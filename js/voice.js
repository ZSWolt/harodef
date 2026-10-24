// Voice chat: a full mesh of PeerJS audio calls, plus the duel rule that the chaser and
// the contestant must not hear each other while a question is open. Spectators hear everyone.

const SPEAKING_LEVEL = 0.04;

export async function requestMic() {
  return navigator.mediaDevices.getUserMedia({
    audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
    video: false,
  });
}

// ?dev only: a silent stand-in so the flow can be tested where no mic is available.
export function silentStream() {
  const ctx = new AudioContext();
  const dest = ctx.createMediaStreamDestination();
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  gain.gain.value = 0;
  osc.connect(gain).connect(dest);
  osc.start();
  return dest.stream;
}

export class Voice {
  constructor(peer, stream, onSpeaking) {
    this.peer = peer;
    this.stream = stream;
    this.track = stream.getAudioTracks()[0];
    this.onSpeaking = onSpeaking;
    this.calls = new Map(); // peerId -> { call, audio, blocked }
    this.blocked = new Set();
    this.ctx = new AudioContext();
    this.meters = new Map();
    this.box = document.getElementById('voices');

    peer.on('call', (call) => {
      if (this.calls.has(call.peer)) this.calls.get(call.peer).call.close();
      call.answer(stream);
      this.attach(call);
    });
    this.meter(peer.id, stream);
    this.loop = setInterval(() => this.measure(), 120);
  }

  // Keep one call per other human player. The lower id dials, so each pair calls once.
  sync(players) {
    const ids = new Set(players.filter((p) => !p.bot && !p.gone && p.id !== this.peer.id).map((p) => p.id));
    for (const id of ids) {
      if (!this.calls.has(id) && this.peer.id < id) this.attach(this.peer.call(id, this.stream));
    }
    for (const [id, entry] of this.calls) {
      if (!ids.has(id)) {
        entry.call.close();
        this.forget(id);
      }
    }
  }

  attach(call) {
    const audio = document.createElement('audio');
    audio.autoplay = true;
    this.box.append(audio);
    const entry = { call, audio, blocked: false };
    this.calls.set(call.peer, entry);
    call.on('stream', (remote) => {
      audio.srcObject = remote;
      audio.play().catch(() => {});
      this.meter(call.peer, remote);
      this.applyTo(call.peer);
    });
    call.on('close', () => this.forget(call.peer, call));
    call.on('error', () => this.forget(call.peer, call));
  }

  forget(id, call) {
    const entry = this.calls.get(id);
    if (!entry || (call && entry.call !== call)) return;
    entry.audio.remove();
    this.calls.delete(id);
    this.meters.delete(id);
  }

  // pair: [chaserId, contestantId] or null. If I'm one of them, cut audio both ways with the other.
  setBlocked(pair) {
    this.blocked = new Set();
    if (pair && pair.includes(this.peer.id)) {
      for (const id of pair) if (id !== this.peer.id) this.blocked.add(id);
    }
    for (const id of this.calls.keys()) this.applyTo(id);
  }

  applyTo(id) {
    const entry = this.calls.get(id);
    if (!entry) return;
    const block = this.blocked.has(id);
    // Sending side: stop transmitting my mic on this one connection.
    const pc = entry.call.peerConnection;
    if (pc) {
      // Calls are audio-only, so every sender carries the mic.
      for (const sender of pc.getSenders()) {
        const want = block ? null : this.track;
        if (sender.track !== want) sender.replaceTrack(want).catch(() => {});
      }
    }
    // Receiving side: belt and braces.
    entry.audio.muted = block;
    entry.blocked = block;
  }

  setSelfMuted(muted) {
    this.track.enabled = !muted;
  }

  meter(id, stream) {
    try {
      const src = this.ctx.createMediaStreamSource(stream);
      const analyser = this.ctx.createAnalyser();
      analyser.fftSize = 512;
      src.connect(analyser);
      this.meters.set(id, { analyser, data: new Float32Array(analyser.fftSize), on: false });
    } catch {
      // Metering is decoration; voice still works without it.
    }
  }

  measure() {
    if (this.ctx.state === 'suspended') this.ctx.resume().catch(() => {});
    for (const [id, m] of this.meters) {
      m.analyser.getFloatTimeDomainData(m.data);
      let sum = 0;
      for (const x of m.data) sum += x * x;
      const rms = Math.sqrt(sum / m.data.length);
      const muted = id === this.peer.id ? !this.track.enabled : this.blocked.has(id);
      const on = rms > SPEAKING_LEVEL && !muted;
      if (on !== m.on) {
        m.on = on;
        this.onSpeaking(id, on);
      }
    }
  }

  // Debug helper: what each connection is actually sending right now.
  debugState() {
    return [...this.calls].map(([id, e]) => ({
      id,
      blocked: e.blocked,
      sending: e.call.peerConnection?.getSenders().map((s) => !!s.track) ?? [],
      audioMuted: e.audio.muted,
    }));
  }
}
