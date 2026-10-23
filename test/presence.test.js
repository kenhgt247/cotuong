// Số người online, phòng chờ trống và gợi ý mời bạn / chơi offline
const { chromium } = require('/opt/node-tools/node_modules/playwright');
const startMock = require('../tools/mock-firebase.js');
const path = require('path');
const out = process.argv[2] || '/tmp/ui-shots';
require('fs').mkdirSync(out, { recursive: true });
const url = 'file://' + path.resolve(__dirname, '../public/index.html');
let fails = 0;
const ok = (c, m) => { console.log(c ? 'ok  :' : 'FAIL:', m); if (!c) fails++; };

(async () => {
  const mock = await startMock(0);
  const cfg = { apiKey: 'k', databaseURL: mock.url, authURL: mock.url + '/identitytoolkit', tokenURL: mock.url + '/securetoken' };
  const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium', args: ['--no-sandbox'] });
  const errors = [];
  async function player(nick, avatar) {
    const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
    await ctx.addInitScript(([c, nick, avatar]) => {
      window.__ONLINE_CONFIG = c; window.__QUICK_HINT_MS = 2500;
      if (!localStorage.getItem('cotuong.profile')) localStorage.setItem('cotuong.profile', JSON.stringify({ setup: true, name: nick, nick, avatar }));
    }, [cfg, nick, avatar]);
    const page = await ctx.newPage();
    page.on('pageerror', (e) => errors.push(nick + ' pageerror: ' + e.message));
    page.on('console', (m) => { if (m.type() === 'error' && !/Failed to load resource/.test(m.text())) errors.push(nick + ' console: ' + m.text()); });
    await page.goto(url);
    await page.waitForFunction(() => document.getElementById('homeDlg').open);
    return { ctx, page };
  }
  const A = await player('Nam', '🐲');
  await A.page.click('#homeOnline');
  await A.page.waitForSelector('#olPresence .pill.on', { timeout: 10000 });
  await A.page.waitForSelector('#olEmpty:not([hidden])', { timeout: 10000 });
  const t1 = await A.page.textContent('#olPresence');
  ok(/1 người đang online/.test(t1) && /0 người đang chờ/.test(t1), 'chỉ một mình: ' + t1.replace(/\s+/g, ' '));
  ok(/chưa có ai khác đang chờ/i.test(await A.page.textContent('#olEmptyText')), 'hiện gợi ý khi chưa có ai chờ');
  ok(await A.page.locator('#olInvite').isVisible() && await A.page.locator('#olGoOffline').isVisible(), 'có nút "Mời bạn bè" và "Chơi offline"');
  await A.page.screenshot({ path: out + '/pr1-trong.png' });

  // người thứ hai vào hàng chờ
  const B = await player('Bạn', '🦁');
  await B.page.evaluate(() => document.getElementById('homeDlg').close());
  await B.page.tap('#btnMenu'); await B.page.tap('#btnOnline');
  await B.page.waitForSelector('#olOn:not([hidden])');
  await B.page.waitForSelector('#olPresence .pill.on', { timeout: 10000 });
  await A.page.waitForFunction(() => /2 người đang online/.test(document.getElementById('olPresence').textContent), null, { timeout: 12000 });
  ok(true, 'A thấy 2 người đang online khi B mở phần online');
  // B tìm đối thủ nhưng chưa ai ghép (A chưa bấm) -> B thấy gợi ý sau 2.5 giây
  await B.page.tap('#olQuickBtn');
  await A.page.waitForFunction(() => /1 người đang chờ/.test(document.getElementById('olPresence').textContent), null, { timeout: 12000 });
  ok(await A.page.locator('#olEmpty').isHidden(), 'A thấy có 1 người chờ nên không còn gợi ý "chưa có ai"');
  ok(/Có 1 người đang chờ/.test(await A.page.textContent('#olQuickInfo')), 'A được mời bấm "Tìm đối thủ": ' + await A.page.textContent('#olQuickInfo'));
  await A.page.screenshot({ path: out + '/pr2-co-nguoi-cho.png' });
  await A.page.tap('#olQuickBtn');
  await A.page.waitForFunction(() => window.__cotuong.G.online && !window.__cotuong.G.online.waiting, null, { timeout: 25000 });
  await B.page.waitForFunction(() => window.__cotuong.G.online && !window.__cotuong.G.online.waiting, null, { timeout: 25000 });
  ok(true, 'A bấm tìm là ghép được với B ngay');
  await A.ctx.close(); await B.ctx.close();

  // một mình chờ lâu -> gợi ý, bấm "Chơi offline"
  const C = await player('Cường', '🦊');
  await C.page.click('#homeOnline');
  await C.page.waitForSelector('#olPresence .pill.on', { timeout: 10000 });
  await C.page.tap('#olQuickBtn');
  await C.page.waitForFunction(() => !document.getElementById('olEmpty').hidden && /Chưa tìm thấy đối thủ/.test(document.getElementById('olEmptyText').textContent), null, { timeout: 12000 });
  ok(true, 'đang tìm mà lâu thì hiện "Chưa tìm thấy đối thủ" kèm gợi ý');
  ok(await C.page.locator('#olQuickWait').isVisible(), 'vẫn đang tìm trong lúc hiện gợi ý');
  await C.page.screenshot({ path: out + '/pr3-cho-lau.png' });
  await C.page.tap('#olGoOffline');
  await C.page.waitForFunction(() => document.getElementById('newDlg').open && !document.getElementById('onlineDlg').open, null, { timeout: 8000 });
  ok(true, 'bấm "Chơi offline" thì dừng tìm và mở màn hình chơi với máy');
  await C.page.waitForTimeout(800);
  const queue = mock.dump().queue || {};
  ok(Object.keys(queue).length === 0, 'đã rời hàng chờ: ' + JSON.stringify(Object.keys(queue)));

  // nút "Mời bạn bè" chuyển sang tạo phòng
  const D = await player('Dũng', '🐯');
  await D.page.click('#homeOnline'); await D.page.waitForSelector('#olEmpty:not([hidden])', { timeout: 10000 });
  await D.page.tap('#olInvite');
  ok(await D.page.locator('#olPanelCreate').isVisible(), 'bấm "Mời bạn bè" thì mở phần tạo phòng');

  console.log(errors.length ? 'LỖI TRÌNH DUYỆT:\n' + errors.join('\n') : 'Không có lỗi trình duyệt');
  await browser.close(); mock.close();
  process.exit(errors.length || fails ? 1 : 0);
})().catch((e) => { console.error('Lỗi:', e); process.exit(1); });
