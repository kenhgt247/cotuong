// Số người trên màn hình chọn, giờ cao điểm, thông báo có người chờ, tìm đối thủ chạy nền, chia sẻ lời mời
const { chromium } = require('/opt/node-tools/node_modules/playwright');
const startMock = require('../tools/mock-firebase.js');
const createNet = require('../src/online.js');
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
  const errors = [], dialogs = [];
  async function player(nick, avatar, opts) {
    const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
    await ctx.addInitScript(([c, nick, avatar]) => {
      window.__ONLINE_CONFIG = c; window.__QUICK_HINT_MS = 2000; window.__QUICK_BG_MS = 3000; window.__WATCH_MS = 2000;
      if (!localStorage.getItem('cotuong.profile')) localStorage.setItem('cotuong.profile', JSON.stringify({ setup: true, name: nick, nick, avatar }));
    }, [cfg, nick, avatar]);
    const page = await ctx.newPage();
    page.on('pageerror', (e) => errors.push(nick + ' pageerror: ' + e.message));
    page.on('console', (m) => { if (m.type() === 'error' && !/Failed to load resource/.test(m.text())) errors.push(nick + ' console: ' + m.text()); });
    page.on('dialog', (d) => { dialogs.push(d.message()); d.dismiss().catch(() => {}); });
    await page.goto(url);
    await page.waitForFunction(() => document.getElementById('homeDlg').open);
    return { ctx, page };
  }
  const inRoom = (p) => p.page.waitForFunction(() => window.__cotuong.G.online && !window.__cotuong.G.online.waiting, null, { timeout: 30000 });

  // ===== 1 + 5: số người trên thẻ "Chơi online" và biểu đồ giờ cao điểm =====
  global.self = global;
  for (let i = 0; i < 4; i++) { const ls = {}; global.localStorage = { getItem: (k) => ls[k] || null, setItem: (k, v) => { ls[k] = String(v); } }; const n = createNet(cfg); await n.markActive(); }
  const A = await player('Nam', '🐲');
  await A.page.waitForFunction(() => /người online/.test(document.getElementById('homePresence').textContent), null, { timeout: 12000 });
  const hp = await A.page.textContent('#homePresence');
  ok(/1 người online/.test(hp) && /0 đang chờ/.test(hp), 'thẻ "Chơi online" hiện số người: ' + hp);
  await A.page.screenshot({ path: out + '/iv1-home-count.png' });
  await A.page.click('#homeOnline');
  await A.page.waitForSelector('#olPeak:not([hidden])', { timeout: 12000 });
  const pk = await A.page.textContent('#olPeakText');
  ok(/Thường đông người nhất lúc \d+h–\d+h/.test(pk), 'hiện giờ cao điểm: ' + pk);
  ok(await A.page.locator('#olPeakBars i').count() === 24, 'biểu đồ có 24 cột giờ');
  await A.page.waitForSelector('#olEmpty:not([hidden])');
  ok(/Thường đông người nhất lúc/.test(await A.page.textContent('#olEmptyText')), 'khung "chưa có ai" cũng nhắc giờ vàng');
  await A.page.screenshot({ path: out + '/iv2-gio-cao-diem.png' });

  // ===== 4: lời mời chia sẻ =====
  await A.page.tap('#olTabs [data-tab=create]'); await A.page.tap('#olCreateBtn');
  await A.page.waitForSelector('#overlay:not([hidden]) .roomcode');
  const btnTexts = await A.page.locator('#overlay .row button').allTextContents();
  ok(btnTexts.some((x) => /Zalo/.test(x)) && btnTexts.some((x) => /Facebook/.test(x)) && btnTexts.some((x) => /Sao chép lời mời/.test(x)), 'nút mời: ' + btnTexts.join(' | '));
  const code = await A.page.evaluate(() => window.__cotuong.G.online.code);
  await A.page.screenshot({ path: out + '/iv3-moi-ban.png' });
  dialogs.length = 0;
  await A.page.locator('#overlay [data-ov="copy"]').tap();
  await A.page.waitForTimeout(500);
  const toastTxt = await A.page.textContent('#toast');
  ok(/Đã sao chép lời mời/.test(toastTxt) || dialogs.some((d) => d.includes(code)), 'sao chép lời mời có mã phòng ' + code);
  await A.ctx.close(); mock.reset();

  // ===== 3: thông báo có người chờ ghép =====
  const E = await player('Em', '🦊');
  await E.page.evaluate(() => document.getElementById('homeDlg').close());
  const F = await player('Phú', '🐯');
  await F.page.click('#homeOnline'); await F.page.waitForSelector('#olOn:not([hidden])');
  await F.page.tap('#olQuickBtn');
  await E.page.waitForSelector('#banner:not([hidden])', { timeout: 15000 });
  const bn = await E.page.textContent('#bnText');
  ok(/đang chờ chơi online/.test(bn), 'E nhận thông báo: ' + bn);
  await E.page.screenshot({ path: out + '/iv4-thong-bao.png' });
  await E.page.tap('#bnGo');
  await inRoom(E); await inRoom(F);
  const ce = await E.page.evaluate(() => window.__cotuong.G.online.code), cf = await F.page.evaluate(() => window.__cotuong.G.online.code);
  ok(ce === cf, 'bấm "Vào chơi" trên thông báo thì ghép với người chờ, cùng phòng ' + ce);
  await E.ctx.close(); await F.ctx.close(); mock.reset();

  // ===== 2: vừa chờ vừa chơi với máy, có người vào thì báo =====
  const C = await player('Cường', '🦁');
  await C.page.click('#homeOnline'); await C.page.waitForSelector('#olOn:not([hidden])');
  await C.page.tap('#olQuickBtn');
  await C.page.waitForFunction(() => document.getElementById('confirmDlg').open && /Chưa có ai vào/.test(document.getElementById('cfTitle').textContent), null, { timeout: 15000 });
  await C.page.screenshot({ path: out + '/iv5-choi-voi-may.png' });
  await C.page.tap('#cfYes');
  await C.page.waitForFunction(() => document.getElementById('newDlg').open);
  await C.page.tap('#startBtn');
  await C.page.waitForFunction(() => !document.getElementById('newDlg').open);
  await C.page.waitForFunction(() => !document.getElementById('bgPill').hidden, null, { timeout: 5000 });
  ok(true, 'chơi với máy trong lúc chờ, có nhãn "Đang chờ đối thủ online…"');
  await C.page.screenshot({ path: out + '/iv6-cho-nen.png' });
  const D = await player('Dũng', '🐼');
  await D.page.click('#homeOnline'); await D.page.waitForSelector('#olOn:not([hidden])');
  await D.page.tap('#olQuickBtn');
  await C.page.waitForFunction(() => document.getElementById('confirmDlg').open && /(Có người muốn chơi|Đã có người chờ)/.test(document.getElementById('cfTitle').textContent), null, { timeout: 25000 });
  await C.page.screenshot({ path: out + '/iv7-co-nguoi-vao.png' });
  await C.page.tap('#cfYes');
  await inRoom(C); await inRoom(D);
  const cc = await C.page.evaluate(() => window.__cotuong.G.online.code), cd = await D.page.evaluate(() => window.__cotuong.G.online.code);
  ok(cc === cd, 'đang chơi máy mà có người vào: xác nhận là vào cùng phòng ' + cc);
  // thoát ván online -> quay lại ván với máy đang dở
  await C.page.tap('#olExit'); await C.page.waitForFunction(() => document.getElementById('confirmDlg').open); await C.page.tap('#cfYes');
  await C.page.waitForFunction(() => !window.__cotuong.G.online && window.__cotuong.G.cfg.mode === 'ai', null, { timeout: 8000 });
  ok(true, 'thoát ván online thì quay lại ván chơi với máy đang dở');
  await C.ctx.close(); await D.ctx.close();

  console.log(errors.length ? 'LỖI TRÌNH DUYỆT:\n' + errors.join('\n') : 'Không có lỗi trình duyệt');
  await browser.close(); mock.close();
  process.exit(errors.length || fails ? 1 : 0);
})().catch((e) => { console.error('Lỗi:', e); process.exit(1); });
