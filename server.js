'use strict';
const path = require('node:path');
const fs = require('node:fs');
const crypto = require('node:crypto');
const express = require('express');
const compression = require('compression');
const cookieParser = require('cookie-parser');

const config = require('./src/config');
const { q, allSettings, log } = require('./src/db');
const auth = require('./src/auth');
const U = require('./src/utils');
const SEO = require('./src/seo');

const app = express();

// ---------- Cache-busting cho CSS/JS (băm nội dung asset khi khởi động) ----------
// Mỗi lần deploy đổi file -> hash đổi -> ?v=... đổi -> trình duyệt tải bản mới ngay,
// không phải xoá cache thủ công (dù static vẫn cache 30 ngày).
app.locals.assetVer = (() => {
  try {
    const files = ['css/site.css', 'css/admin.css', 'js/site-fx.js', 'js/booking.js', 'js/lightbox.js', 'js/admin.js'];
    const h = crypto.createHash('sha1');
    for (const f of files) {
      try { h.update(fs.readFileSync(path.join(config.ROOT, 'public', f))); } catch (_e) { /* bỏ qua file thiếu */ }
    }
    return h.digest('hex').slice(0, 8);
  } catch (_e) { return '1'; }
})();

// ---------- Hạ tầng ----------
if (config.trustProxy) app.set('trust proxy', 1);
app.set('view engine', 'ejs');
app.set('views', path.join(config.ROOT, 'views'));
app.set('x-powered-by', false);
app.use(compression());
app.use(express.urlencoded({ extended: true, limit: '4mb' }));
app.use(express.json({ limit: '4mb' }));
app.use(cookieParser(config.sessionSecret));

// ---------- Bảo mật cơ bản ----------
app.use((req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'SAMEORIGIN');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  res.setHeader('Permissions-Policy', 'geolocation=(), microphone=(), camera=()');
  if (config.siteUrl.startsWith('https://')) {
    res.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
  }
  next();
});

// ---------- Tệp tĩnh ----------
// Phục vụ ảnh tải lên từ thư mục UPLOAD_DIR (có thể nằm ngoài public khi deploy với ổ đĩa lưu trữ)
app.use('/uploads', express.static(config.uploadDir, {
  maxAge: config.env === 'production' ? '30d' : 0,
  etag: true,
}));
app.use(express.static(path.join(config.ROOT, 'public'), {
  maxAge: config.env === 'production' ? '30d' : 0,
  etag: true,
}));

// ---------- Ngôn ngữ (VI / EN) ----------
app.use((req, res, next) => {
  // Ưu tiên: ?lang= → cookie → mặc định (vi)
  let lang = String(req.query.lang || '').toLowerCase();
  if (lang !== 'vi' && lang !== 'en') lang = req.cookies?.lang;
  if (lang !== 'vi' && lang !== 'en') lang = 'vi';
  if (req.query.lang === 'vi' || req.query.lang === 'en') {
    res.cookie('lang', lang, { maxAge: 365 * 864e5, httpOnly: false, sameSite: 'lax', path: '/' });
  }
  req.lang = lang;
  res.locals.lang = lang;
  res.locals.otherLang = lang === 'vi' ? 'en' : 'vi';
  // t('tiếng Việt', 'English') → trả về đúng ngôn ngữ hiện tại
  res.locals.t = (vi, en) => (lang === 'en' && en != null ? en : vi);
  next();
});

// ---------- Phiên & biến dùng chung cho view ----------
app.use(auth.attachUser);
app.use((req, res, next) => {
  const settings = allSettings();
  res.locals.user = req.user;
  res.locals.settings = settings;
  res.locals.csrf = req.session?.csrf || '';
  res.locals.session = req.session;
  res.locals.can = (perm) => auth.can(req.user, perm);
  res.locals.currentPath = req.path;
  res.locals.query = req.query;
  res.locals.U = U;
  res.locals.ROLES = auth.ROLES;
  res.locals.siteUrl = config.siteUrl;
  res.locals.flash = null;
  res.locals.isHome = req.path === '/';
  res.locals.footCategories = require('./src/models').categories.all().slice(0, 5);
  res.locals.seo = SEO.buildMeta({ path: req.originalUrl.split('?')[0] });
  res.locals.jsonLd = [];
  next();
});

// ---------- Chuyển hướng 301 do đổi slug ----------
app.use((req, res, next) => {
  if (req.method !== 'GET') return next();
  const r = q.get('SELECT * FROM redirects WHERE from_path = ?', req.path);
  if (r) {
    q.run('UPDATE redirects SET hits = hits + 1 WHERE id = ?', r.id);
    return res.redirect(r.code || 301, r.to_path);
  }
  return next();
});

// ---------- Định tuyến ----------
app.use('/', require('./src/routes/public'));
app.use('/', require('./src/routes/auth'));
app.use('/api', require('./src/routes/api'));
app.use('/admin', require('./src/routes/admin'));

// ---------- 404 ----------
app.use((req, res) => {
  if (req.path.startsWith('/api/')) {
    return res.status(404).json({ ok: false, error: 'Không tìm thấy tài nguyên.' });
  }
  res.status(404).render('404', {
    seo: SEO.buildMeta({ title: 'Không tìm thấy trang', path: req.path, noindex: true }),
    jsonLd: [],
  });
});

// ---------- Lỗi ----------
// eslint-disable-next-line no-unused-vars
app.use((err, req, res, _next) => {
  console.error('[LỖI]', err);
  try { log(req.user?.id, 'error', 'server', null, String(err.message || err).slice(0, 500), req.ip); } catch (_e) {}
  const status = err.status || 500;
  if (req.path.startsWith('/api/')) {
    return res.status(status).json({ ok: false, error: err.publicMessage || 'Đã có lỗi xảy ra.' });
  }
  res.status(status).render('500', {
    seo: SEO.buildMeta({ title: 'Lỗi hệ thống', path: req.path, noindex: true }),
    jsonLd: [],
    detail: config.env === 'production' ? '' : String(err.stack || err),
  });
});

// ---------- Khởi động ----------
require('./src/seed').ensureSeed();
auth.purgeExpired();
setInterval(auth.purgeExpired, 6 * 3600 * 1000).unref();

const server = app.listen(config.port, config.host, () => {
  console.log(`\n  ✦ THỨC by SEASOUND — máy chủ đã sẵn sàng`);
  console.log(`  → Trang chủ:   ${config.siteUrl}`);
  console.log(`  → Quản trị:    ${config.siteUrl}/admin`);
  console.log(`  → Đăng nhập:   ${config.siteUrl}/dang-nhap`);
  console.log(`  → Môi trường:  ${config.env}\n`);
});

for (const sig of ['SIGINT', 'SIGTERM']) {
  process.on(sig, () => { server.close(() => process.exit(0)); });
}

module.exports = app;
