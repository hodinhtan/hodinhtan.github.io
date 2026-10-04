# Bảng điều khiển riêng tư (/private/) — đăng nhập Google

Trang `/private/` dùng Firebase (miễn phí): đăng nhập Google + lưu dữ liệu trong Firestore.
Chỉ tài khoản Google khai báo trong Security Rules mới đọc/ghi được. Mã nguồn trang là công khai,
nhưng dữ liệu nằm trên Firestore, không nằm trong repo.

Các tab: Tổng quan · Công việc · Lịch (Google Calendar) · Ghi chú · Liên kết · Cập nhật (từ portal/AD).
Mỗi mục gắn nhãn **Cá nhân** hoặc **Tập đoàn**, lọc được ở thanh phía trên.

## 1. Tạo dự án Firebase
Vào https://console.firebase.google.com → **Add project**.

## 2. Bật đăng nhập Google
1. **Build → Authentication → Get started → Sign-in method → Google → Enable → Save**.
2. **Settings → Authorized domains → Add domain** → `hodinhtan.github.io`.

## 3. Tạo Firestore và đặt Rules
1. **Build → Firestore Database → Create database** (production mode).
2. Tab **Rules** → dán toàn bộ `firestore.rules` trong thư mục này, thay `EMAIL_CUA_BAN@gmail.com`
   bằng email Google của bạn → **Publish**.
3. **Mỗi khi file `firestore.rules` thay đổi, phải dán lại và Publish.** Nếu quên, trang sẽ báo
   "Firestore Rules chưa cho phép đọc: …".

## 4. Cấu hình web
**Project settings → Your apps → Web** → chép `apiKey`, `authDomain`, `projectId`, `appId` vào
`private/firebase-config.js`. Các giá trị này không phải bí mật.

## 5. Giới hạn apiKey (khuyến nghị)
https://console.cloud.google.com/apis/credentials → key **Browser key (auto created by Firebase)** →
**Application restrictions: Websites**, thêm:
- `https://hodinhtan.github.io/*`
- `https://<projectId>.firebaseapp.com/*` (bắt buộc — cửa sổ đăng nhập Google chạy trên tên miền này)

**API restrictions** để nguyên "Don't restrict key".

## 6. Google Calendar
Tab **Lịch** đọc lịch trực tiếp từ trình duyệt bằng quyền chỉ-đọc (`calendar.readonly`), không lưu gì lên server.
1. Bật API: https://console.cloud.google.com/apis/library/calendar-json.googleapis.com (đúng dự án Firebase).
2. Bấm **Kết nối Google Calendar** trên trang. Lần đầu Google có thể cảnh báo "ứng dụng chưa xác minh"
   (đây là ứng dụng của chính bạn): chọn **Nâng cao → tiếp tục**. Nếu bị chặn, vào
   **Google Auth platform → Audience** và thêm email của bạn vào **Test users**.
3. Phiên kết nối kéo dài khoảng 1 giờ; hết hạn thì bấm kết nối lại.

Chỉ hiển thị lịch đang bật (hiển thị) trong Google Calendar của bạn.

## 7. Đẩy dữ liệu từ portal / AD lên tab "Cập nhật"
Trình duyệt không được ghi vào `feed`; chỉ script chạy trên **máy của bạn** (Admin SDK) mới ghi được.
1. Firebase console → **Project settings → Service accounts → Generate new private key**.
   Lưu file JSON **ngoài thư mục repo**. Khoá này là bí mật thật sự, không gửi cho ai, không commit.
2. Cài một lần: `cd _tools && npm install`.
3. Chuẩn bị file JSON các mục (xem `_tools/feed.sample.json`):
   `id`, `title` (bắt buộc), `body`, `url`, `source`, `area` (`corp`|`personal`, mặc định `corp`), `ts`, `tags`.
4. Thử trước: `node push-feed.mjs items.json --dry-run`
5. Ghi thật:
   `GOOGLE_APPLICATION_CREDENTIALS=/duong/dan/khoa.json node push-feed.mjs items.json`

Script tự **bỏ qua mục có nội dung báo chí** (tiêu đề/nguồn/nhãn chứa "báo chí" hoặc "press"),
chỉ giữ link `http(s)`, và dùng `id` làm khoá nên chạy lại không bị trùng.

## 8. Sử dụng
Mở https://hodinhtan.github.io/private/ → **Đăng nhập bằng Google**.

Đừng bao giờ để Firestore ở "test mode": bảo mật nằm ở bước 3.
