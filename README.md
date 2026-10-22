# Cờ Tướng của Bảo Nam

Game Cờ Tướng chạy trên trình duyệt, cài được như app (PWA), **chơi offline** với máy và **chơi online** qua Firebase.
Luật theo *Luật Cờ Tướng* của Liên đoàn Cờ Việt Nam.

## Tính năng
- **Chơi với máy** (Dễ, Vừa, Khó, Cao thủ) hoặc 2 người cùng máy, đồng hồ mỗi bên, kéo thả quân, gợi ý, đi lại, xin hòa/xin thua
- Luật đầy đủ: chiếu bí, hết nước đi thì thua, chiếu mãi, bắt mãi, các trường hợp hòa
- **Hồ sơ người chơi**: họ và tên, biệt danh, ảnh đại diện; thống kê thắng/thua/hòa theo độ khó; điểm xếp hạng (Elo); huy hiệu
- **Bài tập chiếu hết** (72 bài, 1–3 nước, tự tạo và kiểm tra bằng `tools/gen-puzzles.js`)
- **Lưu ván đã chơi**, xem lại từng nước, **phân tích ván** (máy chỉ ra nước sai và nước tốt hơn)
- **Chơi online**: ghép nhanh, tạo phòng / vào phòng bằng mã hoặc link, bảng xếp hạng, xin hòa, xin thua, nói chuyện bằng câu có sẵn, tự vào lại ván khi tải lại trang
- Ghi nước đi kiểu Việt Nam ("Pháo 2 bình 5"), tên quân bằng chữ Hán hoặc tiếng Việt

## Cấu trúc

| Thư mục / file | Nội dung |
| --- | --- |
| `src/engine.js` | Luật cờ + máy đánh cờ + bộ giải chiếu hết |
| `src/app.js`, `src/style.css`, `src/template.html` | Giao diện và logic game |
| `src/online.js`, `src/online-config.js` | Lớp mạng Firebase (REST + EventSource) và cấu hình |
| `database.rules.json` | Luật bảo mật Firebase Realtime Database |
| `pwa/` | `manifest.webmanifest`, `sw.js`, `make-icons.js` |
| `public/` | **Bản đã build để đưa lên web** (Vercel phục vụ thư mục này) |
| `co-tuong.html` | Bản một file, bấm đúp là chơi được (không có online) |
| `tools/` | `gen-puzzles.js` (tạo bài tập), `mock-firebase.js` (máy chủ giả để thử) |
| `test/` | Kiểm thử luật, máy đánh cờ, giao diện, PWA, luật Firebase, chơi online |

## Sửa code rồi build lại
```bash
python3 build.py        # ghép src/ -> public/index.html và co-tuong.html
```
Mỗi lần phát hành bản mới, đổi số phiên bản `CACHE` trong `pwa/sw.js` (ví dụ `co-tuong-v5`) để điện thoại tự cập nhật.

## Đưa lên Vercel
1. Đưa repo lên GitHub, vào <https://vercel.com/new>, chọn repo và bấm **Deploy**.
2. `vercel.json` đã chỉ thư mục `public`, không cần lệnh build. Mỗi lần push, trang tự cập nhật.

## Bật chơi online (Firebase Realtime Database)
Chơi online cần một dự án Firebase miễn phí (gói Spark là đủ). Làm một lần:

1. Vào <https://console.firebase.google.com> → **Add project** → đặt tên (ví dụ `cotuong-nam`). Có thể tắt Google Analytics.
2. **Build → Realtime Database → Create database**. Chọn vị trí gần nhất (Singapore, `asia-southeast1`), chọn **Start in locked mode**.
3. Trong tab **Rules**, xóa nội dung cũ, dán toàn bộ nội dung file `database.rules.json`, bấm **Publish**.
4. **Build → Authentication → Get started → Sign-in method → Anonymous → Enable → Save**.
5. Lấy hai giá trị cấu hình:
   - `databaseURL`: hiện ở đầu trang Realtime Database, dạng `https://…firebasedatabase.app`.
   - `apiKey`: **Project settings (⚙) → General → Your apps → thêm Web app (</>)**, copy `apiKey`.
6. Mở `src/online-config.js`, điền hai giá trị, chạy `python3 build.py`, commit và push. Vercel tự cập nhật.
7. Thử bằng hai điện thoại (hoặc một điện thoại và một máy tính): **Menu → Chơi online → Tạo phòng** ở máy thứ nhất, **Vào phòng** nhập mã ở máy thứ hai.

Lưu ý:
- `apiKey` của Firebase cho ứng dụng web không phải bí mật; dữ liệu được bảo vệ bằng `database.rules.json`.
- Nếu bạn giới hạn API key theo tên miền (HTTP referrer), hãy thêm tên miền Vercel của game.
- Dữ liệu phòng cũ và hàng chờ không tự xóa. Thỉnh thoảng vào Firebase Console xóa nhánh `rooms`, `queue`, `claims` để gọn (gói miễn phí dư sức chứa rất nhiều ván).

### Quyền riêng tư của trẻ em
- Khi chơi online chỉ có **biệt danh, ảnh đại diện và điểm online** được gửi lên máy chủ. **Họ và tên thật chỉ lưu trên máy** của người chơi.
- Không có chat tự do, chỉ gửi được các câu có sẵn.
- Người chơi đăng nhập ẩn danh, không cần email hay mật khẩu.

### Giới hạn hiện tại (nên biết)
- Điểm online và bảng xếp hạng do máy của người chơi tự báo, chưa chống được gian lận có chủ đích.
- Kết quả ván (hết giờ, xin hòa…) do máy người chơi ghi; luật bảo mật đảm bảo đúng lượt đi, đúng người chơi và chỉ ghi kết quả một lần. Mỗi máy tự kiểm tra nước đi của đối thủ có hợp lệ không, nếu không hợp lệ sẽ nhận thắng.
- Chưa có chức năng chặn/báo cáo người chơi, chưa có tài khoản cố định (đổi trình duyệt hoặc xóa dữ liệu trang sẽ là người chơi mới).

## Kiểm thử
```bash
npm install                      # cài targaryen, eventsource (chỉ để chạy test)
node test/dbrules.test.js        # luật bảo mật Firebase (mô phỏng, không cần mạng)
node test/net.test.js            # lớp mạng + máy chủ giả có luật thật
node test/online.test.js         # hai trình duyệt chơi online với nhau
node test/perpetual.test.js      # luật chiếu mãi / bắt mãi
node test/ui.test.js             # giao diện điện thoại và máy tính
node test/profile.test.js        # hồ sơ, thống kê, huy hiệu
node test/features.test.js       # bài tập, xem lại, phân tích
node test/pwa.test.js            # PWA, offline
```
