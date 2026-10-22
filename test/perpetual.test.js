// Kiểm tra luật chiếu mãi / bắt mãi theo Điều 22–24
const E = require('../src/engine.js')();
const T = { K: 1, A: 2, E: 3, H: 4, R: 5, C: 6, P: 7 };
let fails = 0;
const ok = (c, m) => { if (!c) { fails++; console.log('FAIL:', m); } else console.log('ok  :', m); };

function board(pieces) {
  const b = new Int8Array(90);
  for (const [sd, t, r, c] of pieces) b[r * 9 + c] = T[t] + sd * 8;
  return b;
}
const mv = (fr, fc, tr, tc) => (fr * 9 + fc) | ((tr * 9 + tc) << 7);

/** chạy dãy nước đi (một chu kỳ), kiểm tra hợp lệ rồi xét luật */
function verdict(b0, startSide, moves) {
  const boards = [Int8Array.from(b0)];
  let sd = startSide;
  for (const m of moves) {
    const st = E.newState(Int8Array.from(boards[boards.length - 1]));
    if (!E.genLegal(st, sd).includes(m)) throw new Error('nước đi không hợp lệ: ' + m + ' lượt ' + sd);
    E.makeMove(st, m);
    boards.push(st.b);
    sd = 1 - sd;
  }
  const same = E.boardKey(boards[0], startSide) === E.boardKey(boards[boards.length - 1], startSide);
  if (!same) throw new Error('chu kỳ không quay về thế ban đầu');
  return E.judgeCycle(boards, moves, startSide).viol;
}
const show = (v) => JSON.stringify(v);

// 1. Trắng chiếu mãi bằng Xe, Đen chỉ chạy Tướng -> Trắng phạm luật
{
  const b = board([[1, 'K', 0, 4], [0, 'K', 9, 3], [0, 'R', 1, 8]]);
  const v = verdict(b, 0, [mv(1, 8, 0, 8), mv(0, 4, 1, 4), mv(0, 8, 1, 8), mv(1, 4, 0, 4)]);
  ok(v[0] === 'check' && v[1] === null, 'chiếu mãi: ' + show(v));
}

// 2. Xe đuổi mãi Pháo không có căn -> Trắng phạm luật bắt mãi
{
  const b = board([[1, 'K', 0, 3], [0, 'K', 9, 5], [0, 'R', 4, 8], [1, 'C', 3, 0]]);
  const v = verdict(b, 0, [mv(4, 8, 3, 8), mv(3, 0, 4, 0), mv(3, 8, 4, 8), mv(4, 0, 3, 0)]);
  ok(v[0] === 'chase' && v[1] === null, 'đuổi bắt mãi quân không căn: ' + show(v));
}

// 3. Xe đuổi Pháo có căn thật (Xe Đen bảo vệ) -> không phạm luật (hòa)
{
  const b = board([[1, 'K', 0, 3], [0, 'K', 9, 5], [0, 'R', 4, 8], [1, 'C', 3, 0], [1, 'R', 0, 0]]);
  const v = verdict(b, 0, [mv(4, 8, 3, 8), mv(3, 0, 4, 0), mv(3, 8, 4, 8), mv(4, 0, 3, 0)]);
  ok(v[0] === null && v[1] === null, 'đuổi quân có căn thật -> hòa: ' + show(v));
}

// 4. Một chiếu một dừng -> không phạm luật (hòa)
{
  const b = board([[1, 'K', 0, 4], [0, 'K', 9, 3], [0, 'R', 5, 8]]);
  const v = verdict(b, 0, [mv(5, 8, 0, 8), mv(0, 4, 1, 4), mv(0, 8, 5, 8), mv(1, 4, 0, 4)]);
  ok(v[0] === null && v[1] === null, 'một chiếu một dừng -> hòa: ' + show(v));
}

function ids90(b) { const ids = new Int16Array(90).fill(-1); for (let i = 0; i < 90; i++) if (b[i]) ids[i] = i; return ids; }
const chasedAt = (b, X, sq) => E.classify(Int8Array.from(b), X, ids90(b)).chased.includes(sq);

// 5. Căn giả: Mã Đen bảo vệ Pháo nhưng bị ghim (rời cột là hai tướng đối mặt) -> vẫn là quân không căn
{
  const b = board([[1, 'K', 0, 4], [0, 'K', 9, 4], [1, 'H', 5, 4], [1, 'C', 4, 2], [0, 'R', 9, 2]]);
  ok(chasedAt(b, 0, 4 * 9 + 2), 'căn giả (quân bảo vệ bị ghim) -> tính là bắt');
  const b2 = board([[1, 'K', 0, 3], [0, 'K', 9, 4], [1, 'H', 5, 4], [1, 'C', 4, 2], [0, 'R', 9, 2]]);
  ok(!chasedAt(b2, 0, 4 * 9 + 2), 'căn thật -> không tính là bắt');
}

// 6. Mã/Pháo đuổi Xe có căn thật vẫn là bắt (Điểm 6); Xe đuổi Xe có căn thì không
{
  const base = [[1, 'K', 0, 3], [0, 'K', 9, 5], [1, 'R', 3, 4], [1, 'R', 0, 4]];
  const bh = board([...base, [0, 'H', 5, 3]]);
  ok(chasedAt(bh, 0, 3 * 9 + 4), 'Mã đuổi Xe có căn thật -> bắt');
  const bc = board([...base, [0, 'R', 3, 8]]);
  ok(!chasedAt(bc, 0, 3 * 9 + 4), 'Xe đuổi Xe có căn thật -> không bắt');
}

// 7. Xe đuổi Tốt chưa qua sông -> được phép; Tốt đã qua sông không căn -> bắt
{
  const b = board([[1, 'K', 0, 3], [0, 'K', 9, 5], [1, 'P', 3, 0], [0, 'R', 3, 8]]);
  ok(!chasedAt(b, 0, 3 * 9 + 0), 'Tốt chưa qua sông -> không tính bắt');
  const b2 = board([[1, 'K', 0, 3], [0, 'K', 9, 5], [1, 'P', 5, 0], [0, 'R', 5, 8]]);
  ok(chasedAt(b2, 0, 5 * 9 + 0), 'Tốt đã qua sông, không căn -> bắt');
}

// 8. Xe-Xe ăn nhau được (đòi đổi) -> không phải đuổi bắt; nếu bên kia bị giam thì là bắt (24.20, Hình 55)
{
  const b = board([[1, 'K', 0, 3], [0, 'K', 9, 5], [1, 'R', 4, 0], [0, 'R', 4, 8]]);
  ok(!chasedAt(b, 0, 4 * 9 + 0), 'Xe đòi đổi Xe -> không bắt');
}

console.log(fails ? fails + ' LỖI' : 'XONG');
process.exit(fails ? 1 : 0);
