import { describe, it, expect } from 'vitest';
import { OPEN, MC } from '../js/questions.js';
import { isCorrect, normalize, choiceFromSpeech } from '../js/match.js';

describe('question bank', () => {
  it('has enough questions', () => {
    expect(OPEN.length).toBeGreaterThanOrEqual(260);
    expect(MC.length).toBeGreaterThanOrEqual(170);
  });
  it('every open answer is accepted by the matcher', () => {
    const bad = OPEN.filter((q) => q.a.some((a) => !isCorrect(a, q.a)));
    expect(bad).toEqual([]);
  });
  it('every multiple-choice option is distinct and reachable by voice', () => {
    for (const q of MC) {
      expect(q.o).toHaveLength(4);
      expect(new Set(q.o.map(normalize)).size).toBe(4);
      q.o.forEach((o, i) => expect(choiceFromSpeech(o, q.o)).toBe(i));
    }
  });
});
