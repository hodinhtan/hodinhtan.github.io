# Cài đặt trang riêng tư (/private/) với đăng nhập Google

Trang `/private/` dùng Firebase (miễn phí) để đăng nhập Google và lưu dữ liệu trong Firestore.
Chỉ tài khoản Google được khai báo trong Security Rules mới đọc/ghi được dữ liệu.
Mã nguồn trang là công khai, nhưng dữ liệu nằm trên Firestore và được bảo vệ bởi Rules.

## 1. Tạo dự án Firebase
1. Vào https://console.firebase.google.com → **Add project** (có thể tắt Google Analytics).

## 2. Bật đăng nhập Google
1. **Build → Authentication → Get started**.
2. Tab **Sign-in method** → **Google** → **Enable** → chọn email hỗ trợ → **Save**.
3. Tab **Settings → Authorized domains** → **Add domain** → `hodinhtan.github.io`.

## 3. Tạo Firestore
1. **Build → Firestore Database → Create database** → chọn vùng (ví dụ `asia-southeast1`) → **Start in production mode**.
2. Tab **Rules** → dán toàn bộ nội dung file `firestore.rules` trong thư mục này,
   thay `EMAIL_CUA_BAN@gmail.com` bằng email Google của bạn → **Publish**.

## 4. Lấy cấu hình web
1. **Project settings** (bánh răng) → **Your apps** → biểu tượng **Web `</>`** → đặt tên → **Register app**.
2. Chép các giá trị `apiKey`, `authDomain`, `projectId`, `appId` vào `private/firebase-config.js`, commit lên nhánh `gh-pages`.

## 5. Giới hạn apiKey (khuyến nghị)
Chỉ cho phép key dùng trên trang của bạn, tránh người khác dùng ké hạn mức miễn phí.
1. Vào https://console.cloud.google.com/apis/credentials?project=hodinhtangithubio
2. Bấm vào key **Browser key (auto created by Firebase)** (key trùng với `apiKey` trong `firebase-config.js`).
3. **Application restrictions** → chọn **Websites** → **Add** lần lượt:
   - `https://hodinhtan.github.io/*`
   - `https://hodinhtangithubio.firebaseapp.com/*` (bắt buộc — cửa sổ đăng nhập Google chạy trên tên miền này)
4. **API restrictions** để nguyên **Don't restrict key** → **Save**. Thay đổi có hiệu lực sau vài phút.

Nếu sau đó đăng nhập báo lỗi `auth/requests-from-referer-...-are-blocked`, kiểm tra lại 2 dòng ở bước 3.

## 6. Sử dụng
Mở https://hodinhtan.github.io/private/ → **Đăng nhập bằng Google** → **+ Thêm** để tạo thông tin.

Ghi chú: các giá trị trong `firebase-config.js` không phải bí mật. Việc bảo mật nằm ở bước 3 (Rules) —
đừng bao giờ để Firestore ở "test mode".
