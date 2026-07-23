# Website Nhà hát Seaphony

Website hoàn chỉnh (frontend + backend + CMS quản trị) cho Nhà hát Seaphony — Hoa Lư, Ninh Bình.
Giao diện được dựng lại từ `seaphony-website.html` thành hệ thống render phía máy chủ, chuẩn SEO.

---

## 1. Chạy dự án

```bash
npm install
cp .env.example .env      # Windows: copy .env.example .env
npm start                 # hoặc: npm run dev  (tự khởi động lại khi sửa mã)
```

| Địa chỉ | Mô tả |
|---|---|
| http://localhost:3000 | Trang chủ |
| http://localhost:3000/tin-tuc | Danh sách bài viết |
| http://localhost:3000/dang-nhap | Đăng nhập quản trị |
| http://localhost:3000/admin | Bảng điều khiển |

### Tài khoản mẫu (tạo tự động ở lần chạy đầu)

| Vai trò | Email | Mật khẩu |
|---|---|---|
| Quản trị viên | `admin@seaphony.vn` | `Seaphony@2026` |
| Biên tập viên | `bientap@seaphony.vn` | `Bientap@2026` |
| Tác giả | `tacgia@seaphony.vn` | `Tacgia@2026` |
| Cộng tác viên | `ctv@seaphony.vn` | `Ctv@202666` |

> **Đổi ngay mật khẩu quản trị** sau lần đăng nhập đầu tiên (mục *Hồ sơ của tôi*).

Tạo lại dữ liệu mẫu: `npm run seed` — xoá sạch rồi tạo lại: `npm run reset`.

---

## 2. Công nghệ

| Lớp | Lựa chọn | Lý do |
|---|---|---|
| Máy chủ | Node.js + Express 4 | Ổn định, ít phụ thuộc |
| Cơ sở dữ liệu | SQLite qua `node:sqlite` (có sẵn trong Node 22.5+) | Không cần cài đặt máy chủ CSDL, không cần biên dịch native |
| Giao diện | EJS render phía máy chủ | HTML đầy đủ ngay ở phản hồi đầu tiên — điều kiện tiên quyết để SEO tốt |
| Mật khẩu | `crypto.scrypt` | Chuẩn mạnh, không cần thư viện ngoài |
| Nội dung | `marked` + `sanitize-html` | Soạn Markdown/HTML, lọc sạch XSS |

Yêu cầu: **Node.js ≥ 22.5** (khuyến nghị 24).

---

## 3. Cấu trúc thư mục

```
├── server.js                 Điểm khởi động, middleware, xử lý lỗi
├── src/
│   ├── config.js             Đọc .env, khoá phiên, đường dẫn
│   ├── db.js                 Lược đồ CSDL, cấu hình website, nhật ký
│   ├── auth.js               Mật khẩu, phiên, CSRF, vai trò & quyền
│   ├── utils.js              Slug tiếng Việt, Markdown, ngày tháng, phân trang
│   ├── seo.js                Thẻ meta, JSON-LD, chấm điểm SEO, sitemap, RSS
│   ├── models.js             Truy vấn bài viết, chuyên mục, thẻ, lịch diễn
│   ├── seed.js               Dữ liệu khởi tạo
│   └── routes/
│       ├── public.js         Trang công khai + sitemap/robots/RSS
│       ├── auth.js           Đăng nhập / đăng xuất
│       ├── api.js            API đặt vé, đăng ký bản tin, liên hệ, phân tích SEO
│       └── admin.js          Toàn bộ khu quản trị
├── views/                    Khuôn mẫu EJS (public + admin)
├── public/                   CSS, JS, ảnh, tệp tải lên
└── data/app.db               CSDL SQLite (tự tạo)
```

---

## 4. Trang công khai

| Đường dẫn | Nội dung |
|---|---|
| `/` | Trang chủ — tin tức và lịch diễn lấy động từ CSDL |
| `/tin-tuc` | Danh sách bài viết, phân trang |
| `/tin-tuc/:slug` | Chi tiết bài: mục lục, chia sẻ, bài liên quan, điều hướng trước/sau |
| `/chuyen-muc/:slug` · `/tag/:slug` | Lưu trữ theo chuyên mục / thẻ |
| `/tim-kiem?q=` | Tìm kiếm **không phân biệt dấu** (gõ "cong chieng" vẫn ra "cồng chiêng") |
| `/trang/:slug` | Trang tĩnh do CMS quản lý |
| `/sitemap.xml` · `/robots.txt` · `/rss.xml` | Tệp phục vụ công cụ tìm kiếm |

### API

| Phương thức | Đường dẫn | Chức năng |
|---|---|---|
| `POST` | `/api/bookings` | Đặt vé — máy chủ tự tính tiền, chống đặt trùng ghế |
| `GET` | `/api/shows/:id/seats` | Danh sách ghế đã bán (vẽ sơ đồ ghế) |
| `POST` | `/api/subscribe` | Đăng ký nhận bản tin |
| `POST` | `/api/contact` | Gửi liên hệ (có bẫy honeypot chống bot) |
| `POST` | `/api/seo/analyze` | Chấm điểm SEO trực tiếp trong trình soạn thảo |

Tất cả API công khai đều có giới hạn tần suất theo IP.

---

## 5. Khu quản trị

| Mục | Chức năng |
|---|---|
| Bảng điều khiển | Thống kê, biểu đồ lượt xem 14 ngày, bài chờ duyệt, bài cần cải thiện SEO |
| Bài viết / Trang | Soạn thảo Markdown/HTML, ảnh đại diện, hẹn giờ đăng, lịch sử phiên bản, khôi phục |
| Chuyên mục / Thẻ | CRUD kèm thẻ meta riêng cho từng chuyên mục |
| Thư viện ảnh | Kéo thả nhiều tệp, sửa ALT & chú thích, sao chép URL |
| Trung tâm SEO | Bảng điểm toàn site, kiểm toán thiếu sót, quản lý chuyển hướng 301 |
| Lịch diễn | CRUD đêm diễn, giá vé từng khán đài, trạng thái mở bán |
| Đơn đặt vé | Duyệt / huỷ đơn, xuất CSV |
| Bản tin & Liên hệ | Danh sách người đăng ký, hộp thư liên hệ |
| Người dùng | Tạo tài khoản, đổi vai trò, ma trận quyền trực quan |
| Cấu hình | Thông tin site, tổ chức, Analytics, mã xác minh, robots.txt bổ sung |
| Nhật ký | Lịch sử mọi thao tác của mọi tài khoản |

---

## 6. Phân quyền

| Vai trò | Phạm vi |
|---|---|
| **Quản trị viên** | Toàn quyền, kể cả người dùng và cấu hình hệ thống |
| **Biên tập viên** | Duyệt & xuất bản mọi bài, quản lý chuyên mục, thẻ, media, lịch diễn, đặt vé |
| **Tác giả** | Viết và xuất bản bài **của chính mình**, tải ảnh lên |
| **Cộng tác viên** | Chỉ soạn nháp bài của mình và gửi duyệt — không được xuất bản |

Cơ chế bảo vệ:

- Mật khẩu băm bằng **scrypt**, kiểm tra độ mạnh khi đặt.
- Phiên lưu trong CSDL, cookie **httpOnly + có chữ ký**, hết hạn 14 ngày, có thể thu hồi từng phiên.
- **CSRF token** bắt buộc cho mọi thao tác thay đổi dữ liệu.
- Khoá đăng nhập sau 8 lần sai trong 15 phút (theo email và theo IP).
- Đổi mật khẩu sẽ đăng xuất toàn bộ phiên khác.
- Không thể hạ quyền hoặc xoá quản trị viên cuối cùng.
- Nội dung bài viết luôn đi qua `sanitize-html` trước khi lưu.
- Vượt quyền ở tầng route **và** tầng dữ liệu: gửi `status=published` khi không đủ quyền sẽ tự hạ xuống *chờ duyệt*.

---

## 7. Những gì hệ thống làm cho SEO

**Trên mỗi trang**

- Thẻ `<title>` theo mẫu tuỳ chỉnh, `meta description`, `canonical`, `robots`, `hreflang`.
- Open Graph + Twitter Card đầy đủ (ảnh, kích thước, tác giả, chuyên mục, thẻ).
- `rel="prev"` / `rel="next"` cho trang danh sách phân trang.
- HTML render sẵn phía máy chủ — bot đọc được toàn bộ nội dung không cần JavaScript.

**Dữ liệu có cấu trúc (JSON-LD)**

`PerformingArtsTheater` · `WebSite` + SearchAction · `BreadcrumbList` · `Article`/`NewsArticle` ·
`TheaterEvent` cho từng đêm diễn · `FAQPage` · `ItemList` cho trang lưu trữ.

**Tệp kỹ thuật**

- Sitemap dạng chỉ mục, tách theo loại nội dung, kèm **image sitemap**.
- `robots.txt` sinh động, chặn `/admin`, `/api/`, trang kết quả tìm kiếm.
- RSS feed. Trang tìm kiếm và trang thẻ mỏng tự động gắn `noindex`.

**Trợ lý biên tập**

- Chấm điểm SEO **thời gian thực** (0–100) với ~15 tiêu chí: độ dài tiêu đề/mô tả, từ khoá trong
  tiêu đề — slug — mô tả — đoạn mở đầu — tiêu đề phụ, mật độ từ khoá, độ dài nội dung, cấu trúc H2,
  ảnh đại diện, ALT của ảnh, liên kết nội bộ/ngoài, độ dài đoạn văn, trạng thái lập chỉ mục.
- Xem trước kết quả trên Google (SERP preview) với từ khoá được tô đậm.
- Slug tiếng Việt tự động bỏ dấu, đổi slug bài đã xuất bản → **tự sinh chuyển hướng 301**.
- Heading H2/H3 tự gắn `id` để tạo mục lục và liên kết neo.

---

## 8. Triển khai thực tế

1. Đặt `SITE_URL=https://tenmien.vn` trong `.env` — giá trị này quyết định canonical, sitemap, OG.
2. Đặt `NODE_ENV=production`, `TRUST_PROXY=1` nếu chạy sau Nginx hoặc Cloudflare.
3. Đổi toàn bộ mật khẩu tài khoản mẫu; xoá tài khoản không dùng.
4. Sao lưu định kỳ thư mục `data/` và `public/uploads/`.
5. Khai báo `https://tenmien.vn/sitemap.xml` trong Google Search Console và Bing Webmaster Tools,
   rồi dán mã xác minh vào *Quản trị → Cấu hình*.
6. Chạy nền bằng `pm2 start server.js --name seaphony` hoặc dịch vụ systemd.

Cấu hình Nginx tối thiểu:

```nginx
location / {
    proxy_pass http://127.0.0.1:3000;
    proxy_set_header Host $host;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto $scheme;
}
```

---

## 9. Ghi chú

- Tệp gốc `seaphony-website.html` vẫn được giữ nguyên làm bản tham chiếu. Giao diện đang chạy nằm ở
  `views/home.ejs` cùng `public/css/site.css`; ảnh nhúng base64 đã tách thành tệp riêng trong `public/img/`
  (trang chủ giảm từ 365 KB HTML xuống còn ~22 KB, ảnh được cache riêng).
- Đặt vé hiện dừng ở mức ghi nhận đơn và gửi mã giữ chỗ — chưa nối cổng thanh toán và chưa gửi email.
  Điểm nối tiếp theo nằm ở `src/routes/api.js`, hàm xử lý `POST /api/bookings`.
