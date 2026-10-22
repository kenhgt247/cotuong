#!/usr/bin/env python3
"""Ghép src/ thành public/index.html (để đưa lên web) và co-tuong.html (một file chạy offline)."""
import pathlib

root = pathlib.Path(__file__).parent
src = root / 'src'
tpl = (src / 'template.html').read_text(encoding='utf-8')
engine = (src / 'engine.js').read_text(encoding='utf-8')
engine = engine.replace("if (typeof module !== 'undefined') module.exports = createEngine;", '')
online = (src / 'online-config.js').read_text(encoding='utf-8') + '\n' + (src / 'online.js').read_text(encoding='utf-8').replace("if (typeof module !== 'undefined') module.exports = createNet;", '')
puzzles_file = src / 'puzzles.js'
puzzles = puzzles_file.read_text(encoding='utf-8') if puzzles_file.exists() else 'const PUZZLES = [];'
out = (tpl
       .replace('/*__CSS__*/', (src / 'style.css').read_text(encoding='utf-8'))
       .replace('/*__ENGINE__*/', engine)
       .replace('/*__PUZZLES__*/', puzzles)
       .replace('/*__ONLINE__*/', online)
       .replace('/*__APP__*/', (src / 'app.js').read_text(encoding='utf-8')))
import shutil
pub = root / 'public'
pub.mkdir(exist_ok=True)
(pub / 'index.html').write_text(out, encoding='utf-8')
for f in ('manifest.webmanifest', 'sw.js'):
    shutil.copy(root / 'pwa' / f, pub / f)
# bản một file để mở trực tiếp trên máy (không cần web)
standalone = root / 'co-tuong.html'
standalone.write_text(out, encoding='utf-8')
print(f'Đã tạo {pub / "index.html"} và {standalone} ({standalone.stat().st_size / 1024:.0f} KB)')
