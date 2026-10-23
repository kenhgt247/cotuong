// Tạo "cờ thế": thế tàn cuộc ít quân, bên đi trước chiếu liên tục để hạ gục trong 3-6 nước.
// Thế được dựng ngẫu nhiên rồi kiểm tra đúng một nước mở đầu thắng và không thể thắng nhanh hơn.
// Chạy: node tools/gen-the.js [số phút]  ->  ghi src/the.js
const fs = require('fs'), path = require('path');
const E = require('../src/engine.js')();
let seed = 777;
const rnd = () => { seed |= 0; seed = (seed + 0x6D2B79F5) | 0; let t = Math.imul(seed ^ (seed >>> 15), 1 | seed); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
const ri = (n) => (rnd() * n) | 0;
const pick = (a) => a[ri(a.length)];
const { K, A, E: EL, H, R, C, P } = E;
const WANT = { 3: 8, 4: 10, 5: 10, 6: 6 };
const found = { 3: [], 4: [], 5: [], 6: [] };
const seen = new Set();
const sq = (r, c) => r * 9 + c;
// ô hợp lệ của từng quân, bên Đen ở trên (hàng 0..4), Trắng ở dưới (hàng 5..9)
const palace = (side) => { const rows = side === 1 ? [0, 1, 2] : [7, 8, 9]; const o = []; for (const r of rows) for (const c of [3, 4, 5]) o.push(sq(r, c)); return o; };
const advisor = (side) => side === 1 ? [sq(0, 3), sq(0, 5), sq(1, 4), sq(2, 3), sq(2, 5)] : [sq(9, 3), sq(9, 5), sq(8, 4), sq(7, 3), sq(7, 5)];
const elephant = (side) => side === 1 ? [sq(0, 2), sq(0, 6), sq(2, 0), sq(2, 4), sq(2, 8), sq(4, 2), sq(4, 6)] : [sq(9, 2), sq(9, 6), sq(7, 0), sq(7, 4), sq(7, 8), sq(5, 2), sq(5, 6)];
const any = () => { const o = []; for (let i = 0; i < 90; i++) o.push(i); return o; };
function pawnSq(side) { const o = []; for (let r = 0; r < 10; r++) for (let c = 0; c < 9; c++) { const adv = side === 1 ? r >= 5 : r <= 4; if (adv || c % 2 === 0) o.push(sq(r, c)); } return o; }

function build(att) {
  const b = new Int8Array(90), def = 1 - att;
  const put = (type, side, cells) => { for (let k = 0; k < 20; k++) { const s = pick(cells); if (!b[s]) { b[s] = type + (side ? 8 : 0); return true; } } return false; };
  put(K, att, palace(att)); put(K, def, palace(def));
  for (let i = 0, n = ri(3); i < n; i++) put(A, att, advisor(att));
  for (let i = 0, n = ri(2); i < n; i++) put(EL, att, elephant(att));
  for (let i = 0, n = 1 + ri(2); i < n; i++) put(A, def, advisor(def));
  for (let i = 0, n = ri(3); i < n; i++) put(EL, def, elephant(def));
  const na = 2 + ri(3);
  for (let i = 0; i < na; i++) { const t = pick([R, R, C, C, H, H, P]); put(t, att, t === P ? pawnSq(att) : any()); }
  for (let i = 0, n = ri(3); i < n; i++) { const t = pick([R, C, H, P, P]); put(t, def, t === P ? pawnSq(def) : any()); }
  return b;
}
const count = (b) => { let n = 0; for (let i = 0; i < 90; i++) if (b[i]) n++; return n; };
function consider(b, att) {
  const st = E.newState(Int8Array.from(b));
  // bố trí quân phải hợp lệ: không ai đang bị chiếu, hai tướng không đối mặt
  if (!st.kp || st.kp[0] == null || st.kp[1] == null) return;
  if (E.inCheck(st, att) || E.inCheck(st, 1 - att)) return;
  const fen = E.toFen(b, att);
  if (seen.has(fen)) return;
  seen.add(fen);
  const moves = E.genLegal(st, att);
  if (!moves.length) return;
  for (const n of [3, 4, 5, 6]) {
    if (found[n].length >= WANT[n] * 4) continue;
    if (n > 3 && E.mateMoves(st, att, n - 1, true).length) return;
    if (n === 3 && (E.mateMoves(st, att, 1, true).length || E.mateMoves(st, att, 2, true).length)) return;
    const m = E.mateMoves(st, att, n, true);
    if (m.length === 1) { found[n].push({ n, fen, pieces: count(b), sol: E.notate(b, m[0]) }); return; }
    if (m.length > 1) return;
    // chưa thắng ở n nước: thử n lớn hơn chỉ khi còn đáng thử
  }
}
const mins = +process.argv[2] || 8, t0 = Date.now();
let tries = 0;
const full = () => [3, 4, 5, 6].every((k) => found[k].length >= WANT[k] * 4);
while (!full() && Date.now() - t0 < mins * 60000) {
  tries++;
  const att = ri(2);
  consider(build(att), att);
  if (tries % 20000 === 0) console.log(tries, [3, 4, 5, 6].map((k) => `${k}:${found[k].length}`).join(' '), ((Date.now() - t0) / 1000 | 0) + 's');
}
console.log('thử', tries, [3, 4, 5, 6].map((k) => `${k}:${found[k].length}`).join(' '));
const out = [];
for (const k of [3, 4, 5, 6]) {
  const list = found[k].sort((a, b) => a.pieces - b.pieces || (a.fen < b.fen ? -1 : 1));
  const step = Math.max(1, Math.floor(list.length / WANT[k]));
  const pk = []; for (let i = 0; i < list.length && pk.length < WANT[k]; i += step) pk.push(list[i]);
  pk.forEach((p, i) => out.push({ id: `t${k}-${String(i + 1).padStart(2, '0')}`, n: k, side: +(p.fen.split(' ')[1] === 'b'), fen: p.fen }));
}
fs.writeFileSync(path.join(__dirname, '../src/the.js'), '// Tạo tự động bởi tools/gen-the.js\nconst THE = ' + JSON.stringify(out).replace(/\},\{/g, '},\n{') + ';\n');
console.log('Đã tạo', out.length, 'thế');
