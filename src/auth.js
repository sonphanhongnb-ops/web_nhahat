'use strict';
const crypto = require('node:crypto');
const { q, log } = require('./db');
const config = require('./config');

// ============================================================
//  MẬT KHẨU — scrypt (không cần native module)
// ============================================================
const SCRYPT = { N: 16384, r: 8, p: 1, keylen: 64 };

function hashPassword(plain) {
  const salt = crypto.randomBytes(16);
  const key = crypto.scryptSync(String(plain), salt, SCRYPT.keylen, { N: SCRYPT.N, r: SCRYPT.r, p: SCRYPT.p });
  return `scrypt$${SCRYPT.N}$${SCRYPT.r}$${SCRYPT.p}$${salt.toString('hex')}$${key.toString('hex')}`;
}

function verifyPassword(plain, stored) {
  try {
    const [alg, N, r, p, saltHex, keyHex] = String(stored).split('$');
    if (alg !== 'scrypt') return false;
    const key = crypto.scryptSync(String(plain), Buffer.from(saltHex, 'hex'), keyHex.length / 2, {
      N: Number(N), r: Number(r), p: Number(p),
    });
    return crypto.timingSafeEqual(key, Buffer.from(keyHex, 'hex'));
  } catch (_e) {
    return false;
  }
}

/** Kiểm tra độ mạnh mật khẩu — trả về mảng lỗi (rỗng nếu đạt) */
function passwordIssues(pw = '') {
  const errs = [];
  if (pw.length < 8) errs.push('Mật khẩu phải có ít nhất 8 ký tự.');
  if (!/[a-z]/.test(pw)) errs.push('Cần ít nhất một chữ thường.');
  if (!/[A-Z]/.test(pw)) errs.push('Cần ít nhất một chữ hoa.');
  if (!/[0-9]/.test(pw)) errs.push('Cần ít nhất một chữ số.');
  return errs;
}

// ============================================================
//  PHIÊN ĐĂNG NHẬP
// ============================================================
const COOKIE = 'sea_sid';

function sha256(s) {
  return crypto.createHash('sha256').update(String(s)).digest('hex');
}

function createSession(res, user, req) {
  const token = crypto.randomBytes(32).toString('hex');
  const csrf = crypto.randomBytes(24).toString('hex');
  const expires = new Date(Date.now() + config.sessionDays * 864e5);
  q.run(
    'INSERT INTO sessions(id, user_id, csrf, ip, user_agent, expires_at) VALUES(?,?,?,?,?,?)',
    sha256(token), user.id, csrf,
    (req.ip || '').slice(0, 64), String(req.get('user-agent') || '').slice(0, 255),
    expires.toISOString().slice(0, 19).replace('T', ' ')
  );
  res.cookie(COOKIE, token, {
    httpOnly: true,
    sameSite: 'lax',
    secure: config.siteUrl.startsWith('https://'),
    maxAge: config.sessionDays * 864e5,
    path: '/',
    signed: true,
  });
  q.run("UPDATE users SET last_login_at = datetime('now') WHERE id = ?", user.id);
  return { token, csrf };
}

function destroySession(req, res) {
  const token = req.signedCookies?.[COOKIE];
  if (token) q.run('DELETE FROM sessions WHERE id = ?', sha256(token));
  res.clearCookie(COOKIE, { path: '/' });
}

function purgeExpired() {
  q.run("DELETE FROM sessions WHERE expires_at < datetime('now')");
  q.run("DELETE FROM login_attempts WHERE created_at < datetime('now','-1 day')");
}

/** Middleware: gắn req.user + req.session nếu cookie hợp lệ */
function attachUser(req, _res, next) {
  req.user = null;
  req.session = null;
  const token = req.signedCookies?.[COOKIE];
  if (!token) return next();
  const row = q.get(
    `SELECT s.id AS sid, s.csrf, s.expires_at, u.*
       FROM sessions s JOIN users u ON u.id = s.user_id
      WHERE s.id = ? AND s.expires_at > datetime('now')`,
    sha256(token)
  );
  if (row && row.active) {
    const { sid, csrf, expires_at, ...user } = row;
    delete user.password_hash;
    req.user = user;
    req.session = { id: sid, csrf, expiresAt: expires_at };
  }
  return next();
}

// ============================================================
//  CHỐNG DÒ MẬT KHẨU
// ============================================================
const MAX_ATTEMPTS = 8;
const WINDOW_MIN = 15;

function tooManyAttempts(email, ip) {
  const row = q.get(
    `SELECT COUNT(*) AS n FROM login_attempts
      WHERE ok = 0 AND (email = ? OR ip = ?)
        AND created_at > datetime('now', ?)`,
    String(email || '').toLowerCase(), ip || '', `-${WINDOW_MIN} minutes`
  );
  return (row?.n || 0) >= MAX_ATTEMPTS;
}
function recordAttempt(email, ip, ok) {
  q.run('INSERT INTO login_attempts(email, ip, ok) VALUES(?,?,?)',
    String(email || '').toLowerCase(), ip || '', ok ? 1 : 0);
}

// ============================================================
//  VAI TRÒ & QUYỀN
// ============================================================
const ROLES = {
  admin: {
    label: 'Quản trị viên',
    desc: 'Toàn quyền: người dùng, cấu hình, nội dung, SEO, đặt vé.',
    rank: 4,
  },
  editor: {
    label: 'Biên tập viên',
    desc: 'Duyệt & xuất bản mọi bài viết, quản lý chuyên mục, thẻ, media, lịch diễn, đặt vé.',
    rank: 3,
  },
  author: {
    label: 'Tác giả',
    desc: 'Viết và xuất bản bài của chính mình, tải ảnh lên.',
    rank: 2,
  },
  viewer: {
    label: 'Cộng tác viên',
    desc: 'Chỉ soạn nháp bài của mình và gửi duyệt, không được xuất bản.',
    rank: 1,
  },
};

const PERMISSIONS = {
  // key: [vai trò được phép]
  'dashboard.view':   ['admin', 'editor', 'author', 'viewer'],
  'post.create':      ['admin', 'editor', 'author', 'viewer'],
  'post.edit.any':    ['admin', 'editor'],
  'post.delete.any':  ['admin', 'editor'],
  'post.publish':     ['admin', 'editor', 'author'],
  'post.publish.any': ['admin', 'editor'],
  'page.manage':      ['admin', 'editor'],
  'category.manage':  ['admin', 'editor'],
  'tag.manage':       ['admin', 'editor', 'author'],
  'media.upload':     ['admin', 'editor', 'author', 'viewer'],
  'media.delete.any': ['admin', 'editor'],
  'show.manage':      ['admin', 'editor'],
  'booking.view':     ['admin', 'editor'],
  'booking.manage':   ['admin', 'editor'],
  'subscriber.view':  ['admin', 'editor'],
  'contact.view':     ['admin', 'editor'],
  'seo.manage':       ['admin', 'editor'],
  'settings.manage':  ['admin'],
  'user.manage':      ['admin'],
  'log.view':         ['admin'],
};

/** Kiểm tra quyền tĩnh */
function can(user, permission) {
  if (!user) return false;
  const allowed = PERMISSIONS[permission];
  return Array.isArray(allowed) && allowed.includes(user.role);
}

/** Quyền trên một bài viết cụ thể (chủ sở hữu hoặc quyền toàn cục) */
function canEditPost(user, post) {
  if (!user || !post) return false;
  if (can(user, 'post.edit.any')) return true;
  return post.author_id === user.id;
}
function canDeletePost(user, post) {
  if (!user || !post) return false;
  if (can(user, 'post.delete.any')) return true;
  return post.author_id === user.id && post.status !== 'published';
}
function canPublishPost(user, post) {
  if (!user) return false;
  if (can(user, 'post.publish.any')) return true;
  return can(user, 'post.publish') && post && post.author_id === user.id;
}

// ============================================================
//  MIDDLEWARE
// ============================================================
function requireLogin(req, res, next) {
  if (!req.user) {
    const next_ = encodeURIComponent(req.originalUrl || '/admin');
    return res.redirect(`/dang-nhap?next=${next_}`);
  }
  return next();
}

function requirePermission(permission) {
  return (req, res, next) => {
    if (!req.user) {
      const next_ = encodeURIComponent(req.originalUrl || '/admin');
      return res.redirect(`/dang-nhap?next=${next_}`);
    }
    if (!can(req.user, permission)) {
      log(req.user.id, 'permission.denied', 'permission', null, permission, req.ip);
      return res.status(403).render('admin/403', {
        title: 'Không đủ quyền',
        permission,
        layout: false,
      });
    }
    return next();
  };
}

/** CSRF cho mọi request thay đổi dữ liệu */
function csrfProtect(req, res, next) {
  if (['GET', 'HEAD', 'OPTIONS'].includes(req.method)) return next();
  const sent = req.body?._csrf || req.get('x-csrf-token');
  if (!req.session || !sent || sent !== req.session.csrf) {
    if (req.accepts('json') && !req.accepts('html')) {
      return res.status(403).json({ ok: false, error: 'CSRF token không hợp lệ.' });
    }
    return res.status(403).render('admin/403', {
      title: 'Phiên làm việc hết hạn',
      permission: 'CSRF',
      layout: false,
    });
  }
  return next();
}

module.exports = {
  hashPassword, verifyPassword, passwordIssues,
  createSession, destroySession, attachUser, purgeExpired,
  tooManyAttempts, recordAttempt,
  ROLES, PERMISSIONS, can, canEditPost, canDeletePost, canPublishPost,
  requireLogin, requirePermission, csrfProtect,
  COOKIE,
};
