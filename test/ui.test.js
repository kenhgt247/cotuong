// Kiểm thử giao diện bằng Chromium không đầu (Playwright)
const { chromium } = require('/opt/node-tools/node_modules/playwright');
const path = require('path');
const out = process.argv[2] || '/tmp/ui-shots';
require('fs').mkdirSync(out, { recursive: true });
const url = 'file://' + path.resolve(__dirname, '../co-tuong.html');

(async () => {
  const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium', args: ['--no-sandbox'] });
  const errors = [];
  const ctx = await browser.newContext({ viewport: { width: 1200, height: 900 } });
  const page = await ctx.newPage();
  page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
  page.on('console', (m) => { if (m.type() === 'error') errors.push('console: ' + m.text()); });
  await page.goto(url);
  await page.waitForSelector('#board .piece');
  await page.screenshot({ path: out + '/1-start.png' });

  // bấm Pháo 2 bình 5: ô (7,7) -> (7,4)
  const click = async (r, c) => {
    const pt = await page.evaluate(([r, c]) => {
      const svg = document.getElementById('board'), rect = svg.getBoundingClientRect();
      const flipped = window.__cotuong.S.flipped;
      const dc = flipped ? 8 - c : c, dr = flipped ? 9 - r : r;
      const g = window.__cotuong.geom;
      return { x: rect.left + (g.M + dc * g.CELL) * rect.width / g.BW, y: rect.top + (g.M + dr * g.CELL) * rect.height / g.BH };
    }, [r, c]);
    await page.mouse.click(pt.x, pt.y);
  };
  await click(7, 7);
  await page.screenshot({ path: out + '/2-selected.png' });
  await click(7, 4);
  await page.waitForFunction(() => window.__cotuong.G.moves.length >= 2, null, { timeout: 15000 });
  await page.waitForTimeout(500);
  await page.screenshot({ path: out + '/3-after-ai.png' });
  const info = await page.evaluate(() => ({ notes: window.__cotuong.G.notes, status: document.getElementById('status').textContent }));
  console.log('nước đi:', info.notes.join(' | '), '/ trạng thái:', info.status);

  // gợi ý
  await page.click('#btnHint');
  await page.waitForFunction(() => document.getElementById('hintText').textContent.includes('Gợi ý'), null, { timeout: 10000 });
  console.log('gợi ý:', await page.textContent('#hintText'));
  await page.screenshot({ path: out + '/4-hint.png' });

  // đi lại
  await page.click('#btnUndo');
  await page.waitForTimeout(300);
  console.log('sau đi lại, số nước:', await page.evaluate(() => window.__cotuong.G.moves.length));

  // ván mới chơi Đen: bàn cờ lật, máy đi trước
  await page.selectOption('#selSide', '1');
  await page.click('#btnNew');
  await page.waitForFunction(() => window.__cotuong.G.moves.length >= 1, null, { timeout: 15000 });
  await page.waitForTimeout(500);
  await page.screenshot({ path: out + '/5-black.png' });

  // luật chơi + điện thoại
  await page.click('#btnRules');
  await page.screenshot({ path: out + '/6-rules.png' });
  await page.click('#rulesClose');
  await page.setViewportSize({ width: 390, height: 844 });
  await page.waitForTimeout(300);
  await page.screenshot({ path: out + '/7-mobile.png', fullPage: true });

  // tải lại: ván cờ được khôi phục
  const n = await page.evaluate(() => window.__cotuong.G.moves.length);
  await page.reload();
  await page.waitForSelector('#board .piece');
  const n2 = await page.evaluate(() => window.__cotuong.G.moves.length);
  console.log('khôi phục sau khi tải lại:', n, '->', n2);

  console.log(errors.length ? 'LỖI TRÌNH DUYỆT:\n' + errors.join('\n') : 'Không có lỗi trình duyệt');
  await browser.close();
  process.exit(errors.length || n !== n2 ? 1 : 0);
})();
