// The rules of הרודף as a pure state machine. Only the host runs this; clients just render publicView().
import { isCorrect } from './match.js';

export const RULES = {
  MIN_PLAYERS: 8,
  QUALIFY_MS: 90_000,
  POINTS_PER_ANSWER: 5,
  TARGET: 40,
  DUEL_MS: 30_000,
  BOARD: 8,
  CHASER_START: 1,
  PLAYER_START: 4,
  CHOICE_POINTS: 10,
  DRAW_MS: 6_000,
  REVEAL_MS: 3_500,
  RESULT_MS: 5_000,
};

export function shuffle(list, rng = Math.random) {
  const a = list.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

export class Game {
  constructor({ open, mc, rng = Math.random, rules = {} }) {
    this.open = open;
    this.mc = mc;
    this.rng = rng;
    this.rules = { ...RULES, ...rules };
    this.phase = 'lobby';
    this.players = [];
    this.version = 0;
  }

  // ---------- lobby ----------
  addPlayer(id, name, extra = {}) {
    if (this.phase !== 'lobby' || this.players.some((p) => p.id === id)) return false;
    this.players.push({ id, name: String(name).slice(0, 16), ...extra });
    return this.bump();
  }

  removePlayer(id, now) {
    const idx = this.players.findIndex((p) => p.id === id);
    if (idx === -1) return false;
    this.players[idx].gone = true;
    if (this.phase === 'lobby') {
      this.players.splice(idx, 1);
      return this.bump();
    }
    if (id === this.chaserId) {
      // A chaser who leaves is replaced by a random contestant still waiting, or the game ends.
      const waiting = this.order.slice(this.turn + 1).filter((pid) => !this.player(pid).gone);
      if (!waiting.length) return this.finish();
      const next = waiting[Math.floor(this.rng() * waiting.length)];
      this.order = this.order.filter((pid) => pid !== next);
      this.chaserId = next;
      delete this.results[next];
      if (this.phase === 'duel' || this.phase === 'reveal' || this.phase === 'choose') return this.nextTurn(now);
      return this.bump();
    }
    if (id === this.currentId && ['qualify', 'qualified', 'choose', 'duel', 'reveal'].includes(this.phase)) {
      this.results[id].status = 'left';
      return this.nextTurn(now);
    }
    return this.bump();
  }

  canStart() {
    return this.phase === 'lobby' && this.players.length >= this.rules.MIN_PLAYERS;
  }

  start(now) {
    if (!this.canStart()) return false;
    const ids = this.players.map((p) => p.id);
    this.chaserId = ids[Math.floor(this.rng() * ids.length)];
    this.order = shuffle(ids.filter((id) => id !== this.chaserId), this.rng);
    this.results = Object.fromEntries(this.order.map((id) => [id, { points: 0, status: 'waiting' }]));
    this.deckOpen = shuffle(this.open.map((_, i) => i), this.rng);
    this.deckMc = shuffle(this.mc.map((_, i) => i), this.rng);
    this.turn = -1;
    this.phase = 'draw';
    this.deadline = now + this.rules.DRAW_MS;
    return this.bump();
  }

  // ---------- turn flow ----------
  get currentId() {
    return this.order?.[this.turn];
  }

  player(id) {
    return this.players.find((p) => p.id === id);
  }

  nextTurn(now) {
    this.duel = null;
    this.qualify = null;
    do this.turn++;
    while (this.turn < this.order.length && this.player(this.currentId).gone);
    if (this.turn >= this.order.length) return this.finish();
    this.results[this.currentId].status = 'playing';
    this.phase = 'qualify';
    this.qualify = { points: 0, correct: 0, asked: 0, q: this.drawOpen(), last: null };
    this.deadline = now + this.rules.QUALIFY_MS;
    return this.bump();
  }

  drawOpen() {
    if (!this.deckOpen.length) this.deckOpen = shuffle(this.open.map((_, i) => i), this.rng);
    return this.deckOpen.pop();
  }

  drawMc() {
    if (!this.deckMc.length) this.deckMc = shuffle(this.mc.map((_, i) => i), this.rng);
    return this.deckMc.pop();
  }

  // Qualifying: any answer (right or wrong) moves on to the next question, like on TV.
  answerQualify(byId, text) {
    if (this.phase !== 'qualify' || byId !== this.currentId) return null;
    const text_ = String(text ?? '').trim();
    const q = this.open[this.qualify.q];
    const pass = text_ === '';
    const correct = !pass && isCorrect(text_, q.a);
    if (correct) {
      this.qualify.points += this.rules.POINTS_PER_ANSWER;
      this.qualify.correct++;
    }
    this.qualify.asked++;
    this.qualify.last = { q: q.q, said: pass ? '' : text_, correct, answer: q.a[0], pass };
    this.qualify.q = this.drawOpen();
    this.bump();
    return correct;
  }

  endQualify(now) {
    const res = this.results[this.currentId];
    res.points = this.qualify.points;
    if (this.qualify.points >= this.rules.TARGET) {
      this.phase = 'choose';
      this.deadline = now + 20_000;
    } else {
      res.status = 'eliminated';
      this.phase = 'qualified';
      this.deadline = now + this.rules.RESULT_MS;
    }
    return this.bump();
  }

  // Square choice: 3 = closer to the chaser (+10), 5 = farther (−10).
  choose(byId, square, now) {
    if (this.phase !== 'choose' || byId !== this.currentId) return false;
    const { PLAYER_START, CHOICE_POINTS } = this.rules;
    const delta = { [PLAYER_START - 1]: CHOICE_POINTS, [PLAYER_START + 1]: -CHOICE_POINTS }[square];
    if (delta === undefined) return false;
    this.results[byId].points += delta;
    this.duel = { player: square, chaser: this.rules.CHASER_START, round: 0, choice: square };
    return this.nextDuelQuestion(now);
  }

  nextDuelQuestion(now) {
    this.phase = 'duel';
    this.duel.q = this.drawMc();
    this.duel.round++;
    this.duel.answers = { player: null, chaser: null };
    this.duel.reveal = null;
    this.deadline = now + this.rules.DUEL_MS;
    return this.bump();
  }

  answerDuel(byId, option, now) {
    if (this.phase !== 'duel') return false;
    const role = byId === this.chaserId ? 'chaser' : byId === this.currentId ? 'player' : null;
    if (!role || this.duel.answers[role] !== null) return false;
    if (!Number.isInteger(option) || option < 0 || option > 3) return false;
    this.duel.answers[role] = option;
    if (this.duel.answers.player !== null && this.duel.answers.chaser !== null) return this.revealDuel(now);
    return this.bump();
  }

  revealDuel(now) {
    const d = this.duel;
    const right = this.mc[d.q].c;
    const playerRight = d.answers.player === right;
    const chaserRight = d.answers.chaser === right;
    if (playerRight) d.player++;
    if (chaserRight) d.chaser++;
    let outcome = null;
    if (d.player >= this.rules.BOARD) outcome = 'escaped';
    else if (d.chaser >= d.player) outcome = 'caught';
    d.reveal = { right, playerRight, chaserRight, outcome };
    if (outcome) this.results[this.currentId].status = outcome;
    this.phase = 'reveal';
    this.deadline = now + this.rules.REVEAL_MS + (outcome ? this.rules.RESULT_MS : 0);
    return this.bump();
  }

  finish() {
    this.phase = 'final';
    this.deadline = null;
    const escaped = this.order
      .filter((id) => this.results[id].status === 'escaped')
      .sort((a, b) => this.results[b].points - this.results[a].points);
    this.winner = escaped.length
      ? { kind: 'player', id: escaped[0], ranking: escaped }
      : { kind: 'chaser', id: this.chaserId, ranking: [] };
    return this.bump();
  }

  backToLobby() {
    this.players = this.players.filter((p) => !p.gone);
    Object.assign(this, { phase: 'lobby', chaserId: null, order: null, results: null, duel: null, qualify: null, winner: null, deadline: null });
    return this.bump();
  }

  // Called a few times a second by the host.
  tick(now) {
    if (this.deadline == null || now < this.deadline) return false;
    switch (this.phase) {
      case 'draw':
      case 'qualified':
        return this.nextTurn(now);
      case 'qualify':
        return this.endQualify(now);
      case 'choose':
        // Indecision keeps the middle-ish safer square.
        return this.choose(this.currentId, this.rules.PLAYER_START + 1, now);
      case 'duel':
        return this.revealDuel(now);
      case 'reveal':
        return this.duel.reveal.outcome ? this.nextTurn(now) : this.nextDuelQuestion(now);
      default:
        return false;
    }
  }

  bump() {
    this.version++;
    return true;
  }

  // Who must not hear whom right now: the chaser and contestant while a duel question is open.
  blockedPair() {
    return this.phase === 'duel' ? [this.chaserId, this.currentId] : null;
  }

  // Everything a client may see. Correct answers stay with the host until reveal.
  publicView(now) {
    const v = {
      version: this.version,
      phase: this.phase,
      players: this.players.map(({ id, name, bot, gone }) => ({ id, name, bot: !!bot, gone: !!gone })),
      minPlayers: this.rules.MIN_PLAYERS,
      target: this.rules.TARGET,
      board: this.rules.BOARD,
      remaining: this.deadline == null ? null : Math.max(0, this.deadline - now),
      chaserId: this.chaserId ?? null,
      order: this.order ?? null,
      currentId: this.currentId ?? null,
      results: this.results ?? null,
      blocked: this.blockedPair(),
      winner: this.winner ?? null,
    };
    if (this.qualify) {
      v.qualify = {
        points: this.qualify.points,
        correct: this.qualify.correct,
        asked: this.qualify.asked,
        q: this.phase === 'qualify' ? this.open[this.qualify.q].q : null,
        qid: this.qualify.asked,
        last: this.qualify.last,
      };
    }
    if (this.duel) {
      const q = this.mc[this.duel.q];
      v.duel = {
        player: this.duel.player,
        chaser: this.duel.chaser,
        round: this.duel.round,
        choice: this.duel.choice,
        q: q.q,
        o: q.o,
        answered: { player: this.duel.answers.player !== null, chaser: this.duel.answers.chaser !== null },
        // The actual picks are only shown once both are locked in.
        answers: this.duel.reveal ? this.duel.answers : null,
        reveal: this.duel.reveal,
      };
    }
    return v;
  }
}
