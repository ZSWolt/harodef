// Screen templates. Each screen returns a key (re-render when it changes) and HTML.
// Everything coming from other players goes through esc().

export function esc(s) {
  return String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
}

const svg = (body, cls = 'icon') =>
  `<svg class="${cls}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${body}</svg>`;

export const icons = {
  mic: (c) => svg('<rect x="9" y="2" width="6" height="12" rx="3"/><path d="M5 10a7 7 0 0 0 14 0M12 17v5M8 22h8"/>', c),
  micOff: (c) => svg('<path d="M2 2l20 20M9 9v1a3 3 0 0 0 5.1 2.1M15 9.3V5a3 3 0 0 0-5.9-.7"/><path d="M19 10a7 7 0 0 1-1.2 3.9M5 10a7 7 0 0 0 11 5.7M12 17v5M8 22h8"/>', c),
  headphones: (c) => svg('<path d="M3 18v-6a9 9 0 0 1 18 0v6"/><path d="M21 19a2 2 0 0 1-2 2h-1v-6h3zM3 19a2 2 0 0 0 2 2h1v-6H3z"/>', c),
  link: (c) => svg('<path d="M10 13a5 5 0 0 0 7.5.5l3-3a5 5 0 0 0-7-7l-1.7 1.7"/><path d="M14 11a5 5 0 0 0-7.5-.5l-3 3a5 5 0 0 0 7 7l1.7-1.7"/>', c),
  crown: (c) => svg('<path d="M2 18h20M3 7l5 5 4-7 4 7 5-5-2 11H5z"/>', c),
  ear: (c) => svg('<path d="M6 8.5a6 6 0 1 1 12 0c0 6-6 6-6 10a3 3 0 0 1-6 0"/><path d="M9 9a3 3 0 1 1 6 0"/>', c),
  earOff: (c) => svg('<path d="M2 2l20 20"/><path d="M6 8.5a6 6 0 0 1 10.3-4.2M18 8.5c0 3.2-1.7 4.6-3.3 5.9M12 18.5a3 3 0 0 1-6 0"/>', c),
  alert: (c) => svg('<path d="M12 9v4M12 17h.01"/><path d="M10.3 3.9L1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z"/>', c),
  bot: (c) => svg('<rect x="4" y="8" width="16" height="12" rx="3"/><path d="M12 4v4M9 14h.01M15 14h.01"/>', c),
};

const LETTERS = ['א', 'ב', 'ג', 'ד'];

const STATUS = {
  waiting: 'ממתין/ה',
  playing: 'בתור',
  eliminated: 'נפסל/ה',
  escaped: 'ברח/ה',
  caught: 'נתפס/ה',
  left: 'עזב/ה',
};

export function initials(name) {
  return esc(String(name).trim().slice(0, 2));
}

function nameOf(v, id) {
  return esc(v.players.find((p) => p.id === id)?.name ?? '');
}

function timerRing(cls = '') {
  const r = 110;
  const c = 2 * Math.PI * r;
  return `<div class="timer ${cls}" data-timer role="timer" aria-label="זמן שנותר">
    <svg viewBox="0 0 260 260"><circle class="ring-bg" cx="130" cy="130" r="${r}"/><circle class="ring-fg" cx="130" cy="130" r="${r}" stroke-dasharray="${c}" stroke-dashoffset="0"/></svg>
    <span class="timer-num num">--</span></div>`;
}

// ---------- chrome around the screens ----------

export function topbar(ctx) {
  const v = ctx.view;
  const phaseNames = {
    lobby: 'לובי',
    draw: 'הגרלה',
    qualify: 'סבב מוקדמות',
    qualified: 'סבב מוקדמות',
    choose: 'בחירת משבצת',
    duel: 'המרדף',
    reveal: 'המרדף',
    final: 'סוף המשחק',
  };
  return `<div class="brand">הרודף <small>HARODEF</small></div>
    <div class="room-chip">חדר <b class="num">${esc(ctx.code)}</b></div>
    <span class="phase-label">${phaseNames[v?.phase] ?? ''}</span>
    <div class="spacer"></div>
    <span class="conn ${ctx.connOk ? '' : 'bad'}">${ctx.connOk ? 'מחובר' : 'אין חיבור'}${ctx.isHost ? ' · מארח/ת' : ''}</span>
    <button class="btn btn-sm mic-btn ${ctx.selfMuted ? 'off' : ''}" data-act="toggle-mic" aria-pressed="${ctx.selfMuted}">
      ${ctx.selfMuted ? icons.micOff() + ' מושתק/ת' : icons.mic() + ' מיקרופון פתוח'}
    </button>`;
}

export function people(ctx) {
  const v = ctx.view;
  const muted = new Set(v.blocked && v.blocked.includes(ctx.me) ? v.blocked.filter((id) => id !== ctx.me) : []);
  return v.players
    .filter((p) => !p.gone || v.phase !== 'lobby')
    .map((p) => {
      const st = v.results?.[p.id]?.status;
      const isChaser = p.id === v.chaserId;
      const isCurrent = p.id === v.currentId && v.phase !== 'final';
      const tag = isChaser ? 'הרודף' : isCurrent ? 'בתור' : st && st !== 'waiting' ? STATUS[st] : p.bot ? 'בוט' : '';
      const cls = [
        'person',
        isChaser && 'is-chaser',
        isCurrent && 'is-current',
        p.id === ctx.me && 'is-me',
        st && `st-${st}`,
        p.gone && 'st-left',
      ].filter(Boolean).join(' ');
      return `<div class="${cls}" data-person="${esc(p.id)}">
        <div class="av">${initials(p.name)}${muted.has(p.id) ? `<span class="muted-mark" title="לא שומעים זה את זה">${icons.earOff()}</span>` : ''}</div>
        <span class="nm">${esc(p.name)}</span>
        <span class="tag">${tag}</span>
      </div>`;
    })
    .join('');
}

// ---------- screens ----------

export function home(ctx) {
  return {
    key: 'home',
    html: `<section class="home">
      <div>
        <div class="logo" data-enter>
          <h1 class="logo-word">הרודף</h1>
          <span class="logo-sub">HARODEF</span>
          <div class="logo-track" aria-hidden="true"><i class="t-chaser"></i><i class="t-player"></i></div>
        </div>
        <p class="tagline" data-enter>עונים מהר, צוברים <b>40 נקודות</b>,<br>ובורחים מהרודף עד הבית.</p>
      </div>
      <form class="panel card" data-enter id="home-form" autocomplete="off">
        <div>
          <label for="name">איך קוראים לך?</label>
          <input class="field" id="name" name="name" maxlength="16" required placeholder="השם שיופיע במשחק" value="${esc(ctx.savedName)}">
        </div>
        <button class="btn btn-primary btn-lg" type="submit" data-act="host">פתיחת לובי חדש</button>
        <div class="divider">או הצטרפות ללובי קיים</div>
        <div class="row">
          <input class="field code" id="code" name="code" maxlength="4" placeholder="קוד" value="${esc(ctx.prefillCode)}" aria-label="קוד לובי בן 4 אותיות">
          <button class="btn btn-player btn-lg" type="button" data-act="join">הצטרפות</button>
        </div>
        <p class="err" id="home-err" role="alert">${esc(ctx.error)}</p>
        <p class="note">${icons.headphones()}<span>המשחק דורש מיקרופון: עונים בקול (או מקלידים). מומלץ לשחק עם אוזניות, בכרום, ממחשב.</span></p>
      </form>
    </section>`,
  };
}

export function message(title, body, actions = '', icon = icons.alert('big-icon')) {
  return {
    key: `msg:${title}`,
    html: `<section class="message" data-enter>${icon}<h2>${esc(title)}</h2><p>${body}</p><div class="final-actions">${actions}</div></section>`,
  };
}

export function busy(text) {
  return {
    key: `busy:${text}`,
    html: `<section class="message" data-enter><div class="logo"><div class="logo-track" aria-hidden="true"><i class="t-chaser"></i><i class="t-player"></i></div></div><h2>${esc(text)}</h2></section>`,
  };
}

function lobby(ctx) {
  const v = ctx.view;
  const list = v.players.filter((p) => !p.gone);
  const need = Math.max(0, v.minPlayers - list.length);
  const tiles = list.map(
    (p, i) => `<div class="ptile ${p.id === ctx.me ? 'me' : ''}" style="--i:${i}" data-person="${esc(p.id)}">
      <span class="av">${p.bot ? icons.bot() : initials(p.name)}</span>
      <span class="meta"><span>${esc(p.name)}</span><small>${i === 0 ? 'מארח/ת' : p.bot ? 'בוט לבדיקות' : 'מוכן/ה'}</small></span>
    </div>`,
  );
  for (let i = list.length; i < v.minPlayers; i++) tiles.push(`<div class="ptile empty">ממתינים לשחקן</div>`);
  return {
    key: `lobby:${list.map((p) => p.id).join(',')}`,
    html: `<section class="lobby">
      <aside class="code-block card" data-enter>
        <span class="muted">קוד הלובי</span>
        <div class="code-letters">${[...ctx.code].map((c) => `<span>${esc(c)}</span>`).join('')}</div>
        <button class="btn btn-ghost" data-act="copy-link">${icons.link()} העתקת קישור הזמנה</button>
        <ol class="rules-mini">
          <li>שחקן אחד יוגרל להיות הרודף.</li>
          <li>כל שחקן מקבל 90 שניות לענות על כמה שיותר שאלות. כל תשובה נכונה = 5 נקודות.</li>
          <li>מי שמגיע ל־40 נקודות עולה למרדף: 8 משבצות, 30 שניות לכל שאלה אמריקאית.</li>
          <li>מגיעים למשבצת 8 לפני שהרודף תופס, ובעל הניקוד הגבוה מבין הבורחים מנצח.</li>
        </ol>
      </aside>
      <div class="lobby-main">
        <p class="count-line" data-enter><span class="num">${list.length}</span> שחקנים בלובי
          <span class="muted small">${need ? `· צריך עוד ${need} כדי להתחיל` : '· אפשר להתחיל'}</span></p>
        <div class="player-grid">${tiles.join('')}</div>
        <div class="lobby-actions">
          ${ctx.isHost
            ? `<button class="btn btn-primary btn-lg" data-act="start" ${need ? 'disabled' : ''}>התחלת המשחק</button>
               ${ctx.dev ? `<button class="btn btn-ghost" data-act="add-bot">${icons.bot()} הוספת בוט</button>` : ''}`
            : `<span class="muted">המארח/ת יתחיל/תתחיל את המשחק כשכולם יגיעו.</span>`}
          <div class="spacer"></div>
          <button class="btn btn-ghost btn-sm" data-act="leave">יציאה מהלובי</button>
        </div>
      </div>
    </section>`,
  };
}

function draw(ctx) {
  const v = ctx.view;
  return {
    key: 'draw',
    html: `<section class="draw">
      <div class="reel"><span class="kicker">הרודף של המשחק הזה</span><span class="reel-name" id="reel-name">?</span></div>
      <ol class="order-list" id="order-list">
        ${v.order.map((id, i) => `<li><b class="num">${i + 1}</b>${nameOf(v, id)}</li>`).join('')}
      </ol>
    </section>`,
    // main.js spins the reel through these names before landing on the chaser.
    reel: v.players.filter((p) => p.id !== v.chaserId).map((p) => p.name),
    chaserName: v.players.find((p) => p.id === v.chaserId)?.name ?? '',
  };
}

function segments(points, target) {
  const per = target / 8;
  const on = Math.min(8, Math.floor(points / per));
  return `<div class="segs ${points >= target ? 'done' : ''}">${Array.from({ length: 8 }, (_, i) => `<i class="${i < on ? 'on' : ''}"></i>`).join('')}</div>`;
}

function lastAnswer(last) {
  if (!last) return `<div class="last"><span class="muted">התשובות יופיעו כאן</span></div>`;
  if (last.pass) {
    return `<div class="last pass"><span class="mark">–</span><span>דילוג · התשובה: <b>${esc(last.answer)}</b></span></div>`;
  }
  return last.correct
    ? `<div class="last right"><span class="mark">✓</span><span>"${esc(last.said)}" · <b>נכון!</b></span></div>`
    : `<div class="last wrong"><span class="mark">✗</span><span>"${esc(last.said)}" · התשובה: <b>${esc(last.answer)}</b></span></div>`;
}

function qualify(ctx) {
  const v = ctx.view;
  const mine = v.currentId === ctx.me;
  const q = v.qualify;
  return {
    key: `qualify:${v.currentId}`,
    html: `<section class="qualify">
      <aside class="side card">
        <div class="who"><small>על הבמה</small><b>${nameOf(v, v.currentId)}</b></div>
        ${timerRing()}
        <div class="meter">
          <div class="meter-head"><span class="pts num" id="q-points">${q.points}</span><small>מתוך <span class="num">${v.target}</span> להעפלה</small></div>
          <div id="q-segs">${segments(q.points, v.target)}</div>
        </div>
      </aside>
      <div class="q-main">
        <div class="qcard card">
          <span class="qnum" id="q-num">שאלה <span class="num">${q.asked + 1}</span></span>
          <p class="qtext" id="q-text">${esc(q.q)}</p>
        </div>
        <div id="q-last">${lastAnswer(q.last)}</div>
        ${mine
          ? `<form class="answer-zone" id="answer-form" autocomplete="off">
              ${listenBox(ctx)}
              <input class="field" id="answer" maxlength="80" placeholder="אפשר גם להקליד ולהקיש Enter">
              <button class="btn btn-primary" type="submit">שליחה</button>
              <button class="btn btn-ghost" type="button" data-act="pass">דילוג</button>
            </form>`
          : `<p class="watching">${v.chaserId === ctx.me ? 'את/ה הרודף. תקשיב/י טוב, עוד מעט תורך.' : 'מקשיבים לשחקן/ית עונה. השקט בבקשה!'}</p>`}
      </div>
    </section>`,
    patch(root) {
      root.querySelector('#q-points').textContent = q.points;
      root.querySelector('#q-segs').innerHTML = segments(q.points, v.target);
      const num = root.querySelector('#q-num .num');
      if (num.textContent !== String(q.asked + 1)) {
        num.textContent = q.asked + 1;
        root.querySelector('#q-text').textContent = q.q;
        root.querySelector('#q-last').innerHTML = lastAnswer(q.last);
        return 'next-question';
      }
      return null;
    },
  };
}

export function listenBox(ctx) {
  const states = {
    listening: ['on', 'מקשיב/ה…'],
    off: ['', 'המיקרופון לא מזהה כרגע'],
    blocked: ['', 'זיהוי דיבור חסום: הקלידו'],
    unsupported: ['', 'זיהוי דיבור לא נתמך: הקלידו'],
  };
  const [cls, label] = states[ctx.listenState] ?? states.off;
  return `<div class="listen ${cls}" id="listen"><span class="dot"></span><span>${label}</span><span class="heard" id="heard">${esc(ctx.interim)}</span></div>`;
}

function qualified(ctx) {
  const v = ctx.view;
  const pts = v.results[v.currentId].points;
  return {
    key: `qualified:${v.currentId}`,
    html: `<section class="verdict out">
      <span class="big" data-pop>נפסל/ה</span>
      <p>${nameOf(v, v.currentId)} צבר/ה <span class="num">${pts}</span> נקודות. צריך ${v.target} כדי להילחם ברודף.</p>
      <p class="small muted">המתמודד/ת הבא/ה עולה לבמה…</p>
    </section>`,
  };
}

export function boardHtml(v, { options = [] } = {}) {
  const d = v.duel ?? { player: 4, chaser: 1 };
  const cells = [];
  for (let n = 1; n <= v.board; n++) {
    const danger = n <= d.chaser;
    const cls = ['sq', n === v.board && 'home-sq', danger && 'danger', options.includes(n) && 'option'].filter(Boolean).join(' ');
    let tokens = '';
    if (n === d.chaser) tokens += `<div class="token chaser" data-token="chaser">ר<small>${nameOf(v, v.chaserId)}</small></div>`;
    if (n === d.player) tokens += `<div class="token player" data-token="player">ש<small>${nameOf(v, v.currentId)}</small></div>`;
    cells.push(`<div class="${cls}" data-sq="${n}"><span class="n num">${n}</span>${tokens}</div>`);
  }
  return `<div class="board" id="board">${cells.join('')}</div>
    <div class="board-legend"><span>הרודף מתחיל כאן</span><span>הבית: משבצת ${v.board}</span></div>`;
}

function choose(ctx) {
  const v = ctx.view;
  const mine = v.currentId === ctx.me;
  const pts = v.results[v.currentId].points;
  return {
    key: `choose:${v.currentId}`,
    html: `<section class="choose">
      <div class="choose-head">
        <h2><b>${nameOf(v, v.currentId)}</b> עלה/תה למרדף עם <span class="num">${pts}</span> נקודות!</h2>
        ${timerRing('sm')}
      </div>
      ${boardHtml(v, { options: [3, 5] })}
      ${mine
        ? `<div class="choices">
            <button class="choice risky" data-act="choose" data-square="3">
              <span class="c-sq">משבצת 3 · קרוב יותר לרודף</span>
              <span class="c-pts num">+10</span>
              <span class="c-why">יותר נקודות, אבל הרודף יושב לך על הגב.</span>
            </button>
            <button class="choice safe" data-act="choose" data-square="5">
              <span class="c-sq">משבצת 5 · רחוק יותר מהרודף</span>
              <span class="c-pts num">−10</span>
              <span class="c-why">פחות נקודות, יותר מרחק ביטחון.</span>
            </button>
          </div>`
        : `<p class="watching">${nameOf(v, v.currentId)} מחליט/ה: משבצת 3 (+10) או משבצת 5 (−10)?</p>`}
    </section>`,
  };
}

function duel(ctx) {
  const v = ctx.view;
  const d = v.duel;
  const role = ctx.me === v.chaserId ? 'chaser' : ctx.me === v.currentId ? 'player' : null;
  const revealed = v.phase === 'reveal';
  const answered = role && (d.answered[role] || ctx.myPick != null);
  const canAnswer = role && !revealed && !answered;
  const opts = d.o
    .map((text, i) => {
      const cls = ['opt'];
      let marks = '';
      if (revealed) {
        if (i === d.reveal.right) cls.push('right');
        else cls.push('dim');
        if (d.answers.chaser === i) marks += '<i class="m-chaser">הרודף</i>';
        if (d.answers.player === i) marks += '<i class="m-player">השחקן</i>';
      } else if (role && ctx.myPick === i) {
        cls.push('picked');
      }
      const tag = role ? 'button' : 'div';
      return `<${tag} class="${cls.join(' ')}" ${role ? `data-act="pick" data-option="${i}" ${canAnswer ? '' : 'disabled'}` : ''}>
        <span class="letter">${LETTERS[i]}</span><span>${esc(text)}</span><span class="marks">${marks}</span></${tag}>`;
    })
    .join('');
  const hearing = role
    ? `<div class="hear ${revealed ? '' : 'cut'}">${revealed ? icons.ear() + ' שומעים שוב את כולם' : icons.earOff() + (role === 'chaser' ? ' השחקן לא שומע אותך ואת/ה לא שומע/ת אותו' : ' הרודף לא שומע אותך ואת/ה לא שומע/ת אותו')}</div>`
    : `<div class="hear">${icons.ear()} את/ה שומע/ת את שניהם</div>`;
  return {
    key: `duel:${v.currentId}:${d.round}:${v.phase}:${answered || ctx.myPick != null ? 'locked' : 'open'}`,
    html: `<section class="duel">
      <div>${boardHtml(v)}</div>
      <div class="duel-body">
        <div class="duel-q">
          <p class="qtext card" style="padding:var(--s-5) var(--s-6)">${esc(d.q)}</p>
          <div class="options">${opts}</div>
          ${canAnswer ? `<div class="duel-input">${listenBox(ctx)}<span class="muted small">לחצו על תשובה או אמרו "א", "ב", "ג" או "ד"</span></div>` : role && !revealed ? `<p class="muted small">התשובה ננעלה. מחכים לצד השני…</p>` : ''}
        </div>
        <aside class="duel-side">
          ${revealed ? `<div class="timer sm"><span class="timer-num num">${d.reveal.playerRight ? '✓' : '✗'}</span></div>` : timerRing('sm')}
          <div class="lock-chip player ${d.answered.player ? 'done' : ''}">${nameOf(v, v.currentId)}<span class="st">${d.answered.player ? 'ענה/תה' : 'חושב/ת…'}</span></div>
          <div class="lock-chip chaser ${d.answered.chaser ? 'done' : ''}">הרודף<span class="st">${d.answered.chaser ? 'ענה' : 'חושב…'}</span></div>
          ${hearing}
          <span class="muted small">שאלה <span class="num">${d.round}</span></span>
        </aside>
      </div>
      ${revealed && d.reveal.outcome ? outcomeHtml(v) : ''}
    </section>`,
    patch(root) {
      // Only the lock chips change while a question is open.
      root.querySelectorAll('.lock-chip').forEach((chip) => {
        const r = chip.classList.contains('chaser') ? 'chaser' : 'player';
        chip.classList.toggle('done', d.answered[r]);
        chip.querySelector('.st').textContent = d.answered[r] ? (r === 'chaser' ? 'ענה' : 'ענה/תה') : r === 'chaser' ? 'חושב…' : 'חושב/ת…';
      });
      return null;
    },
  };
}

function outcomeHtml(v) {
  const caught = v.duel.reveal.outcome === 'caught';
  return `<div class="outcome ${caught ? 'caught' : 'escaped'}" data-outcome>
    <span class="big">${caught ? 'נתפס/ה!' : 'ברח/ה!'}</span>
    <p>${caught ? `הרודף תפס את ${nameOf(v, v.currentId)}` : `${nameOf(v, v.currentId)} הגיע/ה הביתה עם ${v.results[v.currentId].points} נקודות`}</p>
  </div>`;
}

function final(ctx) {
  const v = ctx.view;
  const w = v.winner;
  const rows = v.order
    .map((id) => ({ id, ...v.results[id] }))
    .sort((a, b) => (b.status === 'escaped') - (a.status === 'escaped') || b.points - a.points)
    .map(
      (r, i) => `<tr><td class="num">${i + 1}</td><td>${nameOf(v, r.id)}</td><td class="num">${r.points}</td>
        <td><span class="badge ${r.status}">${STATUS[r.status] ?? ''}</span></td></tr>`,
    )
    .join('');
  const winnerCard =
    w.kind === 'chaser'
      ? `<div class="winner card chaser-win" data-pop>${icons.crown('crown')}<small>אף אחד לא ברח. המנצח:</small><b>הרודף</b><span class="pts">${nameOf(v, w.id)}</span></div>`
      : `<div class="winner card" data-pop>${icons.crown('crown')}<small>המנצח/ת</small><b>${nameOf(v, w.id)}</b><span class="pts"><span class="num">${v.results[w.id].points}</span> נקודות</span></div>`;
  return {
    key: 'final',
    html: `<section class="final">
      ${winnerCard}
      <div class="card" style="padding:var(--s-6)">
        <h2 style="font-size:var(--t-lg);margin-bottom:var(--s-4)">טבלת התוצאות</h2>
        <table class="ranking"><thead><tr><th>#</th><th>שחקן/ית</th><th>נקודות</th><th>סטטוס</th></tr></thead><tbody>${rows}</tbody></table>
        <div class="final-actions">
          ${ctx.isHost ? `<button class="btn btn-primary" data-act="again">משחק חוזר עם אותו לובי</button>` : `<span class="muted small">המארח/ת יכול/ה לפתוח משחק חוזר.</span>`}
          <button class="btn btn-ghost" data-act="leave">יציאה</button>
        </div>
      </div>
    </section>`,
  };
}

export const SCREENS = { lobby, draw, qualify, qualified, choose, duel, reveal: duel, final };
