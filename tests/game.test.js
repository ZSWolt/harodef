import { describe, it, expect } from 'vitest';
import { Game, RULES } from '../js/game.js';

const OPEN = Array.from({ length: 30 }, (_, i) => ({ q: `שאלה ${i}?`, a: ['נכון'] }));
const MC = Array.from({ length: 30 }, (_, i) => ({ q: `אמריקאית ${i}?`, o: ['א', 'ב', 'ג', 'ד'], c: 0 }));

function seeded(seed = 1) {
  return () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
}

function newGame(n = 8) {
  const g = new Game({ open: OPEN, mc: MC, rng: seeded() });
  for (let i = 0; i < n; i++) g.addPlayer(`p${i}`, `שחקן ${i}`);
  return g;
}

function toQualify(g) {
  g.start(0);
  g.tick(RULES.DRAW_MS);
  return RULES.DRAW_MS;
}

function qualifyWith(g, rightAnswers, now) {
  for (let i = 0; i < rightAnswers; i++) g.answerQualify(g.currentId, 'נכון');
  g.tick(now + RULES.QUALIFY_MS);
  return now + RULES.QUALIFY_MS;
}

describe('lobby', () => {
  it('needs at least 8 players', () => {
    expect(newGame(7).canStart()).toBe(false);
    expect(newGame(8).canStart()).toBe(true);
  });
  it('picks one chaser and orders the other players', () => {
    const g = newGame(10);
    g.start(0);
    expect(g.order).toHaveLength(9);
    expect(g.order).not.toContain(g.chaserId);
    expect(new Set(g.order).size).toBe(9);
  });
});

describe('qualifying round', () => {
  it('gives 5 points per correct answer and moves to the next question', () => {
    const g = newGame();
    toQualify(g);
    const first = g.qualify.q;
    g.answerQualify(g.currentId, 'נכון');
    expect(g.qualify.points).toBe(5);
    expect(g.qualify.q).not.toBe(first);
    expect(g.qualify.asked).toBe(1);
  });
  it('keeps the same question after a wrong answer, without revealing it', () => {
    const g = newGame();
    toQualify(g);
    const first = g.qualify.q;
    expect(g.answerQualify(g.currentId, 'לא')).toBe(false);
    expect(g.qualify.q).toBe(first);
    expect(g.qualify.asked).toBe(0);
    expect(g.qualify.last).toEqual({ said: 'לא', correct: false, retry: true });
    g.answerQualify(g.currentId, 'נכון');
    expect(g.qualify.points).toBe(5);
    expect(g.qualify.q).not.toBe(first);
  });
  it('moves on when the player says "דלג"', () => {
    const g = newGame();
    toQualify(g);
    const first = g.qualify.q;
    g.answerQualify(g.currentId, 'אוקיי דלג');
    expect(g.qualify.q).not.toBe(first);
    expect(g.qualify.points).toBe(0);
    expect(g.qualify.last.pass).toBe(true);
    g.answerQualify(g.currentId, '');
    expect(g.qualify.asked).toBe(2);
  });
  it('ignores answers from anyone but the contestant', () => {
    const g = newGame();
    toQualify(g);
    expect(g.answerQualify(g.chaserId, 'נכון')).toBeNull();
    expect(g.qualify.points).toBe(0);
  });
  it('eliminates below 40 and brings up the next contestant', () => {
    const g = newGame();
    let now = toQualify(g);
    const first = g.currentId;
    now = qualifyWith(g, 7, now);
    expect(g.phase).toBe('qualified');
    expect(g.results[first].status).toBe('eliminated');
    g.tick(now + RULES.RESULT_MS);
    expect(g.phase).toBe('qualify');
    expect(g.currentId).not.toBe(first);
  });
  it('sends 40+ to the square choice', () => {
    const g = newGame();
    const now = qualifyWith(g, 8, toQualify(g));
    expect(g.phase).toBe('choose');
    expect(g.results[g.currentId].points).toBe(40);
    expect(now).toBeGreaterThan(0);
  });
});

describe('square choice', () => {
  it('square 3 adds 10 points, square 5 removes 10', () => {
    const a = newGame();
    let now = qualifyWith(a, 8, toQualify(a));
    a.choose(a.currentId, 3, now);
    expect(a.results[a.currentId].points).toBe(50);
    expect(a.duel.player).toBe(3);

    const b = newGame();
    now = qualifyWith(b, 8, toQualify(b));
    b.choose(b.currentId, 5, now);
    expect(b.results[b.currentId].points).toBe(30);
    expect(b.duel.player).toBe(5);
  });
  it('rejects any other square', () => {
    const g = newGame();
    const now = qualifyWith(g, 8, toQualify(g));
    expect(g.choose(g.currentId, 4, now)).toBe(false);
    expect(g.choose(g.currentId, 7, now)).toBe(false);
  });
});

describe('duel', () => {
  function toDuel(square) {
    const g = newGame();
    const now = qualifyWith(g, 8, toQualify(g));
    g.choose(g.currentId, square, now);
    return { g, now };
  }

  it('hides answers until both have locked in', () => {
    const { g, now } = toDuel(5);
    g.answerDuel(g.currentId, 0, now);
    const v = g.publicView(now);
    expect(v.duel.answered.player).toBe(true);
    expect(v.duel.answers).toBeNull();
    expect(JSON.stringify(v)).not.toContain('"c":');
  });

  it('mutes chaser and contestant only while a question is open', () => {
    const { g, now } = toDuel(5);
    expect(g.blockedPair()).toEqual([g.chaserId, g.currentId]);
    g.answerDuel(g.currentId, 0, now);
    g.answerDuel(g.chaserId, 0, now);
    expect(g.blockedPair()).toBeNull();
  });

  it('ignores duplicate and late answers', () => {
    const { g, now } = toDuel(5);
    expect(g.answerDuel(g.currentId, 1, now)).toBe(true);
    expect(g.answerDuel(g.currentId, 0, now)).toBe(false);
    g.tick(now + RULES.DUEL_MS);
    expect(g.answerDuel(g.chaserId, 0, now + RULES.DUEL_MS)).toBe(false);
  });

  it('moves one square per correct answer and stays on wrong ones', () => {
    const { g, now } = toDuel(5);
    g.answerDuel(g.currentId, 0, now); // right
    g.answerDuel(g.chaserId, 2, now); // wrong
    expect(g.duel.player).toBe(6);
    expect(g.duel.chaser).toBe(1);
  });

  it('player escapes on reaching square 8', () => {
    const { g } = toDuel(5);
    let now = 0;
    const id = g.currentId;
    for (let i = 0; i < 3; i++) {
      g.answerDuel(id, 0, now);
      g.answerDuel(g.chaserId, 1, now);
      if (g.duel.reveal.outcome) break;
      now += RULES.REVEAL_MS;
      g.tick(now);
    }
    expect(g.results[id].status).toBe('escaped');
  });

  it('chaser catches when reaching the player square', () => {
    const { g } = toDuel(3);
    let now = 0;
    const id = g.currentId;
    for (let i = 0; i < 2; i++) {
      g.answerDuel(id, 1, now);
      g.answerDuel(g.chaserId, 0, now);
      if (g.duel.reveal.outcome) break;
      now += RULES.REVEAL_MS;
      g.tick(now);
    }
    expect(g.duel.chaser).toBe(3);
    expect(g.results[id].status).toBe('caught');
  });

  it('a timed-out answer counts as wrong', () => {
    const { g, now } = toDuel(5);
    g.answerDuel(g.chaserId, 0, now);
    g.tick(now + RULES.DUEL_MS);
    expect(g.duel.player).toBe(5);
    expect(g.duel.chaser).toBe(2);
  });
});

describe('end of game', () => {
  function playAll(g, plan) {
    let now = toQualify(g);
    while (g.phase !== 'final') {
      const id = g.currentId;
      const p = plan(id);
      now = qualifyWith(g, p.correct, now);
      if (g.phase === 'qualified') {
        now += RULES.RESULT_MS;
        g.tick(now);
        continue;
      }
      g.choose(id, 5, now);
      while (g.phase === 'duel') {
        g.answerDuel(id, p.escape ? 0 : 1, now);
        g.answerDuel(g.chaserId, p.escape ? 1 : 0, now);
        now += RULES.REVEAL_MS + RULES.RESULT_MS;
        g.tick(now);
      }
    }
  }

  it('the chaser wins when nobody escapes', () => {
    const g = newGame();
    playAll(g, () => ({ correct: 3, escape: false }));
    expect(g.winner).toMatchObject({ kind: 'chaser', id: g.chaserId });
  });

  it('the escaped player with the most points wins', () => {
    const g2 = newGame();
    const counts = {};
    playAll(g2, (id) => {
      counts[id] = counts[id] ?? (id === g2.order[0] ? 10 : id === g2.order[1] ? 12 : 2);
      return { correct: counts[id], escape: true };
    });
    expect(g2.winner.kind).toBe('player');
    expect(g2.winner.id).toBe(g2.order[1]);
    expect(g2.winner.ranking).toEqual([g2.order[1], g2.order[0]]);
  });
});

describe('disconnects', () => {
  it('skips a contestant who leaves mid-turn', () => {
    const g = newGame();
    const now = toQualify(g);
    const leaving = g.currentId;
    g.removePlayer(leaving, now);
    expect(g.results[leaving].status).toBe('left');
    expect(g.currentId).not.toBe(leaving);
    expect(g.phase).toBe('qualify');
  });
  it('replaces a chaser who leaves', () => {
    const g = newGame();
    const now = toQualify(g);
    const old = g.chaserId;
    g.removePlayer(old, now);
    expect(g.chaserId).not.toBe(old);
    expect(g.order).not.toContain(g.chaserId);
  });
});
