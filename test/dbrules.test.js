// Kiểm tra database.rules.json bằng bộ mô phỏng luật Firebase (targaryen), không cần kết nối mạng
const targaryen = require('targaryen');
const fs = require('fs'), path = require('path');
const rules = JSON.parse(fs.readFileSync(path.join(__dirname, '../database.rules.json'), 'utf8'));
let fails = 0;
const NOW = 1_700_000_000_000;
const SV = { '.sv': 'timestamp' };
const A = { uid: 'A' }, B = { uid: 'B' }, C = { uid: 'C' };
let db = targaryen.database(rules, {}, NOW);

function check(who, op, p, val, expectAllowed, label) {
  const view = who === null ? targaryen.database(rules, {}, NOW) : db.as(who);
  const r = op === 'read' ? view.read(p) : op === 'update' ? view.update(p, val) : view.write(p, val);
  const okk = !!r.allowed === expectAllowed;
  console.log(okk ? 'ok  :' : 'FAIL:', label);
  if (!okk) { fails++; if (process.env.DEBUG) console.log(r.info); }
  // áp dụng thay đổi nếu hợp lệ để các bước sau dùng dữ liệu mới
  if (r.allowed && op !== 'read') db = r.newDatabase;
}
const W = (who, p, v, e, l) => check(who, 'write', p, v, e, l);
const U = (who, p, v, e, l) => check(who, 'update', p, v, e, l);
const R = (who, p, e, l) => check(who, 'read', p, null, e, l);
const tick = (ms) => { db = db.with({ now: db.now + ms }); };

const info = (n, r = 1000) => ({ nick: n, avatar: '🐲', rating: r });

// ---- hồ sơ công khai ----
W(A, '/users/A', info('Nam'), true, 'tự ghi hồ sơ của mình');
W(B, '/users/A', info('Hack'), false, 'không ghi được hồ sơ người khác');
W(A, '/users/A', { nick: 'Nam', rating: 99999 }, false, 'điểm xếp hạng quá lớn bị từ chối');
W(A, '/users/A', { nick: 'Nam', rating: 1000, secret: 'x' }, false, 'không cho thêm trường lạ');
W(A, '/users/A', { nick: 'x'.repeat(30), rating: 1000 }, false, 'biệt danh quá dài bị từ chối');
R(B, '/users', true, 'người đăng nhập đọc được bảng xếp hạng');
R(null, '/users', false, 'người chưa đăng nhập không đọc được');

// ---- hiện diện ----
W(A, '/seen/A', SV, true, 'ghi giờ máy chủ cho mình');
W(A, '/seen/A', 123, false, 'không tự ghi giờ giả');
W(B, '/seen/A', SV, false, 'không ghi hộ người khác');

// ---- tạo phòng ----
const room = (uid, slot) => ({ [slot]: uid, clock: 10, created: SV, n: 0, mvs: '', info: { [uid]: info('Nam') } });
W(A, '/rooms/ABC234', room('A', 'w'), true, 'tạo phòng với tư cách bên Trắng');
W(B, '/rooms/XYZ789', room('A', 'w'), false, 'không tạo phòng mang tên người khác');
W(A, '/rooms/abc234', room('A', 'w'), false, 'mã phòng sai định dạng bị từ chối');
W(A, '/rooms/QQQ222', Object.assign(room('A', 'w'), { b: 'A' }), false, 'không tự chiếm cả hai bên');
W(A, '/rooms/QQQ223', Object.assign(room('A', 'w'), { clock: 7 }), false, 'đồng hồ lạ bị từ chối');
W(A, '/rooms/ABC234', room('A', 'w'), false, 'không ghi đè phòng đã có');

// ---- vào phòng ----
U(B, '/rooms/ABC234', { b: 'B', started: SV }, true, 'B vào phòng chiếm bên Đen');
W(B, '/rooms/ABC234/info/B', info('Bạn'), true, 'B ghi thông tin của mình trong phòng');
U(C, '/rooms/ABC234', { w: 'C' }, false, 'C không chiếm được chỗ đã có người');
W(C, '/rooms/ABC234/info/C', info('C'), false, 'người ngoài không ghi thông tin vào phòng');
R(C, '/rooms/ABC234', true, 'ai có mã phòng cũng đọc được (để xem)');

// ---- đi quân ----
const mv = (n, mvs) => ({ n, mvs, lastT: SV });
U(B, '/rooms/ABC234', mv(1, '100'), false, 'Đen không đi trước Trắng');
U(A, '/rooms/ABC234', mv(1, '100'), true, 'Trắng đi nước 1');
U(A, '/rooms/ABC234', mv(2, '100,200'), false, 'Trắng không đi hai lần liền');
U(C, '/rooms/ABC234', mv(2, '100,200'), false, 'người ngoài không đi quân');
U(B, '/rooms/ABC234', mv(3, '100,200'), false, 'không nhảy cóc số nước');
U(B, '/rooms/ABC234', mv(2, '999'), false, 'không viết lại lịch sử nước đi');
U(B, '/rooms/ABC234', { n: 2, mvs: '100,abc', lastT: SV }, false, 'nước đi không phải số bị từ chối');
U(B, '/rooms/ABC234', { n: 2, mvs: '100,200' }, false, 'thiếu giờ máy chủ bị từ chối');
U(B, '/rooms/ABC234', { n: 2, mvs: '100,200', lastT: 5 }, false, 'giờ giả bị từ chối');
U(B, '/rooms/ABC234', { n: 2, mvs: '100,200,300,400,500', lastT: SV }, false, 'không thêm nhiều nước một lúc');
tick(5000);
U(B, '/rooms/ABC234', mv(2, '100,200'), true, 'Đen đáp lại nước 2');
U(A, '/rooms/ABC234', mv(3, '100,200,16383'), true, 'Trắng đi nước 3 (số lớn nhất)');

// ---- đề nghị hòa, trò chuyện ----
W(A, '/rooms/ABC234/offer', { from: 'A', n: 3 }, true, 'Trắng xin hòa');
W(B, '/rooms/ABC234/offer', { from: 'A', n: 3 }, false, 'không xin hòa giả danh người khác');
W(C, '/rooms/ABC234/offer', { from: 'C', n: 3 }, false, 'người ngoài không xin hòa');
W(B, '/rooms/ABC234/offer', null, true, 'Đen từ chối (xóa lời xin hòa)');
W(A, '/rooms/ABC234/chat/m1', { u: 'A', k: 3, t: SV }, true, 'gửi câu nói có sẵn');
W(A, '/rooms/ABC234/chat/m2', { u: 'A', k: 12, t: SV }, false, 'câu nói ngoài danh sách bị từ chối');
W(A, '/rooms/ABC234/chat/m3', { u: 'A', text: 'xin chào', k: 1, t: SV }, false, 'không gửi văn bản tự do');
W(C, '/rooms/ABC234/chat/m4', { u: 'C', k: 1, t: SV }, false, 'người ngoài không nhắn vào phòng');
W(B, '/rooms/ABC234/chat/m1', { u: 'B', k: 1, t: SV }, false, 'không ghi đè tin nhắn cũ');

// ---- kết quả ----
W(C, '/rooms/ABC234/result', { w: 0, text: 'x', by: 'C', t: SV }, false, 'người ngoài không ghi kết quả');
W(B, '/rooms/ABC234/result', { w: 3, text: 'x', by: 'B', t: SV }, false, 'kết quả sai giá trị bị từ chối');
W(B, '/rooms/ABC234/result', { w: 1, text: 'Đen xin thua?', by: 'A', t: SV }, false, 'không ghi kết quả mạo danh');
W(B, '/rooms/ABC234/result', { w: 0, text: 'Đen xin thua.', by: 'B', t: SV }, true, 'người chơi ghi kết quả');
W(A, '/rooms/ABC234/result', { w: 1, text: 'đổi ý', by: 'A', t: SV }, false, 'kết quả chỉ ghi được một lần');
U(B, '/rooms/ABC234', mv(4, '100,200,16383,5'), false, 'hết ván thì không đi tiếp được');

// ---- ghép nhanh ----
W(A, '/queue/A', Object.assign({ ts: SV }, info('Nam')), true, 'vào hàng chờ ghép nhanh');
W(B, '/queue/A', Object.assign({ ts: SV }, info('Giả')), false, 'không sửa hàng chờ của người khác');
R(B, '/queue', true, 'đọc được hàng chờ');
W(B, '/claims/A', { by: 'B', room: 'ABC234', t: SV }, true, 'B mời A vào phòng');
W(C, '/claims/A', { by: 'C', room: 'XYZ789', t: SV }, false, 'C không chen vào khi A đã được mời');
W(C, '/claims/B', { by: 'A', room: 'XYZ789', t: SV }, false, 'không mời mạo danh');
R(C, '/claims/A', false, 'người khác không đọc được lời mời của A');
R(A, '/claims/A', true, 'A đọc được lời mời của mình');
W(A, '/claims/A', null, true, 'A xóa lời mời sau khi dùng');

console.log(fails ? `${fails} LỖI` : 'TẤT CẢ LUẬT ĐÚNG');
process.exit(fails ? 1 : 0);
