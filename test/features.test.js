// Kiểm thử bài tập, lưu ván + xem lại, phân tích ván (giao diện điện thoại)
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
  await page.screenshot({ path: out + '/f0-dedication.png' });
  await page.click('#newDlg [data-key=mode] [data-v="pvp"]');
  await page.click('#startBtn');
  await page.waitForFunction(() => !document.getElementById('newDlg').open);

  // ---- chơi 16 nước (máy đánh cả hai bên), rồi xin thua để kết thúc ván ----
  await page.evaluate(() => {
    const { Eng, tryMove } = window.__cotuong;
    for (let i = 0; i < 16; i++) {
      const G = window.__cotuong.G;
      const r = Eng.search(G.pos[G.pos.length - 1], G.moves.length & 1, { maxDepth: 2, timeMs: 60, exact: true, margin: 80 });
      tryMove(r.mv, false);
    }
  });
  await page.tap('#btnMenu');
  await page.tap('#btnResign');
  await page.tap('#cfYes');
  await page.waitForFunction(() => window.__cotuong.G.over);
  ok(await page.evaluate(() => window.__cotuong.loadArchive().length) === 1, 'ván đã được lưu vào danh sách');

  // ---- phân tích ----
  await page.waitForTimeout(300);
  await page.evaluate(() => window.__cotuong.openAnalysis());
  await page.waitForFunction(() => document.querySelector('#analysisBody .an-sum'), null, { timeout: 90000 });
  await page.screenshot({ path: out + '/f1-analysis.png' });
  const an = await page.evaluate(() => ({ g: window.__cotuong.G.analysis.grade.length, acc: document.querySelectorAll('.an-sum b').length }));
  ok(an.g === 16 && an.acc === 2, `phân tích đủ ${an.g} nước, có độ chính xác 2 bên`);
  const hasBad = await page.locator('.an-item').count();
  if (hasBad) { await page.locator('.an-item').first().tap(); await page.waitForTimeout(300); ok(await page.evaluate(() => window.__cotuong.G.view !== null), 'bấm vào sai lầm để xem thế cờ'); await page.screenshot({ path: out + '/f2-viewmistake.png' }); }
  else { await page.tap('#analysisDlg [data-close]'); }

  // ---- xem lại ván đã lưu ----
  await page.evaluate(() => { const G = window.__cotuong.G; if (G.view !== null) document.getElementById('vbDone').click(); });
  await page.tap('#btnMenu');
  await page.tap('#btnGames');
  await page.waitForSelector('#gamesList .grow');
  await page.screenshot({ path: out + '/f3-games.png' });
  await page.locator('#gamesList [data-act=view]').first().tap();
  await page.waitForFunction(() => window.__cotuong.G.kind === 'replay');
  ok(await page.evaluate(() => window.__cotuong.G.view) === 0, 'mở xem lại ở nước 0');
  await page.tap('#vbNext'); await page.tap('#vbNext'); await page.tap('#vbNext');
  ok(await page.evaluate(() => window.__cotuong.G.view) === 3, 'bấm ▶ 3 lần -> nước 3');
  await page.tap('#vbPrev');
  ok(await page.evaluate(() => window.__cotuong.G.view) === 2, 'bấm ◀ -> nước 2');
  await page.screenshot({ path: out + '/f4-replay.png' });
  await page.tap('#vbDone');
  await page.waitForFunction(() => window.__cotuong.G.kind === 'game');
  ok(true, 'thoát xem lại, quay về ván cũ');

  // ---- bài tập ----
  const npz = await page.evaluate(() => PUZZLES.length);
  ok(npz >= 30, `có ${npz} bài tập`);
  await page.tap('#btnMenu'); await page.tap('#btnTrain2');
  await page.waitForSelector('#puzzlesList .pz-tile');
  await page.screenshot({ path: out + '/f5-puzzles.png' });
  await page.locator('#puzzlesList .pz-tile').first().tap();
  await page.waitForFunction(() => window.__cotuong.G.kind === 'puzzle');
  await page.screenshot({ path: out + '/f6-puzzle1.png' });
  // nước sai trước
  const wrong = await page.evaluate(() => {
    const { Eng, G, tryMove } = window.__cotuong;
    const st = Eng.newState(Int8Array.from(G.pos[0]));
    const good = Eng.mateMoves(st, G.puzzle.att, 1, true);
    const bad = Eng.genLegal(st, G.puzzle.att).find((m) => !good.includes(m));
    const r = tryMove(bad, true);
    return { r, errors: window.__cotuong.G.puzzle.errors, moves: window.__cotuong.G.moves.length };
  });
  ok(wrong.r === false && wrong.errors === 1 && wrong.moves === 0, 'nước sai bị từ chối, đếm lỗi');
  await page.evaluate(() => {
    const { Eng, G, tryMove } = window.__cotuong;
    const good = Eng.mateMoves(Eng.newState(Int8Array.from(G.pos[0])), G.puzzle.att, 1, true);
    tryMove(good[0], true);
  });
  await page.waitForFunction(() => window.__cotuong.G.puzzle.solved);
  ok(await page.evaluate(() => window.__cotuong.G.puzzle.stars) === 2, 'giải đúng, sai 1 lần -> 2 sao');
  await page.waitForTimeout(400);
  await page.screenshot({ path: out + '/f7-solved.png' });

  // giải trọn vẹn bài chiếu hết 2 và 3 nước bằng cách dùng nước đúng, để chắc chắn bộ dữ liệu giải được
  const all = await page.evaluate(async () => {
    const { Eng } = window.__cotuong;
    let okc = 0, bad = [];
    for (const p of PUZZLES) {
      window.__cotuong.startPuzzle(p.id);
      let G = window.__cotuong.G, guard = 0;
      while (!G.puzzle.solved && guard++ < 6) {
        while (G.busy) await new Promise((r) => setTimeout(r, 50));
        const good = Eng.mateMoves(Eng.newState(Int8Array.from(G.pos[G.pos.length - 1])), G.puzzle.att, G.puzzle.left, true);
        if (!good.length) break;
        window.__cotuong.tryMove(good[0], true);
        G = window.__cotuong.G;
      }
      if (G.puzzle.solved) okc++; else bad.push(p.id);
    }
    return { okc, bad };
  });
  ok(all.bad.length === 0, `tất cả ${all.okc}/${npz} bài tập giải được (${all.bad.join(',')})`);

  console.log(errors.length ? 'LỖI TRÌNH DUYỆT:\n' + errors.join('\n') : 'Không có lỗi trình duyệt');
  await browser.close();
  process.exit(errors.length || fails ? 1 : 0);
})();
