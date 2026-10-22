const E = require('../src/engine.js')();

const LEVELS = [
  { name: 'Dễ', maxDepth: 2, timeMs: 400, margin: 350, exact: true },
  { name: 'Vừa', maxDepth: 3, timeMs: 800, margin: 80, exact: true },
  { name: 'Khó', maxDepth: 5, timeMs: 2000, margin: 0 },
  { name: 'Cao thủ', maxDepth: 8, timeMs: 5000, margin: 0 },
];

// tốc độ từ thế khai cuộc
for (const L of LEVELS) {
  const t0 = Date.now();
  const r = E.search(E.initialBoard(), 0, L);
  console.log(L.name.padEnd(8), 'depth', r.depth, 'nodes', r.nodes, (Date.now() - t0) + 'ms', E.notate(E.initialBoard(), r.mv));
}

// đấu máy với máy: mức cao thắng mức thấp?
function play(lvW, lvB, maxPly = 200) {
  const b = E.initialBoard();
  let sd = 0;
  const hist = new Map();
  for (let ply = 0; ply < maxPly; ply++) {
    const st = E.newState(Int8Array.from(b));
    const moves = E.genLegal(st, sd);
    if (!moves.length) return sd === 0 ? 'B' : 'W';
    const r = E.search(b, sd, Object.assign({}, sd === 0 ? lvW : lvB, { timeMs: 300, maxDepth: Math.min((sd === 0 ? lvW : lvB).maxDepth, 4) }));
    E.makeMove(st, r.mv); b.set(st.b);
    const k = E.boardKey(b, 1 - sd);
    hist.set(k, (hist.get(k) || 0) + 1);
    if (hist.get(k) >= 3) return 'D';
    sd = 1 - sd;
  }
  return 'D';
}
const res = { W: 0, B: 0, D: 0 };
const N = 6;
for (let i = 0; i < N; i++) {
  const a = play(LEVELS[2], LEVELS[0]); res[a]++;
  const c = play(LEVELS[0], LEVELS[2]); res[c === 'W' ? 'B' : c === 'B' ? 'W' : 'D']++; // đổi bên: quy về "Khó thắng = W"
}
console.log('Khó vs Dễ (W = Khó thắng):', res);
