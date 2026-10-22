// Kiểm thử giao diện (điện thoại + máy tính) bằng Chromium không đầu
const { chromium } = require('/opt/node-tools/node_modules/playwright');
const path = require('path');
const out = process.argv[2] || '/tmp/ui-shots';
require('fs').mkdirSync(out, { recursive: true });
const url = 'file://' + path.resolve(__dirname, '../public/index.html');
let fails = 0;
const ok = (c, m) => { console.log(c ? 'ok  :' : 'FAIL:', m); if (!c) fails++; };

(async () => {
  const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium', args: ['--no-sandbox'] });
  const errors = [];
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
  await ctx.addInitScript(() => { if (!localStorage.getItem('cotuong.profile')) localStorage.setItem('cotuong.profile', JSON.stringify({ setup: true, name: 'Bùi Văn Bảo Nam', nick: 'Nam', avatar: '🐲' })); });
  const page = await ctx.newPage();
  page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
  page.on('console', (m) => { if (m.type() === 'error') errors.push('console: ' + m.text()); });
  await page.goto(url);
  await page.waitForSelector('#board .piece');
  await page.waitForFunction(() => document.getElementById('newDlg').open);
  await page.screenshot({ path: out + '/m1-newgame.png' });

  await page.click('#newDlg [data-key=level] [data-v="1"]');
  await page.click('#startBtn');
  await page.waitForFunction(() => !document.getElementById('newDlg').open);

  // vị trí màn hình của một ô
  const where = (r, c) => page.evaluate(([r, c]) => {
    const svg = document.getElementById('board'), g = window.__cotuong.geom;
    const flipped = window.__cotuong.S.flipped;
    const dc = flipped ? 8 - c : c, dr = flipped ? 9 - r : r;
    const pt = svg.createSVGPoint(); pt.x = g.M + dc * g.CELL; pt.y = g.M + dr * g.CELL;
    const s = pt.matrixTransform(svg.getScreenCTM());
    return { x: s.x, y: s.y, k: svg.getScreenCTM().a };
  }, [r, c]);

  // 1) bấm quân rồi bấm ô đến bằng cảm ứng: Pháo 2 bình 5
  let p = await where(7, 7); await page.touchscreen.tap(p.x, p.y);
  await page.screenshot({ path: out + '/m2-selected.png' });
  p = await where(7, 4); await page.touchscreen.tap(p.x, p.y);
  await page.waitForFunction(() => window.__cotuong.G.moves.length >= 2, null, { timeout: 15000 });
  await page.waitForTimeout(400);
  ok(await page.evaluate(() => window.__cotuong.G.notes[0]) === 'Pháo 2 bình 5', 'bấm-bấm bằng cảm ứng: ' + await page.evaluate(() => window.__cotuong.G.notes.join(' | ')));

  // 2) kéo thả bằng cảm ứng thật (CDP): Mã 8 tiến 7 = (9,1) -> (7,2)
  const cdp = await ctx.newCDPSession(page);
  const from = await where(9, 1), to = await where(7, 2);
  const lift = 34 * to.k; // quân được nhấc lên 34 đơn vị so với ngón tay
  const touch = (type, x, y) => cdp.send('Input.dispatchTouchEvent', { type, touchPoints: type === 'touchEnd' ? [] : [{ x, y }] });
  await touch('touchStart', from.x, from.y);
  for (let i = 1; i <= 8; i++) { await touch('touchMove', from.x + (to.x - from.x) * i / 8, from.y + (to.y + lift - from.y) * i / 8); await page.waitForTimeout(16); }
  await page.screenshot({ path: out + '/m3-dragging.png' });
  await touch('touchEnd');
  await page.waitForFunction(() => window.__cotuong.G.moves.length >= 3, null, { timeout: 15000 });
  ok(await page.evaluate(() => window.__cotuong.G.notes[2]) === 'Mã 8 tiến 7', 'kéo thả bằng cảm ứng: ' + await page.evaluate(() => window.__cotuong.G.notes[2]));
  await page.waitForFunction(() => window.__cotuong.G.moves.length >= 4, null, { timeout: 15000 });
  await page.waitForTimeout(500);

  // 3) bố cục: không cuộn, bàn cờ và thanh nút nằm gọn trong màn hình
  const lay = await page.evaluate(() => {
    const r = (id) => document.getElementById(id).getBoundingClientRect();
    return { sw: document.documentElement.scrollWidth, sh: document.documentElement.scrollHeight, iw: innerWidth, ih: innerHeight, board: r('board'), bar: r('actionbar') };
  });
  ok(lay.sw <= lay.iw && lay.sh <= lay.ih, `không cuộn trang (${lay.sw}x${lay.sh} / ${lay.iw}x${lay.ih})`);
  ok(lay.bar.bottom <= lay.ih && lay.board.width > 340, `thanh nút trong màn hình, bàn cờ rộng ${Math.round(lay.board.width)}px`);
  await page.screenshot({ path: out + '/m4-playing.png' });

  // 4) menu kéo lên
  await page.tap('#btnMenu');
  await page.waitForTimeout(400);
  await page.screenshot({ path: out + '/m5-menu.png' });
  await page.tap('#sheetBackdrop', { position: { x: 200, y: 60 } });
  await page.waitForTimeout(350);

  // 5) đồng hồ + tên quân tiếng Việt
  await page.evaluate(() => { window.__cotuong.S.pieceStyle = 'vi'; window.__cotuong.S.clock = 5; window.__cotuong.newGame(); });
  await page.waitForTimeout(600);
  ok(await page.locator('.clock').count() === 2, 'đồng hồ hiển thị cho cả hai bên');
  await page.screenshot({ path: out + '/m6-clock-vi.png' });

  // 6) nằm ngang
  await page.setViewportSize({ width: 844, height: 390 });
  await page.waitForTimeout(400);
  await page.screenshot({ path: out + '/m7-landscape.png' });

  // 7) máy tính
  const d = await browser.newContext({ viewport: { width: 1280, height: 860 } });
  await d.addInitScript(() => localStorage.setItem('cotuong.profile', JSON.stringify({ setup: true, name: 'Bùi Văn Bảo Nam', nick: 'Nam', avatar: '🐲' })));
  const dp = await d.newPage();
  dp.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
  await dp.goto(url); await dp.waitForSelector('#board .piece');
  await dp.waitForFunction(() => document.getElementById('newDlg').open);
  await dp.click('#startBtn');
  await dp.waitForTimeout(500);
  await dp.screenshot({ path: out + '/d1-desktop.png' });

  console.log(errors.length ? 'LỖI TRÌNH DUYỆT:\n' + errors.join('\n') : 'Không có lỗi trình duyệt');
  await browser.close();
  process.exit(errors.length || fails ? 1 : 0);
})();
