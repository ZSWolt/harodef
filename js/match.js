// Hebrew answer matching: forgiving enough for speech recognition, strict enough to stay fair.

const NIKUD = /[֑-ׇ]/g;
const FINALS = { 'ך': 'כ', 'ם': 'מ', 'ן': 'נ', 'ף': 'פ', 'ץ': 'צ' };
const PREFIXES = ['ה', 'ו', 'ב', 'ל', 'ש', 'מ', 'כ'];

const NUMBER_WORDS = {
  'אפס': 0, 'אחת': 1, 'אחד': 1, 'שתיים': 2, 'שתים': 2, 'שניים': 2, 'שנים': 2, 'שתי': 2, 'שני': 2,
  'שלוש': 3, 'שלושה': 3, 'שלש': 3, 'ארבע': 4, 'ארבעה': 4, 'חמש': 5, 'חמישה': 5, 'חמשה': 5,
  'שש': 6, 'שישה': 6, 'ששה': 6, 'שבע': 7, 'שבעה': 7, 'שמונה': 8, 'תשע': 9, 'תשעה': 9,
  'עשר': 10, 'עשרה': 10, 'אחתעשרה': 11, 'שתיםעשרה': 12, 'עשרים': 20, 'שלושים': 30,
  'ארבעים': 40, 'חמישים': 50, 'שישים': 60, 'שבעים': 70, 'שמונים': 80, 'תשעים': 90,
  'מאה': 100, 'מאתיים': 200, 'אלף': 1000, 'אלפיים': 2000,
};
const NUMBERS = new Map(Object.entries(NUMBER_WORDS).map(([w, n]) => [fold(w), n]));

function fold(s) {
  return s.replace(/[ךםןףץ]/g, (c) => FINALS[c]);
}

function numberOf(token) {
  if (/^\d+$/.test(token)) return Number(token);
  return NUMBERS.has(token) ? NUMBERS.get(token) : null;
}

// Lowercase, strip nikud/punctuation, fold final letters, and turn spoken numbers into digits.
export function normalize(text) {
  const tokens = fold(String(text).toLowerCase().replace(NIKUD, ''))
    .replace(/[׳״'"`]/g, '')
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim()
    .split(' ')
    .filter(Boolean);
  const out = [];
  for (const tok of tokens) {
    const prev = out.length ? numberOf(out[out.length - 1]) : null;
    // "עשרים ושלוש" → 23
    if (prev !== null && tok.startsWith('ו') && numberOf(tok.slice(1)) !== null) {
      out[out.length - 1] = String(prev + numberOf(tok.slice(1)));
      continue;
    }
    const n = numberOf(tok);
    out.push(n === null ? tok : String(n));
  }
  return out.join(' ');
}

export function levenshtein(a, b) {
  if (a === b) return 0;
  const row = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    let diag = row[0];
    row[0] = i;
    for (let j = 1; j <= b.length; j++) {
      const tmp = row[j];
      row[j] = Math.min(row[j] + 1, row[j - 1] + 1, diag + (a[i - 1] === b[j - 1] ? 0 : 1));
      diag = tmp;
    }
  }
  return row[b.length];
}

function tolerance(len) {
  if (len <= 3) return 0;
  if (len <= 6) return 1;
  return 2;
}

function stripPrefix(word) {
  return word.length > 3 && PREFIXES.includes(word[0]) ? word.slice(1) : word;
}

function close(a, b) {
  if (a === b) return true;
  if (/^\d+$/.test(a) || /^\d+$/.test(b)) return false; // numbers must match exactly
  const ca = a.replace(/ /g, '');
  const cb = b.replace(/ /g, '');
  return levenshtein(ca, cb) <= tolerance(cb.length);
}

function variants(phrase) {
  const words = phrase.split(' ');
  return [phrase, words.map(stripPrefix).join(' ')];
}

// True if the spoken/typed text contains one of the accepted answers.
export function isCorrect(spoken, accepted) {
  const said = normalize(spoken);
  if (!said) return false;
  const saidWords = said.split(' ');
  for (const answer of accepted) {
    const target = normalize(answer);
    if (!target) continue;
    const size = target.split(' ').length;
    // Look at every window of words so "אני חושב שזה פריז" still counts.
    for (let n = Math.max(1, size - 1); n <= size + 1; n++) {
      for (let i = 0; i + n <= saidWords.length; i++) {
        const chunk = saidWords.slice(i, i + n).join(' ');
        for (const c of variants(chunk)) {
          for (const t of variants(target)) {
            if (close(c, t)) return true;
          }
        }
      }
    }
  }
  return false;
}

const LETTERS = [
  ['א', 'אלף', 'a'],
  ['ב', 'בית', 'בת', 'b'],
  ['ג', 'גימל', 'גמל', 'c'],
  ['ד', 'דלת', 'דלד', 'd'],
].map((list) => list.map(fold));

// Turn a spoken duel answer into an option index, or -1.
export function choiceFromSpeech(spoken, options) {
  const said = normalize(spoken);
  if (!said) return -1;
  // The option's own text wins first, since options are often numbers.
  const exact = options.findIndex((o) => normalize(o) === said);
  if (exact !== -1) return exact;
  const fuzzy = options.map((o, i) => (isCorrect(said, [o]) ? i : -1)).filter((i) => i !== -1);
  if (fuzzy.length === 1) return fuzzy[0];
  const words = said.split(' ').map((w) => (w.length > 1 && w[0] === 'ה' ? w.slice(1) : w));
  for (const w of words) {
    const li = LETTERS.findIndex((list) => list.includes(w));
    if (li !== -1) return li;
  }
  for (const w of words) {
    if (/^[1-4]$/.test(w) && !options.some((o) => normalize(o) === w)) return Number(w) - 1;
  }
  return -1;
}

const PASS_PHRASES = ['דלג', 'תדלג', 'דילוג', 'פס', 'פאס', 'עבור', 'הלאה', 'לא יודע', 'לא יודעת', 'אין לי מושג'].map(normalize);

// "דלג" and friends skip the question, alone or at the end of a sentence ("אוקיי דלג").
export function isPass(text) {
  const said = normalize(text);
  return PASS_PHRASES.some((p) => said === p || said.endsWith(' ' + p));
}
