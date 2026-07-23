'use strict';
const { marked } = require('marked');
const sanitizeHtml = require('sanitize-html');

// ---------------- Chuỗi tiếng Việt ----------------
const VI_MAP = { đ: 'd', Đ: 'D' };

/** Bỏ dấu tiếng Việt, trả về chữ thường */
function deaccent(str = '') {
  return String(str)
    .replace(/[đĐ]/g, (c) => VI_MAP[c])
    .normalize('NFD')
    .replace(/[̀-ͯ᪰-᫿́̀]/g, '');
}

/** Tạo slug thân thiện SEO từ tiêu đề tiếng Việt */
function slugify(str = '') {
  return deaccent(str)
    .toLowerCase()
    .replace(/['"''""]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .replace(/-{2,}/g, '-')
    .slice(0, 90) || 'bai-viet';
}

/** Slug duy nhất trong một bảng (bỏ qua chính bản ghi đang sửa) */
function uniqueSlug(q, table, base, excludeId = null) {
  let slug = slugify(base);
  let i = 1;
  for (;;) {
    const row = excludeId
      ? q.get(`SELECT id FROM ${table} WHERE slug = ? AND id <> ?`, slug, excludeId)
      : q.get(`SELECT id FROM ${table} WHERE slug = ?`, slug);
    if (!row) return slug;
    i += 1;
    slug = `${slugify(base)}-${i}`;
  }
}

function searchText(...parts) {
  return deaccent(parts.filter(Boolean).join(' '))
    .toLowerCase()
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 20000);
}

// ---------------- Markdown -> HTML an toàn ----------------
const SANITIZE_OPTS = {
  allowedTags: sanitizeHtml.defaults.allowedTags.concat([
    'img', 'figure', 'figcaption', 'h1', 'h2', 'iframe', 'video', 'source', 'audio', 'section', 'span', 'mark',
  ]),
  allowedAttributes: {
    '*': ['class', 'id', 'style', 'title', 'dir', 'lang'],
    a: ['href', 'name', 'target', 'rel'],
    img: ['src', 'alt', 'width', 'height', 'loading', 'decoding', 'srcset', 'sizes'],
    iframe: ['src', 'width', 'height', 'allow', 'allowfullscreen', 'frameborder', 'loading', 'title'],
    video: ['src', 'controls', 'poster', 'width', 'height', 'preload'],
    source: ['src', 'type', 'srcset'],
    audio: ['src', 'controls', 'preload'],
    th: ['colspan', 'rowspan', 'scope'],
    td: ['colspan', 'rowspan'],
  },
  allowedIframeHostnames: ['www.youtube.com', 'youtube.com', 'player.vimeo.com', 'www.google.com'],
  allowedSchemes: ['http', 'https', 'mailto', 'tel', 'data'],
  transformTags: {
    // Liên kết ngoài luôn an toàn + đúng chuẩn SEO
    a: (tagName, attribs) => {
      const href = attribs.href || '';
      const external = /^https?:\/\//i.test(href);
      return {
        tagName: 'a',
        attribs: external
          ? { ...attribs, target: '_blank', rel: attribs.rel || 'noopener noreferrer' }
          : attribs,
      };
    },
    img: (tagName, attribs) => ({
      tagName: 'img',
      attribs: { loading: 'lazy', decoding: 'async', ...attribs, alt: attribs.alt || '' },
    }),
  },
};

marked.setOptions({ gfm: true, breaks: false, headerIds: false, mangle: false });

/** Render nội dung (Markdown hoặc HTML) -> HTML sạch, heading có id để làm mục lục & anchor SEO */
function renderContent(raw = '') {
  const looksHtml = /<(p|div|section|h[1-6]|ul|ol|figure|img|table)\b/i.test(raw);
  let html = looksHtml ? raw : marked.parse(raw || '');
  html = sanitizeHtml(html, SANITIZE_OPTS);
  const used = new Map();
  html = html.replace(/<h([2-4])([^>]*)>([\s\S]*?)<\/h\1>/g, (m, lv, attrs, inner) => {
    if (/\bid=/.test(attrs)) return m;
    let id = slugify(stripTags(inner));
    const n = (used.get(id) || 0) + 1;
    used.set(id, n);
    if (n > 1) id = `${id}-${n}`;
    return `<h${lv}${attrs} id="${id}">${inner}</h${lv}>`;
  });
  return html;
}

function stripTags(html = '') {
  return String(html).replace(/<[^>]*>/g, ' ').replace(/&nbsp;/g, ' ').replace(/\s+/g, ' ').trim();
}

/** Mục lục từ HTML đã render (h2/h3) */
function tableOfContents(html = '') {
  const out = [];
  for (const m of String(html).matchAll(/<h([23])[^>]*id="([^"]+)"[^>]*>([\s\S]*?)<\/h\1>/g)) {
    out.push({ level: Number(m[1]), id: m[2], text: stripTags(m[3]) });
  }
  return out;
}

function excerptFrom(html = '', len = 165) {
  const text = stripTags(html);
  if (text.length <= len) return text;
  return `${text.slice(0, len).replace(/\s+\S*$/, '')}…`;
}

function wordCount(html = '') {
  const t = stripTags(html);
  return t ? t.split(/\s+/).length : 0;
}

function readingTime(html = '') {
  return Math.max(1, Math.round(wordCount(html) / 200));
}

// ---------------- Ngày tháng ----------------
const MONTHS = ['Tháng 1', 'Tháng 2', 'Tháng 3', 'Tháng 4', 'Tháng 5', 'Tháng 6',
  'Tháng 7', 'Tháng 8', 'Tháng 9', 'Tháng 10', 'Tháng 11', 'Tháng 12'];

function toDate(v) {
  if (!v) return null;
  const d = v instanceof Date ? v : new Date(String(v).replace(' ', 'T') + (String(v).includes('T') || String(v).length <= 10 ? '' : 'Z'));
  return Number.isNaN(d.getTime()) ? null : d;
}
function formatDateVN(v) {
  const d = toDate(v);
  if (!d) return '';
  return `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}/${d.getFullYear()}`;
}
function formatMonthVN(v) {
  const d = toDate(v);
  return d ? `${MONTHS[d.getMonth()]}, ${d.getFullYear()}` : '';
}
function formatDateTimeVN(v) {
  const d = toDate(v);
  if (!d) return '';
  return `${formatDateVN(d)} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}
function isoDate(v) {
  const d = toDate(v);
  return d ? d.toISOString() : '';
}
function nowSql() {
  return new Date().toISOString().slice(0, 19).replace('T', ' ');
}

// ---------------- Khác ----------------
function escapeHtml(s = '') {
  return String(s).replace(/[&<>"']/g, (c) =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}
function escapeXml(s = '') {
  return String(s).replace(/[<>&'"]/g, (c) =>
    ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', "'": '&apos;', '"': '&quot;' }[c]));
}
function vnd(n) {
  return `${Number(n || 0).toLocaleString('vi-VN')}đ`;
}
function isEmail(s = '') {
  return /^[^@\s]+@[^@\s]+\.[^@\s]{2,}$/.test(String(s).trim());
}
function clamp(n, min, max) {
  return Math.min(max, Math.max(min, Number(n) || min));
}
function paginate(total, page, perPage) {
  const pages = Math.max(1, Math.ceil(total / perPage));
  const cur = clamp(page, 1, pages);
  return { total, page: cur, perPage, pages, offset: (cur - 1) * perPage, hasPrev: cur > 1, hasNext: cur < pages };
}

module.exports = {
  deaccent, slugify, uniqueSlug, searchText,
  renderContent, stripTags, tableOfContents, excerptFrom, wordCount, readingTime,
  formatDateVN, formatMonthVN, formatDateTimeVN, isoDate, nowSql, toDate, MONTHS,
  escapeHtml, escapeXml, vnd, isEmail, clamp, paginate,
};
