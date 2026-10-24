// Chrome speech recognition (Hebrew), kept alive while it's my turn to answer.

const Recognition = window.SpeechRecognition || window.webkitSpeechRecognition;

export const speechSupported = !!Recognition;

const FILLERS = new Set(['אממ', 'אמ', 'אה', 'אהה', 'אהם', 'רגע', 'יאללה', 'אוקיי', 'טוב', 'נו', 'וואו', 'מה']);
const PASSES = ['דלג', 'פס', 'עבור', 'הלאה', 'לא יודע', 'לא יודעת', 'אין לי מושג', 'פאס', 'תדלג'];

// Fillers are thrown away so "אממ" doesn't burn a question; pass phrases become a pass.
export function classifySpoken(text) {
  const t = text.trim().replace(/[.,!?]/g, '');
  if (!t || FILLERS.has(t)) return { kind: 'ignore' };
  if (PASSES.some((p) => t === p || t.endsWith(' ' + p))) return { kind: 'pass' };
  return { kind: 'answer', text: t };
}

export class Listener {
  constructor({ onInterim, onFinal, onState }) {
    this.onInterim = onInterim;
    this.onFinal = onFinal;
    this.onState = onState;
    this.wanted = false;
    this.running = false;
    if (!Recognition) return;
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
      else this.onState('off');
    };
    rec.onerror = (e) => {
      if (e.error === 'not-allowed' || e.error === 'service-not-allowed') {
        this.wanted = false;
        this.onState('blocked');
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
    if (!this.rec || want === this.wanted) return;
    this.wanted = want;
    if (want) this.safeStart();
    else if (this.running) this.rec.abort();
  }
}
