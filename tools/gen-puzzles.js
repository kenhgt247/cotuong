// Tạo bài tập "chiếu hết trong 1, 2, 3 nước" từ các thế cờ trong ván máy đấu máy.
// Mỗi thế được kiểm tra đúng một nước đầu ép thắng, và không thể thắng nhanh hơn.
// Chạy: node tools/gen-puzzles.js  ->  ghi src/puzzles.js
const fs = require('fs'), path = require('path');
const E = require('../src/engine.js')();

let seed = 12345;
const rnd = () => { seed |= 0; seed = (seed + 0x6D2B79F5) | 0; let t = Math.imul(seed ^ (seed >>> 15), 1 | seed); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
Math.random = rnd; // làm cho máy đấu máy lặp lại được

const WANT = { 1: 24, 2: 24, 3: 24 };
const found = { 1: [], 2: [], 3: [] };
const seen = new Set();
const count = (b) => { let n = 0; for (let i = 0; i < 90; i++) if (b[i]) n++; return n; };
const attackers = (b, side) => { let n = 0; for (let i = 0; i < 90; i++) { const p = b[i]; if (p && (p >> 3) === side && [4, 5, 6].includes(p & 7)) n++; } return n; };

function consider(b, att) {
  const st = E.newState(Int8Array.from(b));
  if (E.inCheck(st, att) || E.inCheck(st, 1 - att)) return;
  const pieces = count(b);
  if (pieces < 6 || pieces > 24 || attackers(b, att) < 1) return;
  // phải có ít nhất một nước chiếu
  const moves = E.genLegal(st, att);
  let hasCheck = false;
  for (const m of moves) { const c = E.makeMove(st, m); if (E.inCheck(st, 1 - att)) hasCheck = true; E.unmakeMove(st, m, c); if (hasCheck) break; }
  if (!hasCheck) return;
  const fen = E.toFen(b, att);
  if (seen.has(fen)) return;
  const m1 = E.mateMoves(st, att, 1, true);
  let n = 0, sol = null;
  if (m1.length === 1) { n = 1; sol = m1[0]; }
  else if (m1.length === 0) {
    if (found[2].length < WANT[2] * 3) { const m2 = E.mateMoves(st, att, 2, true); if (m2.length === 1) { n = 2; sol = m2[0]; } }
    if (!n && found[3].length < WANT[3] * 3 && pieces <= 16 && attackers(b, att) >= 2) {
      const m3 = E.mateMoves(st, att, 3, true);
      if (m3.length === 1 && E.mateMoves(st, att, 2, true).length === 0) { n = 3; sol = m3[0]; }
    }
  }
  if (!n || found[n].length >= WANT[n] * 3) return;
  seen.add(fen);
  found[n].push({ n, fen, pieces, side: att, sol: E.notate(b, sol) });
}

const done = () => [1, 2, 3].every((k) => found[k].length >= WANT[k] * 3);
const t0 = Date.now();
let games = 0;
while (!done() && Date.now() - t0 < 25 * 60 * 1000) {
  games++;
  const b = E.initialBoard();
  let sd = 0;
  const lv = { maxDepth: 2, timeMs: 40, exact: true, margin: 220 };
  for (let ply = 0; ply < 160; ply++) {
    const st = E.newState(Int8Array.from(b));
    const moves = E.genLegal(st, sd);
    if (!moves.length) break;
    if (ply >= 16 && rnd() < 0.5) consider(b, sd);
    const r = E.search(b, sd, lv);
    E.makeMove(st, r.mv); b.set(st.b);
    sd = 1 - sd;
  }
  if (games % 10 === 0) console.log(`ván ${games}: ` + [1, 2, 3].map((k) => `${k}-nước ${found[k].length}`).join(', '), ((Date.now() - t0) / 1000 | 0) + 's');
}
const out = [];
for (const k of [1, 2, 3]) {
  const list = found[k].sort((a, b) => a.pieces - b.pieces || (a.fen < b.fen ? -1 : 1));
  // lấy đều từ ít quân (dễ nhìn) đến nhiều quân
  const step = Math.max(1, Math.floor(list.length / WANT[k]));
  const pick = []; for (let i = 0; i < list.length && pick.length < WANT[k]; i += step) pick.push(list[i]);
  pick.forEach((p, i) => out.push({ id: `m${k}-${String(i + 1).padStart(2, '0')}`, n: k, side: p.side, fen: p.fen }));
}
fs.writeFileSync(path.join(__dirname, '../src/puzzles.js'), '// Tạo tự động bởi tools/gen-puzzles.js\nconst PUZZLES = ' + JSON.stringify(out, null, 0).replace(/\},\{/g, '},\n{') + ';\n');
console.log('Đã tạo', out.length, 'bài tập:', [1, 2, 3].map((k) => out.filter((p) => p.n === k).length).join(' / '));
