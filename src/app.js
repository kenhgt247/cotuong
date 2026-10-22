(function () {
  'use strict';
  const Eng = createEngine();
  const { ROW, COL } = Eng;
  const $ = (id) => document.getElementById(id);

  // ---------- Hằng số giao diện ----------
  const GLYPH = [
    ['', '帥', '仕', '相', '馬', '車', '炮', '兵'],
    ['', '將', '士', '象', '馬', '車', '炮', '卒'],
  ];
  const GLYPH_VI = [
    ['', 'Soái', 'Sĩ', 'Tượng', 'Mã', 'Xe', 'Pháo', 'Binh'],
    ['', 'Tướng', 'Sĩ', 'Tượng', 'Mã', 'Xe', 'Pháo', 'Tốt'],
  ];
  const glyph = (sd, ty) => (S.pieceStyle === 'vi' ? GLYPH_VI : GLYPH)[sd][ty];
  const PIECE_NAME = ['', 'Tướng', 'Sĩ', 'Tượng', 'Mã', 'Xe', 'Pháo', 'Tốt'];
  const SIDE_NAME = ['Trắng (đỏ)', 'Đen'];
  const SIDE_SHORT = ['Trắng', 'Đen'];
  const LEVELS = [
    { name: 'Dễ', maxDepth: 2, timeMs: 400, margin: 300, exact: true },
    { name: 'Vừa', maxDepth: 3, timeMs: 800, margin: 40, exact: true },
    { name: 'Khó', maxDepth: 6, timeMs: 2500, margin: 0 },
    { name: 'Cao thủ', maxDepth: 9, timeMs: 5000, margin: 0 },
  ];
  const NS = 'http://www.w3.org/2000/svg';
  const CELL = 56, M = 52;
  const BW = 8 * CELL + 2 * M, BH = 9 * CELL + 2 * M;

  // ---------- Trạng thái ----------
  // S: cài đặt dùng chung. G: ván đang hiển thị (ván thật, xem lại hoặc bài tập). stash: ván thật khi đang xem lại/làm bài tập.
  const S = { mode: 'ai', human: 0, level: 1, clock: 0, hints: true, sound: true, vibe: true, flipped: false, pieceStyle: 'han' };
  let G = null, stash = null;
  let aiToken = 0;

  function freshGame(opts) {
    opts = opts || {};
    const first = opts.first || 0;
    const b = opts.board ? Int8Array.from(opts.board) : Eng.initialBoard();
    const ms = (opts.kind && opts.kind !== 'game') ? 0 : S.clock * 60000;
    return { kind: opts.kind || 'game', id: Date.now(), first,
      cfg: opts.cfg || { mode: S.mode, human: S.human, level: S.level, clock: S.clock },
      pos: [b], moves: [], notes: [], keys: [Eng.boardKey(b, first)], caps: [], over: null,
      sel: null, legal: [], hint: null, hintText: '', thinking: false, busy: false, anim: null, viewing: false,
      view: null, auto: 0, analysis: null, puzzle: opts.puzzle || null,
      clock: { on: ms > 0, t: [ms, ms], last: null } };
  }
  const isGame = () => G.kind === 'game';
  const cfg = () => G.cfg;
  // lượt đi và thế cờ THẬT (dùng cho luật chơi)
  const turn = () => (G.first + G.moves.length) & 1;
  const cur = () => G.pos[G.pos.length - 1];
  // thế cờ ĐANG XEM (dùng để vẽ)
  const vlen = () => (G.view == null ? G.moves.length : G.view);
  const vpos = () => G.pos[vlen()];
  const vturn = () => (G.first + vlen()) & 1;
  const humanTurn = () => cfg().mode === 'pvp' || turn() === cfg().human;
  const stateOf = (b) => Eng.newState(Int8Array.from(b));

  // ---------- SVG ----------
  const svg = $('board');
  svg.setAttribute('viewBox', `0 0 ${BW} ${BH}`);
  function el(name, attrs, parent) {
    const e = document.createElementNS(NS, name);
    for (const k in attrs) e.setAttribute(k, attrs[k]);
    if (parent) parent.appendChild(e);
    return e;
  }
  const defs = el('defs', {}, svg);
  const rg = el('radialGradient', { id: 'pg', cx: '35%', cy: '30%', r: '75%' }, defs);
  el('stop', { offset: '0', 'stop-color': '#fff8e1' }, rg);
  el('stop', { offset: '1', 'stop-color': '#e3bf7c' }, rg);
  const gb = el('linearGradient', { id: 'wood', x1: '0', y1: '0', x2: '1', y2: '1' }, defs);
  el('stop', { offset: '0', 'stop-color': '#f2d293' }, gb);
  el('stop', { offset: '1', 'stop-color': '#dba95b' }, gb);
  const gg = el('radialGradient', { id: 'glow' }, defs);
  el('stop', { offset: '0', 'stop-color': '#ff3b30', 'stop-opacity': '.85' }, gg);
  el('stop', { offset: '1', 'stop-color': '#ff3b30', 'stop-opacity': '0' }, gg);

  const gGrid = el('g', {}, svg);
  const gLabels = el('g', {}, svg);
  const gHl = el('g', {}, svg);
  const gPieces = el('g', {}, svg);
  const gMarks = el('g', {}, svg);

  const lineStyle = { stroke: '#5a3a14', 'stroke-width': 1.6, 'stroke-linecap': 'round' };
  function line(x1, y1, x2, y2, extra) {
    el('line', Object.assign({ x1, y1, x2, y2 }, lineStyle, extra || {}), gGrid);
  }
  const X = (c) => M + c * CELL, Y = (r) => M + r * CELL;

  function drawGrid() {
    el('rect', { x: 0, y: 0, width: BW, height: BH, rx: 18, fill: 'url(#wood)' }, gGrid);
    el('rect', { x: 3, y: 3, width: BW - 6, height: BH - 6, rx: 16, fill: 'none', stroke: '#8a5a22', 'stroke-width': 3 }, gGrid);
    el('rect', { x: M - 10, y: M - 10, width: 8 * CELL + 20, height: 9 * CELL + 20, fill: 'none', stroke: '#5a3a14', 'stroke-width': 3 }, gGrid);
    for (let r = 0; r < 10; r++) line(X(0), Y(r), X(8), Y(r));
    for (let c = 0; c < 9; c++) {
      if (c === 0 || c === 8) line(X(c), Y(0), X(c), Y(9));
      else { line(X(c), Y(0), X(c), Y(4)); line(X(c), Y(5), X(c), Y(9)); }
    }
    line(X(3), Y(0), X(5), Y(2)); line(X(5), Y(0), X(3), Y(2));
    line(X(3), Y(7), X(5), Y(9)); line(X(5), Y(7), X(3), Y(9));
    const tick = (r, c) => {
      const d = 5, l = 12;
      for (const sx of [-1, 1]) for (const sy of [-1, 1]) {
        if ((c === 0 && sx === -1) || (c === 8 && sx === 1)) continue;
        const x = X(c) + sx * d, y = Y(r) + sy * d;
        line(x, y, x + sx * l, y, { 'stroke-width': 1.3 });
        line(x, y, x, y + sy * l, { 'stroke-width': 1.3 });
      }
    };
    [[2, 1], [2, 7], [7, 1], [7, 7]].forEach(([r, c]) => tick(r, c));
    [0, 2, 4, 6, 8].forEach((c) => { tick(3, c); tick(6, c); });
    const river = { y: Y(4.5), 'text-anchor': 'middle', 'dominant-baseline': 'central', 'font-size': 26, fill: '#6b4518', 'font-family': 'KaiTi,STKaiti,"Noto Serif CJK SC",serif', 'letter-spacing': 6 };
    el('text', Object.assign({ x: X(2) + 4 }, river), gGrid).textContent = '楚河';
    el('text', Object.assign({ x: X(6) - 4 }, river), gGrid).textContent = '漢界';
    // con dấu tên người nhận
    const sx = X(4), sy = Y(4.5);
    el('rect', { x: sx - 66, y: sy - 15, width: 132, height: 30, rx: 7, fill: '#b3261e', stroke: '#7d1a14', 'stroke-width': 2, opacity: .92 }, gGrid);
    el('rect', { x: sx - 62, y: sy - 11, width: 124, height: 22, rx: 5, fill: 'none', stroke: '#ffd9c9', 'stroke-width': 1, opacity: .7 }, gGrid);
    el('text', { x: sx, y: sy + 1, 'text-anchor': 'middle', 'dominant-baseline': 'central', 'font-size': 13.5, 'font-weight': 700, fill: '#fff4e0', 'font-family': 'Georgia,"Times New Roman",serif', 'font-style': 'italic' }, gGrid).textContent = 'Bùi Văn Bảo Nam';
  }
  drawGrid();

  (function drawLabels() {
    for (let dc = 0; dc < 9; dc++) {
      const st = { 'text-anchor': 'middle', 'font-size': 15, fill: '#6b4518', 'font-weight': 600 };
      el('text', Object.assign({ x: X(dc), y: M - 31 }, st), gLabels).textContent = dc + 1;
      el('text', Object.assign({ x: X(dc), y: BH - M + 38 }, st), gLabels).textContent = 9 - dc;
    }
  })();

  const flipR = (r) => (S.flipped ? 9 - r : r);
  const flipC = (c) => (S.flipped ? 8 - c : c);
  const sqX = (sq) => X(flipC(COL[sq]));
  const sqY = (sq) => Y(flipR(ROW[sq]));

  function svgPoint(ev) {
    const pt = svg.createSVGPoint();
    pt.x = ev.clientX; pt.y = ev.clientY;
    const m = svg.getScreenCTM();
    return m ? pt.matrixTransform(m.inverse()) : { x: 0, y: 0 };
  }
  function sqAt(x, y) {
    const dc = Math.round((x - M) / CELL), dr = Math.round((y - M) / CELL);
    if (dc < 0 || dc > 8 || dr < 0 || dr > 9) return -1;
    return (S.flipped ? 9 - dr : dr) * 9 + (S.flipped ? 8 - dc : dc);
  }

  // ---------- Âm thanh & rung ----------
  let actx = null;
  function tone(freq, dur, type, vol, delay) {
    if (!S.sound) return;
    try {
      if (!actx) actx = new (window.AudioContext || window.webkitAudioContext)();
      if (actx.state === 'suspended') actx.resume();
      const t0 = actx.currentTime + (delay || 0);
      const o = actx.createOscillator(), g = actx.createGain();
      o.type = type || 'sine'; o.frequency.setValueAtTime(freq, t0);
      g.gain.setValueAtTime(0.0001, t0);
      g.gain.exponentialRampToValueAtTime(vol || 0.15, t0 + 0.01);
      g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
      o.connect(g); g.connect(actx.destination);
      o.start(t0); o.stop(t0 + dur + 0.02);
    } catch (e) { /* bỏ qua nếu trình duyệt chặn âm thanh */ }
  }
  const SND = {
    move() { tone(300, 0.07, 'triangle', 0.22); tone(180, 0.1, 'sine', 0.18, 0.02); },
    capture() { tone(200, 0.1, 'square', 0.12); tone(120, 0.16, 'triangle', 0.25, 0.03); },
    check() { tone(660, 0.12, 'square', 0.1, 0.08); tone(880, 0.16, 'square', 0.1, 0.2); },
    win() { [523, 659, 784, 1047].forEach((f, i) => tone(f, 0.22, 'triangle', 0.18, i * 0.14)); },
    lose() { [392, 330, 262].forEach((f, i) => tone(f, 0.28, 'triangle', 0.18, i * 0.18)); },
    bad() { tone(160, 0.18, 'sawtooth', 0.12); },
  };
  function buzz(p) { if (S.vibe && navigator.vibrate) { try { navigator.vibrate(p); } catch (e) { /* */ } } }

  // ---------- Thông báo, hộp thoại ----------
  let toastTimer = 0;
  function toast(msg, warn, ms) {
    const t = $('toast');
    t.textContent = msg;
    t.className = 'show' + (warn ? ' warn' : '');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => { t.className = ''; }, ms || 3200);
  }
  function openDlg(d) { if (d.showModal) { if (!d.open) d.showModal(); } else d.setAttribute('open', ''); }
  function closeDlg(d) { if (d.close) d.close(); else d.removeAttribute('open'); }
  const anyDialogOpen = () => document.querySelector('dialog[open]') !== null;
  function askConfirm(title, text, yes, no) {
    return new Promise((resolve) => {
      $('cfTitle').textContent = title; $('cfText').textContent = text;
      $('cfYes').textContent = yes || 'Đồng ý'; $('cfNo').textContent = no || 'Không';
      const d = $('confirmDlg');
      const done = (v) => { $('cfYes').onclick = $('cfNo').onclick = null; d.onclose = null; closeDlg(d); resolve(v); };
      $('cfYes').onclick = () => done(true);
      $('cfNo').onclick = () => done(false);
      d.onclose = () => resolve(false);
      openDlg(d);
    });
  }
  function setSheet(open) { document.body.classList.toggle('sheet-open', open); }

  // ---------- Web Worker cho máy suy nghĩ ----------
  let worker = null, jobId = 0;
  const pending = new Map();
  function initWorker() {
    try {
      const src = createEngine.toString() +
        '\nconst Eng = createEngine();\nonmessage = function (e) { const d = e.data; postMessage({ id: d.id, r: Eng.search(d.board, d.side, d.opts) }); };';
      const url = URL.createObjectURL(new Blob([src], { type: 'application/javascript' }));
      worker = new Worker(url);
      worker.onmessage = (e) => { const f = pending.get(e.data.id); if (f) { pending.delete(e.data.id); f(e.data.r); } };
      worker.onerror = () => { worker = null; pending.forEach((f) => f(null)); pending.clear(); };
    } catch (e) { worker = null; }
  }
  function resetWorker() {
    if (worker) { try { worker.terminate(); } catch (e) { /* */ } }
    pending.clear();
    initWorker();
  }
  function runSearch(board, side, opts) {
    return new Promise((resolve) => {
      if (worker) {
        const id = ++jobId;
        pending.set(id, resolve);
        worker.postMessage({ id, board: Int8Array.from(board), side, opts });
      } else {
        setTimeout(() => resolve(Eng.search(board, side, opts)), 40);
      }
    });
  }
  initWorker();

  // ---------- Luật lặp thế / chiếu mãi / bắt mãi ----------
  const countKey = (key) => { let n = 0; for (const k of G.keys) if (k === key) n++; return n; };

  function repetitionVerdict(key, mv, nb, mover) {
    const j = G.keys.indexOf(key);
    const boards = G.pos.slice(j).concat([nb]);
    const moves = G.moves.slice(j).concat([mv]);
    const { viol } = Eng.judgeCycle(boards, moves, (G.first + j) & 1);
    const opp = 1 - mover;
    if (viol[mover] && viol[opp]) return { kind: 'draw', both: true, viol };
    if (viol[mover]) return { kind: 'mover-loses', reason: viol[mover], viol };
    if (viol[opp]) return { kind: 'opp-loses', reason: viol[opp], viol };
    return { kind: 'draw', both: false, viol };
  }
  const REASON = { check: 'chiếu mãi (nước nào cũng chiếu Tướng)', chase: 'đuổi bắt mãi một quân' };

  // ---------- Đi quân ----------
  function applyRaw(mv) {
    const mover = turn();
    const board = cur();
    const note = Eng.notate(board, mv);
    const st = stateOf(board);
    const cap = Eng.makeMove(st, mv);
    G.moves.push(mv); G.notes.push(note); G.pos.push(st.b); G.caps.push(cap);
    G.keys.push(Eng.boardKey(st.b, 1 - mover));
    return { cap, mover };
  }

  function tryMove(mv, byHuman) {
    if (G.kind === 'puzzle') return puzzleMove(mv);
    const mover = turn();
    const board = cur();
    const st2 = stateOf(board);
    Eng.makeMove(st2, mv);
    const key = Eng.boardKey(st2.b, 1 - mover);
    let verdict = null;
    if (countKey(key) >= 2) verdict = repetitionVerdict(key, mv, st2.b, mover);
    if (verdict && verdict.kind === 'mover-loses' && byHuman) {
      SND.bad(); buzz([40, 50, 40]);
      toast(`Nước này lặp lại thế cờ lần thứ 3 và là ${REASON[verdict.reason]} – phạm luật! Hãy đổi nước đi khác.`, true, 5200);
      G.sel = null; render();
      return false;
    }
    let warn = null;
    if (byHuman && !verdict && countKey(key) === 1) {
      const w = repetitionVerdict(key, mv, st2.b, mover);
      if (w.viol[mover] && !w.viol[1 - mover]) warn = w.viol[mover];
    }
    const { cap } = applyRaw(mv);
    G.anim = { from: mv & 127, to: mv >> 7, cap };
    G.sel = null; G.hint = null; G.hintText = '';
    G.thinking = false;
    if (G.clock.on) G.clock.last = Date.now();
    afterMove(verdict, cap, mover);
    if (warn && !G.over) toast(`⚠ Bạn đang ${REASON[warn]} và thế cờ đã lặp lại. Nếu lặp lại lần nữa bạn sẽ bị xử thua – hãy đổi nước đi!`, true, 6500);
    return true;
  }

  function afterMove(verdict, cap, mover) {
    const t = turn();
    const chk = Eng.inCheck(stateOf(cur()), t);
    if (verdict) {
      if (verdict.kind === 'opp-loses') finish(mover, `${SIDE_NAME[1 - mover]} phạm luật ${REASON[verdict.reason]} nên bị xử thua.`);
      else if (verdict.kind === 'mover-loses') finish(1 - mover, `${SIDE_NAME[mover]} phạm luật ${REASON[verdict.reason]} nên bị xử thua.`);
      else if (verdict.both) finish(null, 'Hai bên cùng phạm luật chiếu mãi / bắt mãi nên ván cờ được xử hòa.');
      else finish(null, 'Thế cờ lặp lại 3 lần mà không bên nào phạm luật nên ván cờ hòa.');
    } else checkEnd(chk);
    if (!G.over) {
      if (chk) { SND.check(); buzz([30, 40, 30]); } else if (cap) { SND.capture(); buzz(28); } else { SND.move(); buzz(12); }
    }
    render();
    saveGame();
    if (!G.over) maybeAI();
  }

  function hasAttackers(side) {
    const b = cur();
    for (let sq = 0; sq < 90; sq++) {
      const p = b[sq];
      if (p && (p >> 3) === side) { const ty = p & 7; if (ty === Eng.R || ty === Eng.C || ty === Eng.H || ty === Eng.P) return true; }
    }
    return false;
  }

  function checkEnd(chk) {
    const t = turn();
    const b = cur();
    if (!Eng.genLegal(stateOf(b), t).length) {
      if (chk) finish(1 - t, `Chiếu bí! ${SIDE_NAME[1 - t]} thắng.`);
      else finish(1 - t, `Tướng ${SIDE_SHORT[t]} bị vây chặt, không còn nước đi nên ${SIDE_NAME[t]} thua.`);
      return;
    }
    if (!hasAttackers(0) && !hasAttackers(1)) { finish(null, 'Hai bên đều không còn Xe, Pháo, Mã, Tốt để tấn công nên ván cờ hòa.'); return; }
    let since = 0;
    for (let i = G.caps.length - 1; i >= 0 && !G.caps[i]; i--) since++;
    if (since >= 100) finish(null, '50 nước liên tiếp không bên nào ăn quân nên ván cờ hòa.');
  }

  function finish(winner, text) {
    G.over = { winner, text };
    G.thinking = false; G.busy = false; G.sel = null; G.hint = null; G.hintText = '';
    aiToken++;
    if (winner === null) { SND.move(); }
    else if (cfg().mode === 'ai') { winner === cfg().human ? SND.win() : SND.lose(); }
    else SND.win();
    buzz(winner === null ? 20 : [60, 60, 120]);
    G.viewing = false;
    if (isGame()) archiveGame(G);
  }

  // ---------- Đồng hồ ----------
  const fmtClock = (ms) => {
    const s = Math.max(0, Math.ceil(ms / 1000));
    return Math.floor(s / 60) + ':' + String(s % 60).padStart(2, '0');
  };
  function updateClocks() {
    const c = G.clock;
    for (let side = 0; side < 2; side++) {
      const e = document.querySelector(`.clock[data-side="${side}"]`);
      if (!e) continue;
      e.textContent = fmtClock(c.t[side]);
      e.classList.toggle('low', c.t[side] < 30000);
      e.classList.toggle('run', !G.over && turn() === side);
    }
  }
  setInterval(() => {
    const c = G && G.clock;
    if (!c || !c.on || G.over || !isGame()) { if (c) c.last = null; return; }
    const now = Date.now(), t = turn();
    if (c.last != null) c.t[t] -= now - c.last;
    c.last = now;
    if (c.t[t] <= 0) {
      c.t[t] = 0;
      if (hasAttackers(1 - t)) finish(1 - t, `${SIDE_NAME[t]} hết giờ nên bị xử thua.`);
      else finish(null, `${SIDE_NAME[t]} hết giờ nhưng đối phương không đủ quân để chiếu bí nên ván cờ hòa.`);
      render(); saveGame();
      return;
    }
    updateClocks();
  }, 250);

  // ---------- Máy suy nghĩ ----------
  function aiOverride() {
    const side = turn(), b = cur(), out = [];
    const moves = Eng.genLegal(stateOf(b), side);
    for (const mv of moves) {
      const st2 = stateOf(b); Eng.makeMove(st2, mv);
      const key = Eng.boardKey(st2.b, 1 - side);
      if (countKey(key) >= 2) {
        const v = repetitionVerdict(key, mv, st2.b, side);
        out.push([mv, v.kind === 'mover-loses' ? -29000 : v.kind === 'opp-loses' ? 29000 : 0]);
      }
    }
    return out;
  }

  function maybeAI() {
    if (!isGame() || G.over || cfg().mode !== 'ai' || turn() === cfg().human || G.thinking) return;
    G.thinking = true;
    render();
    const token = ++aiToken;
    const opts = Object.assign({}, LEVELS[cfg().level], { override: aiOverride() });
    if (G.moves.length < 4 && cfg().level >= 1) { opts.exact = true; opts.margin = 40; opts.maxDepth = Math.min(opts.maxDepth, 3); opts.timeMs = 800; }
    if (G.clock.on) opts.timeMs = Math.max(250, Math.min(opts.timeMs, G.clock.t[turn()] / 25));
    const t0 = Date.now();
    const game = G;
    runSearch(cur(), turn(), opts).then((res) => {
      if (token !== aiToken || G !== game) return;
      const wait = Math.max(0, 450 - (Date.now() - t0));
      setTimeout(() => {
        if (token !== aiToken || G !== game) return;
        G.thinking = false;
        if (!res) { render(); return; }
        tryMove(res.mv, false);
      }, wait);
    });
  }

  function cancelAI() { aiToken++; if (G) { G.thinking = false; G.busy = false; } resetWorker(); }

  // ---------- Ván mới ----------
  function newGame() {
    cancelAI();
    leaveSpecial(true);
    if (G && isGame() && G.moves.length >= 6 && !G.over) archiveGame(G, true);
    G = freshGame();
    render();
    saveGame();
    maybeAI();
  }

  function startFromDialog() {
    S.mode = ng.mode; S.human = +ng.human; S.level = +ng.level; S.clock = +ng.clock;
    S.flipped = S.mode === 'ai' && S.human === 1;
    closeDlg($('newDlg')); setSheet(false);
    newGame();
  }

  async function openNew() {
    if (isGame() && G.moves.length >= 2 && !G.over) {
      if (!(await askConfirm('Bỏ ván đang chơi?', 'Ván cờ hiện tại chưa kết thúc. Bạn muốn bắt đầu ván mới?', 'Ván mới', 'Chơi tiếp'))) return;
    }
    ng = { mode: S.mode, human: String(S.human), level: String(S.level), clock: String(S.clock) };
    syncNewDlg();
    setSheet(false);
    openDlg($('newDlg'));
  }

  function undo() {
    if (!isGame() || G.view != null || !G.moves.length) return;
    cancelAI();
    const popOne = () => { G.moves.pop(); G.notes.pop(); G.pos.pop(); G.keys.pop(); G.caps.pop(); };
    G.over = null; G.analysis = null;
    popOne();
    if (cfg().mode === 'ai') while (turn() !== cfg().human && G.moves.length) popOne();
    G.sel = null; G.hint = null; G.hintText = ''; G.anim = null; G.viewing = false;
    if (G.clock.on) G.clock.last = Date.now();
    render(); saveGame(); maybeAI();
  }

  async function hint() {
    if (G.over || G.thinking || G.busy || !humanTurn() || G.view != null) return;
    if (G.kind === 'puzzle') return puzzleHint();
    G.busy = true; G.hint = null; G.hintText = 'Đang nghĩ gợi ý…'; render();
    const token = ++aiToken;
    const game = G;
    const res = await runSearch(cur(), turn(), { maxDepth: 6, timeMs: 1600, override: aiOverride() });
    if (token !== aiToken || G !== game) return;
    G.busy = false;
    if (res) {
      G.hint = { from: res.mv & 127, to: res.mv >> 7 };
      G.hintText = '💡 Gợi ý: ' + Eng.notate(cur(), res.mv);
    } else G.hintText = '';
    render();
  }

  async function offerDraw() {
    setSheet(false);
    if (!isGame() || G.over || G.thinking || G.busy || !humanTurn() || G.view != null) { toast('Chỉ xin hòa được khi đến lượt bạn trong ván đang chơi.'); return; }
    if (cfg().mode === 'pvp') {
      if (await askConfirm('Xin hòa', `${SIDE_SHORT[1 - turn()]} có đồng ý hòa không?`, 'Đồng ý hòa', 'Không')) { finish(null, 'Hai bên thỏa thuận hòa.'); render(); saveGame(); }
      return;
    }
    if (G.moves.length < 10) { toast('Mới đi ít nước quá, máy chưa đồng ý hòa. Hãy chơi thêm nhé!'); return; }
    G.busy = true; G.hintText = 'Máy đang cân nhắc lời xin hòa…'; render();
    const token = ++aiToken;
    const game = G;
    const res = await runSearch(cur(), 1 - cfg().human, { maxDepth: 4, timeMs: 900 });
    if (token !== aiToken || G !== game) return;
    G.busy = false; G.hintText = '';
    if (res && res.bestScore <= 60) finish(null, 'Máy đồng ý hòa. Hai bên thỏa thuận hòa.');
    else toast('Máy không đồng ý hòa – máy thấy mình đang có lợi. Hãy cố gắng nhé!');
    render(); saveGame();
  }

  async function resign() {
    setSheet(false);
    if (!isGame() || G.over) return;
    const loser = cfg().mode === 'ai' ? cfg().human : turn();
    if (!(await askConfirm('Xin thua?', `${SIDE_NAME[loser]} xin thua ván này?`, 'Xin thua', 'Chơi tiếp'))) return;
    cancelAI();
    finish(1 - loser, `${SIDE_NAME[loser]} xin thua. ${SIDE_NAME[1 - loser]} thắng.`);
    render(); saveGame();
  }

  function flip() { S.flipped = !S.flipped; render(); saveSettings(); }

  // ---------- Xem lại từng nước ----------
  function stopAuto() { if (G && G.auto) { clearInterval(G.auto); G.auto = 0; } }
  function setView(i, animate) {
    const n = G.moves.length;
    i = Math.max(0, Math.min(n, i));
    G.sel = null; G.hint = null; G.hintText = '';
    G.view = i;
    G.anim = animate && i > 0 ? { from: G.moves[i - 1] & 127, to: G.moves[i - 1] >> 7, cap: G.caps[i - 1] } : null;
    if (animate && i > 0) { G.caps[i - 1] ? SND.capture() : SND.move(); }
    render();
  }
  function exitView() {
    stopAuto();
    if (G.kind === 'replay') { leaveSpecial(false); return; }
    G.view = null; G.anim = null; render();
    maybeAI();
  }
  function toggleAuto() {
    if (G.auto) { stopAuto(); render(); return; }
    if (G.view == null) setView(0);
    if (G.view >= G.moves.length) setView(0);
    G.auto = setInterval(() => {
      if (G.view == null || G.view >= G.moves.length) { stopAuto(); render(); return; }
      setView(G.view + 1, true);
    }, 900);
    render();
  }

  // ---------- Ván đã chơi ----------
  const GAMES_KEY = 'cotuong.games';
  function loadArchive() { try { return JSON.parse(localStorage.getItem(GAMES_KEY) || '[]') || []; } catch (e) { return []; } }
  function saveArchive(list) { try { localStorage.setItem(GAMES_KEY, JSON.stringify(list.slice(0, 40))); } catch (e) { /* */ } }
  function archiveGame(g, abandoned) {
    if (!g.moves.length || g.kind !== 'game') return;
    const list = loadArchive().filter((x) => x.id !== g.id);
    list.unshift({ id: g.id, t: Date.now(), cfg: g.cfg, moves: g.moves.slice(), winner: abandoned ? 'x' : g.over.winner, text: abandoned ? 'Bỏ dở' : g.over.text });
    saveArchive(list);
  }
  function resultLabel(e) {
    if (e.winner === 'x') return ['Bỏ dở', ''];
    if (e.winner === null) return ['Hòa', 'res-draw'];
    if (e.cfg.mode === 'ai') return e.winner === e.cfg.human ? ['Thắng', 'res-win'] : ['Thua', 'res-lose'];
    return [SIDE_SHORT[e.winner] + ' thắng', 'res-win'];
  }
  function renderGamesList() {
    const list = loadArchive(), box = $('gamesList');
    if (!list.length) { box.innerHTML = '<div class="empty-note">Chưa có ván nào được lưu.<br>Ván cờ tự lưu khi kết thúc.</div>'; return; }
    box.innerHTML = list.map((e) => {
      const [txt, cls] = resultLabel(e);
      const d = new Date(e.t);
      const when = `${d.getDate()}/${d.getMonth() + 1} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
      const vs = e.cfg.mode === 'ai' ? `Với máy · ${LEVELS[e.cfg.level].name} · cầm ${SIDE_SHORT[e.cfg.human]}` : '2 người';
      return `<div class="grow"><div class="gi"><b class="${cls}">${txt}</b><small>${vs}<br>${when} · ${e.moves.length} nước</small></div><button data-act="view" data-id="${e.id}">Xem lại</button><button data-act="del" data-id="${e.id}" aria-label="Xóa">🗑</button></div>`;
    }).join('');
  }
  function openGames() { setSheet(false); renderGamesList(); openDlg($('gamesDlg')); }
  $('gamesList').addEventListener('click', (ev) => {
    const b = ev.target.closest('button'); if (!b) return;
    const id = +b.dataset.id;
    if (b.dataset.act === 'del') { saveArchive(loadArchive().filter((x) => x.id !== id)); renderGamesList(); }
    else if (b.dataset.act === 'view') {
      const e = loadArchive().find((x) => x.id === id);
      if (e) { closeDlg($('gamesDlg')); startReplay(e); }
    }
  });

  // ---------- Ván tạm (xem lại, bài tập): giữ ván thật để quay về ----------
  function enterSpecial(newG, flipped) {
    cancelAI();
    if (!stash) stash = { G, flipped: S.flipped };
    else stopAuto();
    G = newG;
    S.flipped = flipped;
  }
  function leaveSpecial(silent) {
    if (!stash) return;
    stopAuto();
    G = stash.G; S.flipped = stash.flipped; stash = null;
    if (!silent) { render(); if (isGame()) maybeAI(); }
  }
  function startReplay(e) {
    const g = freshGame({ kind: 'replay', cfg: e.cfg });
    const live = G;
    G = g;
    for (const mv of e.moves) applyRaw(mv);
    G = live;
    g.over = { winner: e.winner === 'x' ? null : e.winner, text: e.text };
    enterSpecial(g, e.cfg.mode === 'ai' && e.cfg.human === 1);
    setView(0);
  }

  // ---------- Phân tích ván ----------
  const clampScore = (s) => Math.max(-1500, Math.min(1500, s));
  let analysisRun = 0;
  function canAnalyze() { return G && G.moves.length >= 4 && (G.over || G.kind === 'replay'); }

  async function openAnalysis() {
    setSheet(false);
    if (!canAnalyze()) { toast('Hãy chơi xong ván cờ (hoặc mở một ván đã lưu) rồi bấm Phân tích.'); return; }
    if (G.analysis) { showAnalysis(); return; }
    const run = ++analysisRun, game = G;
    const body = $('analysisBody');
    body.innerHTML = '<p>Máy đang xem lại từng nước đi của ván cờ…</p><div class="bar"><div id="anBar"></div></div><p class="muted" id="anTxt"></p><button id="anCancel" type="button">Dừng lại</button>';
    $('anCancel').onclick = () => { analysisRun++; resetWorker(); closeDlg($('analysisDlg')); };
    openDlg($('analysisDlg'));
    const n = game.moves.length, best = [], score = [];
    for (let i = 0; i <= n; i++) {
      if (run !== analysisRun) return;
      const side = (game.first + i) & 1;
      const res = await runSearch(game.pos[i], side, { maxDepth: 4, timeMs: 380 });
      if (run !== analysisRun) return;
      best[i] = res ? res.mv : null;
      score[i] = res ? clampScore(res.bestScore) : -1500;
      $('anBar').style.width = Math.round(((i + 1) / (n + 1)) * 100) + '%';
      $('anTxt').textContent = `Nước ${i}/${n}`;
    }
    const loss = [], grade = [];
    for (let i = 0; i < n; i++) {
      let l = best[i] === game.moves[i] ? 0 : Math.max(0, score[i] + score[i + 1]);
      if (i === n - 1 && game.over && game.over.winner !== null && game.over.winner === ((game.first + i) & 1)) l = 0;
      loss.push(l);
      grade.push(l >= 300 ? '??' : l >= 120 ? '?' : l >= 50 ? '?!' : '');
    }
    game.analysis = { best, loss, grade };
    if (G === game) { render(); showAnalysis(); }
  }

  function showAnalysis() {
    const a = G.analysis, n = G.moves.length;
    const side = (i) => (G.first + i) & 1;
    const acc = [0, 1].map((s) => {
      const ls = a.loss.filter((_, i) => side(i) === s);
      if (!ls.length) return 100;
      return Math.round(100 * Math.max(0, 1 - ls.reduce((x, y) => x + y, 0) / ls.length / 350));
    });
    const bad = [];
    a.grade.forEach((g, i) => { if (g === '??' || g === '?') bad.push(i); });
    const cls = { '??': 'g-bad', '?': 'g-mid', '?!': 'g-low' };
    const lbl = { '??': 'Sai lầm nặng', '?': 'Sai lầm', '?!': 'Chưa chính xác' };
    const you = cfg().mode === 'ai' ? cfg().human : null;
    let h = `<div class="an-sum"><div><b>${acc[0]}%</b>${you === 0 ? 'Bạn (Trắng)' : 'Trắng'} – độ chính xác</div><div><b>${acc[1]}%</b>${you === 1 ? 'Bạn (Đen)' : 'Đen'} – độ chính xác</div></div>`;
    if (!bad.length) h += '<p class="empty-note">Không có sai lầm đáng kể. Ván cờ rất hay! 👏</p>';
    else {
      h += '<p class="muted">Bấm vào một nước để xem thế cờ và nước đi tốt hơn.</p>';
      h += bad.map((i) => `<button class="an-item" data-i="${i}" type="button"><span class="g ${cls[a.grade[i]]}">${a.grade[i]}</span><span><b>Nước ${Math.floor(i / 2) + 1} · ${SIDE_SHORT[side(i)]}: ${G.notes[i]}</b><small>${lbl[a.grade[i]]} – nên đi ${a.best[i] != null ? Eng.notate(G.pos[i], a.best[i]) : '…'}</small></span></button>`).join('');
    }
    $('analysisBody').innerHTML = h;
    $('analysisBody').querySelectorAll('.an-item').forEach((b) => b.addEventListener('click', () => { closeDlg($('analysisDlg')); setView(+b.dataset.i); }));
    openDlg($('analysisDlg'));
  }

  // ---------- Bài tập chiếu hết ----------
  const PZ_KEY = 'cotuong.puzzles';
  function pzProgress() { try { return JSON.parse(localStorage.getItem(PZ_KEY) || '{}') || {}; } catch (e) { return {}; } }
  function pzSave(id, stars) {
    const p = pzProgress();
    if (!p[id] || p[id] < stars) p[id] = stars;
    try { localStorage.setItem(PZ_KEY, JSON.stringify(p)); } catch (e) { /* */ }
  }
  function renderPuzzles() {
    const prog = pzProgress(), box = $('puzzlesList');
    let h = '';
    for (const n of [1, 2, 3]) {
      const list = PUZZLES.filter((p) => p.n === n);
      if (!list.length) continue;
      const done = list.filter((p) => prog[p.id]).length;
      h += `<div class="pz-title">Chiếu hết trong ${n} nước <small>(${done}/${list.length})</small></div><div class="pz-grid">`;
      list.forEach((p, i) => {
        const st = prog[p.id] || 0;
        const cur = G.puzzle && G.puzzle.id === p.id ? ' cur' : '';
        h += `<button class="pz-tile${st ? ' done' : ''}${cur}" data-id="${p.id}" type="button">${i + 1}<small>${st ? '★'.repeat(st) + '☆'.repeat(3 - st) : '&nbsp;'}</small></button>`;
      });
      h += '</div>';
    }
    box.innerHTML = h;
  }
  function openPuzzles() { setSheet(false); renderPuzzles(); openDlg($('puzzlesDlg')); }
  $('puzzlesList').addEventListener('click', (ev) => {
    const b = ev.target.closest('.pz-tile'); if (!b) return;
    closeDlg($('puzzlesDlg')); startPuzzle(b.dataset.id);
  });

  function startPuzzle(id) {
    const p = PUZZLES.find((x) => x.id === id);
    if (!p) return;
    const { board, side } = Eng.fromFen(p.fen);
    const g = freshGame({ kind: 'puzzle', first: side, board, cfg: { mode: 'pvp', human: side, level: 0, clock: 0 },
      puzzle: { id: p.id, n: p.n, att: side, left: p.n, errors: 0, hints: 0, solved: false } });
    enterSpecial(g, side === 1);
    render();
  }
  function nextPuzzle() {
    const i = PUZZLES.findIndex((x) => x.id === G.puzzle.id);
    const next = PUZZLES[(i + 1) % PUZZLES.length];
    startPuzzle(next.id);
  }
  function pzTitle() {
    const p = G.puzzle, idx = PUZZLES.filter((x) => x.n === p.n).findIndex((x) => x.id === p.id) + 1;
    return `Bài ${idx} · Chiếu hết trong ${p.n} nước`;
  }

  function puzzleMove(mv) {
    const P = G.puzzle;
    if (P.solved || turn() !== P.att) return false;
    const st = stateOf(cur());
    const good = Eng.mateMoves(st, P.att, P.left, true);
    if (!good.includes(mv)) {
      P.errors++;
      SND.bad(); buzz([40, 50, 40]);
      toast(P.left === P.n ? 'Chưa đúng. Hãy tìm nước ép đối phương vào thế bí!' : 'Chưa đúng, hãy thử nước khác.', true);
      G.sel = null; G.hint = null; render();
      return false;
    }
    const { cap } = applyRaw(mv);
    G.anim = { from: mv & 127, to: mv >> 7, cap };
    G.sel = null; G.hint = null; G.hintText = '';
    const st2 = stateOf(cur());
    const def = 1 - P.att;
    if (!Eng.genLegal(st2, def).length) {
      P.solved = true;
      const stars = P.errors === 0 && P.hints === 0 ? 3 : (P.errors <= 2 && P.hints <= 1 ? 2 : 1);
      P.stars = stars;
      pzSave(P.id, stars);
      SND.win(); buzz([60, 60, 120]);
      render();
      return true;
    }
    SND.check(); buzz([30, 40, 30]);
    P.left--;
    G.busy = true;
    render();
    const game = G;
    setTimeout(() => {
      if (G !== game) return;
      const reply = Eng.bestDefense(stateOf(cur()), P.att, P.left);
      const r = applyRaw(reply);
      G.anim = { from: reply & 127, to: reply >> 7, cap: r.cap };
      G.busy = false;
      r.cap ? SND.capture() : SND.move();
      render();
    }, 650);
    return true;
  }

  function puzzleHint() {
    const P = G.puzzle;
    if (P.solved || G.busy || turn() !== P.att) return;
    const good = Eng.mateMoves(stateOf(cur()), P.att, P.left, true);
    if (!good.length) return;
    const mv = good[0];
    P.hints++;
    if (P.hints === 1) { G.hint = { from: mv & 127, to: -1 }; G.hintText = '💡 Hãy dùng quân đang được đánh dấu.'; }
    else { G.hint = { from: mv & 127, to: mv >> 7 }; G.hintText = '💡 Gợi ý: ' + Eng.notate(cur(), mv); }
    render();
  }

  function puzzleRetry() { if (G.puzzle) startPuzzle(G.puzzle.id); }

  // ---------- Vẽ ----------
  function pieceGroup(p, x, y, parent) {
    const sd = p >> 3, ty = p & 7;
    const g = el('g', { class: 'piece' }, parent || gPieces);
    g.style.transform = `translate(${x}px,${y}px)`;
    el('circle', { cx: 1.5, cy: 3, r: 25, fill: 'rgba(40,20,0,.28)' }, g);
    el('circle', { cx: 0, cy: 0, r: 25, fill: 'url(#pg)', stroke: '#6b4518', 'stroke-width': 2 }, g);
    const col = sd === 0 ? '#c0281d' : '#1b1b1b';
    el('circle', { cx: 0, cy: 0, r: 20.5, fill: 'none', stroke: col, 'stroke-width': 1.6 }, g);
    const vi = S.pieceStyle === 'vi';
    const label = glyph(sd, ty);
    const t = el('text', { x: 0, y: vi ? 1 : 1.5, 'text-anchor': 'middle', 'dominant-baseline': 'central',
      'font-size': vi ? (label.length > 4 ? 14.5 : 16) : 29, fill: col, class: vi ? 'vi' : '' }, g);
    t.textContent = label;
    return g;
  }

  function ring(parent, sq, r, color, w, extra) {
    return el('circle', Object.assign({ cx: sqX(sq), cy: sqY(sq), r, fill: 'none', stroke: color, 'stroke-width': w }, extra || {}), parent);
  }

  const pieceEls = new Array(90).fill(null);

  function renderPieces() {
    const b = vpos();
    gPieces.textContent = '';
    pieceEls.fill(null);
    const anim = G.anim;
    let animGroup = null;
    for (let sq = 0; sq < 90; sq++) {
      const p = b[sq];
      if (!p) continue;
      if (anim && sq === anim.to) {
        animGroup = pieceGroup(p, sqX(anim.from), sqY(anim.from));
        pieceEls[sq] = animGroup;
      } else pieceEls[sq] = pieceGroup(p, sqX(sq), sqY(sq));
    }
    gHl.textContent = '';
    if (animGroup) {
      void animGroup.getBoundingClientRect();
      requestAnimationFrame(() => { animGroup.style.transform = `translate(${sqX(anim.to)}px,${sqY(anim.to)}px)`; });
      if (anim.cap) {
        const gh = pieceGroup(anim.cap, sqX(anim.to), sqY(anim.to), gHl);
        gh.setAttribute('class', 'piece ghost');
        gh.style.transition = 'none';
      }
    }
    G.anim = null;
  }

  function renderHighlights() {
    const b = vpos(), t = vturn(), len = vlen();
    const keep = Array.from(gHl.querySelectorAll('.ghost'));
    gHl.textContent = '';
    keep.forEach((n) => gHl.appendChild(n));
    gMarks.textContent = '';
    const chk = Eng.inCheck(stateOf(b), t);
    if (len > 0) {
      const lm = G.moves[len - 1];
      ring(gHl, lm & 127, 26, '#2f6fde', 2.5, { 'stroke-dasharray': '5 4', opacity: .85 });
      ring(gHl, lm >> 7, 29, '#2f6fde', 3.5, { opacity: .9 });
    }
    if (chk) {
      const g = stateOf(b).kp[t];
      el('circle', { cx: sqX(g), cy: sqY(g), r: 40, fill: 'url(#glow)', class: 'checkglow' }, gHl);
    }
    if (G.view == null && G.sel !== null) {
      ring(gMarks, G.sel, 30, '#e0a100', 4);
      if (S.hints) {
        for (const mv of G.legal) {
          if ((mv & 127) !== G.sel) continue;
          const to = mv >> 7;
          if (b[to]) ring(gMarks, to, 28, '#d12d20', 4, { opacity: .9 });
          else el('circle', { cx: sqX(to), cy: sqY(to), r: 8, fill: '#1f9b60', opacity: .85 }, gMarks);
        }
      }
    }
    if (G.view == null && G.hint) {
      ring(gMarks, G.hint.from, 30, '#1f9b60', 4, { class: 'hintring' });
      if (G.hint.to >= 0) ring(gMarks, G.hint.to, 30, '#1f9b60', 4, { class: 'hintring' });
    }
    // phân tích: chỉ ra nước tốt hơn
    if (G.view != null && G.analysis && G.analysis.best[G.view] != null && G.view < G.moves.length && G.analysis.grade[G.view]) {
      const bm = G.analysis.best[G.view];
      ring(gMarks, bm & 127, 31, '#1f9b60', 4, { class: 'hintring' });
      ring(gMarks, bm >> 7, 31, '#1f9b60', 4, { class: 'hintring' });
    }
    return chk;
  }

  function render() {
    const inView = G.view != null;
    G.legal = (G.over || inView) ? [] : Eng.genLegal(stateOf(cur()), turn());
    renderPieces();
    const chk = renderHighlights();
    renderBars();
    renderStatus(chk);
    renderMoves();
    syncOverlay();
    const special = G.kind !== 'game';
    $('actionbar').hidden = inView || G.kind === 'puzzle';
    $('viewbar').hidden = !inView;
    $('puzzlebar').hidden = !(G.kind === 'puzzle' && !inView);
    $('vbAuto').firstElementChild.textContent = G.auto ? '⏸' : '⏵';
    $('vbDone').firstElementChild.textContent = G.kind === 'replay' ? 'Thoát' : 'Xong';
    $('btnUndo').disabled = !G.moves.length || special || inView;
    const cant = !!G.over || G.thinking || G.busy || !humanTurn() || inView || special;
    $('btnHint').disabled = (G.kind === 'puzzle' ? false : cant);
    $('btnDraw').disabled = cant;
    $('btnResign').disabled = !!G.over || special;
    $('btnAnalyze').disabled = !canAnalyze();
    $('btnFlip').disabled = false;
  }

  function capturedBy(side) {
    const out = [];
    const len = vlen();
    G.caps.forEach((c, i) => { if (c && i < len && ((G.first + i) & 1) === side) out.push(c); });
    out.sort((a, b) => (b & 7) - (a & 7));
    return out;
  }

  function renderBars() {
    const bottomSide = S.flipped ? 1 : 0, topSide = 1 - bottomSide;
    const c = cfg();
    const fill = (id, side) => {
      const bar = $(id);
      const isAI = c.mode === 'ai' && side !== c.human;
      let who = c.mode === 'pvp' ? 'Người chơi' : (isAI ? 'Máy' : 'Bạn');
      let tag = SIDE_NAME[side] + (isAI ? ` · ${LEVELS[c.level].name}` : '');
      if (G.kind === 'puzzle') {
        const att = G.puzzle.att === side;
        who = att ? 'Bạn (bên tấn công)' : 'Đối phương';
        tag = SIDE_NAME[side];
      }
      const active = !G.over && G.view == null && turn() === side;
      bar.className = 'pbar ' + (id === 'barTop' ? 'top' : 'bottom') + (active ? ' active' : '');
      const think = isAI && G.thinking ? ' <span class="spinner" title="Đang nghĩ"></span>' : '';
      const vi = S.pieceStyle === 'vi' ? ' vi' : '';
      const caps = capturedBy(side).map((p) => `<span class="${(p >> 3) === 0 ? 'w' : 'b'}${vi}" title="${PIECE_NAME[p & 7]}">${glyph(p >> 3, p & 7)}</span>`).join('');
      const clock = G.clock.on ? `<span class="clock" data-side="${side}"></span>` : '';
      bar.innerHTML = `<span class="dot ${side === 0 ? 'w' : 'b'}"></span><span class="who"><span class="nm">${who}${think}</span><span class="tag">${tag}</span></span><span class="caps" aria-label="Quân đã ăn">${caps}</span>${clock}`;
    };
    fill('barTop', topSide);
    fill('barBottom', bottomSide);
    if (G.clock.on) updateClocks();
  }

  function renderStatus(chk) {
    const s = $('status');
    let hintText = G.hintText || '';
    if (G.kind === 'puzzle' && !G.view) {
      const P = G.puzzle;
      s.innerHTML = '';
      if (P.solved) s.textContent = '🎉 Chiếu hết rồi! ' + '★'.repeat(P.stars) + '☆'.repeat(3 - P.stars);
      else s.textContent = `${pzTitle()} – ${SIDE_SHORT[P.att]} đi trước${P.n > 1 ? ' (còn ' + P.left + ' nước)' : ''}`;
    } else if (G.view != null) {
      const n = G.moves.length;
      s.textContent = (G.kind === 'replay' ? 'Xem lại ván' : 'Đang xem') + ` · nước ${G.view}/${n}`;
      if (G.analysis && G.view < n && G.analysis.grade[G.view]) {
        const bm = G.analysis.best[G.view];
        hintText = `⚠ ${G.notes[G.view]} (${G.analysis.grade[G.view]}) – nên đi ${bm != null ? Eng.notate(G.pos[G.view], bm) : '…'}`;
      }
    } else if (G.over) {
      s.textContent = G.over.winner === null ? 'Ván cờ hòa' : `${SIDE_NAME[G.over.winner]} thắng`;
    } else if (G.thinking) {
      s.innerHTML = '<span class="spinner"></span> Máy đang suy nghĩ…';
    } else {
      const t = turn();
      let txt = `Lượt đi: ${SIDE_NAME[t]}`;
      if (cfg().mode === 'ai') txt = t === cfg().human ? `Đến lượt bạn (${SIDE_NAME[t]})` : `Lượt của máy (${SIDE_NAME[t]})`;
      s.innerHTML = '';
      s.appendChild(document.createTextNode(txt));
      if (chk) { const bd = document.createElement('span'); bd.className = 'badge'; bd.textContent = 'CHIẾU TƯỚNG!'; s.appendChild(bd); }
    }
    $('hintText').textContent = hintText;
  }

  function renderMoves() {
    const box = $('moves');
    if (!G.notes.length) { box.innerHTML = '<div class="empty">Chưa có nước đi nào.</div>'; return; }
    const cells = G.notes.map((nt, i) => ({ nt, i }));
    if (G.first === 1) cells.unshift(null);
    const mark = G.view == null ? G.notes.length - 1 : G.view - 1;
    const clickable = G.over || G.kind === 'replay' || G.view != null;
    const cell = (c) => {
      if (!c) return '<td></td>';
      const gr = G.analysis && G.analysis.grade[c.i];
      const gm = gr ? `<span class="gm ${gr === '??' ? 'g-bad' : gr === '?' ? 'g-mid' : 'g-low'}">${gr}</span>` : '';
      return `<td${c.i === mark ? ' class="cur"' : ''}${clickable ? ` data-i="${c.i + 1}"` : ''}>${c.nt}${gm}</td>`;
    };
    let h = '<table><thead><tr><th></th><th>Trắng</th><th>Đen</th></tr></thead><tbody>';
    for (let k = 0; k < cells.length; k += 2) h += `<tr><td class="n">${k / 2 + 1}.</td>${cell(cells[k])}${cell(cells[k + 1])}</tr>`;
    box.innerHTML = h + '</tbody></table>';
    const cur = box.querySelector('td.cur');
    if (cur && G.view != null) cur.scrollIntoView({ block: 'nearest' }); else box.scrollTop = box.scrollHeight;
  }
  $('moves').addEventListener('click', (ev) => {
    const td = ev.target.closest('td[data-i]');
    if (td) { setView(+td.dataset.i); setSheet(false); }
  });

  function syncOverlay() {
    const ov = $('overlay');
    const puz = G.kind === 'puzzle' && G.puzzle.solved && G.view == null;
    const over = G.kind === 'game' && G.over && !G.viewing && G.view == null;
    if (!puz && !over) { ov.hidden = true; return; }
    ov.hidden = false;
    const btns = ov.querySelector('.row');
    if (puz) {
      const P = G.puzzle;
      $('ovTitle').textContent = '🎉 Giải đúng!';
      $('ovText').textContent = `${'★'.repeat(P.stars)}${'☆'.repeat(3 - P.stars)}  ${P.errors ? 'Bạn thử sai ' + P.errors + ' lần. ' : 'Không sai nước nào! '}${P.hints ? 'Đã dùng gợi ý ' + P.hints + ' lần.' : ''}`;
      btns.innerHTML = '<button class="primary" data-ov="next" type="button">Bài tiếp ▶</button><button data-ov="retry" type="button">Làm lại</button><button data-ov="list" type="button">Danh sách</button>';
    } else {
      let title;
      if (G.over.winner === null) title = '🤝 Ván cờ hòa';
      else if (cfg().mode === 'ai') title = G.over.winner === cfg().human ? '🎉 Bạn thắng!' : '😅 Máy thắng';
      else title = `🎉 ${SIDE_NAME[G.over.winner]} thắng!`;
      $('ovTitle').textContent = title;
      $('ovText').textContent = G.over.text;
      btns.innerHTML = '<button class="primary" data-ov="new" type="button">Ván mới</button><button data-ov="view" type="button">Xem lại</button><button data-ov="analyze" type="button">🔍 Phân tích</button>';
    }
  }
  $('overlay').addEventListener('click', (ev) => {
    const b = ev.target.closest('button[data-ov]'); if (!b) return;
    const a = b.dataset.ov;
    if (a === 'new') openNew();
    else if (a === 'view') setView(G.moves.length);
    else if (a === 'analyze') openAnalysis();
    else if (a === 'next') nextPuzzle();
    else if (a === 'retry') puzzleRetry();
    else if (a === 'list') openPuzzles();
  });

  // ---------- Tương tác: bấm và kéo thả ----------
  const canInteract = () => {
    if (G.over || G.thinking || G.busy || G.view != null || anyDialogOpen()) return false;
    if (G.kind === 'puzzle') return turn() === G.puzzle.att;
    if (G.kind !== 'game') return false;
    return humanTurn();
  };
  let drag = null;
  const LIFT = -34; // khi kéo bằng ngón tay, nhấc quân lên để ngón không che

  function handleTap(sq) {
    if (sq < 0) return;
    const b = cur();
    if (G.sel !== null) {
      const mv = G.legal.find((m) => (m & 127) === G.sel && (m >> 7) === sq);
      if (mv !== undefined) { tryMove(mv, true); return; }
    }
    const p = b[sq];
    if (p && (p >> 3) === turn() && sq !== G.sel) {
      if (!G.legal.some((m) => (m & 127) === sq)) toast('Quân này không có nước đi hợp lệ.');
      G.sel = sq; G.hint = null; G.hintText = '';
    } else G.sel = null;
    renderHighlights(); renderStatus(false);
  }

  svg.addEventListener('pointerdown', (ev) => {
    if (!canInteract() || (ev.pointerType === 'mouse' && ev.button !== 0)) return;
    const pt = svgPoint(ev);
    const sq = sqAt(pt.x, pt.y);
    if (sq < 0) return;
    const p = cur()[sq];
    const own = p && (p >> 3) === turn();
    drag = { sq: own ? sq : -1, id: ev.pointerId, sx: ev.clientX, sy: ev.clientY, moved: false, touch: ev.pointerType !== 'mouse' };
    if (own) { try { svg.setPointerCapture(ev.pointerId); } catch (e) { /* */ } }
    ev.preventDefault();
  });

  svg.addEventListener('pointermove', (ev) => {
    if (!drag || drag.sq < 0 || ev.pointerId !== drag.id) return;
    if (!drag.moved) {
      if (Math.hypot(ev.clientX - drag.sx, ev.clientY - drag.sy) < 8) return;
      drag.moved = true;
      G.sel = drag.sq; G.hint = null; G.hintText = '';
      renderHighlights();
      const e = pieceEls[drag.sq];
      if (e) { e.classList.add('dragging'); gPieces.appendChild(e); }
    }
    const e = pieceEls[drag.sq];
    if (e) {
      const pt = svgPoint(ev);
      e.style.transform = `translate(${pt.x}px,${pt.y + (drag.touch ? LIFT : 0)}px) scale(1.18)`;
    }
  });

  function endDrag(ev, cancel) {
    if (!drag || ev.pointerId !== drag.id) return;
    const d = drag; drag = null;
    try { svg.releasePointerCapture(ev.pointerId); } catch (e) { /* */ }
    const pt = svgPoint(ev);
    if (cancel) { if (d.moved) render(); return; }
    if (d.sq >= 0 && d.moved) {
      const to = sqAt(pt.x, pt.y + (d.touch ? LIFT : 0));
      const mv = to < 0 ? undefined : G.legal.find((m) => (m & 127) === d.sq && (m >> 7) === to);
      if (mv !== undefined) { tryMove(mv, true); }
      else { if (to >= 0 && to !== d.sq) toast('Nước đi này không hợp lệ.'); render(); }
      return;
    }
    handleTap(sqAt(pt.x, pt.y));
  }
  svg.addEventListener('pointerup', (ev) => endDrag(ev, false));
  svg.addEventListener('pointercancel', (ev) => endDrag(ev, true));
  svg.addEventListener('contextmenu', (ev) => ev.preventDefault());

  // ---------- Nút bấm ----------
  $('btnNew').addEventListener('click', openNew);
  $('btnNew2').addEventListener('click', openNew);
  $('btnUndo').addEventListener('click', undo);
  $('btnHint').addEventListener('click', hint);
  $('btnDraw').addEventListener('click', offerDraw);
  $('btnResign').addEventListener('click', resign);
  $('btnFlip').addEventListener('click', () => { flip(); setSheet(false); });
  $('btnMenu').addEventListener('click', () => setSheet(true));
  $('btnTrain').addEventListener('click', openPuzzles);
  $('btnTrain2').addEventListener('click', openPuzzles);
  $('btnGames').addEventListener('click', openGames);
  $('btnAnalyze').addEventListener('click', openAnalysis);
  $('sheetClose').addEventListener('click', () => setSheet(false));
  $('sheetBackdrop').addEventListener('click', () => setSheet(false));
  $('vbStart').addEventListener('click', () => { stopAuto(); setView(0); });
  $('vbPrev').addEventListener('click', () => { stopAuto(); setView(vlen() - 1); });
  $('vbNext').addEventListener('click', () => { stopAuto(); setView(vlen() + 1, true); });
  $('vbEnd').addEventListener('click', () => { stopAuto(); setView(G.moves.length); });
  $('vbAuto').addEventListener('click', toggleAuto);
  $('vbDone').addEventListener('click', exitView);
  $('pzHint').addEventListener('click', hint);
  $('pzRetry').addEventListener('click', puzzleRetry);
  $('pzNext').addEventListener('click', nextPuzzle);
  $('pzList').addEventListener('click', openPuzzles);
  $('pzExit').addEventListener('click', () => leaveSpecial(false));
  const openRules = () => { setSheet(false); openDlg($('rulesDlg')); };
  $('btnRules').addEventListener('click', openRules);
  $('btnRules2').addEventListener('click', openRules);
  $('rulesClose').addEventListener('click', () => closeDlg($('rulesDlg')));
  document.querySelectorAll('dialog').forEach((d) => d.addEventListener('click', (e) => { if (e.target === d && d.id !== 'confirmDlg') closeDlg(d); }));
  document.querySelectorAll('[data-close]').forEach((b) => b.addEventListener('click', () => closeDlg(b.closest('dialog'))));
  $('chkHints').addEventListener('change', () => { S.hints = $('chkHints').checked; saveSettings(); renderHighlights(); });
  $('chkSound').addEventListener('change', () => { S.sound = $('chkSound').checked; saveSettings(); });
  $('chkVibe').addEventListener('change', () => { S.vibe = $('chkVibe').checked; saveSettings(); buzz(30); });
  $('selStyle').addEventListener('change', () => { S.pieceStyle = $('selStyle').value === 'vi' ? 'vi' : 'han'; saveSettings(); render(); });
  window.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') setSheet(false);
    if (G && G.view != null && !anyDialogOpen()) {
      if (e.key === 'ArrowLeft') setView(G.view - 1);
      else if (e.key === 'ArrowRight') setView(G.view + 1, true);
    }
  });

  // hộp thoại ván mới
  let ng = { mode: 'ai', human: '0', level: '1', clock: '0' };
  function syncNewDlg() {
    document.querySelectorAll('#newDlg .seg').forEach((seg) => {
      const key = seg.dataset.key;
      seg.querySelectorAll('button').forEach((b) => b.classList.toggle('on', b.dataset.v === ng[key]));
    });
    document.querySelectorAll('#newDlg [data-for="ai"]').forEach((f) => f.classList.toggle('hidden', ng.mode !== 'ai'));
  }
  document.querySelectorAll('#newDlg .seg button').forEach((b) => b.addEventListener('click', () => {
    ng[b.closest('.seg').dataset.key] = b.dataset.v; syncNewDlg();
  }));
  $('startBtn').addEventListener('click', startFromDialog);

  function syncControls() {
    $('chkHints').checked = S.hints; $('chkSound').checked = S.sound; $('chkVibe').checked = S.vibe;
    $('selStyle').value = S.pieceStyle;
  }

  // ---------- Lưu / tải ----------
  function saveSettings() { try { localStorage.setItem('cotuong.settings', JSON.stringify(S)); } catch (e) { /* */ } }
  function saveGame() {
    if (!G || !isGame()) return;
    try {
      localStorage.setItem('cotuong.settings', JSON.stringify(S));
      localStorage.setItem('cotuong.game', JSON.stringify({ id: G.id, cfg: G.cfg, moves: G.moves, over: G.over, clock: G.clock.on ? G.clock.t : null }));
    } catch (e) { /* */ }
  }
  function loadSaved() {
    try {
      const s = JSON.parse(localStorage.getItem('cotuong.settings') || 'null');
      if (s) Object.assign(S, {
        mode: s.mode === 'pvp' ? 'pvp' : 'ai', human: s.human === 1 ? 1 : 0, level: Math.min(3, Math.max(0, s.level | 0)),
        clock: [0, 5, 10, 15, 30].includes(s.clock) ? s.clock : 0,
        hints: s.hints !== false, sound: s.sound !== false, vibe: s.vibe !== false, flipped: !!s.flipped,
        pieceStyle: s.pieceStyle === 'vi' ? 'vi' : 'han',
      });
      const g = JSON.parse(localStorage.getItem('cotuong.game') || 'null');
      if (g && Array.isArray(g.moves) && g.moves.length) {
        const c = g.cfg || { mode: S.mode, human: S.human, level: S.level, clock: S.clock };
        G = freshGame({ cfg: { mode: c.mode === 'pvp' ? 'pvp' : 'ai', human: c.human === 1 ? 1 : 0, level: Math.min(3, Math.max(0, c.level | 0)), clock: c.clock | 0 } });
        if (g.id) G.id = g.id;
        const ms = G.cfg.clock * 60000;
        G.clock = { on: ms > 0, t: [ms, ms], last: null };
        for (const mv of g.moves) {
          if (!Eng.genLegal(stateOf(cur()), turn()).includes(mv)) throw new Error('ván lưu không hợp lệ');
          applyRaw(mv);
        }
        if (g.over) G.over = g.over;
        if (G.clock.on && Array.isArray(g.clock)) G.clock.t = g.clock.slice(0, 2);
        return true;
      }
    } catch (e) { G = null; }
    return false;
  }

  // ---------- PWA: chơi offline sau lần mở đầu tiên ----------
  if ('serviceWorker' in navigator && /^https?:$/.test(location.protocol)) {
    window.addEventListener('load', () => { navigator.serviceWorker.register('./sw.js').catch(() => { /* bỏ qua */ }); });
  }

  // ---------- Khởi động ----------
  const resumed = loadSaved();
  if (!resumed) { G = freshGame(); if (S.mode === 'ai' && S.human === 1) S.flipped = true; }
  syncControls();
  render();
  if (!G.over) maybeAI();
  if (!resumed) setTimeout(() => { ng = { mode: S.mode, human: String(S.human), level: String(S.level), clock: String(S.clock) }; syncNewDlg(); openDlg($('newDlg')); }, 350);
  window.__cotuong = { Eng, get G() { return G; }, S, tryMove, render, newGame, setView, startPuzzle, startReplay, openAnalysis, loadArchive, geom: { CELL, M, BW, BH }, sqXY: (sq) => [sqX(sq), sqY(sq)] }; // phục vụ kiểm thử
})();
