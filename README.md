# Cờ Tướng – Luyện cờ cùng máy

Game Cờ Tướng chạy hoàn toàn trên trình duyệt, **chơi được khi không có mạng** (PWA), luật theo
*Luật Cờ Tướng* của Liên đoàn Cờ Việt Nam.

- Chơi với máy (4 mức: Dễ, Vừa, Khó, Cao thủ) hoặc 2 người cùng máy
- Gợi ý nước đi, đi lại, xin hòa, xin thua
- Luật đầy đủ: chiếu bí, hết nước đi thì thua, chiếu mãi, bắt mãi, các trường hợp hòa
- Đồng hồ mỗi bên, kéo thả quân, rung khi đi quân, giao diện vừa một màn hình điện thoại
- **Bài tập chiếu hết** (72 bài, 1–3 nước, tự tạo và kiểm tra bằng `tools/gen-puzzles.js`)
- **Lưu ván đã chơi**, xem lại từng nước, **phân tích ván** (máy chỉ ra nước sai và nước tốt hơn)
- Ghi nước đi kiểu Việt Nam ("Pháo 2 bình 5"), hiển thị tên quân bằng chữ Hán hoặc tiếng Việt

## Cấu trúc

| Thư mục / file | Nội dung |
| --- | --- |
| `src/engine.js` | Luật cờ + máy đánh cờ (dùng chung cho giao diện và Web Worker) |
| `src/app.js`, `src/style.css`, `src/template.html` | Giao diện |
| `pwa/` | `manifest.webmanifest`, `sw.js` (service worker), `make-icons.js` |
| `public/` | **Bản đã build để đưa lên web** (Vercel phục vụ thư mục này) |
| `co-tuong.html` | Bản một file, bấm đúp là chơi được trên máy tính |
| `test/` | Kiểm thử luật, máy đánh cờ, giao diện, PWA |

## Sửa code rồi build lại

```bash
python3 build.py        # ghép src/ -> public/index.html và co-tuong.html
```

Mỗi lần phát hành bản mới, đổi số phiên bản `CACHE` trong `pwa/sw.js` (ví dụ `co-tuong-v2`)
để điện thoại tự cập nhật.

## Đưa lên Vercel

1. Đưa thư mục này lên một repository GitHub.
2. Vào <https://vercel.com/new>, chọn repository đó và bấm **Deploy**.
   Không cần Build Command; `vercel.json` đã chỉ định thư mục `public`.
3. Vercel cấp địa chỉ dạng `ten-du-an.vercel.app`. Mỗi lần push lên GitHub, trang tự cập nhật.

## Chạy thử và kiểm thử (cần Node.js)

```bash
node test/rules.test.js       # perft + đối chiếu với xiangqi.js (cần clone xiangqi.js để so sánh)
node test/perpetual.test.js   # luật chiếu mãi / bắt mãi
```
