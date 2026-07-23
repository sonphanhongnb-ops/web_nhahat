'use strict';
const { DatabaseSync } = require('node:sqlite');
const config = require('./config');

const db = new DatabaseSync(config.dbFile);

db.exec(`
PRAGMA journal_mode = WAL;
PRAGMA foreign_keys = ON;
PRAGMA busy_timeout = 5000;
`);

db.exec(`
-- ============ NGƯỜI DÙNG & PHÂN QUYỀN ============
CREATE TABLE IF NOT EXISTS users (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  email         TEXT    NOT NULL UNIQUE,
  name          TEXT    NOT NULL,
  password_hash TEXT    NOT NULL,
  role          TEXT    NOT NULL DEFAULT 'author',   -- admin | editor | author | viewer
  bio           TEXT    NOT NULL DEFAULT '',
  avatar        TEXT    NOT NULL DEFAULT '',
  active        INTEGER NOT NULL DEFAULT 1,
  last_login_at TEXT,
  created_at    TEXT    NOT NULL DEFAULT (datetime('now')),
  updated_at    TEXT    NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS sessions (
  id         TEXT PRIMARY KEY,                        -- sha256 của token trong cookie
  user_id    INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  csrf       TEXT NOT NULL,
  ip         TEXT NOT NULL DEFAULT '',
  user_agent TEXT NOT NULL DEFAULT '',
  expires_at TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_sessions_user ON sessions(user_id);

CREATE TABLE IF NOT EXISTS login_attempts (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  email      TEXT NOT NULL,
  ip         TEXT NOT NULL DEFAULT '',
  ok         INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_attempts ON login_attempts(email, created_at);

-- ============ NỘI DUNG ============
CREATE TABLE IF NOT EXISTS categories (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  name        TEXT NOT NULL,
  slug        TEXT NOT NULL UNIQUE,
  description TEXT NOT NULL DEFAULT '',
  meta_title  TEXT NOT NULL DEFAULT '',
  meta_desc   TEXT NOT NULL DEFAULT '',
  sort_order  INTEGER NOT NULL DEFAULT 0,
  created_at  TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS tags (
  id   INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  slug TEXT NOT NULL UNIQUE
);

CREATE TABLE IF NOT EXISTS posts (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  type          TEXT    NOT NULL DEFAULT 'post',      -- post | page
  title         TEXT    NOT NULL,
  slug          TEXT    NOT NULL UNIQUE,
  excerpt       TEXT    NOT NULL DEFAULT '',
  content       TEXT    NOT NULL DEFAULT '',          -- Markdown / HTML
  content_html  TEXT    NOT NULL DEFAULT '',          -- đã render + làm sạch
  cover_image   TEXT    NOT NULL DEFAULT '',
  cover_alt     TEXT    NOT NULL DEFAULT '',
  category_id   INTEGER REFERENCES categories(id) ON DELETE SET NULL,
  author_id     INTEGER REFERENCES users(id) ON DELETE SET NULL,
  status        TEXT    NOT NULL DEFAULT 'draft',     -- draft | review | published | archived
  featured      INTEGER NOT NULL DEFAULT 0,
  -- SEO
  meta_title    TEXT NOT NULL DEFAULT '',
  meta_desc     TEXT NOT NULL DEFAULT '',
  focus_keyword TEXT NOT NULL DEFAULT '',
  canonical_url TEXT NOT NULL DEFAULT '',
  og_image      TEXT NOT NULL DEFAULT '',
  og_title      TEXT NOT NULL DEFAULT '',
  og_desc       TEXT NOT NULL DEFAULT '',
  schema_type   TEXT NOT NULL DEFAULT 'Article',      -- Article | NewsArticle | BlogPosting | Event | WebPage
  noindex       INTEGER NOT NULL DEFAULT 0,
  nofollow      INTEGER NOT NULL DEFAULT 0,
  sitemap_priority TEXT NOT NULL DEFAULT '0.7',
  sitemap_freq  TEXT NOT NULL DEFAULT 'weekly',
  seo_score     INTEGER NOT NULL DEFAULT 0,
  search_text   TEXT NOT NULL DEFAULT '',             -- không dấu, chữ thường — phục vụ tìm kiếm
  reading_time  INTEGER NOT NULL DEFAULT 1,
  views         INTEGER NOT NULL DEFAULT 0,
  published_at  TEXT,
  created_at    TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at    TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_posts_status  ON posts(status, published_at DESC);
CREATE INDEX IF NOT EXISTS idx_posts_cat     ON posts(category_id);
CREATE INDEX IF NOT EXISTS idx_posts_author  ON posts(author_id);

CREATE TABLE IF NOT EXISTS post_tags (
  post_id INTEGER NOT NULL REFERENCES posts(id) ON DELETE CASCADE,
  tag_id  INTEGER NOT NULL REFERENCES tags(id)  ON DELETE CASCADE,
  PRIMARY KEY (post_id, tag_id)
);

CREATE TABLE IF NOT EXISTS post_revisions (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  post_id    INTEGER NOT NULL REFERENCES posts(id) ON DELETE CASCADE,
  user_id    INTEGER REFERENCES users(id) ON DELETE SET NULL,
  title      TEXT NOT NULL DEFAULT '',
  content    TEXT NOT NULL DEFAULT '',
  note       TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_rev_post ON post_revisions(post_id, created_at DESC);

-- Chuyển hướng 301 khi đổi slug (giữ SEO)
CREATE TABLE IF NOT EXISTS redirects (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  from_path  TEXT NOT NULL UNIQUE,
  to_path    TEXT NOT NULL,
  code       INTEGER NOT NULL DEFAULT 301,
  hits       INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- ============ THƯ VIỆN ẢNH ============
CREATE TABLE IF NOT EXISTS media (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  filename   TEXT NOT NULL,
  url        TEXT NOT NULL,
  mime       TEXT NOT NULL DEFAULT '',
  size       INTEGER NOT NULL DEFAULT 0,
  alt        TEXT NOT NULL DEFAULT '',
  caption    TEXT NOT NULL DEFAULT '',
  user_id    INTEGER REFERENCES users(id) ON DELETE SET NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- ============ LỊCH DIỄN & ĐẶT VÉ ============
CREATE TABLE IF NOT EXISTS shows (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  title       TEXT NOT NULL,
  slug        TEXT NOT NULL UNIQUE,
  subtitle    TEXT NOT NULL DEFAULT '',
  description TEXT NOT NULL DEFAULT '',
  show_date   TEXT NOT NULL,                          -- YYYY-MM-DD
  show_time   TEXT NOT NULL DEFAULT '20:00',
  venue       TEXT NOT NULL DEFAULT 'Nhà hát Seaphony',
  price_a     INTEGER NOT NULL DEFAULT 600000,
  price_b     INTEGER NOT NULL DEFAULT 400000,
  on_sale     INTEGER NOT NULL DEFAULT 1,
  active      INTEGER NOT NULL DEFAULT 1,
  created_at  TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_shows_date ON shows(show_date);

CREATE TABLE IF NOT EXISTS bookings (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  code        TEXT NOT NULL UNIQUE,
  show_id     INTEGER REFERENCES shows(id) ON DELETE SET NULL,
  name        TEXT NOT NULL,
  email       TEXT NOT NULL,
  phone       TEXT NOT NULL DEFAULT '',
  seats       TEXT NOT NULL DEFAULT '[]',             -- JSON
  seat_count  INTEGER NOT NULL DEFAULT 0,
  total       INTEGER NOT NULL DEFAULT 0,
  status      TEXT NOT NULL DEFAULT 'pending',        -- pending | confirmed | cancelled
  note        TEXT NOT NULL DEFAULT '',
  created_at  TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_bookings_show ON bookings(show_id, created_at DESC);

CREATE TABLE IF NOT EXISTS subscribers (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  email      TEXT NOT NULL UNIQUE,
  source     TEXT NOT NULL DEFAULT 'site',
  active     INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS contacts (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  name       TEXT NOT NULL,
  email      TEXT NOT NULL,
  phone      TEXT NOT NULL DEFAULT '',
  subject    TEXT NOT NULL DEFAULT '',
  message    TEXT NOT NULL,
  handled    INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- ============ CẤU HÌNH & NHẬT KÝ ============
CREATE TABLE IF NOT EXISTS settings (
  key   TEXT PRIMARY KEY,
  value TEXT NOT NULL DEFAULT ''
);

CREATE TABLE IF NOT EXISTS activity_log (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id    INTEGER REFERENCES users(id) ON DELETE SET NULL,
  action     TEXT NOT NULL,
  entity     TEXT NOT NULL DEFAULT '',
  entity_id  INTEGER,
  detail     TEXT NOT NULL DEFAULT '',
  ip         TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_log ON activity_log(created_at DESC);

CREATE TABLE IF NOT EXISTS post_views (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  post_id    INTEGER NOT NULL REFERENCES posts(id) ON DELETE CASCADE,
  day        TEXT NOT NULL,
  count      INTEGER NOT NULL DEFAULT 0,
  UNIQUE(post_id, day)
);
`);

// ---------- Helpers ----------
const q = {
  all(sql, ...params) { return db.prepare(sql).all(...params); },
  get(sql, ...params) { return db.prepare(sql).get(...params); },
  run(sql, ...params) { return db.prepare(sql).run(...params); },
  tx(fn) {
    db.exec('BEGIN');
    try { const r = fn(); db.exec('COMMIT'); return r; }
    catch (e) { try { db.exec('ROLLBACK'); } catch (_) {} throw e; }
  },
};

// ---------- Settings ----------
const DEFAULT_SETTINGS = {
  site_name: 'THỨC by SEASOUND',
  site_tagline: 'Dàn Khí Nhạc Bản Địa Đông Nam Á',
  site_description:
    'THỨC — vở diễn đầu tiên của SEASOUND, Dàn Khí Nhạc Bản Địa Đông Nam Á, tại Trung tâm Biểu diễn Alluvium, Hoa Lư, Ninh Bình. Đặt vé, lịch diễn và giá vé.',
  site_description_en:
    'THỨC — the debut work of SEASOUND, the Southeast Asian Indigenous Music Ensemble, at the Alluvium Performing Arts Center, Hoa Lư, Ninh Bình. Reserve seats, schedule and prices.',
  site_keywords: 'THỨC, SEASOUND, khí nhạc bản địa, Alluvium, Hoa Lư, Ninh Bình, đặt vé, Nguyễn Nhất Lý',
  site_locale: 'vi_VN',
  default_og_image: '/img/hero.jpg',
  organization_name: 'SEASOUND',
  organization_phone: '',
  organization_email: 'tickets@seasound.com',
  organization_address: 'Trung tâm Biểu diễn Alluvium, Đường Đinh Tiên Hoàng, Hoa Lư, Ninh Bình',
  organization_lat: '20.2506',
  organization_lng: '105.9745',
  social_facebook: '',
  social_youtube: '',
  social_instagram: '',
  google_analytics_id: '',
  google_site_verification: '',
  bing_site_verification: '',
  facebook_domain_verification: '',
  robots_extra: '',
  posts_per_page: '9',
  seo_title_template: '%title% — %site%',
};

function getSetting(key, fallback = '') {
  const row = q.get('SELECT value FROM settings WHERE key = ?', key);
  if (row) return row.value;
  return key in DEFAULT_SETTINGS ? DEFAULT_SETTINGS[key] : fallback;
}
function setSetting(key, value) {
  q.run(
    'INSERT INTO settings(key, value) VALUES(?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value',
    key, String(value ?? '')
  );
}
function allSettings() {
  const out = { ...DEFAULT_SETTINGS };
  for (const r of q.all('SELECT key, value FROM settings')) out[r.key] = r.value;
  return out;
}

function log(userId, action, entity = '', entityId = null, detail = '', ip = '') {
  try {
    q.run(
      'INSERT INTO activity_log(user_id, action, entity, entity_id, detail, ip) VALUES(?,?,?,?,?,?)',
      userId ?? null, action, entity, entityId ?? null, detail, ip
    );
  } catch (_e) { /* nhật ký không được phép làm hỏng request */ }
}

module.exports = { db, q, getSetting, setSetting, allSettings, DEFAULT_SETTINGS, log };
