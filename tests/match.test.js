import { describe, it, expect } from 'vitest';
import { normalize, isCorrect, choiceFromSpeech } from '../js/match.js';

describe('normalize', () => {
  it('strips nikud, punctuation and final letters', () => {
    expect(normalize('שָׁלוֹם!')).toBe('שלומ');
  });
  it('turns spoken numbers into digits', () => {
    expect(normalize('שמונה')).toBe('8');
    expect(normalize('עשרים ושלוש')).toBe('23');
  });
});

describe('isCorrect', () => {
  it('accepts exact and filler-wrapped answers', () => {
    expect(isCorrect('פריז', ['פריז'])).toBe(true);
    expect(isCorrect('אני חושב שזה פריז', ['פריז'])).toBe(true);
  });
  it('tolerates small typos on longer words only', () => {
    expect(isCorrect('ירושליים', ['ירושלים'])).toBe(true);
    expect(isCorrect('חתול', ['כלב'])).toBe(false);
  });
  it('ignores the definite article', () => {
    expect(isCorrect('הירח', ['ירח'])).toBe(true);
  });
  it('requires numbers to match exactly', () => {
    expect(isCorrect('שמונה', ['8'])).toBe(true);
    expect(isCorrect('9', ['8'])).toBe(false);
  });
  it('rejects empty answers', () => {
    expect(isCorrect('', ['8'])).toBe(false);
  });
});

describe('choiceFromSpeech', () => {
  const opts = ['צרפת', 'איטליה', 'ספרד', 'פורטוגל'];
  it('understands letters', () => {
    expect(choiceFromSpeech('ב', opts)).toBe(1);
    expect(choiceFromSpeech('תשובה גימל', opts)).toBe(2);
  });
  it('understands the option text', () => {
    expect(choiceFromSpeech('פורטוגל', opts)).toBe(3);
  });
  it('prefers numeric option text over index', () => {
    expect(choiceFromSpeech('4', ['2', '4', '6', '8'])).toBe(1);
  });
  it('returns -1 when unclear', () => {
    expect(choiceFromSpeech('אממ', opts)).toBe(-1);
  });
});
