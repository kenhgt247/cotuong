// Kiểm thử lớp mạng online (src/online.js) với máy chủ giả có luật thật
const startMock = require('../tools/mock-firebase.js');
const createNet = require('../src/online.js');
let fails = 0;
const ok = (c, m) => { console.log(c ? 'ok  :' : 'FAIL:', m); if (!c) fails++; };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// môi trường giả cho Node: localStorage + EventSource
function fakeLS() { const m = {}; return { getItem: (k) => (k in m ? m[k] : null), setItem: (k, v) => { m[k] = String(v); }, removeItem: (k) => { delete m[k]; } }; }
const { EventSource } = require('eventsource');
global.EventSource = EventSource;
global.self = global;

(async () => {
  const mock = await startMock(0);
  const cfg = { apiKey: 'k', databaseURL: mock.url, authURL: mock.url + '/identitytoolkit', tokenURL: mock.url + '/securetoken' };
  const mk = () => { global.localStorage = fakeLS(); const net = createNet(cfg); const ls = global.localStorage; return { net, ls }; };
  const A = mk(), B = mk();
  const swap = (x) => { global.localStorage = x.ls; };

  swap(A); const ua = await A.net.uid();
  swap(B); const ub = await B.net.uid();
  ok(ua && ub && ua !== ub, 'đăng nhập ẩn danh, hai người khác nhau');
  swap(A); ok((await A.net.uid()) === ua, 'giữ nguyên người dùng khi gọi lại');

  swap(A); await A.net.saveUser({ nick: 'Nam', avatar: '🐲', rating: 1100, games: 3, wins: 2 });
  swap(B); await B.net.saveUser({ nick: 'Bạn', avatar: '🐯', rating: 1300, games: 5, wins: 4 });
  const lb = await B.net.leaderboard();
  ok(lb.length === 2 && lb[0].nick === 'Bạn', 'bảng xếp hạng sắp theo điểm: ' + lb.map((x) => x.nick + ':' + x.rating).join(', '));

  // phòng chơi + luồng sự kiện
  swap(A); const code = await A.net.createRoom({ side: 0, clock: 10, info: { nick: 'Nam', avatar: '🐲', rating: 1100 } });
  ok(/^[A-Z0-9]{6}$/.test(code), 'tạo phòng, mã ' + code);
  const evA = [], evB = [];
  swap(A); const sA = A.net.stream(`rooms/${code}`, { onData: (t) => evA.push(JSON.parse(JSON.stringify(t))) });
  await sleep(300);
  swap(B); const j = await B.net.joinRoom(code.toLowerCase(), { nick: 'Bạn', avatar: '🐯', rating: 1300 });
  ok(j.side === 1, 'B vào phòng, cầm quân Đen');
  const sB = B.net.stream(`rooms/${code}`, { onData: (t) => evB.push(JSON.parse(JSON.stringify(t))) });
  await sleep(400);
  const lastA = evA[evA.length - 1]; if (process.env.DBG) console.log('lastA', JSON.stringify(lastA), 'n events', evA.length);
  ok(lastA && lastA.b === ub && lastA.info && lastA.info[ub] && lastA.info[ub].nick === 'Bạn' && typeof lastA.started === 'number', 'A thấy B vào phòng cùng thông tin');

  // đi quân qua lại
  swap(A); let mvs = await A.net.sendMove(code, 0, '', 123);
  await sleep(250);
  swap(B); const t1 = evB[evB.length - 1];
  ok(t1.n === 1 && t1.mvs === '123' && typeof t1.lastT === 'number', 'B nhận nước 1 cùng giờ máy chủ');
  let denied = false;
  try { await B.net.sendMove(code, 1, '123', 456); await B.net.sendMove(code, 1, '123,456', 789); } catch (e) { denied = true; }
  ok(denied, 'đi hai lần liền bị luật chặn');
  swap(A); const t2 = evA[evA.length - 1];
  ok(t2.n === 2 && t2.mvs === '123,456', 'A nhận nước 2');

  // kết quả + xin hòa + chat
  swap(A); await A.net.sendOffer(code, 2);
  await sleep(200);
  ok(evB[evB.length - 1].offer && evB[evB.length - 1].offer.from === ua, 'B thấy lời xin hòa');
  swap(B); await B.net.clearOffer(code);
  await sleep(200);
  ok(!evA[evA.length - 1].offer, 'lời xin hòa bị xóa');
  swap(A); await A.net.sendChat(code, 2);
  await sleep(200);
  const chat = Object.values(evB[evB.length - 1].chat || {});
  ok(chat.length === 1 && chat[0].k === 2, 'tin nhắn có sẵn đến được B');
  swap(B); await B.net.sendResult(code, 2, 'Hai bên thỏa thuận hòa.');
  await sleep(200);
  ok(evA[evA.length - 1].result && evA[evA.length - 1].result.w === 2, 'A thấy kết quả hòa');
  let again = false;
  swap(A); try { await A.net.sendResult(code, 0, 'đổi ý'); } catch (e) { again = true; }
  ok(again, 'kết quả không ghi lại được');
  let late = false;
  try { await A.net.joinRoom(code, { nick: 'x', rating: 1000 }); } catch (e) { late = e.code === 'done'; }
  ok(late, 'phòng đã kết thúc thì báo "đã kết thúc"');
  let nf = false; try { await A.net.joinRoom('ZZZZZZ', { nick: 'x', rating: 1000 }); } catch (e) { nf = e.code === 'notfound'; }
  ok(nf, 'mã phòng không có thì báo không tìm thấy');

  // ghép nhanh
  swap(A); await A.net.queueJoin({ nick: 'Nam', avatar: '🐲', rating: 1100 });
  swap(B); await B.net.queueJoin({ nick: 'Bạn', avatar: '🐯', rating: 1300 });
  const q = await B.net.queueScan();
  ok(q.length === 2 && q[0].ts <= q[1].ts, 'hàng chờ có 2 người, sắp theo thời gian');
  const evC = [];
  swap(A); const sC = A.net.stream(`claims/${ua}`, { onData: (t) => evC.push(t) });
  swap(B); const room2 = await B.net.createRoom({ side: 1, clock: 0, info: { nick: 'Bạn', rating: 1300 } });
  await B.net.claim(ua, room2);
  await sleep(300);
  ok(evC.length && evC[evC.length - 1] && evC[evC.length - 1].room === room2 && evC[evC.length - 1].by === ub, 'A nhận lời mời vào phòng ' + room2);
  swap(A); await A.net.queueLeave(); swap(B); await B.net.queueLeave();
  ok((await B.net.queueScan()).length === 0, 'rời hàng chờ');

  const bad = mock.log.filter((l) => !l.allowed).length;
  console.log('   (số lần luật Firebase từ chối trong bài thử:', bad + ')');
  sA.close(); sB.close(); sC.close(); mock.close();
  console.log(fails ? fails + ' LỖI' : 'XONG');
  process.exit(fails ? 1 : 0);
})().catch((e) => { console.error('Lỗi:', e); process.exit(1); });
