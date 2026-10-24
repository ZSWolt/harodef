// App shell: screens, host loop, client sync, voice, speech and sound.
import { Game, RULES } from './game.js';
import { OPEN, MC } from './questions.js';
import { hostRoom, joinRoom, ERR, MSG } from './net.js';
import { Voice, requestMic, silentStream } from './voice.js';
import { Listener, speechSupported, classifySpoken } from './speech.js';
import { choiceFromSpeech } from './match.js';
import { sfx } from './sfx.js';
import * as ui from './ui.js';

const $ = (sel, root = document) => root.querySelector(sel);
const params = new URLSearchParams(location.search);
const DEV = params.has('dev');
const MAX_PLAYERS = 16;
const PHASE_MS = { qualify: RULES.QUALIFY_MS, duel: RULES.DUEL_MS, choose: 20_000 };
const reduceMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;

const ERROR_TEXT = {
  [ERR.NOT_FOUND]: 'לא מצאנו לובי עם הקוד הזה. בדקו את הקוד ונסו שוב.',
  [ERR.STARTED]: 'המשחק בלובי הזה כבר התחיל. בקשו מהמארח/ת משחק חוזר.',
  [ERR.FULL]: `הלובי מלא (${MAX_PLAYERS} שחקנים).`,
  [ERR.NETWORK]: 'אין חיבור לשרת החיבורים. בדקו את האינטרנט ונסו שוב.',
};

function load(key) {
  try {
    return localStorage.getItem(key) ?? '';
  } catch {
    return '';
  }
}
function save(key, value) {
  try {
    localStorage.setItem(key, value);
  } catch {
    // Private mode: the name just won't be remembered.
  }
}

const ctx = {
  me: null,
  isHost: false,
  code: '',
  view: null,
  dev: DEV,
  listenState: speechSupported ? 'off' : 'unsupported',
  interim: '',
  connOk: true,
  selfMuted: false,
  myPick: null,
  savedName: load('harodef-name'),
  prefillCode: (params.get('room') ?? '').toUpperCase().replace(/[^A-Z]/g, '').slice(0, 4),
  error: '',
};

let game = null;
let room = null;
let client = null;
let voice = null;
let current = { key: null, screen: null };
let localDeadline = null;
let lastVersion = -1;
const speaking = new Set();

// ---------- 16:9 stage ----------
const stage = $('#stage');
function fit() {
  const s = Math.min(innerWidth / 1920, innerHeight / 1080);
  stage.style.transform = `translate(-50%, -50%) scale(${s})`;
  stage.dataset.scale = s;
}
addEventListener('resize', fit);
fit();

// ---------- rendering ----------
function animate(opts) {
  if (!window.anime) return null;
  return window.anime(reduceMotion ? { ...opts, duration: 1, delay: 0 } : opts);
}

function show(screen, { bare = false } = {}) {
  document.body.classList.toggle('bare', bare);
  $('#topbar').hidden = bare;
  $('#people').hidden = bare;
  const root = $('#screen');
  if (screen.key === current.key) {
    const result = screen.patch?.(root);
    current.screen = screen;
    if (result === 'next-question') {
      animate({ targets: '.qcard', translateX: [-40, 0], opacity: [0, 1], duration: 300, easing: 'cubicBezier(0.16, 1, 0.3, 1)' });
    }
    return;
  }
  const before = tokenRects();
  root.innerHTML = screen.html;
  current = { key: screen.key, screen };
  enter(root, screen, before);
}

function enter(root, screen, before) {
  animate({
    targets: root.querySelectorAll('[data-enter], .card, .board, .ptile:not(.empty)'),
    translateY: [24, 0],
    opacity: [0, 1],
    delay: window.anime?.stagger(40) ?? 0,
    duration: 380,
    easing: 'cubicBezier(0.16, 1, 0.3, 1)',
  });
  animate({ targets: root.querySelectorAll('[data-pop]'), scale: [0.6, 1], opacity: [0, 1], duration: 600, easing: 'spring(1, 80, 12, 0)' });
  const outcome = root.querySelector('[data-outcome]');
  if (outcome) {
    animate({ targets: outcome, opacity: [0, 1], duration: 300, delay: 900, easing: 'linear' });
    animate({ targets: outcome.querySelector('.big'), scale: [2.2, 1], duration: 700, delay: 900, easing: 'cubicBezier(0.16, 1, 0.3, 1)' });
  }
  flipTokens(before);
  if (screen.reel) spinReel(screen);
  const input = root.querySelector('#answer');
  if (input) input.focus();
}

function tokenRects() {
  return Object.fromEntries([...document.querySelectorAll('[data-token]')].map((el) => [el.dataset.token, el.getBoundingClientRect()]));
}

// Tokens are re-rendered in their new square; slide them from where they were.
function flipTokens(before) {
  const scale = Number(stage.dataset.scale) || 1;
  for (const el of document.querySelectorAll('[data-token]')) {
    const old = before[el.dataset.token];
    if (!old) continue;
    const dx = (old.left - el.getBoundingClientRect().left) / scale;
    if (Math.abs(dx) > 1) {
      animate({ targets: el, translateX: [dx, 0], duration: 700, delay: 250, easing: 'cubicBezier(0.16, 1, 0.3, 1)' });
    }
  }
}

function spinReel(screen) {
  const el = $('#reel-name');
  const names = screen.reel.length ? screen.reel : ['?'];
  sfx.drumroll(2.6);
  let i = 0;
  let wait = 60;
  const step = () => {
    if (current.screen !== screen) return;
    if (wait > 340) {
      el.textContent = screen.chaserName;
      sfx.sting();
      animate({ targets: el, scale: [1.6, 1], duration: 700, easing: 'cubicBezier(0.16, 1, 0.3, 1)' });
      animate({ targets: '#order-list li', opacity: [0, 1], translateY: [16, 0], delay: window.anime?.stagger(50, { start: 600 }) ?? 0, duration: 300, easing: 'easeOutQuad' });
      if (!window.anime) document.querySelectorAll('#order-list li').forEach((li) => (li.style.opacity = 1));
      return;
    }
    el.textContent = names[i++ % names.length];
    wait *= 1.13;
    setTimeout(step, reduceMotion ? 0 : wait);
  };
  step();
}

function renderChrome() {
  if (!ctx.view) return;
  $('#topbar').innerHTML = ui.topbar(ctx);
  $('#people').innerHTML = ui.people(ctx);
  for (const id of speaking) markSpeaking(id, true);
}

function render() {
  const v = ctx.view;
  if (!v) return;
  document.body.classList.toggle('chase-on', ['choose', 'duel', 'reveal'].includes(v.phase));
  renderChrome();
  show(ui.SCREENS[v.phase](ctx));
}

function toast(text, kind = '') {
  const el = $('#toast');
  el.textContent = text;
  el.className = `show ${kind}`;
  clearTimeout(toast.timer);
  toast.timer = setTimeout(() => (el.className = ''), 3200);
}

function markSpeaking(id, on) {
  for (const el of document.querySelectorAll(`[data-person="${CSS.escape(id)}"]`)) el.classList.toggle('speaking', on);
}

// ---------- timers ----------
let lastSecond = null;
function frame() {
  requestAnimationFrame(frame);
  const v = ctx.view;
  if (!v || localDeadline == null) return;
  const rem = Math.max(0, localDeadline - performance.now());
  const total = PHASE_MS[v.phase] ?? rem;
  const secs = Math.ceil(rem / 1000);
  for (const t of document.querySelectorAll('[data-timer]')) {
    const ring = t.querySelector('.ring-fg');
    const c = Number(ring.getAttribute('stroke-dasharray'));
    ring.setAttribute('stroke-dashoffset', String(c * (1 - rem / total)));
    const num = t.querySelector('.timer-num');
    if (num.textContent !== String(secs)) num.textContent = secs;
    t.classList.toggle('low', secs <= (v.phase === 'qualify' ? 10 : 5));
  }
  if (secs !== lastSecond) {
    if (lastSecond !== null && secs <= 5 && secs > 0 && ['qualify', 'duel'].includes(v.phase)) sfx.tick();
    lastSecond = secs;
  }
}
requestAnimationFrame(frame);

// ---------- state updates (host and client) ----------
function roleOf(v) {
  if (v.chaserId === ctx.me) return 'chaser';
  if (v.currentId === ctx.me) return 'player';
  return null;
}

function onView(v) {
  const prev = ctx.view;
  ctx.view = v;
  localDeadline = v.remaining == null ? null : performance.now() + v.remaining;
  if (!v.duel || prev?.duel?.round !== v.duel.round || prev?.currentId !== v.currentId) ctx.myPick = null;
  playSounds(prev, v);
  voice?.sync(v.players);
  voice?.setBlocked(v.blocked);
  listener.set(shouldListen(v));
  render();
}

function shouldListen(v) {
  if (ctx.selfMuted) return false;
  if (v.phase === 'qualify') return v.currentId === ctx.me;
  if (v.phase === 'duel') {
    const role = roleOf(v);
    return !!role && !v.duel.answered[role] && ctx.myPick == null;
  }
  return false;
}

function playSounds(prev, v) {
  if (!prev) return;
  if (v.phase === 'qualify' && prev.phase === 'qualify' && v.qualify.asked > prev.qualify.asked) {
    const last = v.qualify.last;
    if (last.correct) sfx.correct();
    else if (!last.pass) {
      sfx.wrong();
      $('.qcard')?.classList.remove('shake');
      requestAnimationFrame(() => $('.qcard')?.classList.add('shake'));
    }
  }
  if (v.phase === prev.phase) return;
  if (v.phase === 'qualify') sfx.sting();
  if (v.phase === 'qualified') sfx.wrong();
  if (v.phase === 'choose') sfx.escaped();
  if (v.phase === 'reveal') {
    const r = v.duel.reveal;
    if (r.playerRight || r.chaserRight) setTimeout(sfx.step, 250);
    if (r.outcome === 'caught') setTimeout(sfx.caught, 900);
    if (r.outcome === 'escaped') setTimeout(sfx.escaped, 900);
  }
  if (v.phase === 'final') v.winner.kind === 'chaser' ? sfx.caught() : sfx.escaped();
}

// ---------- speech ----------
const listener = new Listener({
  onInterim(text) {
    ctx.interim = text;
    const el = $('#heard');
    if (el) el.textContent = text;
  },
  onFinal(text) {
    const v = ctx.view;
    if (!v) return;
    if (v.phase === 'qualify' && v.currentId === ctx.me) {
      const said = classifySpoken(text);
      if (said.kind === 'ignore') return;
      act({ type: 'answer', text: said.kind === 'pass' ? '' : said.text, qid: v.qualify.asked });
    } else if (v.phase === 'duel' && roleOf(v) && ctx.myPick == null) {
      const i = choiceFromSpeech(text, v.duel.o);
      if (i < 0) toast(`שמעתי "${text}". אמרו א, ב, ג או ד, או לחצו על תשובה.`, 'bad');
      else pick(i);
    }
  },
  onState(state) {
    ctx.listenState = state;
    const el = $('#listen');
    if (el) el.outerHTML = ui.listenBox(ctx);
  },
});

function pick(i) {
  const v = ctx.view;
  if (ctx.myPick != null || v.phase !== 'duel') return;
  ctx.myPick = i;
  sfx.lock();
  listener.set(false);
  act({ type: 'pick', option: i, round: v.duel.round });
  render();
}

// ---------- actions ----------
function act(a) {
  if (ctx.isHost) handleAction(ctx.me, a);
  else client?.send(a);
}

// Host-side validation of every intent. Clients never change state directly.
function handleAction(id, a) {
  const now = Date.now();
  switch (a.type) {
    case 'start':
      if (id === ctx.me) game.start(now);
      break;
    case 'answer':
      if (game.qualify && a.qid === game.qualify.asked) game.answerQualify(id, String(a.text ?? '').slice(0, 120));
      break;
    case 'choose':
      game.choose(id, Number(a.square), now);
      break;
    case 'pick':
      if (game.duel && a.round === game.duel.round) game.answerDuel(id, Number(a.option), now);
      break;
    case 'again':
      if (id === ctx.me) game.backToLobby();
      break;
    case 'add-bot':
      if (id === ctx.me && DEV) addBot();
      break;
    default:
      break;
  }
  pump();
}

function pump() {
  if (!game || game.version === lastVersion) return;
  lastVersion = game.version;
  const v = game.publicView(Date.now());
  room.broadcast({ t: MSG.STATE, v });
  onView(v);
}

// ---------- dev bots (only with ?dev) ----------
let botCount = 0;
const botTimers = {};
const BOT_NAMES = ['רובו־דני', 'בוטית', 'צ׳יפ', 'ביפ', 'מכונת', 'סרבו', 'ננו', 'פיקסל', 'טרנזיסטור', 'אלגו'];
function addBot() {
  if (game.players.length >= MAX_PLAYERS) return;
  game.addPlayer(`bot-${++botCount}`, BOT_NAMES[(botCount - 1) % BOT_NAMES.length] + ' ' + botCount, { bot: true });
}

function due(key, now, min, max) {
  if (!botTimers[key]) botTimers[key] = now + min + Math.random() * (max - min);
  if (now < botTimers[key]) return false;
  delete botTimers[key];
  return true;
}

function runBots(now) {
  if (!DEV || !game) return;
  const bot = (id) => game.player(id)?.bot;
  if (game.phase === 'qualify' && bot(game.currentId) && due(`q${game.qualify.asked}`, now, 3000, 7000)) {
    const q = OPEN[game.qualify.q];
    game.answerQualify(game.currentId, Math.random() < 0.55 ? q.a[0] : 'לא יודע');
  }
  if (game.phase === 'choose' && bot(game.currentId) && due(`c${game.currentId}`, now, 2000, 4000)) {
    game.choose(game.currentId, Math.random() < 0.5 ? 3 : 5, now);
  }
  if (game.phase === 'duel') {
    const right = MC[game.duel.q].c;
    for (const [role, id, skill] of [['chaser', game.chaserId, 0.7], ['player', game.currentId, 0.6]]) {
      if (bot(id) && game.duel.answers[role] === null && due(`d${game.duel.round}${role}`, now, 2000, 9000)) {
        game.answerDuel(id, Math.random() < skill ? right : (right + 1 + Math.floor(Math.random() * 3)) % 4, now);
      }
    }
  }
}

// ---------- joining ----------
function goHome(error = '') {
  ctx.error = error;
  show(ui.home(ctx), { bare: true });
  $('#name')?.focus();
}

function messageScreen(title, body, actions) {
  show(ui.message(title, body, actions), { bare: true });
}

async function begin(mode) {
  const name = $('#name').value.trim();
  const code = $('#code').value.trim().toUpperCase();
  if (!name) {
    $('#home-err').textContent = 'כתבו שם כדי שידעו מי בורח מהרודף.';
    $('#name').focus();
    return;
  }
  if (mode === 'join' && !/^[A-Z]{4}$/.test(code)) {
    $('#home-err').textContent = 'קוד הלובי הוא 4 אותיות באנגלית.';
    $('#code').focus();
    return;
  }
  save('harodef-name', name);
  ctx.savedName = name;
  ctx.prefillCode = code;
  sfx.unlock();

  show(ui.busy('מבקשים גישה למיקרופון…'), { bare: true });
  let stream;
  try {
    stream = await requestMic();
  } catch {
    if (DEV) stream = silentStream();
  }
  if (!stream) {
    messageScreen(
      'צריך מיקרופון כדי לשחק',
      'הרודף הוא משחק קולי: עונים בקול ושומעים את כולם. לחצו על סמל המנעול ליד שורת הכתובת, אפשרו גישה למיקרופון ונסו שוב.',
      `<button class="btn btn-primary" data-act="retry">ניסיון נוסף</button>`,
    );
    return;
  }
  if (typeof window.Peer === 'undefined') {
    goHome(ERROR_TEXT[ERR.NETWORK]);
    return;
  }

  show(ui.busy(mode === 'host' ? 'פותחים לובי…' : 'מתחברים ללובי…'), { bare: true });
  try {
    if (mode === 'host') await startHost(name, stream);
    else await startClient(code, name, stream);
  } catch (err) {
    stream.getTracks().forEach((t) => t.stop());
    goHome(ERROR_TEXT[err.type] ?? ERROR_TEXT[ERR.NETWORK]);
  }
}

async function startHost(name, stream) {
  room = await hostRoom({
    onJoin(id, joinName) {
      if (game.phase !== 'lobby') return ERR.STARTED;
      if (game.players.length >= MAX_PLAYERS) return ERR.FULL;
      game.addPlayer(id, joinName);
      setTimeout(pump, 0); // after the welcome message
      return true;
    },
    onLeave(id) {
      game.removePlayer(id, Date.now());
      pump();
    },
    onAction(id, a) {
      handleAction(id, a);
    },
  });
  ctx.isHost = true;
  ctx.me = room.id;
  ctx.code = room.code;
  game = new Game({ open: OPEN, mc: MC, rules: DEV ? { MIN_PLAYERS: 2 } : {} });
  game.addPlayer(ctx.me, name);
  voice = new Voice(room.peer, stream, onSpeaking);
  window.harodef = { game, voice }; // console debugging
  setInterval(() => {
    const now = Date.now();
    game.tick(now);
    runBots(now);
    pump();
  }, 200);
  pump();
}

async function startClient(code, name, stream) {
  client = await joinRoom(code, name, {
    onState(v) {
      if (ctx.me) onView(v);
      else queueMicrotask(() => onView(v));
    },
    onClosed() {
      ctx.connOk = false;
      listener.set(false);
      messageScreen(
        'החיבור למארח/ת נותק',
        'כנראה שהמארח/ת סגר/ה את הדף או שהאינטרנט נפל. אפשר לחזור ולהצטרף שוב עם אותו קוד.',
        `<button class="btn btn-primary" data-act="retry">חזרה למסך הראשי</button>`,
      );
    },
  });
  ctx.me = client.id;
  ctx.code = code;
  voice = new Voice(client.peer, stream, onSpeaking);
  window.harodef = { voice };
}

function onSpeaking(id, on) {
  if (on) speaking.add(id);
  else speaking.delete(id);
  markSpeaking(id, on);
}

function inviteLink() {
  return `${location.origin}${location.pathname}?room=${ctx.code}${DEV ? '&dev' : ''}`;
}

// ---------- events ----------
stage.addEventListener('submit', (e) => {
  e.preventDefault();
  // Enter inside the code field means "join", anywhere else in the form means "open a lobby".
  if (e.target.id === 'home-form') begin(document.activeElement?.id === 'code' ? 'join' : 'host');
  if (e.target.id === 'answer-form') {
    const input = $('#answer');
    const text = input.value.trim();
    if (!text) return;
    input.value = '';
    act({ type: 'answer', text, qid: ctx.view.qualify.asked });
  }
});

stage.addEventListener('click', async (e) => {
  const btn = e.target.closest('[data-act]');
  if (!btn || btn.disabled) return;
  const actName = btn.dataset.act;
  if (actName !== 'host' && actName !== 'join') sfx.click();
  switch (actName) {
    case 'join':
      begin('join');
      break;
    case 'retry':
      location.href = location.pathname + (ctx.prefillCode ? `?room=${ctx.prefillCode}` : '') + (DEV ? (ctx.prefillCode ? '&dev' : '?dev') : '');
      break;
    case 'toggle-mic':
      ctx.selfMuted = !ctx.selfMuted;
      voice?.setSelfMuted(ctx.selfMuted);
      listener.set(ctx.view ? shouldListen(ctx.view) : false);
      renderChrome();
      break;
    case 'copy-link':
      try {
        await navigator.clipboard.writeText(inviteLink());
        toast('הקישור הועתק. שלחו אותו לחברים.');
      } catch {
        toast(inviteLink());
      }
      break;
    case 'start':
      act({ type: 'start' });
      break;
    case 'add-bot':
      act({ type: 'add-bot' });
      break;
    case 'pass':
      act({ type: 'answer', text: '', qid: ctx.view.qualify.asked });
      $('#answer')?.focus();
      break;
    case 'choose':
      act({ type: 'choose', square: Number(btn.dataset.square) });
      break;
    case 'pick':
      pick(Number(btn.dataset.option));
      break;
    case 'again':
      act({ type: 'again' });
      break;
    case 'leave':
      location.href = location.pathname + (DEV ? '?dev' : '');
      break;
    default:
      break;
  }
});

// Keyboard shortcuts in the duel: 1-4 or א-ד.
addEventListener('keydown', (e) => {
  const v = ctx.view;
  if (!v || v.phase !== 'duel' || !roleOf(v) || e.target.tagName === 'INPUT') return;
  const idx = /^[1-4]$/.test(e.key) ? Number(e.key) - 1 : ['א', 'ב', 'ג', 'ד'].indexOf(e.key);
  if (idx !== -1) pick(idx);
});

addEventListener('beforeunload', (e) => {
  if (ctx.view && ctx.view.phase !== 'lobby' && ctx.view.phase !== 'final') {
    e.preventDefault();
    e.returnValue = '';
  }
});

goHome();
