// Kiểm tra bộ luật: perft chuẩn + đối chiếu ngẫu nhiên với xiangqi.js
const createEngine = require('../src/engine.js');
const E = createEngine();
const path = process.argv[2] || '/home/user/ref/xiangqi.js/xiangqi.js';
const { Xiangqi } = require(path);

let fails = 0;
function ok(cond, msg) { if (!cond) { fails++; console.log('FAIL:', msg); } }

// ---- perft ----
function perft(st, sd, depth) {
  if (depth === 0) return 1;
  const mv = E.genLegal(st, sd);
  if (depth === 1) return mv.length;
  let n = 0;
  for (const m of mv) { const c = E.makeMove(st, m); n += perft(st, 1 - sd, depth - 1); E.unmakeMove(st, m, c); }
  return n;
}
{
  const st = E.newState(E.initialBoard());
  const expected = [44, 1920, 79666, 3290240];
  for (let d = 1; d <= 4; d++) {
    const t0 = Date.now();
    const n = perft(st, 0, d);
    console.log(`perft(${d}) = ${n}  (${Date.now() - t0}ms)`);
    ok(n === expected[d - 1], `perft ${d}: ${n} != ${expected[d - 1]}`);
  }
}

// ---- đối chiếu với xiangqi.js ----
const LET = { 1: 'k', 2: 'a', 3: 'b', 4: 'n', 5: 'r', 6: 'c', 7: 'p' };
function fenOf(b, sd) {
  const rows = [];
  for (let r = 0; r < 10; r++) {
    let s = '', e = 0;
    for (let c = 0; c < 9; c++) {
      const p = b[r * 9 + c];
      if (!p) { e++; continue; }
      if (e) { s += e; e = 0; }
      const l = LET[p & 7];
      s += (p >> 3) === 0 ? l.toUpperCase() : l;
    }
    if (e) s += e;
    rows.push(s);
  }
  return rows.join('/') + ' ' + (sd === 0 ? 'r' : 'b') + ' - - 0 1';
}
const sqName = (sq) => 'abcdefghi'[E.COL[sq]] + (9 - E.ROW[sq]);
const mvName = (m) => sqName(m & 127) + sqName(m >> 7);

let positions = 0, games = 400;
for (let g = 0; g < games; g++) {
  const b = E.initialBoard();
  let sd = 0;
  for (let ply = 0; ply < 120; ply++) {
    const st = E.newState(Int8Array.from(b));
    const mine = E.genLegal(st, sd);
    const ref = new Xiangqi(fenOf(b, sd));
    const theirs = ref.moves({ verbose: false }).map((m) => (typeof m === 'string' ? m : (m.from + m.to)));
    const a = mine.map(mvName).sort().join(','), c = theirs.map((m) => m.replace(/[^a-i0-9]/g, '')).sort().join(',');
    positions++;
    if (a !== c) {
      ok(false, `khác nhau tại ${fenOf(b, sd)}\n mine=${a}\n ref =${c}`);
      break;
    }
    ok(E.inCheck(st, sd) === ref.in_check(), `in_check khác tại ${fenOf(b, sd)}`);
    if (!mine.length) break;
    const m = mine[(Math.random() * mine.length) | 0];
    E.makeMove(st, m);
    b.set(st.b);
    sd = 1 - sd;
  }
}
console.log(`đã đối chiếu ${positions} thế cờ`);

// ---- cách ghi nước đi ----
{
  const b = E.initialBoard();
  const mv = (fr, fc, tr, tc) => (fr * 9 + fc) | ((tr * 9 + tc) << 7);
  ok(E.notate(b, mv(7, 7, 7, 4)) === 'Pháo 2 bình 5', 'Pháo 2 bình 5 : ' + E.notate(b, mv(7, 7, 7, 4)));
  ok(E.notate(b, mv(9, 1, 7, 2)) === 'Mã 8 tiến 7', 'Mã 8 tiến 7 : ' + E.notate(b, mv(9, 1, 7, 2)));
  ok(E.notate(b, mv(0, 1, 2, 2)) === 'Mã 2 tiến 3', 'Mã 2 tiến 3 : ' + E.notate(b, mv(0, 1, 2, 2)));
}

console.log(fails ? `${fails} LỖI` : 'TẤT CẢ ĐỀU ĐÚNG');
process.exit(fails ? 1 : 0);
