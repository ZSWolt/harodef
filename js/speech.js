// Chrome speech recognition (Hebrew), kept alive while it's my turn to answer.
import { isPass } from './match.js';

const Recognition = window.SpeechRecognition || window.webkitSpeechRecognition;

// Brave ships the API but has no speech service behind it: every start fails with "network".
export const isBrave = !!navigator.brave;
export const speechSupported = !!Recognition && !isBrave;

const FILLERS = new Set(['אממ', 'אמ', 'אה', 'אהה', 'אהם', 'רגע', 'יאללה', 'אוקיי', 'טוב', 'נו', 'וואו', 'מה']);

// Fillers are thrown away so "אממ" doesn't burn a question; pass phrases become a pass.
export function classifySpoken(text) {
  const t = text.trim().replace(/[.,!?]/g, '');
  if (!t || FILLERS.has(t)) return { kind: 'ignore' };
  if (isPass(t)) return { kind: 'pass' };
  return { kind: 'answer', text: t };
}

export class Listener {
  constructor({ onInterim, onFinal, onState }) {
    this.onInterim = onInterim;
    this.onFinal = onFinal;
    this.onState = onState;
    this.wanted = false;
    this.running = false;
    if (!speechSupported) return;
    const rec = new Recognition();
    rec.lang = 'he-IL';
    rec.continuous = true;
    rec.interimResults = true;
    rec.maxAlternatives = 1;
    rec.onresult = (e) => {
      let interim = '';
      for (let i = e.resultIndex; i < e.results.length; i++) {
        const r = e.results[i];
        if (r.isFinal) this.onFinal(r[0].transcript);
        else interim += r[0].transcript;
      }
      this.onInterim(interim);
    };
    rec.onstart = () => {
      this.running = true;
      this.onState('listening');
    };
    rec.onend = () => {
      this.running = false;
      this.onInterim('');
      // Chrome stops after silence; keep going while we still want to listen.
      if (this.wanted) setTimeout(() => this.wanted && this.safeStart(), 150);
      else this.onState(this.broken ? 'unsupported' : 'off');
    };
    rec.onerror = (e) => {
      if (e.error === 'not-allowed' || e.error === 'service-not-allowed') {
        this.wanted = false;
        this.onState('blocked');
      } else if (e.error === 'network' || e.error === 'language-not-supported') {
        // No speech service (Brave, offline): stop retrying instead of looping forever.
        this.broken = true;
        this.wanted = false;
        this.onState('unsupported');
      }
    };
    this.rec = rec;
  }

  safeStart() {
    try {
      this.rec.start();
    } catch {
      // Already started.
    }
  }

  set(want) {
    if (!this.rec || this.broken || want === this.wanted) return;
    this.wanted = want;
    if (want) this.safeStart();
    else if (this.running) this.rec.abort();
  }
}
