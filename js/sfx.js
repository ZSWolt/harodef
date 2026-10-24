// Game-show sounds synthesized with WebAudio, so the site ships no audio files.

let ctx = null;
let master = null;

function audio() {
  if (!ctx) {
    ctx = new AudioContext();
    master = ctx.createGain();
    master.gain.value = 0.35;
    master.connect(ctx.destination);
  }
  if (ctx.state === 'suspended') ctx.resume().catch(() => {});
  return ctx;
}

function tone(freq, start, dur, { type = 'sine', gain = 0.5, to = null } = {}) {
  const c = audio();
  const t = c.currentTime + start;
  const osc = c.createOscillator();
  const g = c.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(freq, t);
  if (to) osc.frequency.exponentialRampToValueAtTime(to, t + dur);
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(gain, t + 0.01);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  osc.connect(g).connect(master);
  osc.start(t);
  osc.stop(t + dur + 0.05);
}

function noise(start, dur, gain = 0.2) {
  const c = audio();
  const t = c.currentTime + start;
  const buf = c.createBuffer(1, c.sampleRate * dur, c.sampleRate);
  const data = buf.getChannelData(0);
  for (let i = 0; i < data.length; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / data.length);
  const src = c.createBufferSource();
  const g = c.createGain();
  const filter = c.createBiquadFilter();
  filter.type = 'lowpass';
  filter.frequency.value = 900;
  src.buffer = buf;
  g.gain.value = gain;
  src.connect(filter).connect(g).connect(master);
  src.start(t);
}

export const sfx = {
  unlock: () => audio(),
  click: () => tone(880, 0, 0.06, { type: 'triangle', gain: 0.25 }),
  lock: () => {
    tone(520, 0, 0.08, { type: 'square', gain: 0.18 });
    tone(780, 0.07, 0.12, { type: 'square', gain: 0.18 });
  },
  correct: () => {
    tone(660, 0, 0.12, { type: 'triangle' });
    tone(990, 0.1, 0.22, { type: 'triangle' });
  },
  wrong: () => tone(160, 0, 0.35, { type: 'sawtooth', gain: 0.3, to: 110 }),
  tick: () => tone(1400, 0, 0.03, { type: 'square', gain: 0.12 }),
  sting: () => {
    tone(220, 0, 0.5, { type: 'sawtooth', gain: 0.25 });
    tone(330, 0, 0.5, { type: 'sawtooth', gain: 0.2 });
    tone(196, 0.45, 0.9, { type: 'sawtooth', gain: 0.3 });
    noise(0, 0.4, 0.15);
  },
  drumroll: (secs = 2) => {
    for (let i = 0; i < secs * 16; i++) noise(i / 16, 0.05, 0.08 + (i / (secs * 16)) * 0.15);
  },
  step: () => tone(300, 0, 0.15, { type: 'triangle', gain: 0.35, to: 600 }),
  caught: () => {
    [392, 330, 262, 196].forEach((f, i) => tone(f, i * 0.18, 0.4, { type: 'sawtooth', gain: 0.3 }));
    noise(0.7, 0.8, 0.25);
  },
  escaped: () => {
    [523, 659, 784, 1047].forEach((f, i) => tone(f, i * 0.12, 0.35, { type: 'triangle', gain: 0.4 }));
    tone(1047, 0.5, 0.8, { type: 'triangle', gain: 0.35 });
  },
};
