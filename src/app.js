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
  const S = { mode: 'ai', human: 0, level: 1, clock: 0, hints: true, sound: true, vibe: true, flipped: false, pieceStyle: 'han', alerts: true };
  let G = null, stash = null;
  let aiToken = 0;

  function freshGame(opts) {
    opts = opts || {};
    const first = opts.first || 0;
    const b = opts.board ? Int8Array.from(opts.board) : Eng.initialBoard();
    const ms = (opts.kind && opts.kind !== 'game') ? 0 : ((opts.cfg ? opts.cfg.clock : S.clock) | 0) * 60000;
    return { kind: opts.kind || 'game', id: Date.now(), first,
      cfg: opts.cfg || { mode: S.mode, human: S.human, level: S.level, clock: S.clock },
      pos: [b], moves: [], notes: [], keys: [Eng.boardKey(b, first)], caps: [], over: null,
      sel: null, legal: [], hint: null, hintText: '', thinking: false, busy: false, anim: null, viewing: false,
      view: null, auto: 0, analysis: null, puzzle: opts.puzzle || null, bot: null, botChats: 0,
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


  // ---------- Hồ sơ người chơi, thống kê, điểm xếp hạng, huy hiệu ----------
  const PROFILE_KEY = 'cotuong.profile';
  const AVATARS = ['🐲', '🐯', '🦁', '🐼', '🦊', '🐘', '🦅', '🐬', '⭐', '♟', '🚀', '⚡'];
  const LEVEL_RATING = [600, 1000, 1400, 1800]; // điểm "danh nghĩa" của máy ở từng độ khó
  const blankProfile = () => ({ setup: false, name: '', nick: '', avatar: '🐲', rating: 1000, games: 0, w: [0, 0, 0, 0], l: [0, 0, 0, 0], d: [0, 0, 0, 0],
    pvp: { w: 0, l: 0, d: 0 }, online: { w: 0, l: 0, d: 0, games: 0, rating: 1000 }, bots: { w: 0, l: 0, d: 0, games: 0, rating: 1000 }, botWins: {}, streak: 0, best: 0, fastWin: 0, badges: {}, created: Date.now() });
  function loadProfile() {
    const base = blankProfile();
    try {
      const x = JSON.parse(localStorage.getItem(PROFILE_KEY) || 'null');
      if (x && typeof x === 'object') {
        const arr4 = (a) => (Array.isArray(a) && a.length === 4 ? a.map((v) => v | 0) : [0, 0, 0, 0]);
        return Object.assign(base, x, { w: arr4(x.w), l: arr4(x.l), d: arr4(x.d),
          pvp: Object.assign(base.pvp, x.pvp), online: Object.assign(base.online, x.online), bots: Object.assign(base.bots, x.bots), botWins: x.botWins && typeof x.botWins === 'object' ? x.botWins : {}, badges: x.badges && typeof x.badges === 'object' ? x.badges : {} });
      }
    } catch (e) { /* hồ sơ hỏng: dùng hồ sơ mới */ }
    return base;
  }
  let PF = loadProfile();
  function saveProfile() { try { localStorage.setItem(PROFILE_KEY, JSON.stringify(PF)); } catch (e) { /* */ } }
  const displayName = () => (PF.nick || PF.name || 'Bạn').trim();
  const sum = (a) => a.reduce((x, y) => x + y, 0);

  const BADGES = [
    { id: 'first', icon: '🎯', name: 'Ván đầu tiên', desc: 'Hoàn thành ván cờ đầu tiên với máy', ok: (p) => p.games >= 1 },
    { id: 'win1', icon: '🥇', name: 'Chiến thắng đầu tiên', desc: 'Thắng máy lần đầu', ok: (p) => sum(p.w) >= 1 },
    { id: 'win_easy', icon: '🌱', name: 'Hạ máy mức Dễ', desc: 'Thắng máy mức Dễ', ok: (p) => p.w[0] >= 1 },
    { id: 'win_mid', icon: '🌿', name: 'Hạ máy mức Vừa', desc: 'Thắng máy mức Vừa', ok: (p) => p.w[1] >= 1 },
    { id: 'win_hard', icon: '🌳', name: 'Hạ máy mức Khó', desc: 'Thắng máy mức Khó', ok: (p) => p.w[2] >= 1 },
    { id: 'win_pro', icon: '👑', name: 'Hạ Cao thủ', desc: 'Thắng máy mức Cao thủ', ok: (p) => p.w[3] >= 1 },
    { id: 'streak3', icon: '🔥', name: 'Thắng 3 ván liền', desc: 'Chuỗi 3 ván thắng', ok: (p) => p.best >= 3 },
    { id: 'streak5', icon: '⚡', name: 'Thắng 5 ván liền', desc: 'Chuỗi 5 ván thắng', ok: (p) => p.best >= 5 },
    { id: 'fast', icon: '💨', name: 'Chiến thắng chớp nhoáng', desc: 'Thắng trong chưa đến 25 nước', ok: (p) => p.fastWin > 0 },
    { id: 'games10', icon: '📘', name: 'Chăm chỉ', desc: 'Chơi 10 ván', ok: (p) => p.games >= 10 },
    { id: 'games50', icon: '📚', name: 'Kỳ thủ nhí', desc: 'Chơi 50 ván', ok: (p) => p.games >= 50 },
    { id: 'rating1200', icon: '📈', name: 'Điểm 1200', desc: 'Đạt 1200 điểm xếp hạng', ok: (p) => p.rating >= 1200 },
    { id: 'rating1500', icon: '🏆', name: 'Điểm 1500', desc: 'Đạt 1500 điểm xếp hạng', ok: (p) => p.rating >= 1500 },
    { id: 'puz10', icon: '🧩', name: 'Thợ giải thế', desc: 'Giải đúng 10 bài tập', ok: (p, x) => x.solved >= 10 },
    { id: 'puz40', icon: '🧠', name: 'Bậc thầy thế cờ', desc: 'Giải đúng 40 bài tập', ok: (p, x) => x.solved >= 40 },
    { id: 'puz3star', icon: '🌟', name: 'Ba sao', desc: 'Đạt 3 sao ở 10 bài tập', ok: (p, x) => x.stars3 >= 10 },
    { id: 'bot_any', icon: '🤖', name: 'Hạ gục bot', desc: 'Thắng một bot', ok: (p) => Object.values(p.botWins).some((v) => v > 0) },
    { id: 'bot_master', icon: '🧙', name: 'Vượt qua Sư Phụ', desc: 'Thắng bot Sư Phụ', ok: (p) => (p.botWins['su-phu'] | 0) > 0 },
    { id: 'online1', icon: '🌐', name: 'Kỳ thủ online', desc: 'Chơi một ván online', ok: (p) => p.online.games >= 1 },
    { id: 'online_win', icon: '🎖', name: 'Thắng online', desc: 'Thắng một ván online', ok: (p) => p.online.w >= 1 },
  ];
  function puzzleStats() {
    const prog = (typeof pzProgress === 'function') ? pzProgress() : {};
    const v = Object.values(prog);
    return { solved: v.length, stars3: v.filter((x) => x >= 3).length };
  }
  function checkBadges() {
    const x = puzzleStats(), won = [];
    for (const b of BADGES) {
      if (!PF.badges[b.id] && b.ok(PF, x)) { PF.badges[b.id] = Date.now(); won.push(b); }
    }
    if (won.length) {
      saveProfile();
      setTimeout(() => toast('🏅 Huy hiệu mới: ' + won.map((b) => b.icon + ' ' + b.name).join(', '), false, 5200), 900);
    }
  }
  const expected = (r, o) => 1 / (1 + Math.pow(10, (o - r) / 400));
  function eloUpdate(r, o, score, games) {
    const k = games < 20 ? 40 : 24;
    return Math.max(100, Math.round(r + k * (score - expected(r, o))));
  }
  /** Ghi kết quả ván với máy / 2 người vào hồ sơ. */
  function recordGame(g) {
    if (!g || g.recorded || g.kind !== 'game' || !g.over || g.moves.length < 2) return;
    g.recorded = true;
    const c = g.cfg;
    if (c.mode === 'ai') {
      const lv = c.level, w = g.over.winner;
      const res = w === null ? 'd' : (w === c.human ? 'w' : 'l');
      PF[res][lv]++;
      PF.games++;
      const score = res === 'w' ? 1 : res === 'd' ? 0.5 : 0;
      PF.rating = eloUpdate(PF.rating, LEVEL_RATING[lv], score, PF.games);
      if (res === 'w') { PF.streak++; if (PF.streak > PF.best) PF.best = PF.streak; if (g.moves.length < 50) PF.fastWin++; }
      else if (res === 'l') PF.streak = 0;
    } else if (c.mode === 'bot' && g.bot) {
      const w = g.over.winner, res = w === null ? 'd' : (w === c.human ? 'w' : 'l');
      PF.bots[res]++; PF.bots.games++;
      PF.bots.rating = eloUpdate(PF.bots.rating, g.bot.rating, res === 'w' ? 1 : res === 'd' ? 0.5 : 0, PF.bots.games);
      if (res === 'w') PF.botWins[g.bot.id] = (PF.botWins[g.bot.id] | 0) + 1;
    } else if (c.mode === 'online') {
      const w = g.over.winner, res = w === null ? 'd' : (w === c.human ? 'w' : 'l');
      const opp = (g.online && g.online.opp) || {};
      PF.online[res]++; PF.online.games++;
      const old = PF.online.rating;
      PF.online.rating = eloUpdate(old, opp.rating || 1000, res === 'w' ? 1 : res === 'd' ? 0.5 : 0, PF.online.games);
      if (g.online) g.online.delta = PF.online.rating - old;
      if (NET.enabled) NET.saveUser({ nick: (PF.nick || displayName()).slice(0, 20), avatar: PF.avatar, rating: PF.online.rating, games: PF.online.games, wins: PF.online.w }).catch(() => {});
    } else if (c.mode === 'pvp') {
      const w = g.over.winner;
      if (w === null) PF.pvp.d++; else PF.pvp.w++;
    }
    saveProfile();
    checkBadges();
    renderChip();
  }

  function renderChip() {
    const c = $('btnProfile');
    if (!c) return;
    c.innerHTML = `<span class="av">${PF.avatar}</span><span class="pn"><b>${escapeHtml(displayName())}</b><small>${PF.rating} điểm</small></span>`;
  }
  const escapeHtml = (t) => String(t).replace(/[&<>"']/g, (m) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[m]));

  let profAvatar = '🐲', profWelcome = false;
  function renderProfile() {
    $('pfName').value = PF.name; $('pfNick').value = PF.nick;
    profAvatar = PF.avatar;
    $('pfAvatars').innerHTML = AVATARS.map((a) => `<button type="button" class="avb${a === profAvatar ? ' on' : ''}" data-a="${a}">${a}</button>`).join('');
    const W = sum(PF.w), L = sum(PF.l), D = sum(PF.d), N = W + L + D;
    const names = ['Dễ', 'Vừa', 'Khó', 'Cao thủ'];
    const x = puzzleStats();
    let h = `<div class="st-top"><div><b>${PF.rating}</b><small>Điểm xếp hạng</small></div><div><b>${N}</b><small>Ván với máy</small></div><div><b>${N ? Math.round((100 * W) / N) : 0}%</b><small>Tỉ lệ thắng</small></div></div>`;
    h += `<table class="st-tbl"><thead><tr><th>Độ khó</th><th>Thắng</th><th>Hòa</th><th>Thua</th></tr></thead><tbody>`;
    names.forEach((n, i) => { h += `<tr><td>${n}</td><td class="res-win">${PF.w[i]}</td><td class="res-draw">${PF.d[i]}</td><td class="res-lose">${PF.l[i]}</td></tr>`; });
    h += `<tr class="tot"><td>Tổng</td><td class="res-win">${W}</td><td class="res-draw">${D}</td><td class="res-lose">${L}</td></tr></tbody></table>`;
    h += `<p class="muted">Chuỗi thắng hiện tại: <b>${PF.streak}</b> · dài nhất: <b>${PF.best}</b> · Bài tập đã giải: <b>${x.solved}</b>/${typeof PUZZLES !== 'undefined' ? PUZZLES.length : 0} (${x.stars3} bài 3 sao)</p>`;
    const o = PF.online, bt = PF.bots;
    h += `<p class="muted">Đấu bot: <b>${bt.rating}</b> điểm · thắng ${bt.w} · hòa ${bt.d} · thua ${bt.l}</p>`;
    h += `<p class="muted">Online: <b>${o.rating}</b> điểm · thắng ${o.w} · hòa ${o.d} · thua ${o.l}${PF.pvp.w + PF.pvp.d ? ` · Hai người cùng máy: ${PF.pvp.w + PF.pvp.d} ván` : ''}</p>`;
    h += '<div class="pz-title">Huy hiệu</div><div class="badges">' + BADGES.map((b) => `<div class="badge-i${PF.badges[b.id] ? ' got' : ''}" title="${escapeHtml(b.desc)}"><span>${PF.badges[b.id] ? b.icon : '🔒'}</span><b>${b.name}</b><small>${b.desc}</small></div>`).join('') + '</div>';
    $('pfStats').innerHTML = h;
    $('pfTitle').textContent = profWelcome ? 'Chào mừng bạn!' : 'Hồ sơ của bạn';
    $('pfIntro').hidden = !profWelcome;
    $('pfStatsWrap').hidden = profWelcome;
    $('pfSkip').hidden = !profWelcome;
    $('pfReset').hidden = profWelcome;
  }
  function openProfile(welcome) {
    profWelcome = !!welcome;
    setSheet(false);
    renderProfile();
    openDlg($('profileDlg'));
  }
  function saveProfileForm() {
    const name = $('pfName').value.trim().slice(0, 40), nick = $('pfNick').value.trim().slice(0, 16);
    if (profWelcome && !name && !nick) { toast('Hãy nhập họ và tên hoặc biệt danh của bạn nhé!', true); return; }
    PF.name = name; PF.nick = nick; PF.avatar = profAvatar; PF.setup = true;
    saveProfile(); renderChip();
    closeDlg($('profileDlg'));
    if (G) render();
    toast('Đã lưu hồ sơ ✔');
  }

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


  // ---------- Bot đối thủ (luôn ghi rõ là bot) ----------
  const BOTS = [
    { id: 'tieu-ma', name: 'Tiểu Mã', avatar: '🐴', rating: 600, stars: '★☆☆☆', blurb: 'Mới tập chơi, hay đi sai. Hợp để làm quen.',
      search: { maxDepth: 2, timeMs: 300, margin: 300, exact: true }, think: [1500, 4500],
      lines: { start: ['Chào bạn! Mình mới tập chơi thôi nhé 🐴', 'Mình là Tiểu Mã, chơi nhẹ tay nha!'], idle: ['Hừm, để mình nghĩ…', 'Oái, khó quá!', 'Nước của bạn hay đó!'], win: ['Mình thắng rồi! May quá 😅'], lose: ['Bạn giỏi quá, mình chịu thua!'], draw: ['Hòa nhé, vui quá!'] } },
    { id: 'phao-thu', name: 'Pháo Thủ', avatar: '💣', rating: 1000, stars: '★★☆☆', blurb: 'Thích đánh pháo đầu, tấn công mạnh.',
      search: { maxDepth: 3, timeMs: 700, margin: 40, exact: true }, think: [1200, 5000],
      lines: { start: ['Pháo đầu nào! 💣', 'Chuẩn bị đỡ pháo nhé!'], idle: ['Cẩn thận pháo của mình đó!', 'Để xem bạn đỡ thế nào…'], win: ['Pháo nổ rồi! Ván hay đấy!'], lose: ['Pháo hết đạn rồi 😄 Bạn chơi hay quá!'], draw: ['Hòa! Đấu lại nhé?'] } },
    { id: 'xe-tuong', name: 'Xe Tướng', avatar: '🛡', rating: 1400, stars: '★★★☆', blurb: 'Chắc chắn, ít sai lầm. Phải suy nghĩ kỹ mới thắng.',
      search: { maxDepth: 6, timeMs: 1400, margin: 0 }, think: [1500, 7000],
      lines: { start: ['Xe này không dễ ăn đâu 🛡', 'Hãy cho mình thấy bản lĩnh nào!'], idle: ['Thế cờ thú vị đấy.', 'Mình đang tính vài nước…'], win: ['Ván hay! Lần sau bạn sẽ thắng.'], lose: ['Bạn đã hạ được Xe Tướng, giỏi lắm!'], draw: ['Cân tài cân sức, hòa nhé.'] } },
    { id: 'su-phu', name: 'Sư Phụ', avatar: '🧙', rating: 1800, stars: '★★★★', blurb: 'Cao thủ, nghĩ lâu, rất khó thắng.',
      search: { maxDepth: 9, timeMs: 3000, margin: 0 }, think: [2000, 9000],
      lines: { start: ['Hãy cho thầy thấy bạn học được gì 🧙', 'Thầy sẽ không nhường đâu nhé.'], idle: ['Hừm…', 'Nước này có ý đấy.'], win: ['Còn phải luyện thêm, nhưng con đánh khá lắm!'], lose: ['Con đã vượt qua thầy rồi! 👏'], draw: ['Hòa. Con tiến bộ nhiều rồi.'] } },
  ];
  const botOpts = { side: 'r', clock: '0' };
  const botFast = () => !!window.__BOT_FAST;
  function botSay(kind, game) {
    const g = game || G;
    if (!g || !g.bot || g !== G) return;
    const arr = g.bot.lines[kind];
    if (!arr || !arr.length) return;
    toast(`${g.bot.avatar} ${g.bot.name}: ${arr[(Math.random() * arr.length) | 0]}`, false, 3600);
  }
  function botDelay(bot, nLegal, t0) {
    if (botFast()) return 60;
    const [lo, hi] = bot.think;
    let d = (lo + Math.random() * (hi - lo)) * (0.6 + Math.min(1.2, nLegal / 45));
    if (G.clock.on) d = Math.min(d, G.clock.t[turn()] / 12);
    return Math.max(0, d - (Date.now() - t0));
  }
  function openBots() {
    $('botList').innerHTML = BOTS.map((b) => `<button class="botcard" type="button" data-id="${b.id}"><span class="bav">${b.avatar}</span><span class="bt"><b>${b.name} <span class="tagbot">🤖 BOT</span></b><small>${b.blurb}</small></span><span class="bs">${b.rating}<small>${b.stars}</small></span></button>`).join('');
    document.querySelectorAll('#botDlg [data-bo]').forEach((seg) => seg.querySelectorAll('button').forEach((x) => x.classList.toggle('on', x.dataset.v === botOpts[seg.dataset.bo])));
    openDlg($('botDlg'));
  }
  document.querySelectorAll('#botDlg [data-bo]').forEach((seg) => seg.addEventListener('click', (ev) => {
    const x = ev.target.closest('button'); if (!x) return;
    botOpts[seg.dataset.bo] = x.dataset.v;
    seg.querySelectorAll('button').forEach((y) => y.classList.toggle('on', y === x));
  }));
  $('botList').addEventListener('click', (ev) => { const b = ev.target.closest('.botcard'); if (b) startBotGame(b.dataset.id, botOpts.side); });
  async function startBotGame(botId, sideSel) {
    const bot = BOTS.find((b) => b.id === botId);
    if (!bot) return;
    if (G && G.online && !G.over) { toast('Đang chơi online – hãy thoát ván trước nhé.'); return; }
    if (isGame() && !G.online && G.moves.length >= 2 && !G.over && !G.bot && false) return;
    const side = sideSel === 'r' ? (Math.random() < 0.5 ? 0 : 1) : +sideSel;
    if (Q) await quickStop();
    cancelAI();
    leaveSpecial(true);
    if (G && isGame() && G.moves.length >= 6 && !G.over) archiveGame(G, true);
    G = freshGame({ cfg: { mode: 'bot', human: side, level: 0, clock: +botOpts.clock | 0, botId } });
    G.bot = bot;
    S.flipped = side === 1;
    closeDlg($('botDlg')); closeDlg($('onlineDlg')); closeDlg($('homeDlg')); setSheet(false);
    render(); saveGame(); maybeAI();
    const game = G;
    setTimeout(() => { if (G === game && !G.moves.length || G === game && G.moves.length < 3) botSay('start', game); }, botFast() ? 200 : 1500);
  }
  $('olBotBtn').addEventListener('click', openBots);
  $('olEmptyBot').addEventListener('click', async () => { if (Q) await quickStop(); openBots(); });

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
    if (G.online && byHuman) olPublish(mv);
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

  function finish(winner, text, remote) {
    G.over = { winner, text };
    G.thinking = false; G.busy = false; G.sel = null; G.hint = null; G.hintText = '';
    aiToken++;
    if (winner === null) { SND.move(); }
    else if (cfg().mode === 'ai' || cfg().mode === 'online' || cfg().mode === 'bot') { winner === cfg().human ? SND.win() : SND.lose(); }
    else SND.win();
    buzz(winner === null ? 20 : [60, 60, 120]);
    G.viewing = false;
    if (isGame()) { archiveGame(G); recordGame(G); }
    if (G.online && !remote) olSendResult(winner === null ? 2 : winner, text);
    if (G.bot) { const g0 = G; setTimeout(() => botSay(winner === null ? 'draw' : winner === cfg().human ? 'lose' : 'win', g0), botFast() ? 300 : 900); }
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
    if (G.online && !(OL && OL.started)) { c.last = null; return; }
    const now = Date.now(), t = turn();
    if (c.last != null) c.t[t] -= now - c.last;
    c.last = now;
    if (c.t[t] <= 0) {
      c.t[t] = 0;
      if (G.online) { olTimeout(t); return; }
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
    const md = G && G.cfg.mode;
    if (!isGame() || G.over || (md !== 'ai' && md !== 'bot') || turn() === cfg().human || G.thinking) return;
    G.thinking = true;
    render();
    const token = ++aiToken;
    const bot = G.bot;
    const opts = Object.assign({}, bot ? bot.search : LEVELS[cfg().level], { override: aiOverride() });
    if (G.moves.length < 4 && (bot ? bot.rating >= 1000 : cfg().level >= 1)) { opts.exact = true; opts.margin = 40; opts.maxDepth = Math.min(opts.maxDepth, 3); opts.timeMs = 800; }
    if (G.clock.on) opts.timeMs = Math.max(250, Math.min(opts.timeMs, G.clock.t[turn()] / 25));
    const t0 = Date.now();
    const game = G;
    runSearch(cur(), turn(), opts).then((res) => {
      if (token !== aiToken || G !== game) return;
      const wait = bot ? botDelay(bot, Eng.genLegal(stateOf(cur()), turn()).length, t0) : Math.max(0, 450 - (Date.now() - t0));
      setTimeout(() => {
        if (token !== aiToken || G !== game) return;
        G.thinking = false;
        if (!res) { render(); return; }
        if (bot && res.bestScore < -1100 && G.moves.length >= 40 && Math.random() < 0.5) {
          finish(cfg().human, `${bot.name} (bot) xin thua. Bạn thắng!`);
          render(); saveGame();
          return;
        }
        const mover = turn();
        tryMove(res.mv, false);
        if (bot && !G.over && G.botChats < 3 && Math.random() < 0.07) { G.botChats++; botSay('idle', game); }
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
    if (ng.mode === 'online') { closeDlg($('newDlg')); openOnline(); return; }
    S.mode = ng.mode; S.human = +ng.human; S.level = +ng.level; S.clock = +ng.clock;
    S.flipped = S.mode === 'ai' && S.human === 1;
    closeDlg($('newDlg')); setSheet(false);
    newGame();
  }

  async function openNew() {
    if (G.online) { if (G.over || !OL || !OL.oppUid) { await olExit(); } else { toast('Đang chơi online – bấm Thoát nếu muốn rời ván.'); setSheet(false); return; } }
    if (isGame() && G.moves.length >= 2 && !G.over) {
      if (!(await askConfirm('Bỏ ván đang chơi?', 'Ván cờ hiện tại chưa kết thúc. Bạn muốn bắt đầu ván mới?', 'Ván mới', 'Chơi tiếp'))) return;
    }
    openHome();
  }
  function openHome() {
    setSheet(false);
    $('homeResume').hidden = !(isGame() && !G.online && G.moves.length > 0 && !G.over);
    openDlg($('homeDlg'));
  }
  function openOffline(mode) {
    ng = { mode: mode === 'pvp' ? 'pvp' : 'ai', human: String(S.human), level: String(S.level), clock: String(S.clock) };
    syncNewDlg();
    closeDlg($('homeDlg'));
    openDlg($('newDlg'));
  }
  $('homeOnline').addEventListener('click', () => { closeDlg($('homeDlg')); openOnline(); });
  $('homeOffline').addEventListener('click', () => openOffline('ai'));
  $('homePvp').addEventListener('click', () => openOffline('pvp'));
  $('homePuzzle').addEventListener('click', () => { closeDlg($('homeDlg')); openPuzzles(); });
  $('homeGames').addEventListener('click', () => { closeDlg($('homeDlg')); openGames(); });
  $('homeResume').addEventListener('click', () => closeDlg($('homeDlg')));
  $('btnOffline').addEventListener('click', async () => {
    setSheet(false);
    if (G.online) { if (G.over || !OL || !OL.oppUid) { await olExit(); } else { toast('Đang chơi online – bấm Thoát nếu muốn rời ván.'); return; } }
    openHome();
  });

  function undo() {
    if (!isGame() || G.online || G.bot || G.view != null || !G.moves.length) { if (G && G.bot) toast('Đấu với bot không được đi lại, giống như chơi online!'); return; }
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
    if (G.online) { toast('Chơi online không dùng gợi ý nhé!'); return; }
    if (G.bot) { toast('Đấu với bot không dùng gợi ý, giống như chơi online!'); return; }
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
    if (G.online) return olOfferDraw();
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
    if (G.online) return olResign();
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
    list.unshift({ id: g.id, t: Date.now(), cfg: g.cfg, moves: g.moves.slice(), winner: abandoned ? 'x' : g.over.winner, text: abandoned ? 'Bỏ dở' : g.over.text, opp: g.online && g.online.opp ? g.online.opp.nick : (g.bot ? g.bot.name : ''), oppAvatar: g.bot ? g.bot.avatar : '' });
    saveArchive(list);
  }
  function resultLabel(e) {
    if (e.winner === 'x') return ['Bỏ dở', ''];
    if (e.winner === null) return ['Hòa', 'res-draw'];
    if (e.cfg.mode === 'ai' || e.cfg.mode === 'online' || e.cfg.mode === 'bot') return e.winner === e.cfg.human ? ['Thắng', 'res-win'] : ['Thua', 'res-lose'];
    return [SIDE_SHORT[e.winner] + ' thắng', 'res-win'];
  }
  function renderGamesList() {
    const list = loadArchive(), box = $('gamesList');
    if (!list.length) { box.innerHTML = '<div class="empty-note">Chưa có ván nào được lưu.<br>Ván cờ tự lưu khi kết thúc.</div>'; return; }
    box.innerHTML = list.map((e) => {
      const [txt, cls] = resultLabel(e);
      const d = new Date(e.t);
      const when = `${d.getDate()}/${d.getMonth() + 1} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
      const vs = e.cfg.mode === 'bot' ? `Đấu bot 🤖 ${escapeHtml(e.opp || '')} · cầm ${SIDE_SHORT[e.cfg.human]}` : e.cfg.mode === 'ai' ? `Với máy · ${LEVELS[e.cfg.level].name} · cầm ${SIDE_SHORT[e.cfg.human]}` : e.cfg.mode === 'online' ? `Online · với ${escapeHtml(e.opp || 'đối thủ')} · cầm ${SIDE_SHORT[e.cfg.human]}` : '2 người';
      return `<div class="grow"><div class="gi"><b class="${cls}">${txt}</b><small>${vs}<br>${when} · ${e.moves.length} nước</small></div><button data-act="view" data-id="${e.id}">Xem lại</button><button data-act="del" data-id="${e.id}" aria-label="Xóa">🗑</button></div>`;
    }).join('');
  }
  function openGames() {
    if (G.online && !G.over) { toast('Đang chơi online – hãy thoát ván trước nhé.'); setSheet(false); return; }
    setSheet(false); renderGamesList(); openDlg($('gamesDlg')); }
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
    if (G && G.online && OL && !newG.online) olTeardown();
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
    g.recorded = true;
    if (e.opp) g.oppInfo = { nick: e.opp, avatar: e.oppAvatar || '🙂', rating: 0 };
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
  function openPuzzles() {
    if (G.online && !G.over) { toast('Đang chơi online – hãy thoát ván trước nhé.'); setSheet(false); return; }
    setSheet(false); renderPuzzles(); openDlg($('puzzlesDlg')); }
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
      checkBadges();
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
      const to = lm >> 7;
      const opp = !G.over && G.kind === 'game' && cfg().mode !== 'pvp' && ((G.first + len - 1) & 1) !== cfg().human;
      const col = opp ? '#e8590c' : '#2f6fde';
      // chỉ viền sáng quanh quân vừa đi
      ring(gHl, to, 29, col, 4.5, { opacity: .95, class: opp ? 'lastto' : '' });
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
    $('actionbar').hidden = inView || G.kind === 'puzzle' || !!G.online;
    $('onlinebar').hidden = !(G.online && !inView);
    $('viewbar').hidden = !inView;
    $('puzzlebar').hidden = !(G.kind === 'puzzle' && !inView);
    $('vbAuto').firstElementChild.textContent = G.auto ? '⏸' : '⏵';
    $('vbDone').firstElementChild.textContent = G.kind === 'replay' ? 'Thoát' : 'Xong';
    $('btnUndo').disabled = !G.moves.length || special || inView || !!G.online || !!G.bot;
    const cant = !!G.over || G.thinking || G.busy || !humanTurn() || inView || special || !!G.online || !!G.bot;
    $('btnHint').disabled = (G.kind === 'puzzle' ? false : cant);
    $('btnDraw').disabled = cant;
    $('btnResign').disabled = !!G.over || (special && !G.online);
    $('olDraw').disabled = !G.online || !!G.over || !humanTurn() || !(G.online && !G.online.waiting);
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
      let who = c.mode === 'pvp' ? 'Người chơi' : (isAI ? '🤖 Máy' : PF.avatar + ' ' + escapeHtml(displayName()));
      let tag = SIDE_NAME[side] + (isAI ? ` · ${LEVELS[c.level].name}` : '');
      if (c.mode === 'bot') {
        const bi = G.bot || G.oppInfo;
        if (side === c.human) { who = PF.avatar + ' ' + escapeHtml(PF.nick || displayName()); tag = SIDE_NAME[side] + ` · ${PF.bots.rating} điểm đấu bot`; }
        else if (bi) {
          const th = G.thinking && G.bot ? ' <span class="spinner" title="Đang nghĩ"></span>' : '';
          who = (bi.avatar || '🤖') + ' ' + escapeHtml(bi.nick || bi.name) + ' <span class="tagbot">🤖 BOT</span>' + th;
          tag = SIDE_NAME[side] + (bi.rating ? ` · ${bi.rating} điểm` : '');
        }
      }
      if (c.mode === 'online') {
        const mine = side === c.human;
        const opp = (G.online && G.online.opp) || G.oppInfo;
        if (mine) { who = PF.avatar + ' ' + escapeHtml(PF.nick || displayName()); tag = SIDE_NAME[side] + ` · ${PF.online.rating} điểm`; }
        else if (opp) { who = (opp.avatar || '🙂') + ' ' + escapeHtml(opp.nick); tag = SIDE_NAME[side] + (opp.rating ? ` · ${opp.rating} điểm` : ''); }
        else { who = '⏳ Chờ đối thủ…'; tag = SIDE_NAME[side]; }
      }
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
      s.innerHTML = '<span class="spinner"></span> ' + (G.bot ? `${G.bot.avatar} ${G.bot.name} đang suy nghĩ…` : 'Máy đang suy nghĩ…');
    } else {
      const t = turn();
      let txt = `Lượt đi: ${SIDE_NAME[t]}`;
      if (cfg().mode !== 'pvp') txt = t === cfg().human ? `Đến lượt bạn (${SIDE_NAME[t]})` : (cfg().mode === 'online' ? `Lượt của đối thủ (${SIDE_NAME[t]})` : G.bot ? `Lượt của ${G.bot.name} (${SIDE_NAME[t]})` : `Lượt của máy (${SIDE_NAME[t]})`);
      if (G.online && G.online.waiting) txt = '⏳ Đang chờ đối thủ vào phòng…';
      s.innerHTML = '';
      s.appendChild(document.createTextNode(txt));
      if (chk) { const bd = document.createElement('span'); bd.className = 'badge'; bd.textContent = 'CHIẾU TƯỚNG!'; s.appendChild(bd); }
    }
    $('hintText').textContent = hintText;
    const lmEl = $('lastMove'), L = vlen();
    if (G.kind !== 'puzzle' && L > 0 && G.notes[L - 1]) {
      const mv = G.moves[L - 1], who = (G.first + L - 1) & 1;
      const mine = G.kind === 'game' && cfg().mode !== 'pvp' && who === cfg().human;
      const lead = G.kind !== 'game' || cfg().mode === 'pvp' ? SIDE_NAME[who] : (mine ? 'Bạn' : (G.bot ? G.bot.name : cfg().mode === 'online' ? 'Đối thủ' : 'Máy'));
      lmEl.className = mine ? 'mine' : 'theirs';
      lmEl.innerHTML = `<b>${escapeHtml(lead)}</b> vừa đi: <span class="mvn">${escapeHtml(G.notes[L - 1])}</span>`;
      lmEl.hidden = false;
      void mv;
    } else lmEl.hidden = true;
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
    const wait = !!(G.online && G.online.waiting && !G.over && G.view == null);
    if (!puz && !over && !wait) { ov.hidden = true; return; }
    ov.hidden = false;
    const btns = ov.querySelector('.row');
    if (wait) {
      $('ovTitle').textContent = '⏳ Chờ đối thủ…';
      $('ovText').innerHTML = 'Gửi mã hoặc link này cho bạn bè:<div class="roomcode">' + G.online.code + '</div>';
      btns.innerHTML = '<button class="primary" data-ov="share" type="button">📤 Mời qua Zalo, Messenger…</button><button data-ov="fb" type="button">Facebook</button><button data-ov="copy" type="button">📋 Sao chép lời mời</button><button data-ov="cancelroom" type="button">Hủy phòng</button>';
    } else if (puz) {
      const P = G.puzzle;
      $('ovTitle').textContent = '🎉 Giải đúng!';
      $('ovText').textContent = `${'★'.repeat(P.stars)}${'☆'.repeat(3 - P.stars)}  ${P.errors ? 'Bạn thử sai ' + P.errors + ' lần. ' : 'Không sai nước nào! '}${P.hints ? 'Đã dùng gợi ý ' + P.hints + ' lần.' : ''}`;
      btns.innerHTML = '<button class="primary" data-ov="next" type="button">Bài tiếp ▶</button><button data-ov="retry" type="button">Làm lại</button><button data-ov="list" type="button">Danh sách</button>';
    } else {
      let title;
      if (G.over.winner === null) title = '🤝 Ván cờ hòa';
      else if (cfg().mode === 'ai') title = G.over.winner === cfg().human ? '🎉 Bạn thắng!' : '😅 Máy thắng';
      else if (cfg().mode === 'online') title = G.over.winner === cfg().human ? '🎉 Bạn thắng!' : '😢 Bạn thua';
      else if (cfg().mode === 'bot') title = G.over.winner === cfg().human ? '🎉 Bạn thắng bot!' : `😅 ${G.bot ? G.bot.name : 'Bot'} thắng`;
      else title = `🎉 ${SIDE_NAME[G.over.winner]} thắng!`;
      $('ovTitle').textContent = title;
      let more = '';
      if (G.online && typeof G.online.delta === 'number') more = ` Điểm online: ${PF.online.rating} (${G.online.delta >= 0 ? '+' : ''}${G.online.delta}).`;
      $('ovText').textContent = G.over.text + more;
      btns.innerHTML = G.bot
        ? '<button class="primary" data-ov="rematch" type="button">Đấu lại</button><button data-ov="view" type="button">Xem lại</button><button data-ov="analyze" type="button">🔍 Phân tích</button><button data-ov="new" type="button">Ván mới</button>'
        : G.online
        ? '<button class="primary" data-ov="exit" type="button">Thoát</button><button data-ov="view" type="button">Xem lại</button><button data-ov="analyze" type="button">🔍 Phân tích</button>'
        : '<button class="primary" data-ov="new" type="button">Ván mới</button><button data-ov="view" type="button">Xem lại</button><button data-ov="analyze" type="button">🔍 Phân tích</button>';
    }
  }
  $('overlay').addEventListener('click', (ev) => {
    const b = ev.target.closest('button[data-ov]'); if (!b) return;
    const a = b.dataset.ov;
    if (a === 'new') openNew();
    else if (a === 'view') setView(G.moves.length);
    else if (a === 'analyze') openAnalysis();
    else if (a === 'rematch') startBotGame(G.bot.id, G.cfg.human === 0 ? '1' : '0');
    else if (a === 'next') nextPuzzle();
    else if (a === 'retry') puzzleRetry();
    else if (a === 'list') openPuzzles();
    else if (a === 'exit' || a === 'cancelroom') olExit();
    else if (a === 'copy') olCopyLink();
    else if (a === 'share') olShare();
    else if (a === 'fb') olFacebook();
  });

  // ---------- Tương tác: bấm và kéo thả ----------
  const canInteract = () => {
    if (G.over || G.thinking || G.busy || G.view != null || anyDialogOpen()) return false;
    if (G.kind === 'puzzle') return turn() === G.puzzle.att;
    if (G.kind !== 'game') return false;
    if (G.online && G.online.waiting) return false;
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
  $('btnProfile').addEventListener('click', () => openProfile(false));
  $('pfSave').addEventListener('click', saveProfileForm);
  $('pfSkip').addEventListener('click', () => { PF.setup = true; saveProfile(); closeDlg($('profileDlg')); });
  $('pfAvatars').addEventListener('click', (ev) => {
    const b = ev.target.closest('.avb'); if (!b) return;
    profAvatar = b.dataset.a;
    $('pfAvatars').querySelectorAll('.avb').forEach((x) => x.classList.toggle('on', x === b));
  });
  $('pfReset').addEventListener('click', async () => {
    if (!(await askConfirm('Đặt lại thống kê?', 'Số ván thắng, thua, hòa, điểm xếp hạng và huy hiệu sẽ về ban đầu. Họ tên và ảnh đại diện được giữ nguyên.', 'Đặt lại', 'Giữ nguyên'))) return;
    const keep = { name: PF.name, nick: PF.nick, avatar: PF.avatar, setup: true };
    PF = Object.assign(blankProfile(), keep); saveProfile(); renderChip(); renderProfile();
  });
  const openRules = () => { setSheet(false); openDlg($('rulesDlg')); };
  $('btnRules').addEventListener('click', openRules);
  $('btnRules2').addEventListener('click', openRules);
  $('rulesClose').addEventListener('click', () => closeDlg($('rulesDlg')));
  document.querySelectorAll('dialog').forEach((d) => d.addEventListener('click', (e) => { if (e.target === d && d.id !== 'confirmDlg') closeDlg(d); }));
  document.querySelectorAll('[data-close]').forEach((b) => b.addEventListener('click', () => closeDlg(b.closest('dialog'))));
  $('chkHints').addEventListener('change', () => { S.hints = $('chkHints').checked; saveSettings(); renderHighlights(); });
  $('chkSound').addEventListener('change', () => { S.sound = $('chkSound').checked; saveSettings(); });
  $('chkAlerts').addEventListener('change', () => { S.alerts = $('chkAlerts').checked; saveSettings(); if (!S.alerts) hideBanner(); presEnsure(); });
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
    document.querySelectorAll('#newDlg [data-for="local"]').forEach((f) => f.classList.toggle('hidden', ng.mode === 'online'));
    $('startBtn').textContent = ng.mode === 'online' ? 'Mở chơi online ▶' : 'Bắt đầu chơi';
  }
  document.querySelectorAll('#newDlg .seg button').forEach((b) => b.addEventListener('click', () => {
    ng[b.closest('.seg').dataset.key] = b.dataset.v; syncNewDlg();
  }));
  $('startBtn').addEventListener('click', startFromDialog);

  function syncControls() {
    $('chkHints').checked = S.hints; $('chkSound').checked = S.sound; $('chkVibe').checked = S.vibe;
    $('selStyle').value = S.pieceStyle; $('chkAlerts').checked = S.alerts;
  }

  // ---------- Lưu / tải ----------
  function saveSettings() { try { localStorage.setItem('cotuong.settings', JSON.stringify(S)); } catch (e) { /* */ } }
  function saveGame() {
    if (!G || !isGame() || G.online) return;
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
        pieceStyle: s.pieceStyle === 'vi' ? 'vi' : 'han', alerts: s.alerts !== false,
      });
      const g = JSON.parse(localStorage.getItem('cotuong.game') || 'null');
      if (g && Array.isArray(g.moves) && g.moves.length) {
        const c = g.cfg || { mode: S.mode, human: S.human, level: S.level, clock: S.clock };
        const botFound = c.mode === 'bot' && BOTS.find((b) => b.id === c.botId);
        G = freshGame({ cfg: { mode: c.mode === 'pvp' ? 'pvp' : (botFound ? 'bot' : 'ai'), human: c.human === 1 ? 1 : 0, level: Math.min(3, Math.max(0, c.level | 0)), clock: c.clock | 0, botId: botFound ? botFound.id : undefined } });
        if (botFound) G.bot = botFound;
        if (g.id) G.id = g.id;
        const ms = G.cfg.clock * 60000;
        G.clock = { on: ms > 0, t: [ms, ms], last: null };
        for (const mv of g.moves) {
          if (!Eng.genLegal(stateOf(cur()), turn()).includes(mv)) throw new Error('ván lưu không hợp lệ');
          applyRaw(mv);
        }
        if (g.over) { G.over = g.over; G.recorded = true; }
        if (G.clock.on && Array.isArray(g.clock)) G.clock.t = g.clock.slice(0, 2);
        return true;
      }
    } catch (e) { G = null; }
    return false;
  }


  // ---------- Chơi online (Firebase Realtime Database) ----------
  const NET = createNet(ONLINE_CONFIG);
  const CHAT = ['Chào bạn! 👋', 'Chúc bạn chơi vui!', 'Nước đi hay!', 'Cho mình suy nghĩ chút nhé', 'Ván hay đấy!', 'Cảm ơn bạn!', 'Oái, mình nhầm 😅', 'Chơi lại nhé?'];
  const OL_KEY = 'cotuong.online';
  let OL = null;          // trạng thái phòng đang chơi
  let Q = null;           // trạng thái tìm đối thủ nhanh
  let olTab = 'quick';
  const olOpts = { clockQ: '0', sideC: '0', clockC: '0' };
  const olInfo = () => ({ nick: (PF.nick || '').slice(0, 20), avatar: PF.avatar, rating: PF.online.rating });
  const olLink = (code) => (/^https?:$/.test(location.protocol) ? `${location.origin}${location.pathname}?room=${code}` : '');

  function ensureNick() {
    if (PF.nick && PF.nick.trim()) return true;
    toast('Hãy đặt biệt danh trước khi chơi online nhé!', true, 4200);
    closeDlg($('onlineDlg'));
    openProfile(false);
    return false;
  }
  const netError = (e) => toast('Không kết nối được máy chủ online (' + (e && e.message ? e.message : 'lỗi mạng') + '). Kiểm tra mạng rồi thử lại.', true, 5200);

  function openOnline() {
    setSheet(false);
    if (G.online && !G.over) { toast('Bạn đang trong một ván online.'); return; }
    $('olOff').hidden = NET.enabled;
    $('olOn').hidden = !NET.enabled;
    if (NET.enabled) {
      $('olWho').textContent = PF.nick ? `Bạn sẽ hiện là “${PF.nick}” · ${PF.online.rating} điểm online` : 'Bạn chưa đặt biệt danh. Bấm vào tên ở góc trên để đặt.';
      syncOlOpts(); showOlTab(olTab);
    }
    if (Q) Q.bg = false;
    openDlg($('onlineDlg'));
    presEnsure();
    loadPeak();
  }
  function showOlTab(t) {
    olTab = t;
    ['Quick', 'Create', 'Join', 'Board'].forEach((n) => { $('olPanel' + n).hidden = n.toLowerCase() !== t; });
    $('olTabs').querySelectorAll('button').forEach((b) => b.classList.toggle('on', b.dataset.tab === t));
    if (t === 'board') loadBoard();
    if (typeof renderPresence === 'function') { if (olPres) renderPresence(); else updateEmpty(); }
    if (t === 'join') setTimeout(() => $('olCode').focus(), 50);
  }
  function syncOlOpts() {
    document.querySelectorAll('#olOn [data-ol]').forEach((seg) => seg.querySelectorAll('button').forEach((b) => b.classList.toggle('on', b.dataset.v === olOpts[seg.dataset.ol])));
  }
  document.querySelectorAll('#olOn [data-ol]').forEach((seg) => seg.addEventListener('click', (ev) => {
    const b = ev.target.closest('button'); if (!b) return;
    olOpts[seg.dataset.ol] = b.dataset.v; syncOlOpts();
  }));
  $('olTabs').addEventListener('click', (ev) => { const b = ev.target.closest('button'); if (b) showOlTab(b.dataset.tab); });
  $('btnOnline').addEventListener('click', openOnline);
  $('olCode').addEventListener('input', () => { $('olCode').value = NET.cleanCode($('olCode').value); });
  $('olCode').addEventListener('keydown', (e) => { if (e.key === 'Enter') joinCode($('olCode').value); });
  $('olJoinBtn').addEventListener('click', () => joinCode($('olCode').value));
  $('olCreateBtn').addEventListener('click', createCode);
  $('olQuickBtn').addEventListener('click', quickStart);
  $('olQuickCancel').addEventListener('click', () => quickStop());

  // ----- Số người online / đang chờ ghép -----
  const QUICK_HINT_MS = window.__QUICK_HINT_MS || 20000;
  const QUICK_BG_MS = window.__QUICK_BG_MS || 60000;
  const WATCH_MS = window.__WATCH_MS || 20000;
  let olPres = null, presTimer = 0, presMs = 0, beatTimer = 0, presSynced = false, prevWaiting = null, lastBanner = 0;
  let presFails = 0, presSkip = 0;
  async function presTick() {
    if (!NET.enabled || document.hidden) return;
    if (presFails > 2 && (presSkip++ % 6)) return; // mất mạng: thử thưa dần
    try {
      if (!presSynced) { presSynced = true; await NET.syncClock().catch(() => {}); }
      olPres = await NET.presence();
      presFails = 0;
      renderPresence();
      watchAlert();
      maybeMarkActive();
    } catch (e) {
      presFails++;
      olPres = null;
      if ($('onlineDlg').open) $('olPresence').innerHTML = '<span class="pill">Chưa tải được số người online</span>';
      $('homePresence').textContent = '';
    }
  }
  // Chạy nhanh (5 giây) khi đang xem màn hình chọn / phần online / đang tìm; chạy chậm khi chỉ "canh" người chờ ghép.
  function presEnsure() {
    const fast = $('onlineDlg').open || $('homeDlg').open || !!Q;
    const watch = S.alerts && !(G && G.online);
    const want = NET.enabled && (fast || watch);
    const ms = fast ? 5000 : WATCH_MS;
    if (!want) { clearInterval(presTimer); clearInterval(beatTimer); presTimer = beatTimer = 0; presMs = 0; return; }
    if (presTimer && presMs === ms) return;
    clearInterval(presTimer); clearInterval(beatTimer);
    presMs = ms;
    presTimer = setInterval(presTick, ms);
    beatTimer = setInterval(() => { if (!document.hidden) NET.heartbeat().catch(() => {}); }, 15000);
    NET.heartbeat().catch(() => {});
    presTick();
  }
  setInterval(presEnsure, 2500);
  document.addEventListener('visibilitychange', () => { if (!document.hidden) { presEnsure(); presTick(); } });
  $('homeDlg').addEventListener('toggle', presEnsure);

  // ----- Giờ cao điểm -----
  /** Tìm khung 2 giờ liên tiếp đông người nhất. Cần ít nhất 3 lượt người có mặt mới kết luận. */
  function peakSummary(counts) {
    const total = counts.reduce((x, y) => x + y, 0);
    if (total < 3) return null;
    let best = 0, bestSum = -1;
    for (let h = 0; h < 24; h++) { const s2 = counts[h] + counts[(h + 1) % 24]; if (s2 > bestSum) { bestSum = s2; best = h; } }
    return { start: best, end: (best + 2) % 24, text: `${best}h–${(best + 2) % 24}h`, max: Math.max(...counts) };
  }
  let peakInfo = null, peakAt = 0, markedKey = '';
  async function loadPeak() {
    if (!NET.enabled || Date.now() - peakAt < 20 * 60000) { renderPeak(); return; }
    try {
      const counts = await NET.peakHours();
      peakAt = Date.now();
      peakInfo = { counts, sum: peakSummary(counts) };
    } catch (e) { /* bỏ qua */ }
    renderPeak();
  }
  function renderPeak() {
    const box = $('olPeak');
    if (!peakInfo || !peakInfo.sum) { box.hidden = true; return; }
    const { counts, sum } = peakInfo, now = NET.vnHour();
    box.hidden = false;
    $('olPeakBars').innerHTML = counts.map((v, h) => `<i class="${h === sum.start || h === (sum.start + 1) % 24 ? 'top' : ''}${h === now ? ' now' : ''}" style="height:${Math.max(6, Math.round((v / Math.max(1, sum.max)) * 100))}%" title="${h}h: ${v} người"></i>`).join('');
    $('olPeakText').textContent = `Thường đông người nhất lúc ${sum.text} (giờ Việt Nam). Hẹn bạn bè vào khung giờ này để dễ có đối thủ nhé!`;
    updateEmpty();
  }
  /** Mỗi người chỉ ghi một dấu có mặt cho mỗi giờ trong ngày. */
  async function maybeMarkActive() {
    if (!NET.enabled) return;
    const d = new Date(NET.serverNow() + 7 * 3600000);
    const key = `${d.getUTCFullYear()}-${d.getUTCMonth()}-${d.getUTCDate()}-${d.getUTCHours()}`;
    if (markedKey === key) return;
    let saved = ''; try { saved = localStorage.getItem('cotuong.act') || ''; } catch (e) { /* */ }
    if (saved === key) { markedKey = key; return; }
    try { await NET.markActive(); markedKey = key; try { localStorage.setItem('cotuong.act', key); } catch (e) { /* */ } } catch (e) { /* thử lại ở lần sau */ }
  }

  // ----- Thông báo có người chờ ghép -----
  let bannerTimer = 0, bannerFn = null;
  function showBanner(text, label, fn) {
    $('bnText').textContent = text; $('bnGo').textContent = label; bannerFn = fn;
    $('banner').hidden = false;
    clearTimeout(bannerTimer); bannerTimer = setTimeout(hideBanner, 14000);
  }
  function hideBanner() { $('banner').hidden = true; clearTimeout(bannerTimer); }
  $('bnX').addEventListener('click', hideBanner);
  $('bnGo').addEventListener('click', () => { const f = bannerFn; hideBanner(); if (f) f(); });
  function watchAlert() {
    const p = olPres; if (!p) return;
    const was = prevWaiting; prevWaiting = p.waiting;
    if (!S.alerts || Q || (G && G.online) || $('onlineDlg').open || anyDialogOpen()) return;
    if (p.waiting >= 1 && (was === null || was === 0) && Date.now() - lastBanner > 45000) {
      lastBanner = Date.now();
      showBanner(`🔔 Có ${p.waiting} người đang chờ chơi online!`, 'Vào chơi', openOnlineQuick);
      SND.check(); buzz([30, 40, 30]);
    }
  }
  function openOnlineQuick() {
    hideBanner();
    if (G && G.online && !G.over) return;
    closeDlg($('homeDlg'));
    openOnline(); showOlTab('quick'); quickStart();
  }
  // ----- Tìm đối thủ chạy nền -----
  function updateBgPill() { $('bgPill').hidden = !(Q && !$('onlineDlg').open); }
  setInterval(updateBgPill, 700);
  $('bgCancel').addEventListener('click', () => { quickStop(); toast('Đã dừng tìm đối thủ.'); });
  $('onlineDlg').addEventListener('close', () => { if (Q) Q.bg = true; updateBgPill(); updateEmpty(); });

  function renderPresence() {
    const p = olPres;
    if (!p) return;
    const others = Math.max(0, p.online - 1);
    $('homePresence').textContent = `🟢 ${p.online} người online · ⏳ ${p.waiting} đang chờ ghép`;
    $('olPresence').innerHTML = `<span class="pill on">🟢 ${p.online} người đang online</span><span class="pill wait">⏳ ${p.waiting} người đang chờ ghép</span>`;
    if (!Q) {
      $('olQuickInfo').textContent = p.waiting > 0
        ? `Có ${p.waiting} người đang chờ. Bấm “Tìm đối thủ” để vào chơi ngay!`
        : (others > 0 ? 'Có người đang online nhưng chưa ai chờ ghép. Bạn bấm “Tìm đối thủ” để chờ nhé.' : 'Máy chủ sẽ tìm một đối thủ đang chờ. Hai bạn chọn quân ngẫu nhiên.');
    }
    updateEmpty();
  }
  function updateEmpty() {
    const p = olPres;
    const searching = !!Q;
    const longWait = searching && Date.now() - Q.t0 > QUICK_HINT_MS;
    const none = !!p && p.waiting === 0 && !searching;
    $('olEmpty').hidden = !(olTab === 'quick' && (none || longWait));
    const tip = peakInfo && peakInfo.sum ? `<br>💡 Thường đông người nhất lúc ${peakInfo.sum.text}.` : '';
    $('olEmptyText').innerHTML = (searching
      ? '<b>Chưa tìm thấy đối thủ.</b><br>Trong lúc chờ, bạn có thể mời bạn bè cùng chơi hoặc chơi offline với máy.'
      : '<b>Hiện chưa có ai khác đang chờ ghép.</b><br>Bạn có thể mời bạn bè cùng chơi, hoặc chơi offline với máy trong lúc chờ.') + tip;
  }
  $('olInvite').addEventListener('click', async () => { if (Q) await quickStop(); showOlTab('create'); });
  $('olGoOffline').addEventListener('click', async () => { if (Q) await quickStop(); closeDlg($('onlineDlg')); openOffline('ai'); });

  async function loadBoard() {
    const box = $('olBoardList');
    box.innerHTML = '<p class="muted">Đang tải…</p>';
    try {
      const me = await NET.uid();
      const list = await NET.leaderboard();
      if (!list.length) { box.innerHTML = '<div class="empty-note">Chưa có ai trên bảng xếp hạng.<br>Hãy chơi ván online đầu tiên nhé!</div>'; return; }
      box.innerHTML = list.map((u, i) => `<div class="lb-row${u.uid === me ? ' me' : ''}"><span class="rk">${i + 1}</span><span class="av">${escapeHtml(u.avatar || '🙂')}</span><span class="nm">${escapeHtml(u.nick || '?')}</span><span class="sc">${u.rating | 0}<small>${u.wins | 0}/${u.games | 0} thắng</small></span></div>`).join('');
    } catch (e) { box.innerHTML = '<p class="muted">Không tải được bảng xếp hạng.</p>'; }
  }

  // ----- Ghép nhanh: người có mã nhỏ hơn đi mời, tránh hai người cùng mời nhau -----
  async function quickStart() {
    if (!ensureNick()) return;
    $('olQuickBtn').hidden = true; $('olQuickWait').hidden = false;
    hideBanner();
    try {
      await NET.syncClock();
      const me = await NET.uid();
      await NET.del(`claims/${me}`).catch(() => {});
      await NET.queueJoin(olInfo());
      Q = { me, clock: +olOpts.clockQ, t0: Date.now(), beat: Date.now(), busy: false, done: false, timer: 0, stream: null };
      Q.stream = NET.stream(`claims/${me}`, { onData: async (c) => {
        if (!c || !c.room || !Q || Q.done || Q.asking) return;
        if (Q.bg) {
          Q.asking = true;
          SND.check(); buzz([30, 40, 30]);
          const yes = await askConfirm('Có người muốn chơi với bạn!', 'Một người chơi đang chờ trong phòng. Vào chơi online ngay? Ván đang chơi sẽ được giữ lại.', 'Vào chơi', 'Để sau');
          if (!Q) return;
          Q.asking = false;
          if (!yes) { quickStop(); return; }
        }
        Q.done = true; const code = c.room; quickStop(); joinCode(code);
      } });
      Q.timer = setInterval(quickTick, 2000);
      quickTick();
    } catch (e) { quickStop(); netError(e); }
  }
  async function quickTick() {
    if (!Q || Q.busy || Q.done || Q.asking) return;
    Q.busy = true;
    try {
      $('olQuickSec').textContent = Math.round((Date.now() - Q.t0) / 1000) + ' giây' + (olPres ? ` · ${olPres.waiting} người đang chờ` : '');
      updateEmpty();
      if (Date.now() - Q.beat > 12000) { Q.beat = Date.now(); await NET.queueJoin(olInfo()); }
      const list = await NET.queueScan();
      const now = NET.serverNow();
      const cand = list.find((e) => e.uid !== Q.me && now - e.ts < 40000 && Q.me < e.uid);
      if (!cand && !Q.offered && !Q.bg && Date.now() - Q.t0 > QUICK_BG_MS) {
        Q.offered = true; Q.asking = true;
        const yes = await askConfirm('Chưa có ai vào', 'Bạn muốn chơi với máy trong lúc chờ? Game vẫn tiếp tục tìm đối thủ và báo ngay khi có người.', '🤖 Chơi với máy', 'Tiếp tục chờ');
        if (!Q) return;
        Q.asking = false;
        if (yes) { Q.bg = true; closeDlg($('onlineDlg')); openOffline('ai'); }
      }
      if (cand && Q && !Q.done) {
        if (Q.bg) {
          Q.asking = true;
          SND.check(); buzz([30, 40, 30]);
          const yes = await askConfirm('Đã có người chờ!', `${cand.nick || 'Một người chơi'} đang chờ chơi online. Vào chơi ngay? Ván đang chơi sẽ được giữ lại.`, 'Vào chơi', 'Để sau');
          if (!Q) return;
          Q.asking = false;
          if (!yes) { quickStop(); return; }
        }
        const side = Math.random() < 0.5 ? 0 : 1;
        const code = await NET.createRoom({ side, clock: Q.clock, info: olInfo() });
        try { await NET.claim(cand.uid, code); } catch (e) { if (Q) Q.busy = false; return; } // người khác nhanh tay hơn
        Q.done = true; quickStop(); enterRoom(code, { side }); return;
      }
    } catch (e) { /* thử lại ở lần sau */ }
    if (Q) Q.busy = false;
  }
  async function quickStop() {
    const q = Q; Q = null;
    $('olQuickBtn').hidden = false; $('olQuickWait').hidden = true;
    updateEmpty(); updateBgPill();
    if (!q) return;
    clearInterval(q.timer); if (q.stream) q.stream.close();
    try { await NET.queueLeave(); } catch (e) { /* */ }
  }

  async function createCode() {
    if (!ensureNick()) return;
    const side = olOpts.sideC === 'r' ? (Math.random() < 0.5 ? 0 : 1) : +olOpts.sideC;
    try {
      await NET.syncClock();
      const code = await NET.createRoom({ side, clock: +olOpts.clockC, info: olInfo() });
      enterRoom(code, { side });
    } catch (e) { netError(e); }
  }
  async function joinCode(codeIn) {
    if (!ensureNick()) return;
    const code = NET.cleanCode(codeIn);
    if (code.length !== 6) { toast('Mã phòng gồm 6 ký tự.', true); return; }
    try {
      await NET.syncClock();
      const j = await NET.joinRoom(code, olInfo());
      enterRoom(j.code, j);
    } catch (e) { if (e.code) toast(e.message, true, 4500); else netError(e); }
  }

  async function enterRoom(code, joined) {
    closeDlg($('onlineDlg'));
    olTeardown();
    let room = null;
    try { room = await NET.get(`rooms/${code}`); } catch (e) { netError(e); return; }
    if (!room) { toast('Không đọc được phòng ' + code, true); return; }
    const me = await NET.uid();
    const side = room.w === me ? 0 : room.b === me ? 1 : joined.side;
    const g = freshGame({ cfg: { mode: 'online', human: side, level: 0, clock: room.clock | 0 } });
    g.online = { code, opp: null, waiting: true };
    OL = { code, me, side, room: null, sendQ: Promise.resolve(), tAt: {}, started: false, startedAt: 0, oppUid: null,
      offerKey: '', myOffer: false, chatSeen: new Set(Object.keys(room.chat || {})), timers: [], stream: null, abandonAsked: 0, timeoutSent: false };
    enterSpecial(g, side === 1);
    try { localStorage.setItem(OL_KEY, JSON.stringify({ code })); } catch (e) { /* */ }
    OL.stream = NET.stream(`rooms/${code}`, { onData: onRoomData, onError: (e) => { if (OL) toast('Mất kết nối phòng: ' + e.message, true, 4000); } });
    OL.timers.push(setInterval(olBeat, 15000), setInterval(olWatch, 6000), setInterval(() => { NET.syncClock().catch(() => {}); }, 60000));
    olBeat();
    render();
  }
  async function olBeat() { try { await NET.heartbeat(); } catch (e) { /* */ } }
  function olTeardown() {
    if (!OL) return;
    if (OL.stream) OL.stream.close();
    OL.timers.forEach(clearInterval);
    try { localStorage.removeItem(OL_KEY); } catch (e) { /* */ }
    OL = null;
  }
  async function olWatch() {
    if (!OL || !G.online || G.over || !OL.oppUid || !OL.started) return;
    try {
      const seen = await NET.get(`seen/${OL.oppUid}`);
      if (typeof seen === 'number' && NET.serverNow() - seen > 75000 && Date.now() - OL.abandonAsked > 120000) {
        OL.abandonAsked = Date.now();
        if (await askConfirm('Đối thủ có vẻ đã thoát', 'Đã lâu không thấy đối thủ. Bạn muốn nhận thắng ván này?', 'Nhận thắng', 'Chờ thêm')) olSendResult(OL.side, 'Đối thủ đã rời khỏi ván.');
      }
    } catch (e) { /* */ }
  }

  function onRoomData(room) {
    if (!OL || !G.online) return;
    if (!room) { toast('Phòng không còn nữa.', true); return; }
    OL.room = room;
    const oppUid = OL.side === 0 ? room.b : room.w;
    OL.oppUid = oppUid || null;
    const inf = oppUid && room.info ? room.info[oppUid] : null;
    G.online.opp = inf || (oppUid ? { nick: 'Đối thủ', avatar: '🙂', rating: 1000 } : null);
    G.online.waiting = !oppUid;
    if (typeof room.started === 'number') { OL.started = true; OL.startedAt = room.started; }
    if (typeof room.n === 'number' && typeof room.lastT === 'number' && !(room.n in OL.tAt)) OL.tAt[room.n] = room.lastT;
    const arr = room.mvs ? String(room.mvs).split(',').map(Number) : [];
    if (arr.length > G.moves.length && !G.over) olApplyMoves(arr);
    if (room.result && !G.over) finish(room.result.w === 2 ? null : room.result.w, room.result.text || 'Ván cờ kết thúc.', true);
    olHandleOffer(room);
    olHandleChat(room);
    olRecomputeClock(room);
    render();
  }

  function olApplyMoves(arr) {
    const start = G.moves.length;
    const bulk = arr.length - start > 1;
    for (let i = start; i < arr.length; i++) {
      const mv = arr[i];
      const legal = Number.isInteger(mv) && Eng.genLegal(stateOf(cur()), turn()).includes(mv);
      if (!legal) { toast('Đối thủ đi một nước không hợp lệ!', true); olSendResult(OL.side, 'Đối thủ đi nước không hợp lệ.'); return; }
      if (bulk) applyRaw(mv); else tryMove(mv, false);
      if (G.over) return;
    }
    if (bulk) { G.anim = null; checkEnd(Eng.inCheck(stateOf(cur()), turn())); }
  }

  function olRecomputeClock(room) {
    const c = G.clock;
    if (!c.on || !OL.started) return;
    const base = (room.clock | 0) * 60000;
    const n = room.n | 0;
    const used = [0, 0];
    let prev = OL.startedAt;
    for (let k = 1; k <= n; k++) {
      const tk = OL.tAt[k] != null ? OL.tAt[k] : prev;
      used[(k - 1) & 1] += Math.max(0, tk - prev);
      prev = tk;
    }
    c.t = [base - used[0], base - used[1]];
    if (!G.over) { const t = turn(); c.t[t] -= Math.max(0, NET.serverNow() - prev); c.last = Date.now(); }
  }
  function olTimeout(t) {
    if (!OL || OL.timeoutSent || G.over) return;
    OL.timeoutSent = true;
    if (hasAttackers(1 - t)) olSendResult(1 - t, `${SIDE_NAME[t]} hết giờ nên bị xử thua.`);
    else olSendResult(2, `${SIDE_NAME[t]} hết giờ nhưng đối phương không đủ quân để chiếu bí nên ván cờ hòa.`);
  }

  function olPublish(mv) {
    if (!OL) return;
    const idx = G.moves.length - 1;
    const prefix = G.moves.slice(0, idx).join(',');
    const code = OL.code;
    OL.sendQ = OL.sendQ.then(() => NET.sendMove(code, idx, prefix, mv)).catch((e) => {
      toast('Không gửi được nước đi (' + e.message + '). Đang đồng bộ lại…', true, 5000);
      olResync();
    });
  }
  async function olResync() {
    if (!OL) return;
    let room = null;
    try { room = await NET.get(`rooms/${OL.code}`); } catch (e) { return; }
    if (!room || !OL) return;
    const prev = G, g = freshGame({ cfg: prev.cfg });
    g.online = prev.online;
    G = g;
    for (const mv of (room.mvs ? String(room.mvs).split(',').map(Number) : [])) { if (!Eng.genLegal(stateOf(cur()), turn()).includes(mv)) break; applyRaw(mv); }
    if (prev.over) G.over = prev.over;
    onRoomData(room);
  }
  function olSendResult(winner, text) {
    if (!OL) return;
    const code = OL.code;
    OL.sendQ = OL.sendQ.then(() => NET.sendResult(code, winner, text)).catch(() => {});
  }

  async function olHandleOffer(room) {
    const o = room.offer;
    if (!o) {
      if (OL.myOffer) { OL.myOffer = false; if (!G.over && !room.result) toast('Đối thủ không đồng ý hòa.'); }
      OL.offerKey = '';
      return;
    }
    if (o.from === OL.me) { OL.myOffer = true; return; }
    const key = o.from + ':' + o.n;
    if (OL.offerKey === key || G.over) return;
    OL.offerKey = key;
    const yes = await askConfirm('Đối thủ xin hòa', 'Bạn có đồng ý hòa ván này không?', 'Đồng ý hòa', 'Từ chối');
    if (!OL || G.over) return;
    if (yes) olSendResult(2, 'Hai bên thỏa thuận hòa.'); else NET.clearOffer(OL.code).catch(() => {});
  }
  function olHandleChat(room) {
    const chat = room.chat || {};
    for (const id of Object.keys(chat)) {
      if (OL.chatSeen.has(id)) continue;
      OL.chatSeen.add(id);
      const m = chat[id];
      if (!m || m.u === OL.me) continue;
      toast(`${G.online.opp ? G.online.opp.nick : 'Đối thủ'}: ${CHAT[m.k] || '…'}`, false, 3800);
    }
  }

  async function olOfferDraw() {
    if (!OL || G.over || G.online.waiting) return;
    if (G.moves.length < 4) { toast('Mới đi ít nước quá, hãy chơi thêm đã nhé.'); return; }
    try { await NET.sendOffer(OL.code, G.moves.length); OL.myOffer = true; toast('Đã gửi lời xin hòa cho đối thủ.'); } catch (e) { netError(e); }
  }
  async function olResign() {
    if (!OL || G.over) return;
    if (!(await askConfirm('Xin thua?', 'Bạn xin thua ván online này?', 'Xin thua', 'Chơi tiếp'))) return;
    olSendResult(1 - OL.side, `${SIDE_NAME[OL.side]} xin thua. ${SIDE_NAME[1 - OL.side]} thắng.`);
  }
  async function olExit() {
    if (!G.online) return;
    if (!G.over && OL && OL.oppUid) {
      if (!(await askConfirm('Thoát ván online?', 'Thoát khi đang chơi sẽ bị tính là xin thua.', 'Thoát và xin thua', 'Ở lại'))) return;
      olSendResult(1 - OL.side, `${SIDE_NAME[OL.side]} đã thoát ván.`);
      await OL.sendQ;
    }
    olTeardown();
    leaveSpecial(false);
  }
  const olInviteText = () => {
    const link = olLink(OL.code);
    return `Chơi cờ tướng online với mình nhé! 🎮 ${link ? 'Bấm vào: ' + link : ''}\nMã phòng: ${OL.code}`;
  };
  function olFacebook() {
    if (!OL) return;
    const link = olLink(OL.code);
    if (!link) { olCopyLink(); return; }
    window.open('https://www.facebook.com/sharer/sharer.php?u=' + encodeURIComponent(link) + '&quote=' + encodeURIComponent('Chơi cờ tướng online với mình nhé! Mã phòng: ' + OL.code), '_blank', 'noopener');
  }
  function olCopyLink() {
    if (!OL) return;
    const link = olInviteText();
    const done = () => toast('Đã sao chép lời mời, hãy dán vào Zalo, Messenger…');
    if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(link).then(done, () => window.prompt('Sao chép link này:', link));
    else window.prompt('Sao chép link này:', link);
  }
  function olShare() {
    if (!OL) return;
    const url = olLink(OL.code);
    const text = `Chơi cờ tướng online với mình nhé! 🎮 Mã phòng: ${OL.code}`;
    if (navigator.share) navigator.share({ title: 'Cờ Tướng', text, url: url || undefined }).catch(() => {});
    else olCopyLink();
  }
  $('olDraw').addEventListener('click', olOfferDraw);
  $('olResign').addEventListener('click', olResign);
  $('olExit').addEventListener('click', olExit);
  $('olMenu').addEventListener('click', () => setSheet(true));
  $('olChat').addEventListener('click', () => {
    $('chatList').innerHTML = CHAT.map((t, i) => `<button type="button" data-k="${i}">${t}</button>`).join('');
    openDlg($('chatDlg'));
  });
  $('chatList').addEventListener('click', async (ev) => {
    const b = ev.target.closest('button'); if (!b || !OL) return;
    closeDlg($('chatDlg'));
    try { await NET.sendChat(OL.code, +b.dataset.k); toast('Đã gửi: ' + CHAT[+b.dataset.k], false, 1800); } catch (e) { netError(e); }
  });

  async function resumeRoom(code) {
    try {
      const me = await NET.uid();
      const room = await NET.get(`rooms/${code}`);
      if (!room || room.result || (room.w !== me && room.b !== me)) { try { localStorage.removeItem(OL_KEY); } catch (e) { /* */ } return; }
      await NET.syncClock();
      enterRoom(code, { side: room.w === me ? 0 : 1 });
    } catch (e) { /* offline: bỏ qua */ }
  }
  function whenReady(fn) {
    if (PF.setup) setTimeout(fn, 700);
    else { const d = $('profileDlg'); const once = () => { d.removeEventListener('close', once); setTimeout(fn, 500); }; d.addEventListener('close', once); }
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
  let pendingOnline = false, startRoom = '', resumeCode = null;
  if (NET.enabled) {
    startRoom = NET.cleanCode(new URLSearchParams(location.search).get('room'));
    try { resumeCode = (JSON.parse(localStorage.getItem(OL_KEY) || 'null') || {}).code || null; } catch (e) { /* */ }
    pendingOnline = startRoom.length === 6 || !!resumeCode;
  }
  renderChip();
  const showNewDlg = () => openHome();
  if (!PF.setup) {
    setTimeout(() => {
      openProfile(true);
      $('profileDlg').addEventListener('close', function once() { $('profileDlg').removeEventListener('close', once); if (!resumed && !pendingOnline) setTimeout(showNewDlg, 150); });
    }, 350);
  } else if (!resumed && !pendingOnline) setTimeout(showNewDlg, 350);
  if (startRoom.length === 6) { try { history.replaceState(null, '', location.pathname); } catch (e) { /* */ } whenReady(() => joinCode(startRoom)); }
  else if (resumeCode) whenReady(() => resumeRoom(resumeCode));
  window.__cotuong = { BOTS, startBotGame, peakSummary, presEnsure, get Q() { return Q; }, NET, get OL() { return OL; }, quickStart, Eng, get PF() { return PF; }, recordGame, checkBadges, openProfile, get G() { return G; }, S, tryMove, render, newGame, setView, startPuzzle, startReplay, openAnalysis, loadArchive, geom: { CELL, M, BW, BH }, sqXY: (sq) => [sqX(sq), sqY(sq)] }; // phục vụ kiểm thử
})();
