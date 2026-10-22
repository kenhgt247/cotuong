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
  const S = { mode: 'ai', human: 0, level: 1, hints: true, sound: true, flipped: false, pieceStyle: 'han' };
  let G = null;
  let aiToken = 0;

  function freshGame() {
    const b = Eng.initialBoard();
    return { pos: [b], moves: [], notes: [], keys: [Eng.boardKey(b, 0)], caps: [], over: null,
      sel: null, legal: [], hint: null, hintText: '', thinking: false, busy: false, anim: null, viewing: false };
  }
  const cur = () => G.pos[G.pos.length - 1];
  const turn = () => G.moves.length & 1;
  const humanTurn = () => S.mode === 'pvp' || turn() === S.human;
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
  el('stop', { offset: '0', 'stop-color': '#f0cf8e' }, gb);
  el('stop', { offset: '1', 'stop-color': '#dcae62' }, gb);
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
    el('rect', { x: 0, y: 0, width: BW, height: BH, rx: 14, fill: 'url(#wood)' }, gGrid);
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
    const t1 = el('text', { x: X(2) + 4, y: Y(4.5), 'text-anchor': 'middle', 'dominant-baseline': 'central', 'font-size': 26, fill: '#6b4518', 'font-family': 'KaiTi,STKaiti,"Noto Serif CJK SC",serif', 'letter-spacing': 6 }, gGrid);
    t1.textContent = '楚河';
    const t2 = el('text', { x: X(6) - 4, y: Y(4.5), 'text-anchor': 'middle', 'dominant-baseline': 'central', 'font-size': 26, fill: '#6b4518', 'font-family': 'KaiTi,STKaiti,"Noto Serif CJK SC",serif', 'letter-spacing': 6 }, gGrid);
    t2.textContent = '漢界';
  }
  drawGrid();

  function drawLabels() {
    gLabels.textContent = '';
    for (let dc = 0; dc < 9; dc++) {
      const top = el('text', { x: X(dc), y: M - 31, 'text-anchor': 'middle', 'font-size': 15, fill: '#6b4518', 'font-weight': 600 }, gLabels);
      top.textContent = dc + 1;
      const bot = el('text', { x: X(dc), y: BH - M + 38, 'text-anchor': 'middle', 'font-size': 15, fill: '#6b4518', 'font-weight': 600 }, gLabels);
      bot.textContent = 9 - dc;
    }
  }
  drawLabels();

  const flipR = (r) => (S.flipped ? 9 - r : r);
  const flipC = (c) => (S.flipped ? 8 - c : c);
  const sqX = (sq) => X(flipC(COL[sq]));
  const sqY = (sq) => Y(flipR(ROW[sq]));

  function hitSquare(ev) {
    const rect = svg.getBoundingClientRect();
    const x = ((ev.clientX - rect.left) * BW) / rect.width;
    const y = ((ev.clientY - rect.top) * BH) / rect.height;
    const dc = Math.round((x - M) / CELL), dr = Math.round((y - M) / CELL);
    if (dc < 0 || dc > 8 || dr < 0 || dr > 9) return -1;
    const c = S.flipped ? 8 - dc : dc, r = S.flipped ? 9 - dr : dr;
    return r * 9 + c;
  }

  // ---------- Âm thanh ----------
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

  // ---------- Thông báo ngắn ----------
  let toastTimer = 0;
  function toast(msg, warn, ms) {
    const t = $('toast');
    t.textContent = msg;
    t.className = 'show' + (warn ? ' warn' : '');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => { t.className = ''; }, ms || 3200);
  }

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
    const { viol } = Eng.judgeCycle(boards, moves, j & 1);
    const opp = 1 - mover;
    if (viol[mover] && viol[opp]) return { kind: 'draw', both: true, viol };
    if (viol[mover]) return { kind: 'mover-loses', reason: viol[mover], viol };
    if (viol[opp]) return { kind: 'opp-loses', reason: viol[opp], viol };
    return { kind: 'draw', both: false, viol };
  }
  const REASON = { check: 'chiếu mãi (nước nào cũng chiếu Tướng)', chase: 'đuổi bắt mãi một quân' };

  // ---------- Đi quân ----------
  function applyRaw(mv) {
    const mover = G.moves.length & 1;
    const board = cur();
    const note = Eng.notate(board, mv);
    const st = stateOf(board);
    const cap = Eng.makeMove(st, mv);
    G.moves.push(mv); G.notes.push(note); G.pos.push(st.b); G.caps.push(cap);
    G.keys.push(Eng.boardKey(st.b, 1 - mover));
    return { cap, mover };
  }

  function tryMove(mv, byHuman) {
    const mover = G.moves.length & 1;
    const board = cur();
    const st2 = stateOf(board);
    const capped = Eng.makeMove(st2, mv);
    const key = Eng.boardKey(st2.b, 1 - mover);
    let verdict = null;
    if (countKey(key) >= 2) verdict = repetitionVerdict(key, mv, st2.b, mover);
    if (verdict && verdict.kind === 'mover-loses' && byHuman) {
      SND.bad();
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
    G.anim = { from: mv & 127, to: mv >> 7 };
    G.sel = null; G.hint = null; G.hintText = '';
    G.thinking = false;
    afterMove(verdict, cap, mover);
    if (warn && !G.over) toast(`⚠ Bạn đang ${REASON[warn]} và thế cờ đã lặp lại. Nếu lặp lại lần nữa bạn sẽ bị xử thua – hãy đổi nước đi!`, true, 6500);
    return true;
  }

  function afterMove(verdict, cap, mover) {
    const t = turn();
    const st = stateOf(cur());
    const chk = Eng.inCheck(st, t);
    if (verdict) {
      if (verdict.kind === 'opp-loses') {
        finish(mover, `${SIDE_NAME[1 - mover]} phạm luật ${REASON[verdict.reason]} nên bị xử thua.`);
      } else if (verdict.kind === 'mover-loses') {
        finish(1 - mover, `${SIDE_NAME[mover]} phạm luật ${REASON[verdict.reason]} nên bị xử thua.`);
      } else if (verdict.both) {
        finish(null, 'Hai bên cùng phạm luật chiếu mãi / bắt mãi nên ván cờ được xử hòa.');
      } else {
        finish(null, 'Thế cờ lặp lại 3 lần mà không bên nào phạm luật nên ván cờ hòa.');
      }
    } else {
      checkEnd(chk);
    }
    if (!G.over) {
      if (chk) SND.check(); else if (cap) SND.capture(); else SND.move();
    }
    render();
    if (!G.over) { saveGame(); maybeAI(); } else saveGame();
  }

  function checkEnd(chk) {
    const t = turn();
    const b = cur();
    const st = stateOf(b);
    if (!Eng.genLegal(st, t).length) {
      if (chk) finish(1 - t, `Chiếu bí! ${SIDE_NAME[1 - t]} thắng.`);
      else finish(1 - t, `Tướng ${SIDE_SHORT[t]} bị vây chặt, không còn nước đi nên ${SIDE_NAME[t]} thua.`);
      return;
    }
    let attackers = 0;
    for (let sq = 0; sq < 90; sq++) {
      const ty = b[sq] & 7;
      if (b[sq] && (ty === Eng.R || ty === Eng.C || ty === Eng.H || ty === Eng.P)) attackers++;
    }
    if (!attackers) { finish(null, 'Hai bên đều không còn Xe, Pháo, Mã, Tốt để tấn công nên ván cờ hòa.'); return; }
    let since = 0;
    for (let i = G.caps.length - 1; i >= 0 && !G.caps[i]; i--) since++;
    if (since >= 100) finish(null, '50 nước liên tiếp không bên nào ăn quân nên ván cờ hòa.');
  }

  function finish(winner, text) {
    G.over = { winner, text };
    G.thinking = false; G.sel = null; G.hint = null; G.hintText = '';
    aiToken++;
    if (winner === null) { SND.move(); }
    else if (S.mode === 'ai') { winner === S.human ? SND.win() : SND.lose(); }
    else SND.win();
    G.viewing = false;
  }

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
    if (G.over || S.mode !== 'ai' || turn() === S.human || G.thinking) return;
    G.thinking = true;
    render();
    const token = ++aiToken;
    const lv = LEVELS[S.level];
    const opening = G.moves.length < 4;
    const opts = Object.assign({}, lv, { override: aiOverride() });
    if (opening && S.level >= 1) { opts.exact = true; opts.margin = 40; opts.maxDepth = Math.min(opts.maxDepth, 3); opts.timeMs = 800; }
    const t0 = Date.now();
    runSearch(cur(), turn(), opts).then((res) => {
      if (token !== aiToken) return;
      const wait = Math.max(0, 450 - (Date.now() - t0));
      setTimeout(() => {
        if (token !== aiToken) return;
        G.thinking = false;
        if (!res) { render(); return; }
        tryMove(res.mv, false);
      }, wait);
    });
  }

  function cancelAI() { aiToken++; G.thinking = false; G.busy = false; resetWorker(); }

  // ---------- Nút chức năng ----------
  function newGame(keepSettings) {
    cancelAI();
    if (!keepSettings) {
      S.mode = $('selMode').value; S.human = +$('selSide').value; S.level = +$('selLevel').value;
      S.flipped = S.mode === 'ai' && S.human === 1;
    }
    G = freshGame();
    syncControls();
    render();
    saveGame();
    maybeAI();
  }

  function undo() {
    if (!G.moves.length) return;
    cancelAI();
    const popOne = () => { G.moves.pop(); G.notes.pop(); G.pos.pop(); G.keys.pop(); G.caps.pop(); };
    G.over = null;
    popOne();
    if (S.mode === 'ai') while (turn() !== S.human && G.moves.length) popOne();
    G.sel = null; G.hint = null; G.hintText = ''; G.anim = null; G.viewing = false;
    render(); saveGame(); maybeAI();
  }

  async function hint() {
    if (G.over || G.thinking || G.busy || !humanTurn()) return;
    G.busy = true; G.hint = null; G.hintText = 'Đang nghĩ gợi ý…'; render();
    const token = ++aiToken;
    const res = await runSearch(cur(), turn(), { maxDepth: 6, timeMs: 1600, override: aiOverride() });
    if (token !== aiToken) return;
    G.busy = false;
    if (res) {
      G.hint = { from: res.mv & 127, to: res.mv >> 7 };
      G.hintText = '💡 Gợi ý: ' + Eng.notate(cur(), res.mv);
    } else G.hintText = '';
    render();
  }

  async function offerDraw() {
    if (G.over || G.thinking || G.busy || !humanTurn()) return;
    if (S.mode === 'pvp') {
      if (confirm(`${SIDE_SHORT[1 - turn()]} có đồng ý hòa không?`)) { finish(null, 'Hai bên thỏa thuận hòa.'); render(); saveGame(); }
      return;
    }
    if (G.moves.length < 10) { toast('Mới đi ít nước quá, máy chưa đồng ý hòa. Hãy chơi thêm nhé!'); return; }
    G.busy = true; G.hintText = 'Máy đang cân nhắc lời xin hòa…'; render();
    const token = ++aiToken;
    const res = await runSearch(cur(), 1 - S.human, { maxDepth: 4, timeMs: 900 });
    if (token !== aiToken) return;
    G.busy = false; G.hintText = '';
    if (res && res.bestScore <= 60) { finish(null, 'Máy đồng ý hòa. Hai bên thỏa thuận hòa.'); }
    else toast('Máy không đồng ý hòa – máy thấy mình đang có lợi. Hãy cố gắng nhé!');
    render(); saveGame();
  }

  function resign() {
    if (G.over) return;
    const loser = S.mode === 'ai' ? S.human : turn();
    if (!confirm(`${SIDE_NAME[loser]} xin thua?`)) return;
    cancelAI();
    finish(1 - loser, `${SIDE_NAME[loser]} xin thua. ${SIDE_NAME[1 - loser]} thắng.`);
    render(); saveGame();
  }

  function flip() { S.flipped = !S.flipped; render(); saveSettings(); }

  // ---------- Vẽ ----------
  function pieceGroup(sq, p, x, y) {
    const sd = p >> 3, ty = p & 7;
    const g = el('g', { class: 'piece' }, gPieces);
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

  function render() {
    const b = cur();
    const t = turn();
    const st = stateOf(b);
    G.legal = G.over ? [] : Eng.genLegal(st, t);
    const chk = !G.over && Eng.inCheck(st, t);

    // quân cờ
    gPieces.textContent = '';
    const animTo = G.anim ? G.anim.to : -1;
    let animGroup = null, animFrom = null;
    for (let sq = 0; sq < 90; sq++) {
      const p = b[sq];
      if (!p) continue;
      if (sq === animTo) {
        animFrom = G.anim.from;
        animGroup = pieceGroup(sq, p, sqX(animFrom), sqY(animFrom));
      } else pieceGroup(sq, p, sqX(sq), sqY(sq));
    }
    if (animGroup) {
      void animGroup.getBoundingClientRect();
      requestAnimationFrame(() => { animGroup.style.transform = `translate(${sqX(animTo)}px,${sqY(animTo)}px)`; });
    }
    G.anim = null;

    // nền nhấn mạnh
    gHl.textContent = '';
    gMarks.textContent = '';
    if (G.moves.length) {
      const lm = G.moves[G.moves.length - 1];
      ring(gHl, lm & 127, 26, '#2f6fde', 2.5, { 'stroke-dasharray': '5 4', opacity: .85 });
      ring(gHl, lm >> 7, 29, '#2f6fde', 3.5, { opacity: .9 });
    }
    if (chk) {
      const g = st.kp[t];
      el('circle', { cx: sqX(g), cy: sqY(g), r: 40, fill: 'url(#glow)', class: 'checkglow' }, gHl);
    }
    if (G.sel !== null) {
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
    if (G.hint) {
      ring(gMarks, G.hint.from, 30, '#1f9b60', 4, { class: 'hintring' });
      ring(gMarks, G.hint.to, 30, '#1f9b60', 4, { class: 'hintring' });
    }

    renderBars(st, chk);
    renderStatus(chk);
    renderMoves();
    syncOverlay();
    $('btnUndo').disabled = !G.moves.length;
    $('btnHint').disabled = !!G.over || G.thinking || G.busy || !humanTurn();
    $('btnDraw').disabled = !!G.over || G.thinking || G.busy || !humanTurn();
    $('btnResign').disabled = !!G.over;
  }

  function capturedBy(side) {
    const out = [];
    G.caps.forEach((c, i) => { if (c && (i & 1) === side) out.push(c); });
    out.sort((a, b) => (b & 7) - (a & 7));
    return out;
  }

  function renderBars(st, chk) {
    const bottomSide = S.flipped ? 1 : 0, topSide = 1 - bottomSide;
    const fill = (id, side) => {
      const bar = $(id);
      const isAI = S.mode === 'ai' && side !== S.human;
      const who = S.mode === 'pvp' ? 'Người chơi' : (isAI ? 'Máy' : 'Bạn');
      const active = !G.over && turn() === side;
      bar.className = 'pbar ' + (id === 'barTop' ? 'top' : 'bottom') + (active ? ' active' : '');
      const think = isAI && G.thinking ? ' <span class="spinner" title="Đang nghĩ"></span>' : '';
      const caps = capturedBy(side).map((c) => `<span class="${(c >> 3) === 0 ? 'w' : 'b'}${S.pieceStyle === 'vi' ? ' vi' : ''}" title="${PIECE_NAME[c & 7]}">${glyph(c >> 3, c & 7)}</span>`).join('');
      const lvl = isAI ? ` · ${LEVELS[S.level].name}` : '';
      bar.innerHTML = `<span class="dot ${side === 0 ? 'w' : 'b'}"></span><span class="nm">${who}</span><span class="tag">${SIDE_NAME[side]}${lvl}</span>${think}<span class="caps" aria-label="Quân đã ăn">${caps}</span>`;
    };
    fill('barTop', topSide);
    fill('barBottom', bottomSide);
  }

  function renderStatus(chk) {
    const s = $('status');
    if (G.over) {
      s.textContent = G.over.winner === null ? 'Ván cờ hòa' : `${SIDE_NAME[G.over.winner]} thắng`;
    } else if (G.thinking) {
      s.innerHTML = '<span class="spinner"></span> Máy đang suy nghĩ…';
    } else {
      const t = turn();
      let txt = `Lượt đi: ${SIDE_NAME[t]}`;
      if (S.mode === 'ai') txt = t === S.human ? `Đến lượt bạn (${SIDE_NAME[t]})` : `Lượt của máy (${SIDE_NAME[t]})`;
      s.innerHTML = '';
      s.appendChild(document.createTextNode(txt));
      if (chk) { const bd = document.createElement('span'); bd.className = 'badge'; bd.textContent = 'CHIẾU TƯỚNG!'; s.appendChild(bd); }
    }
    $('hintText').textContent = G.hintText || '';
  }

  function renderMoves() {
    const box = $('moves');
    if (!G.notes.length) { box.innerHTML = '<div class="empty">Chưa có nước đi nào.</div>'; return; }
    let h = '<table><thead><tr><th></th><th>Trắng</th><th>Đen</th></tr></thead><tbody>';
    const last = G.notes.length - 1;
    for (let i = 0; i < G.notes.length; i += 2) {
      h += `<tr><td class="n">${i / 2 + 1}.</td><td${i === last ? ' class="cur"' : ''}>${G.notes[i]}</td><td${i + 1 === last ? ' class="cur"' : ''}>${G.notes[i + 1] || ''}</td></tr>`;
    }
    box.innerHTML = h + '</tbody></table>';
    box.scrollTop = box.scrollHeight;
  }

  function syncOverlay() {
    const ov = $('overlay');
    if (!G.over || G.viewing) { ov.hidden = true; return; }
    ov.hidden = false;
    let title;
    if (G.over.winner === null) title = '🤝 Ván cờ hòa';
    else if (S.mode === 'ai') title = G.over.winner === S.human ? '🎉 Bạn thắng!' : '😅 Máy thắng';
    else title = `🎉 ${SIDE_NAME[G.over.winner]} thắng!`;
    $('ovTitle').textContent = title;
    $('ovText').textContent = G.over.text;
  }

  // ---------- Tương tác ----------
  svg.addEventListener('click', (ev) => {
    if (G.over || G.thinking || G.busy || !humanTurn()) return;
    const sq = hitSquare(ev);
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
    render();
  });

  $('btnNew').addEventListener('click', () => newGame(false));
  $('ovNew').addEventListener('click', () => newGame(false));
  $('ovView').addEventListener('click', () => { G.viewing = true; render(); });
  $('btnUndo').addEventListener('click', undo);
  $('btnHint').addEventListener('click', hint);
  $('btnDraw').addEventListener('click', offerDraw);
  $('btnResign').addEventListener('click', resign);
  $('btnFlip').addEventListener('click', flip);
  $('btnRules').addEventListener('click', () => { const d = $('rulesDlg'); if (d.showModal) d.showModal(); else d.setAttribute('open', ''); });
  $('rulesClose').addEventListener('click', () => $('rulesDlg').close());
  $('rulesDlg').addEventListener('click', (e) => { if (e.target === $('rulesDlg')) $('rulesDlg').close(); });
  $('chkHints').addEventListener('change', () => { S.hints = $('chkHints').checked; saveSettings(); render(); });
  $('selStyle').addEventListener('change', () => { S.pieceStyle = $('selStyle').value === 'vi' ? 'vi' : 'han'; saveSettings(); render(); });
  $('chkSound').addEventListener('change', () => { S.sound = $('chkSound').checked; saveSettings(); });
  $('selMode').addEventListener('change', () => { $('selSide').disabled = $('selLevel').disabled = $('selMode').value === 'pvp'; });

  function syncControls() {
    $('selMode').value = S.mode; $('selSide').value = String(S.human); $('selLevel').value = String(S.level);
    $('chkHints').checked = S.hints; $('chkSound').checked = S.sound; $('selStyle').value = S.pieceStyle;
    $('selSide').disabled = $('selLevel').disabled = S.mode === 'pvp';
  }

  // ---------- Lưu / tải ----------
  function saveSettings() { try { localStorage.setItem('cotuong.settings', JSON.stringify(S)); } catch (e) { /* */ } }
  function saveGame() {
    try {
      localStorage.setItem('cotuong.settings', JSON.stringify(S));
      localStorage.setItem('cotuong.game', JSON.stringify({ moves: G.moves, over: G.over }));
    } catch (e) { /* */ }
  }
  function loadSaved() {
    try {
      const s = JSON.parse(localStorage.getItem('cotuong.settings') || 'null');
      if (s) Object.assign(S, { mode: s.mode === 'pvp' ? 'pvp' : 'ai', human: s.human === 1 ? 1 : 0, level: Math.min(3, Math.max(0, s.level | 0)), hints: s.hints !== false, sound: s.sound !== false, flipped: !!s.flipped, pieceStyle: s.pieceStyle === 'vi' ? 'vi' : 'han' });
      const g = JSON.parse(localStorage.getItem('cotuong.game') || 'null');
      if (g && Array.isArray(g.moves) && g.moves.length) {
        const game = freshGame();
        G = game;
        for (const mv of g.moves) {
          const legal = Eng.genLegal(stateOf(cur()), turn());
          if (!legal.includes(mv)) throw new Error('ván lưu không hợp lệ');
          applyRaw(mv);
        }
        if (g.over) G.over = g.over;
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
  if (!loadSaved()) {
    G = freshGame();
    if (S.mode === 'ai' && S.human === 1) S.flipped = true;
  }
  syncControls();
  render();
  if (!G.over) maybeAI();
  window.__cotuong = { Eng, get G() { return G; }, S, tryMove, render, newGame, geom: { CELL, M, BW, BH } }; // phục vụ kiểm thử
})();
