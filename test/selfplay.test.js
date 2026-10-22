// Cho máy đấu máy ngay trong trang để thử luật kết thúc ván / lặp thế, không có lỗi JS
const { chromium } = require('/opt/node-tools/node_modules/playwright');
const path = require('path');
const url = 'file://' + path.resolve(__dirname, '../co-tuong.html');
(async () => {
  const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium', args: ['--no-sandbox'] });
  const page = await (await browser.newContext({ viewport: { width: 1000, height: 900 } })).newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto(url);
  await page.waitForSelector('#board .piece');
  const games = +process.argv[2] || 8;
  const results = await page.evaluate(async (games) => {
    const { Eng, S, tryMove, newGame } = window.__cotuong;
    S.mode = 'pvp';
    const out = [];
    for (let g = 0; g < games; g++) {
      document.getElementById('selMode').value = 'pvp';
      newGame(false);
      let G = window.__cotuong.G, guard = 0;
      while (!G.over && guard++ < 400) {
        const b = G.pos[G.pos.length - 1], t = G.moves.length & 1;
        const lv = g % 2 ? { maxDepth: 2, timeMs: 60, exact: true, margin: 60 } : { maxDepth: 3, timeMs: 80, exact: true, margin: 30 };
        const r = Eng.search(b, t, lv);
        if (!r) break;
        tryMove(r.mv, false);
        G = window.__cotuong.G;
      }
      out.push({ plies: G.moves.length, over: G.over ? G.over.text : '(chưa kết thúc)' });
    }
    return out;
  }, games);
  results.forEach((r, i) => console.log(`ván ${i + 1}: ${r.plies} nước – ${r.over}`));
  console.log(errors.length ? 'LỖI:\n' + errors.join('\n') : 'Không có lỗi JS');
  await browser.close();
  process.exit(errors.length ? 1 : 0);
})();
