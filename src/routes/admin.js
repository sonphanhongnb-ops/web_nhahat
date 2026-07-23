'use strict';
const path = require('node:path');
const fs = require('node:fs');
const crypto = require('node:crypto');
const express = require('express');
const multer = require('multer');

const config = require('../config');
const { q, getSetting, setSetting, allSettings, DEFAULT_SETTINGS, log } = require('../db');
const A = require('../auth');
const U = require('../utils');
const SEO = require('../seo');
const { posts, categories, tags, shows } = require('../models');

const router = express.Router();

// ============================================================
//  LỚP CHUNG
// ============================================================
router.use(A.requireLogin);
router.use(A.csrfProtect);
router.use((req, res, next) => {
  res.locals.adminPath = req.path;
  res.locals.seo = SEO.buildMeta({ title: 'Quản trị', path: req.originalUrl, noindex: true, nofollow: true });
  res.locals.jsonLd = [];
  res.locals.pendingCount = q.get("SELECT COUNT(*) AS n FROM posts WHERE status='review'").n;
  next();
});

/** Chuyển hướng kèm thông báo (dùng cookie ngắn hạn thay session flash) */
function flash(res, type, message) {
  res.cookie('sea_flash', JSON.stringify({ type, message }), { maxAge: 10_000, httpOnly: false, path: '/' });
}
router.use((req, res, next) => {
  if (req.cookies?.sea_flash) {
    try { res.locals.flash = JSON.parse(req.cookies.sea_flash); } catch (_e) { res.locals.flash = null; }
    res.clearCookie('sea_flash', { path: '/' });
  }
  next();
});

const asInt = (v, d = 0) => (Number.isFinite(Number(v)) ? Number(v) : d);
const bool = (v) => (v === '1' || v === 'on' || v === 'true' || v === true ? 1 : 0);

// ============================================================
//  BẢNG ĐIỀU KHIỂN
// ============================================================
router.get('/', (req, res) => {
  const mine = !A.can(req.user, 'post.edit.any');
  const scope = mine ? ' AND author_id = ?' : '';
  const args = mine ? [req.user.id] : [];

  const stats = {
    published: q.get(`SELECT COUNT(*) AS n FROM posts WHERE status='published' AND type='post'${scope}`, ...args).n,
    draft: q.get(`SELECT COUNT(*) AS n FROM posts WHERE status='draft'${scope}`, ...args).n,
    review: q.get(`SELECT COUNT(*) AS n FROM posts WHERE status='review'${scope}`, ...args).n,
    pages: q.get("SELECT COUNT(*) AS n FROM posts WHERE type='page'").n,
    views: q.get(`SELECT COALESCE(SUM(views),0) AS n FROM posts WHERE 1=1${scope}`, ...args).n,
    users: q.get('SELECT COUNT(*) AS n FROM users').n,
    bookings: q.get("SELECT COUNT(*) AS n FROM bookings WHERE status <> 'cancelled'").n,
    revenue: q.get("SELECT COALESCE(SUM(total),0) AS n FROM bookings WHERE status='confirmed'").n,
    subscribers: q.get('SELECT COUNT(*) AS n FROM subscribers WHERE active=1').n,
    contacts: q.get('SELECT COUNT(*) AS n FROM contacts WHERE handled=0').n,
    avgSeo: q.get(`SELECT COALESCE(ROUND(AVG(seo_score)),0) AS n FROM posts WHERE type='post'${scope}`, ...args).n,
  };

  // Lượt xem 14 ngày gần nhất
  const series = q.all(`
    SELECT day, SUM(count) AS n FROM post_views
     WHERE day >= date('now','-13 days') GROUP BY day ORDER BY day`);
  const days = [];
  for (let i = 13; i >= 0; i -= 1) {
    const d = new Date(Date.now() - i * 864e5).toISOString().slice(0, 10);
    days.push({ day: d, label: d.slice(8) + '/' + d.slice(5, 7), n: series.find((s) => s.day === d)?.n || 0 });
  }

  res.render('admin/dashboard', {
    title: 'Bảng điều khiển',
    stats,
    days,
    maxView: Math.max(1, ...days.map((d) => d.n)),
    recent: posts.adminList({ perPage: 6, type: 'post', authorId: mine ? req.user.id : null }).rows,
    needReview: A.can(req.user, 'post.publish.any')
      ? posts.adminList({ perPage: 5, status: 'review' }).rows : [],
    lowSeo: q.all(`
      SELECT id, title, slug, seo_score FROM posts
       WHERE type='post' AND status='published' AND seo_score < 70${scope}
       ORDER BY seo_score ASC LIMIT 5`, ...args),
    latestBookings: A.can(req.user, 'booking.view')
      ? q.all(`SELECT b.*, s.title AS show_title FROM bookings b
                 LEFT JOIN shows s ON s.id = b.show_id
                ORDER BY b.created_at DESC LIMIT 5`) : [],
  });
});

// ============================================================
//  BÀI VIẾT & TRANG
// ============================================================
function postFormData(req) {
  const b = req.body;
  return {
    type: b.type === 'page' ? 'page' : 'post',
    title: String(b.title || '').trim().slice(0, 250),
    slug: String(b.slug || '').trim(),
    excerpt: String(b.excerpt || '').trim().slice(0, 500),
    content: String(b.content || ''),
    cover_image: String(b.cover_image || '').trim(),
    cover_alt: String(b.cover_alt || '').trim().slice(0, 200),
    category_id: b.category_id ? asInt(b.category_id) : null,
    status: ['draft', 'review', 'published', 'archived'].includes(b.status) ? b.status : 'draft',
    featured: bool(b.featured),
    meta_title: String(b.meta_title || '').trim().slice(0, 200),
    meta_desc: String(b.meta_desc || '').trim().slice(0, 320),
    focus_keyword: String(b.focus_keyword || '').trim().slice(0, 120),
    canonical_url: String(b.canonical_url || '').trim().slice(0, 400),
    og_image: String(b.og_image || '').trim(),
    og_title: String(b.og_title || '').trim().slice(0, 200),
    og_desc: String(b.og_desc || '').trim().slice(0, 320),
    schema_type: ['Article', 'NewsArticle', 'BlogPosting', 'Event', 'WebPage'].includes(b.schema_type) ? b.schema_type : 'Article',
    noindex: bool(b.noindex),
    nofollow: bool(b.nofollow),
    sitemap_priority: String(b.sitemap_priority || '0.7'),
    sitemap_freq: String(b.sitemap_freq || 'weekly'),
    published_at: String(b.published_at || '').trim(),
    tagString: String(b.tags || ''),
  };
}

router.get('/posts', A.requirePermission('post.create'), (req, res) => {
  const type = req.query.type === 'page' ? 'page' : 'post';
  const mine = !A.can(req.user, 'post.edit.any');
  const { rows, pg } = posts.adminList({
    page: asInt(req.query.page, 1),
    status: String(req.query.status || ''),
    search: String(req.query.q || ''),
    categoryId: req.query.category || '',
    type,
    authorId: mine ? req.user.id : null,
  });
  res.render('admin/posts', {
    title: type === 'page' ? 'Trang nội dung' : 'Bài viết',
    type,
    posts: rows,
    pg,
    categories: categories.all(),
    counts: {
      all: q.get('SELECT COUNT(*) AS n FROM posts WHERE type=?', type).n,
      draft: q.get("SELECT COUNT(*) AS n FROM posts WHERE type=? AND status='draft'", type).n,
      review: q.get("SELECT COUNT(*) AS n FROM posts WHERE type=? AND status='review'", type).n,
      published: q.get("SELECT COUNT(*) AS n FROM posts WHERE type=? AND status='published'", type).n,
      archived: q.get("SELECT COUNT(*) AS n FROM posts WHERE type=? AND status='archived'", type).n,
    },
  });
});

router.get('/posts/new', A.requirePermission('post.create'), (req, res) => {
  const type = req.query.type === 'page' ? 'page' : 'post';
  res.render('admin/post-edit', {
    title: type === 'page' ? 'Tạo trang mới' : 'Viết bài mới',
    post: {
      id: null, type, title: '', slug: '', excerpt: '', content: '', cover_image: '', cover_alt: '',
      category_id: null, status: 'draft', featured: 0, meta_title: '', meta_desc: '', focus_keyword: '',
      canonical_url: '', og_image: '', og_title: '', og_desc: '', schema_type: type === 'page' ? 'WebPage' : 'Article',
      noindex: 0, nofollow: 0, sitemap_priority: '0.7', sitemap_freq: 'weekly', published_at: '',
      seo_score: 0, tags: [],
    },
    categories: categories.all(),
    allTags: tags.all(),
    media: q.all('SELECT * FROM media ORDER BY created_at DESC LIMIT 60'),
    analysis: null,
    revisions: [],
    canPublish: A.canPublishPost(req.user, { author_id: req.user.id }),
  });
});

router.get('/posts/:id/edit', A.requirePermission('post.create'), (req, res, next) => {
  const post = posts.byId(asInt(req.params.id));
  if (!post) return next();
  if (!A.canEditPost(req.user, post)) {
    return res.status(403).render('admin/403', { title: 'Không đủ quyền', permission: 'post.edit.any' });
  }
  res.render('admin/post-edit', {
    title: post.type === 'page' ? 'Sửa trang' : 'Sửa bài viết',
    post,
    categories: categories.all(),
    allTags: tags.all(),
    media: q.all('SELECT * FROM media ORDER BY created_at DESC LIMIT 60'),
    analysis: SEO.analyzePost(post),
    revisions: q.all(
      `SELECT r.*, u.name AS user_name FROM post_revisions r
         LEFT JOIN users u ON u.id = r.user_id
        WHERE r.post_id = ? ORDER BY r.created_at DESC LIMIT 10`, post.id),
    canPublish: A.canPublishPost(req.user, post),
  });
});

router.post('/posts/save', A.requirePermission('post.create'), (req, res) => {
  const id = asInt(req.body.id, 0);
  const d = postFormData(req);
  const existing = id ? posts.byId(id) : null;

  if (existing && !A.canEditPost(req.user, existing)) {
    return res.status(403).render('admin/403', { title: 'Không đủ quyền', permission: 'post.edit.any' });
  }
  if (!d.title) {
    flash(res, 'error', 'Tiêu đề không được để trống.');
    return res.redirect(id ? `/admin/posts/${id}/edit` : '/admin/posts/new');
  }

  // Không cho tự xuất bản nếu thiếu quyền
  if (d.status === 'published' && !A.canPublishPost(req.user, existing || { author_id: req.user.id })) {
    d.status = 'review';
    flash(res, 'warn', 'Bạn chưa có quyền xuất bản — bài đã được gửi chờ duyệt.');
  }

  const content_html = U.renderContent(d.content);
  const excerpt = d.excerpt || U.excerptFrom(content_html);
  const slugBase = d.slug || d.title;
  const slug = U.uniqueSlug(q, 'posts', slugBase, id || null);
  const search_text = U.searchText(d.title, excerpt, content_html, d.focus_keyword, d.tagString);
  const reading_time = U.readingTime(content_html);

  const analysis = SEO.analyzePost({ ...d, slug, content_html, excerpt });

  let publishedAt = d.published_at ? d.published_at.replace('T', ' ') + ':00' : null;
  if (d.status === 'published' && !publishedAt) publishedAt = existing?.published_at || U.nowSql();
  if (d.status !== 'published' && !d.published_at) publishedAt = existing?.published_at || null;

  let postId = id;
  if (existing) {
    // Lưu bản sửa đổi trước khi ghi đè
    q.run(
      'INSERT INTO post_revisions(post_id, user_id, title, content, note) VALUES(?,?,?,?,?)',
      existing.id, req.user.id, existing.title, existing.content, 'Tự động lưu trước khi cập nhật'
    );
    // Đổi slug -> tạo chuyển hướng 301 giữ nguyên giá trị SEO
    if (existing.slug !== slug && existing.status === 'published') {
      const from = existing.type === 'page' ? `/trang/${existing.slug}` : `/tin-tuc/${existing.slug}`;
      const to = existing.type === 'page' ? `/trang/${slug}` : `/tin-tuc/${slug}`;
      q.run('INSERT OR REPLACE INTO redirects(from_path, to_path, code) VALUES(?,?,301)', from, to);
    }
    q.run(
      `UPDATE posts SET type=?, title=?, slug=?, excerpt=?, content=?, content_html=?, cover_image=?, cover_alt=?,
        category_id=?, status=?, featured=?, meta_title=?, meta_desc=?, focus_keyword=?, canonical_url=?,
        og_image=?, og_title=?, og_desc=?, schema_type=?, noindex=?, nofollow=?, sitemap_priority=?, sitemap_freq=?,
        seo_score=?, search_text=?, reading_time=?, published_at=?, updated_at=datetime('now')
       WHERE id=?`,
      d.type, d.title, slug, excerpt, d.content, content_html, d.cover_image, d.cover_alt,
      d.category_id, d.status, d.featured, d.meta_title, d.meta_desc, d.focus_keyword, d.canonical_url,
      d.og_image, d.og_title, d.og_desc, d.schema_type, d.noindex, d.nofollow, d.sitemap_priority, d.sitemap_freq,
      analysis.score, search_text, reading_time, publishedAt, existing.id
    );
    log(req.user.id, 'post.update', 'post', existing.id, d.title, req.ip);
  } else {
    q.run(
      `INSERT INTO posts(type, title, slug, excerpt, content, content_html, cover_image, cover_alt, category_id,
        author_id, status, featured, meta_title, meta_desc, focus_keyword, canonical_url, og_image, og_title, og_desc,
        schema_type, noindex, nofollow, sitemap_priority, sitemap_freq, seo_score, search_text, reading_time, published_at)
       VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
      d.type, d.title, slug, excerpt, d.content, content_html, d.cover_image, d.cover_alt, d.category_id,
      req.user.id, d.status, d.featured, d.meta_title, d.meta_desc, d.focus_keyword, d.canonical_url,
      d.og_image, d.og_title, d.og_desc, d.schema_type, d.noindex, d.nofollow, d.sitemap_priority, d.sitemap_freq,
      analysis.score, search_text, reading_time, publishedAt
    );
    postId = q.get('SELECT last_insert_rowid() AS id').id;
    log(req.user.id, 'post.create', 'post', postId, d.title, req.ip);
  }

  posts.syncTags(postId, d.tagString);
  flash(res, 'success', `Đã lưu “${d.title}” · Điểm SEO ${analysis.score}/100 (${analysis.grade}).`);
  res.redirect(`/admin/posts/${postId}/edit`);
});

router.post('/posts/:id/status', A.requirePermission('post.create'), (req, res) => {
  const post = posts.byId(asInt(req.params.id));
  const status = String(req.body.status || '');
  if (!post) return res.redirect('/admin/posts');
  if (!A.canEditPost(req.user, post)) return res.status(403).render('admin/403', { title: 'Không đủ quyền', permission: 'post.edit.any' });
  if (status === 'published' && !A.canPublishPost(req.user, post)) {
    flash(res, 'error', 'Bạn không có quyền xuất bản bài viết này.');
    return res.redirect('/admin/posts');
  }
  const publishedAt = status === 'published' && !post.published_at ? U.nowSql() : post.published_at;
  q.run("UPDATE posts SET status=?, published_at=?, updated_at=datetime('now') WHERE id=?", status, publishedAt, post.id);
  log(req.user.id, `post.status.${status}`, 'post', post.id, post.title, req.ip);
  flash(res, 'success', `Đã chuyển “${post.title}” sang trạng thái ${status}.`);
  res.redirect(req.get('referer') || '/admin/posts');
});

router.post('/posts/:id/delete', A.requirePermission('post.create'), (req, res) => {
  const post = posts.byId(asInt(req.params.id));
  if (!post) return res.redirect('/admin/posts');
  if (!A.canDeletePost(req.user, post)) {
    flash(res, 'error', 'Bạn không có quyền xoá bài viết này.');
    return res.redirect('/admin/posts');
  }
  q.run('DELETE FROM posts WHERE id = ?', post.id);
  log(req.user.id, 'post.delete', 'post', post.id, post.title, req.ip);
  flash(res, 'success', `Đã xoá “${post.title}”.`);
  res.redirect(`/admin/posts?type=${post.type}`);
});

router.post('/posts/:id/restore/:revId', A.requirePermission('post.create'), (req, res) => {
  const post = posts.byId(asInt(req.params.id));
  const rev = q.get('SELECT * FROM post_revisions WHERE id = ? AND post_id = ?', asInt(req.params.revId), post?.id);
  if (!post || !rev) return res.redirect('/admin/posts');
  if (!A.canEditPost(req.user, post)) return res.status(403).render('admin/403', { title: 'Không đủ quyền', permission: 'post.edit.any' });
  const html = U.renderContent(rev.content);
  q.run(
    "UPDATE posts SET title=?, content=?, content_html=?, updated_at=datetime('now') WHERE id=?",
    rev.title, rev.content, html, post.id
  );
  log(req.user.id, 'post.restore', 'post', post.id, `revision ${rev.id}`, req.ip);
  flash(res, 'success', 'Đã khôi phục phiên bản trước.');
  res.redirect(`/admin/posts/${post.id}/edit`);
});

// ============================================================
//  CHUYÊN MỤC
// ============================================================
router.get('/categories', A.requirePermission('category.manage'), (req, res) => {
  res.render('admin/categories', { title: 'Chuyên mục', categories: categories.all() });
});

router.post('/categories/save', A.requirePermission('category.manage'), (req, res) => {
  const id = asInt(req.body.id, 0);
  const name = String(req.body.name || '').trim();
  if (!name) { flash(res, 'error', 'Tên chuyên mục không được trống.'); return res.redirect('/admin/categories'); }
  const slug = U.uniqueSlug(q, 'categories', req.body.slug || name, id || null);
  const args = [
    name, slug, String(req.body.description || '').slice(0, 500),
    String(req.body.meta_title || '').slice(0, 200), String(req.body.meta_desc || '').slice(0, 320),
    asInt(req.body.sort_order, 0),
  ];
  if (id) {
    q.run('UPDATE categories SET name=?, slug=?, description=?, meta_title=?, meta_desc=?, sort_order=? WHERE id=?', ...args, id);
    log(req.user.id, 'category.update', 'category', id, name, req.ip);
  } else {
    q.run('INSERT INTO categories(name, slug, description, meta_title, meta_desc, sort_order) VALUES(?,?,?,?,?,?)', ...args);
    log(req.user.id, 'category.create', 'category', null, name, req.ip);
  }
  flash(res, 'success', `Đã lưu chuyên mục “${name}”.`);
  res.redirect('/admin/categories');
});

router.post('/categories/:id/delete', A.requirePermission('category.manage'), (req, res) => {
  const id = asInt(req.params.id);
  const cat = categories.byId(id);
  if (cat) {
    q.run('DELETE FROM categories WHERE id = ?', id);
    log(req.user.id, 'category.delete', 'category', id, cat.name, req.ip);
    flash(res, 'success', `Đã xoá chuyên mục “${cat.name}”. Các bài viết liên quan chuyển về "chưa phân loại".`);
  }
  res.redirect('/admin/categories');
});

// ============================================================
//  THẺ
// ============================================================
router.get('/tags', A.requirePermission('tag.manage'), (req, res) => {
  res.render('admin/tags', { title: 'Thẻ', tags: tags.all() });
});

router.post('/tags/save', A.requirePermission('tag.manage'), (req, res) => {
  const id = asInt(req.body.id, 0);
  const name = String(req.body.name || '').trim();
  if (!name) return res.redirect('/admin/tags');
  const slug = U.uniqueSlug(q, 'tags', req.body.slug || name, id || null);
  if (id) q.run('UPDATE tags SET name=?, slug=? WHERE id=?', name, slug, id);
  else q.run('INSERT INTO tags(name, slug) VALUES(?,?)', name, slug);
  flash(res, 'success', `Đã lưu thẻ “${name}”.`);
  res.redirect('/admin/tags');
});

router.post('/tags/:id/delete', A.requirePermission('tag.manage'), (req, res) => {
  q.run('DELETE FROM tags WHERE id = ?', asInt(req.params.id));
  flash(res, 'success', 'Đã xoá thẻ.');
  res.redirect('/admin/tags');
});

// ============================================================
//  THƯ VIỆN ẢNH
// ============================================================
const storage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, config.uploadDir),
  filename: (_req, file, cb) => {
    const ext = (path.extname(file.originalname) || '').toLowerCase().slice(0, 8);
    const base = U.slugify(path.basename(file.originalname, path.extname(file.originalname))).slice(0, 60);
    cb(null, `${Date.now().toString(36)}-${crypto.randomBytes(3).toString('hex')}-${base}${ext}`);
  },
});
const ALLOWED_MIME = ['image/jpeg', 'image/png', 'image/webp', 'image/gif', 'image/avif', 'image/svg+xml'];
const upload = multer({
  storage,
  limits: { fileSize: config.maxUploadMB * 1024 * 1024, files: 10 },
  fileFilter: (_req, file, cb) => {
    if (!ALLOWED_MIME.includes(file.mimetype)) return cb(new Error('Chỉ chấp nhận tệp ảnh (JPG, PNG, WebP, GIF, AVIF, SVG).'));
    return cb(null, true);
  },
});

router.get('/media', A.requirePermission('media.upload'), (req, res) => {
  const page = asInt(req.query.page, 1);
  const total = q.get('SELECT COUNT(*) AS n FROM media').n;
  const pg = U.paginate(total, page, 24);
  res.render('admin/media', {
    title: 'Thư viện ảnh',
    pg,
    media: q.all(
      `SELECT m.*, u.name AS user_name FROM media m LEFT JOIN users u ON u.id = m.user_id
        ORDER BY m.created_at DESC LIMIT ? OFFSET ?`, pg.perPage, pg.offset),
    maxMB: config.maxUploadMB,
  });
});

router.post('/media/upload', A.requirePermission('media.upload'), upload.array('files', 10), (req, res) => {
  const files = req.files || [];
  for (const f of files) {
    q.run(
      'INSERT INTO media(filename, url, mime, size, alt, user_id) VALUES(?,?,?,?,?,?)',
      f.filename, `/uploads/${f.filename}`, f.mimetype, f.size,
      U.slugify(path.basename(f.originalname, path.extname(f.originalname))).replace(/-/g, ' '), req.user.id
    );
  }
  log(req.user.id, 'media.upload', 'media', null, `${files.length} tệp`, req.ip);
  if (req.get('x-requested-with') === 'fetch') {
    return res.json({
      ok: true,
      files: files.map((f) => ({ url: `/uploads/${f.filename}`, name: f.filename })),
    });
  }
  flash(res, 'success', `Đã tải lên ${files.length} tệp.`);
  return res.redirect('/admin/media');
});

router.post('/media/:id/update', A.requirePermission('media.upload'), (req, res) => {
  const m = q.get('SELECT * FROM media WHERE id = ?', asInt(req.params.id));
  if (m && (m.user_id === req.user.id || A.can(req.user, 'media.delete.any'))) {
    q.run('UPDATE media SET alt=?, caption=? WHERE id=?',
      String(req.body.alt || '').slice(0, 200), String(req.body.caption || '').slice(0, 300), m.id);
    flash(res, 'success', 'Đã cập nhật thông tin ảnh (ALT rất quan trọng cho SEO ảnh).');
  }
  res.redirect('/admin/media');
});

router.post('/media/:id/delete', A.requirePermission('media.upload'), (req, res) => {
  const m = q.get('SELECT * FROM media WHERE id = ?', asInt(req.params.id));
  if (m && (m.user_id === req.user.id || A.can(req.user, 'media.delete.any'))) {
    try { fs.unlinkSync(path.join(config.uploadDir, m.filename)); } catch (_e) { /* tệp có thể đã bị xoá */ }
    q.run('DELETE FROM media WHERE id = ?', m.id);
    log(req.user.id, 'media.delete', 'media', m.id, m.filename, req.ip);
    flash(res, 'success', 'Đã xoá ảnh.');
  } else {
    flash(res, 'error', 'Bạn không có quyền xoá ảnh này.');
  }
  res.redirect('/admin/media');
});

// ============================================================
//  LỊCH DIỄN
// ============================================================
router.get('/shows', A.requirePermission('show.manage'), (req, res) => {
  res.render('admin/shows', { title: 'Lịch diễn', shows: shows.all() });
});

router.post('/shows/save', A.requirePermission('show.manage'), (req, res) => {
  const id = asInt(req.body.id, 0);
  const title = String(req.body.title || '').trim();
  const date = String(req.body.show_date || '').trim();
  if (!title || !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    flash(res, 'error', 'Cần nhập tên chương trình và ngày diễn hợp lệ (YYYY-MM-DD).');
    return res.redirect('/admin/shows');
  }
  const slug = U.uniqueSlug(q, 'shows', req.body.slug || `${title}-${date}`, id || null);
  const args = [
    title, slug, String(req.body.subtitle || '').slice(0, 200), String(req.body.description || '').slice(0, 2000),
    date, String(req.body.show_time || '20:00').slice(0, 5), String(req.body.venue || 'Nhà hát Seaphony').slice(0, 160),
    asInt(req.body.price_a, 600000), asInt(req.body.price_b, 400000), bool(req.body.on_sale), bool(req.body.active),
  ];
  if (id) {
    q.run(`UPDATE shows SET title=?, slug=?, subtitle=?, description=?, show_date=?, show_time=?, venue=?,
             price_a=?, price_b=?, on_sale=?, active=? WHERE id=?`, ...args, id);
    log(req.user.id, 'show.update', 'show', id, title, req.ip);
  } else {
    q.run(`INSERT INTO shows(title, slug, subtitle, description, show_date, show_time, venue, price_a, price_b, on_sale, active)
           VALUES(?,?,?,?,?,?,?,?,?,?,?)`, ...args);
    log(req.user.id, 'show.create', 'show', null, title, req.ip);
  }
  flash(res, 'success', `Đã lưu đêm diễn “${title}”.`);
  res.redirect('/admin/shows');
});

router.post('/shows/:id/delete', A.requirePermission('show.manage'), (req, res) => {
  q.run('DELETE FROM shows WHERE id = ?', asInt(req.params.id));
  log(req.user.id, 'show.delete', 'show', asInt(req.params.id), '', req.ip);
  flash(res, 'success', 'Đã xoá đêm diễn.');
  res.redirect('/admin/shows');
});

// ============================================================
//  ĐẶT VÉ
// ============================================================
router.get('/bookings', A.requirePermission('booking.view'), (req, res) => {
  const status = String(req.query.status || '');
  const search = String(req.query.q || '').trim();
  const where = ['1=1']; const args = [];
  if (status) { where.push('b.status = ?'); args.push(status); }
  if (search) { where.push('(b.code LIKE ? OR b.name LIKE ? OR b.email LIKE ? OR b.phone LIKE ?)'); args.push(`%${search}%`, `%${search}%`, `%${search}%`, `%${search}%`); }
  const w = where.join(' AND ');
  const pg = U.paginate(q.get(`SELECT COUNT(*) AS n FROM bookings b WHERE ${w}`, ...args).n, asInt(req.query.page, 1), 20);
  const rows = q.all(
    `SELECT b.*, s.title AS show_title, s.show_date FROM bookings b
       LEFT JOIN shows s ON s.id = b.show_id
      WHERE ${w} ORDER BY b.created_at DESC LIMIT ? OFFSET ?`, ...args, pg.perPage, pg.offset);
  rows.forEach((r) => { try { r.seatList = JSON.parse(r.seats); } catch (_e) { r.seatList = []; } });
  res.render('admin/bookings', {
    title: 'Đơn đặt vé',
    bookings: rows,
    pg,
    status,
    search,
    summary: q.get(`SELECT COUNT(*) AS n, COALESCE(SUM(total),0) AS revenue, COALESCE(SUM(seat_count),0) AS seats
                      FROM bookings WHERE status <> 'cancelled'`),
  });
});

router.post('/bookings/:id/status', A.requirePermission('booking.manage'), (req, res) => {
  const status = ['pending', 'confirmed', 'cancelled'].includes(req.body.status) ? req.body.status : 'pending';
  q.run('UPDATE bookings SET status=? WHERE id=?', status, asInt(req.params.id));
  log(req.user.id, `booking.${status}`, 'booking', asInt(req.params.id), '', req.ip);
  flash(res, 'success', 'Đã cập nhật trạng thái đơn.');
  res.redirect(req.get('referer') || '/admin/bookings');
});

router.get('/bookings/export.csv', A.requirePermission('booking.view'), (req, res) => {
  const rows = q.all(`SELECT b.*, s.title AS show_title FROM bookings b LEFT JOIN shows s ON s.id=b.show_id ORDER BY b.created_at DESC`);
  const head = 'Mã;Đêm diễn;Họ tên;Email;Điện thoại;Số ghế;Tổng tiền;Trạng thái;Thời gian\n';
  const body = rows.map((r) => [
    r.code, r.show_title || '', r.name, r.email, r.phone, r.seat_count, r.total, r.status, r.created_at,
  ].map((v) => `"${String(v).replace(/"/g, '""')}"`).join(';')).join('\n');
  res.setHeader('Content-Disposition', 'attachment; filename="dat-ve-seaphony.csv"');
  res.type('text/csv').send('﻿' + head + body);
});

// ============================================================
//  NGƯỜI ĐĂNG KÝ & LIÊN HỆ
// ============================================================
router.get('/subscribers', A.requirePermission('subscriber.view'), (req, res) => {
  const pg = U.paginate(q.get('SELECT COUNT(*) AS n FROM subscribers').n, asInt(req.query.page, 1), 30);
  res.render('admin/subscribers', {
    title: 'Người đăng ký nhận tin',
    subscribers: q.all('SELECT * FROM subscribers ORDER BY created_at DESC LIMIT ? OFFSET ?', pg.perPage, pg.offset),
    pg,
  });
});

router.get('/subscribers/export.csv', A.requirePermission('subscriber.view'), (req, res) => {
  const rows = q.all('SELECT email, source, active, created_at FROM subscribers ORDER BY created_at DESC');
  res.setHeader('Content-Disposition', 'attachment; filename="ban-tin-seaphony.csv"');
  res.type('text/csv').send('﻿' + 'Email;Nguồn;Kích hoạt;Ngày đăng ký\n'
    + rows.map((r) => `"${r.email}";"${r.source}";"${r.active}";"${r.created_at}"`).join('\n'));
});

router.post('/subscribers/:id/delete', A.requirePermission('subscriber.view'), (req, res) => {
  q.run('DELETE FROM subscribers WHERE id = ?', asInt(req.params.id));
  flash(res, 'success', 'Đã xoá người đăng ký.');
  res.redirect('/admin/subscribers');
});

router.get('/contacts', A.requirePermission('contact.view'), (req, res) => {
  const pg = U.paginate(q.get('SELECT COUNT(*) AS n FROM contacts').n, asInt(req.query.page, 1), 20);
  res.render('admin/contacts', {
    title: 'Liên hệ',
    contacts: q.all('SELECT * FROM contacts ORDER BY handled ASC, created_at DESC LIMIT ? OFFSET ?', pg.perPage, pg.offset),
    pg,
  });
});

router.post('/contacts/:id/handled', A.requirePermission('contact.view'), (req, res) => {
  q.run('UPDATE contacts SET handled = 1 - handled WHERE id = ?', asInt(req.params.id));
  res.redirect('/admin/contacts');
});

router.post('/contacts/:id/delete', A.requirePermission('contact.view'), (req, res) => {
  q.run('DELETE FROM contacts WHERE id = ?', asInt(req.params.id));
  flash(res, 'success', 'Đã xoá liên hệ.');
  res.redirect('/admin/contacts');
});

// ============================================================
//  NGƯỜI DÙNG & PHÂN QUYỀN
// ============================================================
router.get('/users', A.requirePermission('user.manage'), (req, res) => {
  res.render('admin/users', {
    title: 'Người dùng & phân quyền',
    users: q.all(`
      SELECT u.*, (SELECT COUNT(*) FROM posts p WHERE p.author_id = u.id) AS post_count
        FROM users u ORDER BY
          CASE u.role WHEN 'admin' THEN 1 WHEN 'editor' THEN 2 WHEN 'author' THEN 3 ELSE 4 END, u.name`),
    permissions: A.PERMISSIONS,
  });
});

router.post('/users/save', A.requirePermission('user.manage'), (req, res) => {
  const id = asInt(req.body.id, 0);
  const email = String(req.body.email || '').trim().toLowerCase();
  const name = String(req.body.name || '').trim();
  const role = Object.keys(A.ROLES).includes(req.body.role) ? req.body.role : 'author';
  const password = String(req.body.password || '');
  const active = bool(req.body.active);

  if (!U.isEmail(email) || name.length < 2) {
    flash(res, 'error', 'Email hoặc tên không hợp lệ.');
    return res.redirect('/admin/users');
  }
  const dup = q.get('SELECT id FROM users WHERE email = ? AND id <> ?', email, id || 0);
  if (dup) { flash(res, 'error', 'Email này đã được sử dụng.'); return res.redirect('/admin/users'); }

  if (id) {
    // Không cho tự hạ quyền admin cuối cùng
    const admins = q.get("SELECT COUNT(*) AS n FROM users WHERE role='admin' AND active=1").n;
    const target = q.get('SELECT * FROM users WHERE id = ?', id);
    if (target?.role === 'admin' && (role !== 'admin' || !active) && admins <= 1) {
      flash(res, 'error', 'Không thể hạ quyền/vô hiệu hoá quản trị viên cuối cùng.');
      return res.redirect('/admin/users');
    }
    q.run(
      "UPDATE users SET email=?, name=?, role=?, bio=?, active=?, updated_at=datetime('now') WHERE id=?",
      email, name, role, String(req.body.bio || '').slice(0, 800), active, id
    );
    if (password) {
      const issues = A.passwordIssues(password);
      if (issues.length) { flash(res, 'error', issues.join(' ')); return res.redirect('/admin/users'); }
      q.run('UPDATE users SET password_hash=? WHERE id=?', A.hashPassword(password), id);
      q.run('DELETE FROM sessions WHERE user_id = ?', id); // buộc đăng nhập lại
    }
    log(req.user.id, 'user.update', 'user', id, `${email} · ${role}`, req.ip);
    flash(res, 'success', `Đã cập nhật tài khoản ${email}.`);
  } else {
    const issues = A.passwordIssues(password);
    if (issues.length) { flash(res, 'error', issues.join(' ')); return res.redirect('/admin/users'); }
    q.run(
      'INSERT INTO users(email, name, password_hash, role, bio, active) VALUES(?,?,?,?,?,?)',
      email, name, A.hashPassword(password), role, String(req.body.bio || '').slice(0, 800), active
    );
    log(req.user.id, 'user.create', 'user', null, `${email} · ${role}`, req.ip);
    flash(res, 'success', `Đã tạo tài khoản ${email} với vai trò ${A.ROLES[role].label}.`);
  }
  res.redirect('/admin/users');
});

router.post('/users/:id/delete', A.requirePermission('user.manage'), (req, res) => {
  const id = asInt(req.params.id);
  if (id === req.user.id) { flash(res, 'error', 'Không thể tự xoá tài khoản của chính mình.'); return res.redirect('/admin/users'); }
  const target = q.get('SELECT * FROM users WHERE id = ?', id);
  const admins = q.get("SELECT COUNT(*) AS n FROM users WHERE role='admin' AND active=1").n;
  if (target?.role === 'admin' && admins <= 1) {
    flash(res, 'error', 'Không thể xoá quản trị viên cuối cùng.');
    return res.redirect('/admin/users');
  }
  q.run('DELETE FROM users WHERE id = ?', id);
  log(req.user.id, 'user.delete', 'user', id, target?.email || '', req.ip);
  flash(res, 'success', 'Đã xoá tài khoản.');
  res.redirect('/admin/users');
});

// ---- Hồ sơ cá nhân (mọi vai trò) ----
router.get('/profile', (req, res) => {
  res.render('admin/profile', {
    title: 'Hồ sơ của tôi',
    sessions: q.all(
      "SELECT id, ip, user_agent, created_at, expires_at FROM sessions WHERE user_id = ? ORDER BY created_at DESC", req.user.id),
  });
});

router.post('/profile', (req, res) => {
  const name = String(req.body.name || '').trim();
  if (name.length >= 2) {
    q.run("UPDATE users SET name=?, bio=?, updated_at=datetime('now') WHERE id=?",
      name, String(req.body.bio || '').slice(0, 800), req.user.id);
  }
  const cur = String(req.body.current_password || '');
  const next = String(req.body.new_password || '');
  if (next) {
    const row = q.get('SELECT password_hash FROM users WHERE id = ?', req.user.id);
    if (!A.verifyPassword(cur, row.password_hash)) {
      flash(res, 'error', 'Mật khẩu hiện tại không đúng.');
      return res.redirect('/admin/profile');
    }
    const issues = A.passwordIssues(next);
    if (issues.length) { flash(res, 'error', issues.join(' ')); return res.redirect('/admin/profile'); }
    q.run('UPDATE users SET password_hash=? WHERE id=?', A.hashPassword(next), req.user.id);
    q.run('DELETE FROM sessions WHERE user_id = ? AND id <> ?', req.user.id, req.session.id);
    log(req.user.id, 'user.password.change', 'user', req.user.id, '', req.ip);
    flash(res, 'success', 'Đã đổi mật khẩu. Các phiên đăng nhập khác đã bị đăng xuất.');
    return res.redirect('/admin/profile');
  }
  flash(res, 'success', 'Đã cập nhật hồ sơ.');
  return res.redirect('/admin/profile');
});

router.post('/profile/sessions/:id/revoke', (req, res) => {
  q.run('DELETE FROM sessions WHERE id = ? AND user_id = ?', String(req.params.id), req.user.id);
  flash(res, 'success', 'Đã thu hồi phiên đăng nhập.');
  res.redirect('/admin/profile');
});

// ============================================================
//  SEO
// ============================================================
router.get('/seo', A.requirePermission('seo.manage'), (req, res) => {
  const rows = q.all(`
    SELECT id, title, slug, status, seo_score, meta_title, meta_desc, focus_keyword, noindex, type, views
      FROM posts ORDER BY seo_score ASC, updated_at DESC LIMIT 100`);
  res.render('admin/seo', {
    title: 'Trung tâm SEO',
    rows,
    redirects: q.all('SELECT * FROM redirects ORDER BY created_at DESC LIMIT 100'),
    settings: allSettings(),
    audit: {
      noMetaDesc: q.get("SELECT COUNT(*) AS n FROM posts WHERE meta_desc='' AND status='published'").n,
      noKeyword: q.get("SELECT COUNT(*) AS n FROM posts WHERE focus_keyword='' AND status='published'").n,
      noCover: q.get("SELECT COUNT(*) AS n FROM posts WHERE cover_image='' AND status='published'").n,
      noindex: q.get("SELECT COUNT(*) AS n FROM posts WHERE noindex=1 AND status='published'").n,
      thin: q.get("SELECT COUNT(*) AS n FROM posts WHERE status='published' AND length(content) < 1200").n,
      avg: q.get("SELECT COALESCE(ROUND(AVG(seo_score)),0) AS n FROM posts WHERE status='published'").n,
      total: q.get("SELECT COUNT(*) AS n FROM posts WHERE status='published'").n,
    },
  });
});

router.post('/seo/redirects', A.requirePermission('seo.manage'), (req, res) => {
  const from = String(req.body.from_path || '').trim();
  const to = String(req.body.to_path || '').trim();
  if (from.startsWith('/') && to && from !== to) {
    q.run('INSERT OR REPLACE INTO redirects(from_path, to_path, code) VALUES(?,?,?)',
      from, to, asInt(req.body.code, 301));
    flash(res, 'success', `Đã tạo chuyển hướng ${from} → ${to}.`);
  } else {
    flash(res, 'error', 'Đường dẫn không hợp lệ (đường dẫn nguồn phải bắt đầu bằng "/").');
  }
  res.redirect('/admin/seo');
});

router.post('/seo/redirects/:id/delete', A.requirePermission('seo.manage'), (req, res) => {
  q.run('DELETE FROM redirects WHERE id = ?', asInt(req.params.id));
  res.redirect('/admin/seo');
});

/** Tính lại điểm SEO toàn bộ bài viết */
router.post('/seo/rescan', A.requirePermission('seo.manage'), (req, res) => {
  const all = q.all('SELECT * FROM posts');
  let n = 0;
  for (const p of all) {
    const score = SEO.analyzePost(p).score;
    q.run('UPDATE posts SET seo_score = ? WHERE id = ?', score, p.id);
    n += 1;
  }
  log(req.user.id, 'seo.rescan', 'post', null, `${n} bài`, req.ip);
  flash(res, 'success', `Đã tính lại điểm SEO cho ${n} bài viết.`);
  res.redirect('/admin/seo');
});

// ============================================================
//  CẤU HÌNH
// ============================================================
router.get('/settings', A.requirePermission('settings.manage'), (req, res) => {
  res.render('admin/settings', { title: 'Cấu hình website', values: allSettings(), keys: Object.keys(DEFAULT_SETTINGS) });
});

router.post('/settings', A.requirePermission('settings.manage'), (req, res) => {
  for (const key of Object.keys(DEFAULT_SETTINGS)) {
    if (key in req.body) setSetting(key, String(req.body[key] ?? '').slice(0, 2000));
  }
  log(req.user.id, 'settings.update', 'settings', null, '', req.ip);
  flash(res, 'success', 'Đã lưu cấu hình website.');
  res.redirect('/admin/settings');
});

// ============================================================
//  NHẬT KÝ HOẠT ĐỘNG
// ============================================================
router.get('/logs', A.requirePermission('log.view'), (req, res) => {
  const pg = U.paginate(q.get('SELECT COUNT(*) AS n FROM activity_log').n, asInt(req.query.page, 1), 40);
  res.render('admin/logs', {
    title: 'Nhật ký hoạt động',
    logs: q.all(`
      SELECT l.*, u.name AS user_name, u.email AS user_email FROM activity_log l
        LEFT JOIN users u ON u.id = l.user_id
       ORDER BY l.created_at DESC LIMIT ? OFFSET ?`, pg.perPage, pg.offset),
    pg,
  });
});

// ============================================================
//  XỬ LÝ LỖI RIÊNG CHO ADMIN (vd. tải tệp quá lớn)
// ============================================================
// eslint-disable-next-line no-unused-vars
router.use((err, req, res, next) => {
  if (err instanceof multer.MulterError || /tệp ảnh/i.test(err.message || '')) {
    flash(res, 'error', err.code === 'LIMIT_FILE_SIZE'
      ? `Tệp vượt quá ${config.maxUploadMB}MB.` : err.message);
    return res.redirect('/admin/media');
  }
  return next(err);
});

module.exports = router;
