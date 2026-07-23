# Triển khai THỨC by SEASOUND (Railway / Render)

Website là **Node + Express + SQLite** ghi vào ổ đĩa, nên cần nền tảng có **máy chủ thường trú + ổ đĩa lưu trữ** (không dùng được Vercel/Netlify serverless). Hai lựa chọn dễ nhất: **Railway** (khuyên dùng) hoặc **Render**.

Cả hai đều deploy từ **GitHub**, nên làm 1 lần bước A trước.

---

## A. Đưa code lên GitHub (làm 1 lần)

```bash
# (đã git init + commit sẵn trong dự án)
# 1) Tạo repo trống trên github.com (KHÔNG thêm README/gitignore)
# 2) Kết nối và đẩy lên:
git remote add origin https://github.com/<tài-khoản>/thuc-seasound.git
git push -u origin main
```

> `.env`, thư mục `data/` và `node_modules/` đã bị `.gitignore` loại — **không** bị đẩy lên (an toàn, không lộ mật khẩu/CSDL).

---

## B1. Deploy bằng RAILWAY (khuyên dùng)

1. Vào **railway.app** → đăng nhập bằng GitHub → **New Project** → **Deploy from GitHub repo** → chọn repo vừa đẩy.
2. Railway tự nhận Node, chạy `npm install` rồi `npm start`. Chờ build xong.
3. **Thêm ổ đĩa lưu trữ**: mở service → tab **Settings** (hoặc **Variables/Volumes**) → **Add Volume** → Mount path: `/data`.
4. Mở tab **Variables** → thêm các biến:

   | Biến | Giá trị |
   |---|---|
   | `NODE_ENV` | `production` |
   | `NIXPACKS_NODE_VERSION` | `24` |
   | `TRUST_PROXY` | `1` |
   | `DB_FILE` | `/data/app.db` |
   | `UPLOAD_DIR` | `/data/uploads` |
   | `SESSION_SECRET` | *(một chuỗi ngẫu nhiên dài, tự đặt)* |
   | `SEED_ADMIN_EMAIL` | `admin@seasound.com` |
   | `SEED_ADMIN_PASSWORD` | *(mật khẩu mạnh của bạn)* |
   | `SITE_URL` | *(điền ở bước 6)* |

5. Tab **Settings → Networking → Generate Domain** để lấy URL công khai (dạng `https://xxx.up.railway.app`).
6. Quay lại **Variables**, đặt `SITE_URL` = đúng URL đó → Railway tự deploy lại.
7. Mở `https://<url>/dang-nhap`, đăng nhập bằng tài khoản seed ở trên → **đổi mật khẩu ngay** (mục *Hồ sơ của tôi*).

---

## B2. Deploy bằng RENDER (dùng render.yaml có sẵn)

> Cần gói **Starter** (~$7/tháng) vì gói Free **không có ổ đĩa lưu trữ** → dữ liệu sẽ mất.

1. Vào **render.com** → **New** → **Blueprint** → chọn repo (Render đọc `render.yaml` sẵn trong dự án).
2. Render tự tạo web service + ổ đĩa `/data` + phần lớn biến môi trường.
3. Nhập 2 biến còn để trống: `SEED_ADMIN_PASSWORD` (mật khẩu quản trị) — và sau khi có URL, sửa `SITE_URL` trong Dashboard cho khớp URL Render cấp (`https://xxx.onrender.com`).
4. Deploy. Vào `/dang-nhap`, đăng nhập, **đổi mật khẩu**.

---

## C. Sau khi chạy

- Lần chạy đầu tiên hệ thống **tự tạo CSDL + dữ liệu mẫu** (trang, bài viết, lịch diễn) trên ổ đĩa `/data` — không mất khi deploy lại.
- Đổi nội dung/giá vé/lịch diễn tại **/admin**.
- Khai báo `https://<url>/sitemap.xml` trong Google Search Console.
- Muốn dùng **tên miền riêng** (vd `thuc.seasound.com`): thêm domain trong Railway/Render, trỏ DNS theo hướng dẫn, rồi đổi `SITE_URL` sang tên miền đó.

## Gắn tên miền thật `thuc.seasound.com`
Trong Railway/Render → Settings → Custom Domain → nhập `thuc.seasound.com` → thêm bản ghi CNAME theo hướng dẫn tại nhà cung cấp tên miền → đổi `SITE_URL=https://thuc.seasound.com`.
