// Thử PWA: chạy public/ qua http, kiểm tra manifest, service worker và chơi khi mất mạng
const { chromium } = require('/opt/node-tools/node_modules/playwright');
const http = require('http'), fs = require('fs'), path = require('path');
const root = path.resolve(__dirname, '../public');
const types = { '.html': 'text/html', '.js': 'text/javascript', '.png': 'image/png', '.webmanifest': 'application/manifest+json' };
const srv = http.createServer((q, r) => {
  let f = path.join(root, q.url.split('?')[0]); if (f.endsWith('/')) f += 'index.html';
  fs.readFile(f, (e, d) => { if (e) { r.writeHead(404); r.end(); } else { r.writeHead(200, { 'Content-Type': types[path.extname(f)] || 'application/octet-stream' }); r.end(d); } });
}).listen(0, async () => {
  const url = 'http://localhost:' + srv.address().port + '/';
  const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium', args: ['--no-sandbox'] });
  const ctx = await browser.newContext({ viewport: { width: 420, height: 900 } });
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto(url);
  await page.waitForSelector('#board .piece');
  const sw = await page.evaluate(async () => { const r = await navigator.serviceWorker.ready; await new Promise((s) => setTimeout(s, 800)); return !!r.active && (await caches.keys()); });
  console.log('service worker hoạt động, cache:', JSON.stringify(sw));
  const man = await page.evaluate(async () => { const m = await (await fetch(document.querySelector('link[rel=manifest]').href)).json(); const ok = []; for (const i of m.icons) ok.push((await fetch(i.src)).status); return { name: m.name, display: m.display, icons: ok }; });
  console.log('manifest:', JSON.stringify(man));
  // mất mạng -> tải lại vẫn chơi được
  await ctx.setOffline(true);
  await page.reload();
  await page.waitForSelector('#board .piece');
  console.log('offline: trang tải lại được, số quân =', await page.locator('#board .piece').count());
  // tên quân tiếng Việt
  await page.selectOption('#selStyle', 'vi');
  await page.waitForTimeout(200);
  await page.screenshot({ path: '/tmp/ui-shots/8-vi-names.png' });
  console.log(errors.length ? 'LỖI: ' + errors.join('\n') : 'Không có lỗi JS');
  await browser.close(); srv.close();
  process.exit(errors.length ? 1 : 0);
});
