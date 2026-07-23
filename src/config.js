'use strict';
const path = require('node:path');
const fs = require('node:fs');
const crypto = require('node:crypto');

const ROOT = path.resolve(__dirname, '..');

// Nạp .env đơn giản (không cần dependency)
const envFile = path.join(ROOT, '.env');
if (fs.existsSync(envFile)) {
  for (const line of fs.readFileSync(envFile, 'utf8').split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/i);
    if (m && !(m[1] in process.env)) {
      process.env[m[1]] = m[2].replace(/^["']|["']$/g, '');
    }
  }
}

// SESSION_SECRET: sinh tự động và lưu lại nếu chưa có, tránh mất phiên khi restart
const secretFile = path.join(ROOT, 'data', '.session-secret');
function resolveSecret() {
  if (process.env.SESSION_SECRET) return process.env.SESSION_SECRET;
  fs.mkdirSync(path.dirname(secretFile), { recursive: true });
  if (fs.existsSync(secretFile)) return fs.readFileSync(secretFile, 'utf8').trim();
  const s = crypto.randomBytes(48).toString('hex');
  fs.writeFileSync(secretFile, s, 'utf8');
  return s;
}

const config = {
  ROOT,
  env: process.env.NODE_ENV || 'development',
  port: Number(process.env.PORT || 3000),
  host: process.env.HOST || '0.0.0.0',
  // Dùng cho canonical URL, sitemap, RSS, Open Graph — bắt buộc là URL tuyệt đối cho SEO
  siteUrl: (process.env.SITE_URL || 'http://localhost:3000').replace(/\/+$/, ''),
  sessionSecret: resolveSecret(),
  sessionDays: Number(process.env.SESSION_DAYS || 14),
  dbFile: process.env.DB_FILE || path.join(ROOT, 'data', 'app.db'),
  // UPLOAD_DIR: khi deploy, trỏ vào ổ đĩa lưu trữ (vd /data/uploads) để ảnh không mất
  uploadDir: process.env.UPLOAD_DIR || path.join(ROOT, 'public', 'uploads'),
  maxUploadMB: Number(process.env.MAX_UPLOAD_MB || 8),
  trustProxy: process.env.TRUST_PROXY === '1',
  seedAdminEmail: process.env.SEED_ADMIN_EMAIL || 'admin@seasound.com',
  seedAdminPassword: process.env.SEED_ADMIN_PASSWORD || 'Seasound@2026',
};

fs.mkdirSync(path.dirname(config.dbFile), { recursive: true });
fs.mkdirSync(config.uploadDir, { recursive: true });

module.exports = config;
