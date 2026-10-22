// Chơi online giữa hai người chơi thật (hai trình duyệt) với máy chủ Firebase giả có luật thật
const { chromium } = require('/opt/node-tools/node_modules/playwright');
const startMock = require('../tools/mock-firebase.js');
const path = require('path');
const out = process.argv[2] || '/tmp/ui-shots';
require('fs').mkdirSync(out, { recursive: true });
const url = 'file://' + path.resolve(__dirname, '../public/index.html');
let fails = 0;
const ok = (c, m) => { console.log(c ? 'ok  :' : 'FAIL:', m); if (!c) fails++; };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

(async () => {
  const mock = await startMock(0);
  const cfg = { apiKey: 'k', databaseURL: mock.url, authURL: mock.url + '/identitytoolkit', tokenURL: mock.url + '/securetoken' };
  const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium', args: ['--no-sandbox'] });
  const errors = [];
  async function player(nick, avatar) {
    const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
    await ctx.addInitScript(([c, nick, avatar]) => {
      window.__ONLINE_CONFIG = c;
      if (!localStorage.getItem('cotuong.profile')) localStorage.setItem('cotuong.profile', JSON.stringify({ setup: true, name: 'Tên thật ' + nick, nick, avatar }));
    }, [cfg, nick, avatar]);
    const page = await ctx.newPage();
    page.on('pageerror', (e) => errors.push(nick + ' pageerror: ' + e.message));
    page.on('console', (m) => { if (m.type() === 'error' && !/Failed to load resource/.test(m.text())) errors.push(nick + ' console: ' + m.text()); });
    await page.goto(url);
    await page.waitForSelector('#board .piece');
    await page.waitForFunction(() => document.getElementById('homeDlg').open);
    await page.evaluate(() => document.getElementById('homeDlg').close());
    return { ctx, page, nick };
  }
  const G = (p, expr) => p.page.evaluate(expr);
  const openOnline = async (p) => { await p.page.tap('#btnMenu'); await p.page.tap('#btnOnline'); await p.page.waitForFunction(() => document.getElementById('onlineDlg').open); };
  // đi một nước hợp lệ bất kỳ (ưu tiên nước do máy chọn) bằng đúng đường đi của người chơi
  const play = (p) => p.page.evaluate(() => {
    const { Eng, tryMove, G } = window.__cotuong;
    const r = Eng.search(G.pos[G.pos.length - 1], (G.first + G.moves.length) & 1, { maxDepth: 2, timeMs: 40 });
    return tryMove(r.mv, true);
  });
  const waitMoves = (p, n) => p.page.waitForFunction((n) => window.__cotuong.G.moves.length >= n, n, { timeout: 8000 });

  const A = await player('Nam', '🐲'), B = await player('Bạn', '🐯');

  // ----- tạo phòng và vào phòng -----
  await openOnline(A);
  await A.page.screenshot({ path: out + '/o1-dialog.png' });
  await A.page.tap('#olTabs [data-tab=create]');
  await A.page.tap('#olPanelCreate [data-ol=clockC] [data-v="5"]');
  await A.page.tap('#olCreateBtn');
  await A.page.waitForFunction(() => window.__cotuong.G.online && window.__cotuong.G.online.code);
  const code = await G(A, () => window.__cotuong.G.online.code);
  ok(/^[A-Z0-9]{6}$/.test(code), 'A tạo phòng, mã ' + code);
  await A.page.waitForSelector('#overlay:not([hidden]) .roomcode');
  await A.page.screenshot({ path: out + '/o2-waiting.png' });

  await openOnline(B);
  await B.page.tap('#olTabs [data-tab=join]');
  await B.page.fill('#olCode', code.toLowerCase());
  await B.page.tap('#olJoinBtn');
  await B.page.waitForFunction(() => window.__cotuong.G.online && !window.__cotuong.G.online.waiting, null, { timeout: 8000 });
  await A.page.waitForFunction(() => window.__cotuong.G.online && !window.__cotuong.G.online.waiting, null, { timeout: 8000 });
  ok(true, 'cả hai vào phòng, ván bắt đầu');
  const sides = [await G(A, () => window.__cotuong.G.cfg.human), await G(B, () => window.__cotuong.G.cfg.human)];
  ok(sides[0] === 0 && sides[1] === 1, 'A cầm Trắng, B cầm Đen');
  const oppOfA = await G(A, () => window.__cotuong.G.online.opp);
  ok(oppOfA && oppOfA.nick === 'Bạn' && oppOfA.avatar === '🐯', 'A thấy tên và ảnh của B: ' + JSON.stringify(oppOfA));
  ok(await A.page.locator('.clock').count() === 2 && await B.page.locator('.clock').count() === 2, 'hai bên đều có đồng hồ');
  await A.page.screenshot({ path: out + '/o3-start-A.png' });
  await B.page.screenshot({ path: out + '/o3-start-B.png' });

  // ----- đi quân qua lại -----
  ok(await play(A) === true, 'A đi nước 1'); await waitMoves(B, 1);
  ok(await G(B, () => window.__cotuong.G.moves.length) === 1, 'B nhận được nước 1');
  ok(await G(B, () => window.__cotuong.G.notes[0]) === await G(A, () => window.__cotuong.G.notes[0]), 'hai bên ghi cùng một nước');
  await play(B); await waitMoves(A, 2);
  await play(A); await waitMoves(B, 3);
  await play(B); await waitMoves(A, 4);
  ok(true, 'đi qua lại đến nước 4, hai bên đồng bộ');
  const clk = await G(A, () => window.__cotuong.G.clock.t.map((x) => Math.round(x / 1000)));
  ok(clk[0] <= 300 && clk[0] > 280 && clk[1] <= 300 && clk[1] > 280, 'đồng hồ đúng khoảng 5:00 trừ thời gian đã dùng: ' + clk);

  // B không đi được khi chưa tới lượt
  ok(await G(B, () => window.__cotuong.G.moves.length) === 4, 'B có 4 nước trong ván');
  // ----- trò chuyện -----
  await A.page.tap('#olChat');
  await A.page.locator('#chatList [data-k="1"]').tap();
  await B.page.waitForFunction(() => /Chúc bạn chơi vui/.test(document.getElementById('toast').textContent), null, { timeout: 5000 });
  ok(true, 'B nhận câu nói "Chúc bạn chơi vui!"');

  // ----- xin hòa -> B đồng ý -----
  await A.page.tap('#olDraw');
  await B.page.waitForFunction(() => document.getElementById('confirmDlg').open, null, { timeout: 5000 });
  await B.page.screenshot({ path: out + '/o4-offer.png' });
  await B.page.tap('#cfYes');
  await A.page.waitForFunction(() => window.__cotuong.G.over, null, { timeout: 5000 });
  await B.page.waitForFunction(() => window.__cotuong.G.over, null, { timeout: 5000 });
  const ra = await G(A, () => window.__cotuong.G.over), rb = await G(B, () => window.__cotuong.G.over);
  ok(ra.winner === null && rb.winner === null, 'cả hai thấy kết quả hòa');
  await A.page.waitForTimeout(400);
  await A.page.screenshot({ path: out + '/o5-draw.png' });
  const pa = await G(A, () => window.__cotuong.PF.online);
  ok(pa.games === 1 && pa.d === 1, 'A được ghi 1 ván online hòa');

  // ----- ván 2: thoát, vào lại, B xin thua -----
  await A.page.locator('#overlay [data-ov="exit"]').tap();
  await B.page.locator('#overlay [data-ov="exit"]').tap();
  await A.page.waitForFunction(() => !window.__cotuong.G.online);
  ok(true, 'thoát ván online, quay về ván cũ');
  await openOnline(A); await A.page.tap('#olTabs [data-tab=create]'); await A.page.tap('#olCreateBtn');
  await A.page.waitForFunction(() => window.__cotuong.G.online && window.__cotuong.G.online.code);
  const code2 = await G(A, () => window.__cotuong.G.online.code);
  await openOnline(B); await B.page.tap('#olTabs [data-tab=join]'); await B.page.fill('#olCode', code2); await B.page.tap('#olJoinBtn');
  await B.page.waitForFunction(() => window.__cotuong.G.online && !window.__cotuong.G.online.waiting, null, { timeout: 8000 });
  await A.page.waitForFunction(() => window.__cotuong.G.online && !window.__cotuong.G.online.waiting, null, { timeout: 8000 });
  await play(A); await waitMoves(B, 1);
  await play(B); await waitMoves(A, 2);

  // tải lại trang của B: tự vào lại ván đang chơi
  await B.page.reload();
  await B.page.waitForSelector('#board .piece');
  await B.page.waitForFunction(() => window.__cotuong.G.online && window.__cotuong.G.moves.length === 2, null, { timeout: 12000 });
  ok(true, 'B tải lại trang vẫn trở về ván đang chơi (2 nước)');
  await play(A); await waitMoves(B, 3);
  await B.page.tap('#olResign'); await B.page.tap('#cfYes');
  await A.page.waitForFunction(() => window.__cotuong.G.over, null, { timeout: 6000 });
  await B.page.waitForFunction(() => window.__cotuong.G.over, null, { timeout: 6000 });
  const ov = await G(A, () => window.__cotuong.G.over);
  ok(ov.winner === 0, 'B xin thua thì A (Trắng) thắng: ' + ov.text);
  await A.page.waitForTimeout(300);
  const a2 = await G(A, () => ({ o: window.__cotuong.PF.online })), b2 = await G(B, () => ({ o: window.__cotuong.PF.online }));
  ok(a2.o.w === 1 && a2.o.rating > 1000, `A thắng online, điểm tăng: ${a2.o.rating}`);
  ok(b2.o.l === 1 && b2.o.rating < 1000, `B thua online, điểm giảm: ${b2.o.rating}`);
  await A.page.screenshot({ path: out + '/o6-win.png' });
  await A.page.locator('#overlay [data-ov="exit"]').tap();
  await B.page.locator('#overlay [data-ov="exit"]').tap();

  // ----- bảng xếp hạng -----
  await openOnline(A); await A.page.tap('#olTabs [data-tab=board]');
  await A.page.waitForSelector('#olBoardList .lb-row');
  const rows = await A.page.locator('#olBoardList .lb-row .nm').allTextContents();
  ok(rows.includes('Nam') && rows.includes('Bạn'), 'bảng xếp hạng có cả hai: ' + rows.join(', '));
  await A.page.screenshot({ path: out + '/o7-board.png' });
  await A.page.evaluate(() => document.getElementById('onlineDlg').close());

  // ----- ghép nhanh -----
  const C = await player('Cường', '🦁'), D = await player('Dũng', '🦊');
  await openOnline(C); await C.page.tap('#olQuickBtn');
  await openOnline(D); await D.page.tap('#olQuickBtn');
  await C.page.waitForFunction(() => window.__cotuong.G.online, null, { timeout: 30000 });
  await D.page.waitForFunction(() => window.__cotuong.G.online, null, { timeout: 30000 });
  await C.page.waitForFunction(() => window.__cotuong.G.online && !window.__cotuong.G.online.waiting, null, { timeout: 15000 });
  await D.page.waitForFunction(() => window.__cotuong.G.online && !window.__cotuong.G.online.waiting, null, { timeout: 15000 });
  const qc = await G(C, () => window.__cotuong.G.cfg.human), qd = await G(D, () => window.__cotuong.G.cfg.human);
  const codeC = await G(C, () => window.__cotuong.G.online.code), codeD = await G(D, () => window.__cotuong.G.online.code);
  ok(codeC === codeD && qc !== qd, `ghép nhanh: cùng phòng ${codeC}, khác bên (${qc},${qd})`);
  await C.page.screenshot({ path: out + '/o8-quick.png' });

  console.log(`   (luật Firebase từ chối ${mock.log.filter((l) => !l.allowed).length} lần trong cả bài thử)`);
  console.log(errors.length ? 'LỖI TRÌNH DUYỆT:\n' + errors.join('\n') : 'Không có lỗi trình duyệt');
  await browser.close(); mock.close();
  process.exit(errors.length || fails ? 1 : 0);
})().catch((e) => { console.error('Lỗi:', e); process.exit(1); });
