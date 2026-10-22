// Tạo biểu tượng ứng dụng (PNG) bằng Chromium: node pwa/make-icons.js
const { chromium } = require('/opt/node-tools/node_modules/playwright');
const path = require('path');
const out = path.resolve(__dirname, '../public/icons');
const page = (size, maskable) => `<!doctype html><meta charset=utf-8><style>
html,body{margin:0;width:${size}px;height:${size}px;overflow:hidden}
body{background:${maskable ? '#b3261e' : 'transparent'};display:flex;align-items:center;justify-content:center}
.bg{width:${size}px;height:${size}px;border-radius:${maskable ? 0 : size * 0.2}px;background:#b3261e;display:flex;align-items:center;justify-content:center}
.disc{width:${size * (maskable ? 0.56 : 0.7)}px;height:${size * (maskable ? 0.56 : 0.7)}px;border-radius:50%;
 background:radial-gradient(circle at 35% 30%,#fff8e1,#e3bf7c);box-shadow:0 ${size * 0.02}px ${size * 0.05}px rgba(0,0,0,.35);
 border:${size * 0.012}px solid #6b4518;display:flex;align-items:center;justify-content:center;position:relative}
.disc::after{content:"";position:absolute;inset:${size * 0.035}px;border-radius:50%;border:${size * 0.01}px solid #c0281d}
.g{font:700 ${size * (maskable ? 0.34 : 0.42)}px "Noto Serif CJK SC","Noto Serif SC","Source Han Serif SC",serif;color:#c0281d;line-height:1}
</style><div class=bg><div class=disc><div class=g>帥</div></div></div>`;
(async () => {
  const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium', args: ['--no-sandbox'] });
  const jobs = [['icon-192.png', 192, false], ['icon-512.png', 512, false], ['maskable-512.png', 512, true], ['apple-touch-icon.png', 180, true]];
  for (const [name, size, mask] of jobs) {
    const p = await browser.newPage({ viewport: { width: size, height: size } });
    await p.setContent(page(size, mask));
    await p.screenshot({ path: path.join(out, name), omitBackground: !mask });
    await p.close();
  }
  await browser.close();
  console.log('Đã tạo biểu tượng trong', out);
})();
