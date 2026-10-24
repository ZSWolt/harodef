// PeerJS transport. The host's browser is the server; everyone else talks only to the host.
/* global Peer */

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
    const timer = setTimeout(() => reject(Object.assign(new Error('timeout'), { type: ERR.NETWORK })), CONNECT_TIMEOUT_MS);
    peer.once('open', () => {
      clearTimeout(timer);
      resolve(peer);
    });
    peer.once('error', (err) => {
      clearTimeout(timer);
      peer.destroy();
      reject(err);
    });
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

  const heartbeat = setInterval(() => {
    const now = Date.now();
    for (const [id, entry] of conns) {
      if (now - entry.seen > DEAD_AFTER_MS) {
        entry.conn.close();
        drop(id);
      } else {
        entry.conn.send({ t: MSG.PING });
      }
    }
  }, HEARTBEAT_MS);

  return {
    peer,
    code,
    id: peer.id,
    broadcast(msg) {
      for (const { conn } of conns.values()) if (conn.open) conn.send(msg);
    },
    close() {
      clearInterval(heartbeat);
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
    clearInterval(watchdog);
    peer.destroy();
    if (accepted) onClosed(reason);
  }

  const watchdog = setInterval(() => {
    if (accepted && Date.now() - lastSeen > DEAD_AFTER_MS) close(ERR.HOST_LEFT);
  }, HEARTBEAT_MS);

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
