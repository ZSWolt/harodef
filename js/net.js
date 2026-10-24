// PeerJS transport. The host's browser is the server; everyone else talks only to the host.
/* global Peer */
import { every } from './ticker.js';

export const MSG = {
  JOIN: 'join',
  WELCOME: 'welcome',
  STATE: 'state',
  ACT: 'act',
  ERROR: 'error',
  PING: 'ping',
  PONG: 'pong',
};

export const ERR = {
  NOT_FOUND: 'not-found',
  STARTED: 'started',
  FULL: 'full',
  HOST_LEFT: 'host-left',
  NETWORK: 'network',
};

const PREFIX = 'harodef-v1-';
const CODE_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ';
const CONNECT_TIMEOUT_MS = 9_000;
const HEARTBEAT_MS = 3_000;
const DEAD_AFTER_MS = 12_000;

function randomCode() {
  return Array.from({ length: 4 }, () => CODE_CHARS[Math.floor(Math.random() * CODE_CHARS.length)]).join('');
}

function openPeer(id) {
  return new Promise((resolve, reject) => {
    const peer = id ? new Peer(id, { debug: 0 }) : new Peer({ debug: 0 });
    const timer = setTimeout(() => {
      peer.off('open', onOpen);
      peer.off('error', onError);
      peer.destroy();
      reject(Object.assign(new Error('timeout'), { type: ERR.NETWORK }));
    }, CONNECT_TIMEOUT_MS);
    // Both listeners go away once settled: a later network blip must not destroy a live peer.
    function onOpen() {
      clearTimeout(timer);
      peer.off('error', onError);
      keepSignaling(peer);
      resolve(peer);
    }
    function onError(err) {
      clearTimeout(timer);
      peer.off('open', onOpen);
      peer.destroy();
      reject(err);
    }
    peer.once('open', onOpen);
    peer.once('error', onError);
  });
}

// The PeerJS server drops sockets whose heartbeat stops (a throttled background tab, a network
// blip). Existing connections survive, but nobody new can reach us, so keep the heartbeat going
// from the worker ticker and reconnect with the same id whenever the socket is lost.
function keepSignaling(peer) {
  let failures = 0;
  let nextTry = 0;
  peer.on('open', () => {
    failures = 0;
  });
  peer.on('disconnected', () => {
    failures++;
    nextTry = Date.now() + Math.min(20_000, 500 * 2 ** Math.min(failures, 6));
  });
  // Errors after the first open are reported here instead of being thrown away; the reconnect
  // loop below handles recovery.
  peer.on('error', () => {});
  const check = () => {
    if (peer.destroyed) return stop();
    if (peer.disconnected) {
      if (Date.now() >= nextTry) {
        try {
          peer.reconnect();
        } catch {
          // Destroyed meanwhile.
        }
      }
    } else if (peer.open) {
      peer.socket?._sendHeartbeat?.();
    }
  };
  const stop = every(4_000, check);
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') {
      nextTry = 0;
      check();
    }
  });
}

// Host: claims a room code and relays every message through the given handlers.
export async function hostRoom({ onJoin, onLeave, onAction }) {
  let peer;
  let code;
  for (let attempt = 0; attempt < 5 && !peer; attempt++) {
    code = randomCode();
    try {
      peer = await openPeer(PREFIX + code);
    } catch (err) {
      if (err.type !== 'unavailable-id') throw err;
    }
  }
  if (!peer) throw Object.assign(new Error('no free code'), { type: ERR.NETWORK });

  const conns = new Map(); // peerId -> { conn, seen }

  peer.on('connection', (conn) => {
    conn.on('data', (msg) => {
      if (!msg || typeof msg !== 'object') return;
      const entry = conns.get(conn.peer);
      if (entry) entry.seen = Date.now();
      if (msg.t === MSG.JOIN && !entry) {
        const verdict = onJoin(conn.peer, String(msg.name ?? '').trim() || 'שחקן');
        if (verdict !== true) {
          conn.send({ t: MSG.ERROR, code: verdict });
          setTimeout(() => conn.close(), 500);
          return;
        }
        conns.set(conn.peer, { conn, seen: Date.now() });
        conn.send({ t: MSG.WELCOME, you: conn.peer });
      } else if (msg.t === MSG.ACT && entry && msg.a && typeof msg.a === 'object') {
        onAction(conn.peer, msg.a);
      }
    });
    conn.on('close', () => drop(conn.peer));
    conn.on('error', () => drop(conn.peer));
  });

  function drop(id) {
    if (!conns.has(id)) return;
    conns.delete(id);
    onLeave(id);
  }

  const stopHeartbeat = every(HEARTBEAT_MS, () => {
    const now = Date.now();
    for (const [id, entry] of conns) {
      if (now - entry.seen > DEAD_AFTER_MS) {
        entry.conn.close();
        drop(id);
      } else {
        entry.conn.send({ t: MSG.PING });
      }
    }
  });

  return {
    peer,
    code,
    id: peer.id,
    broadcast(msg) {
      for (const { conn } of conns.values()) if (conn.open) conn.send(msg);
    },
    close() {
      stopHeartbeat();
      peer.destroy();
    },
  };
}

// Client: joins a room by code. Resolves once the host has accepted us.
export async function joinRoom(code, name, { onState, onClosed }) {
  const peer = await openPeer();
  const conn = peer.connect(PREFIX + code.toUpperCase(), { reliable: true });
  let lastSeen = Date.now();
  let accepted = false;
  let closed = false;

  function close(reason) {
    if (closed) return;
    closed = true;
    stopWatchdog();
    peer.destroy();
    if (accepted) onClosed(reason);
  }

  const stopWatchdog = every(HEARTBEAT_MS, () => {
    if (accepted && Date.now() - lastSeen > DEAD_AFTER_MS) close(ERR.HOST_LEFT);
  });

  await new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      close();
      reject(Object.assign(new Error('timeout'), { type: ERR.NOT_FOUND }));
    }, CONNECT_TIMEOUT_MS);
    peer.on('error', (err) => {
      if (err.type === 'peer-unavailable') {
        clearTimeout(timer);
        close();
        reject(Object.assign(err, { type: ERR.NOT_FOUND }));
      }
    });
    conn.on('open', () => conn.send({ t: MSG.JOIN, name }));
    conn.on('data', (msg) => {
      lastSeen = Date.now();
      if (!msg || typeof msg !== 'object') return;
      if (msg.t === MSG.WELCOME) {
        clearTimeout(timer);
        accepted = true;
        resolve();
      } else if (msg.t === MSG.ERROR) {
        clearTimeout(timer);
        close();
        reject(Object.assign(new Error(msg.code), { type: msg.code }));
      } else if (msg.t === MSG.PING) {
        conn.send({ t: MSG.PONG });
      } else if (msg.t === MSG.STATE) {
        onState(msg.v);
      }
    });
    conn.on('close', () => close(ERR.HOST_LEFT));
  });

  return {
    peer,
    id: peer.id,
    send(a) {
      if (conn.open) conn.send({ t: MSG.ACT, a });
    },
    close: () => close(),
  };
}
