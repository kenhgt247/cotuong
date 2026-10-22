/* Cấu hình Firebase cho chơi online.
 * Điền hai giá trị lấy từ Firebase Console (xem README, mục "Bật chơi online").
 * Để trống thì game vẫn chơi bình thường, chỉ mục "Chơi online" báo chưa cấu hình.
 * apiKey của Firebase dành cho ứng dụng web nên không phải bí mật; việc bảo vệ dữ liệu do database.rules.json đảm nhiệm.
 */
const ONLINE_CONFIG = (typeof window !== 'undefined' && window.__ONLINE_CONFIG) || {
  apiKey: 'AIzaSyCFaKDvDhQ6ueHgiqd1iTObUitSx0uHpLM', // dự án Firebase: cotuong-61856
  databaseURL: '', // ĐIỀN VÀO: địa chỉ Realtime Database, ví dụ https://cotuong-61856-default-rtdb.asia-southeast1.firebasedatabase.app
};
