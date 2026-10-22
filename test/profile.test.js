// Hồ sơ người chơi, thống kê, điểm xếp hạng, huy hiệu
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
  const page = await ctx.newPage();
  page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
  page.on('console', (m) => { if (m.type() === 'error') errors.push('console: ' + m.text()); });
  await page.goto(url);
  await page.waitForFunction(() => document.getElementById('profileDlg').open);
  await page.screenshot({ path: out + '/p1-welcome.png' });

  // bỏ trống thì bị nhắc
  await page.tap('#pfSave');
  ok(await page.evaluate(() => document.getElementById('profileDlg').open), 'chưa nhập tên thì chưa lưu được');
  await page.fill('#pfName', 'Bùi Văn Bảo Nam');
  await page.fill('#pfNick', 'Nam Cờ Tướng');
  await page.locator('#pfAvatars .avb').nth(3).tap();
  await page.tap('#pfSave');
  await page.waitForFunction(() => document.getElementById('newDlg').open, null, { timeout: 5000 });
  ok(true, 'lưu hồ sơ xong thì hiện hộp thoại ván mới');
  ok((await page.textContent('#btnProfile')).includes('Nam Cờ Tướng'), 'biệt danh hiện trên thanh trên cùng');

  // ván với máy mức Vừa, xin thua -> ghi 1 ván thua
  await page.click('#newDlg [data-key=level] [data-v="1"]');
  await page.click('#startBtn');
  await page.evaluate(() => { const { Eng, tryMove } = window.__cotuong; for (let i = 0; i < 6; i++) { const G = window.__cotuong.G; if (G.thinking) break; } });
  await page.evaluate(() => window.__cotuong.G.cfg.human);
  // đi vài nước thật rồi xin thua
  await page.evaluate(async () => {
    const { Eng, tryMove } = window.__cotuong;
    for (let i = 0; i < 3; i++) {
      let G = window.__cotuong.G;
      while (G.thinking) await new Promise((r) => setTimeout(r, 100));
      const r = Eng.search(G.pos[G.pos.length - 1], G.moves.length & 1, { maxDepth: 2, timeMs: 50 });
      tryMove(r.mv, true);
      await new Promise((r2) => setTimeout(r2, 100));
    }
  });
  await page.tap('#btnMenu'); await page.tap('#btnResign'); await page.tap('#cfYes');
  await page.waitForFunction(() => window.__cotuong.G.over);
  const st = await page.evaluate(() => { const p = window.__cotuong.PF; return { games: p.games, l: p.l, rating: p.rating, badges: Object.keys(p.badges) }; });
  ok(st.games === 1 && st.l[1] === 1, 'ghi 1 ván thua ở mức Vừa: ' + JSON.stringify(st.l));
  ok(st.rating < 1000, `điểm xếp hạng giảm sau ván thua: ${st.rating}`);
  ok(st.badges.includes('first'), 'nhận huy hiệu "Ván đầu tiên"');

  // thắng: giả lập thắng 3 ván để thử chuỗi thắng và huy hiệu
  const st2 = await page.evaluate(() => {
    const { recordGame } = window.__cotuong;
    for (let i = 0; i < 3; i++) {
      const g = { kind: 'game', over: { winner: 0, text: 'x' }, moves: new Array(30).fill(0), cfg: { mode: 'ai', human: 0, level: 2 } };
      recordGame(g);
    }
    const p = window.__cotuong.PF; return { w: p.w, rating: p.rating, streak: p.streak, badges: Object.keys(p.badges) };
  });
  ok(st2.w[2] === 3 && st2.streak === 3, 'thắng 3 ván mức Khó: chuỗi ' + st2.streak);
  ok(st2.badges.includes('win_hard') && st2.badges.includes('streak3') && st2.badges.includes('fast'), 'huy hiệu: ' + st2.badges.join(','));
  ok(st2.rating > 1000, `điểm tăng sau khi thắng máy Khó: ${st2.rating}`);

  // xem hồ sơ
  await page.tap('#btnProfile');
  await page.waitForSelector('#pfStats .st-tbl');
  await page.screenshot({ path: out + '/p2-profile.png' });
  await page.tap('#profileDlg [data-close]');

  // tải lại: hồ sơ còn nguyên, không hỏi lại tên
  await page.reload();
  await page.waitForSelector('#board .piece');
  await page.waitForTimeout(700);
  ok(!(await page.evaluate(() => document.getElementById('profileDlg').open)), 'không hỏi lại tên sau khi tải lại');
  ok((await page.textContent('#btnProfile')).includes('Nam Cờ Tướng'), 'hồ sơ còn sau khi tải lại');
  await page.screenshot({ path: out + '/p3-reload.png' });

  console.log(errors.length ? 'LỖI TRÌNH DUYỆT:\n' + errors.join('\n') : 'Không có lỗi trình duyệt');
  await browser.close();
  process.exit(errors.length || fails ? 1 : 0);
})();
