# Aquarium Shop · Sales Dashboard

Dashboard frontend cho sales aquarium shop: nền navy/glass, sidebar cố định, stat cards, biểu đồ doanh thu, danh mục bán chạy, đơn hàng gần đây và top products.

## Chạy local

```bash
npm install
npm run dev
```

Mở `http://localhost:3000`.

Để gửi khách bản demo không cần backend, chạy preview rồi mở `http://127.0.0.1:4173/#demo`. Demo có dữ liệu mẫu và cho phép thử Products/Categories, tạo–sửa–xóa cục bộ, Personalize và Admin profile.

Muốn mở demo client-only trên điện thoại trong cùng Wi‑Fi, chỉ bật LAN khi cần: PowerShell `$env:DASHBOARD_BIND_HOST="0.0.0.0"; node ../work/server-dashboard.mjs`, lấy IPv4 của máy tính (ví dụ `192.168.1.20`) rồi mở `http://192.168.1.20:4173/#demo`. Mặc định preview chỉ bind `127.0.0.1` để không mở dashboard/API cho thiết bị khác trong mạng.

Muốn gửi khách ở mạng khác, cần một tunnel/hosting public. Ví dụ sau khi preview chạy: `ssh -R 80:localhost:4173 nokey@localhost.run`; dùng URL HTTPS được in ra và thêm `/#demo`. URL tunnel chỉ tồn tại khi máy tính và lệnh tunnel còn chạy; để có URL cố định hãy deploy thư mục `dist` lên Vercel/Netlify/Cloudflare Pages.

Vite proxy `/api` tới backend NestJS tại `http://localhost:4000` (cả `npm run dev` và `npm run preview` đều có proxy). Dashboard bắt buộc đi qua màn hình đăng nhập trước khi vào các view sales/catalog.

## Auth API

Màn hình login gọi trực tiếp các endpoint thật:

- `POST /api/v1/auth/login` để đăng nhập.
- `POST /api/v1/auth/mfa/verify-login` khi tài khoản bật MFA.
- `POST /api/v1/auth/password/forgot` cho Forgot password.
- `POST /api/v1/auth/logout` khi sign out.

Access token chỉ được giữ trong memory của tab; refresh token do backend giữ trong HttpOnly cookie và được xoay sau mỗi lần dùng. Vì vậy reload trang sẽ xác thực lại qua cookie thay vì để access token nằm trong `localStorage`/`sessionStorage`.

Nếu frontend deploy khác origin, đặt `VITE_API_BASE_URL` (ví dụ `https://api.example.com/api/v1`) trước khi build.

## Personalize

Nút **Personalize** ở góc phải cho phép:

- Đổi accent color bằng preset hoặc color picker.
- Chọn nền Aurora/Midnight/Ocean.
- Chọn một ảnh từ máy tính cho lớp nền dashboard.
- Lưu lựa chọn trên thiết bị bằng localStorage.

Các quy tắc visual (bo góc, spacing, card, shadow, sidebar và layout) luôn được giữ nguyên. Ảnh người dùng chỉ thay đổi lớp background, không thay avatar, icon, biểu đồ hay bố cục.

## Sales focus

Màn hình ưu tiên các câu hỏi của sales: doanh thu tăng bao nhiêu, đơn hàng đang ở trạng thái nào, khách mới, sản phẩm bán chạy và tồn kho nào cần xử lý. Các view Products/Orders/Customers/Analytics đã có shell để nối API CRUD ở bước tiếp theo.
