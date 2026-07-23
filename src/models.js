'use strict';
const { q } = require('./db');
const U = require('./utils');

const POST_COLS = `
  p.*,
  c.name AS category_name, c.slug AS category_slug,
  u.name AS author_name, u.id AS author_id
`;

const FROM = `
  FROM posts p
  LEFT JOIN categories c ON c.id = p.category_id
  LEFT JOIN users u      ON u.id = p.author_id
`;

/** Bổ sung các trường hiển thị cho template */
function decorate(p) {
  if (!p) return p;
  p.url = p.type === 'page' ? `/trang/${p.slug}` : `/tin-tuc/${p.slug}`;
  p.dateLabel = U.formatMonthVN(p.published_at || p.created_at);
  p.dateFull = U.formatDateVN(p.published_at || p.created_at);
  p.dateIso = U.isoDate(p.published_at || p.created_at);
  p.tags = q.all(
    'SELECT t.id, t.name, t.slug FROM tags t JOIN post_tags pt ON pt.tag_id = t.id WHERE pt.post_id = ?',
    p.id
  );
  p.tag_names = p.tags.map((t) => t.name);
  if (!p.excerpt) p.excerpt = U.excerptFrom(p.content_html);
  return p;
}

const posts = {
  /** Danh sách có phân trang cho trang công khai */
  published({ page = 1, perPage = 9, categorySlug = null, tagSlug = null, search = '', type = 'post', featured = null } = {}) {
    const where = ["p.status = 'published'", "p.published_at <= datetime('now')", 'p.type = ?'];
    const args = [type];
    if (categorySlug) { where.push('c.slug = ?'); args.push(categorySlug); }
    if (tagSlug) {
      where.push('p.id IN (SELECT pt.post_id FROM post_tags pt JOIN tags t ON t.id = pt.tag_id WHERE t.slug = ?)');
      args.push(tagSlug);
    }
    if (featured !== null) { where.push('p.featured = ?'); args.push(featured ? 1 : 0); }
    if (search) {
      where.push('(p.search_text LIKE ? OR p.title LIKE ?)');
      const s = `%${U.deaccent(search).toLowerCase()}%`;
      args.push(s, `%${search}%`);
    }
    const w = where.join(' AND ');
    const total = q.get(`SELECT COUNT(*) AS n ${FROM} WHERE ${w}`, ...args).n;
    const pg = U.paginate(total, page, perPage);
    const rows = q.all(
      `SELECT ${POST_COLS} ${FROM} WHERE ${w}
        ORDER BY p.featured DESC, p.published_at DESC, p.id DESC
        LIMIT ? OFFSET ?`,
      ...args, pg.perPage, pg.offset
    );
    return { rows: rows.map(decorate), pg };
  },

  bySlug(slug, { onlyPublished = true } = {}) {
    const row = q.get(
      `SELECT ${POST_COLS} ${FROM} WHERE p.slug = ?${onlyPublished ? " AND p.status = 'published' AND p.published_at <= datetime('now')" : ''}`,
      slug
    );
    return decorate(row);
  },

  byId(id) {
    return decorate(q.get(`SELECT ${POST_COLS} ${FROM} WHERE p.id = ?`, id));
  },

  /** Bài liên quan: cùng chuyên mục hoặc cùng thẻ */
  related(post, limit = 3) {
    const rows = q.all(
      `SELECT ${POST_COLS} ${FROM}
        WHERE p.status = 'published' AND p.published_at <= datetime('now')
          AND p.type = 'post' AND p.id <> ?
          AND (p.category_id = ? OR p.id IN (
              SELECT pt.post_id FROM post_tags pt WHERE pt.tag_id IN (
                SELECT tag_id FROM post_tags WHERE post_id = ?)))
        ORDER BY p.published_at DESC LIMIT ?`,
      post.id, post.category_id, post.id, limit
    );
    if (rows.length >= limit) return rows.map(decorate);
    const fill = q.all(
      `SELECT ${POST_COLS} ${FROM}
        WHERE p.status = 'published' AND p.published_at <= datetime('now')
          AND p.type = 'post' AND p.id <> ? AND p.id NOT IN (${rows.map(() => '?').join(',') || '0'})
        ORDER BY p.published_at DESC LIMIT ?`,
      post.id, ...rows.map((r) => r.id), limit - rows.length
    );
    return [...rows, ...fill].map(decorate);
  },

  /** Bài trước / sau theo thời gian xuất bản (điều hướng nội bộ tốt cho SEO) */
  neighbours(post) {
    const prev = q.get(
      `SELECT p.title, p.slug FROM posts p
        WHERE p.status='published' AND p.type='post' AND p.published_at < ?
        ORDER BY p.published_at DESC LIMIT 1`,
      post.published_at
    );
    const next = q.get(
      `SELECT p.title, p.slug FROM posts p
        WHERE p.status='published' AND p.type='post' AND p.published_at > ?
        ORDER BY p.published_at ASC LIMIT 1`,
      post.published_at
    );
    return { prev, next };
  },

  /** Danh sách cho trang quản trị (lọc theo quyền) */
  adminList({ page = 1, perPage = 15, status = '', type = 'post', search = '', categoryId = '', authorId = null } = {}) {
    const where = ['p.type = ?'];
    const args = [type];
    if (status) { where.push('p.status = ?'); args.push(status); }
    if (categoryId) { where.push('p.category_id = ?'); args.push(Number(categoryId)); }
    if (authorId) { where.push('p.author_id = ?'); args.push(authorId); }
    if (search) {
      where.push('(p.title LIKE ? OR p.search_text LIKE ?)');
      args.push(`%${search}%`, `%${U.deaccent(search).toLowerCase()}%`);
    }
    const w = where.join(' AND ');
    const total = q.get(`SELECT COUNT(*) AS n ${FROM} WHERE ${w}`, ...args).n;
    const pg = U.paginate(total, page, perPage);
    const rows = q.all(
      `SELECT ${POST_COLS} ${FROM} WHERE ${w} ORDER BY p.updated_at DESC LIMIT ? OFFSET ?`,
      ...args, pg.perPage, pg.offset
    );
    return { rows: rows.map(decorate), pg };
  },

  incrementView(id) {
    const day = new Date().toISOString().slice(0, 10);
    q.run('UPDATE posts SET views = views + 1 WHERE id = ?', id);
    q.run(
      `INSERT INTO post_views(post_id, day, count) VALUES(?,?,1)
       ON CONFLICT(post_id, day) DO UPDATE SET count = count + 1`,
      id, day
    );
  },

  /** Gán lại danh sách thẻ cho bài viết (tạo thẻ mới nếu chưa có) */
  syncTags(postId, tagString = '') {
    const names = String(tagString).split(',').map((s) => s.trim()).filter(Boolean).slice(0, 20);
    q.run('DELETE FROM post_tags WHERE post_id = ?', postId);
    for (const name of names) {
      const slug = U.slugify(name);
      let tag = q.get('SELECT id FROM tags WHERE slug = ?', slug);
      if (!tag) {
        q.run('INSERT INTO tags(name, slug) VALUES(?,?)', name, slug);
        tag = q.get('SELECT id FROM tags WHERE slug = ?', slug);
      }
      q.run('INSERT OR IGNORE INTO post_tags(post_id, tag_id) VALUES(?,?)', postId, tag.id);
    }
  },
};

const categories = {
  all() {
    return q.all(`
      SELECT c.*, (SELECT COUNT(*) FROM posts p WHERE p.category_id = c.id AND p.status='published') AS post_count
        FROM categories c ORDER BY c.sort_order, c.name`);
  },
  bySlug(slug) { return q.get('SELECT * FROM categories WHERE slug = ?', slug); },
  byId(id) { return q.get('SELECT * FROM categories WHERE id = ?', id); },
};

const tags = {
  all() {
    return q.all(`
      SELECT t.*, (SELECT COUNT(*) FROM post_tags pt WHERE pt.tag_id = t.id) AS post_count
        FROM tags t ORDER BY post_count DESC, t.name`);
  },
  bySlug(slug) { return q.get('SELECT * FROM tags WHERE slug = ?', slug); },
};

const shows = {
  upcoming(limit = 6) {
    return q.all(
      `SELECT * FROM shows WHERE active = 1 AND date(show_date) >= date('now','-1 day')
        ORDER BY show_date ASC LIMIT ?`, limit
    ).map(decorateShow);
  },
  all() { return q.all('SELECT * FROM shows ORDER BY show_date DESC').map(decorateShow); },
  byId(id) { const s = q.get('SELECT * FROM shows WHERE id = ?', id); return s ? decorateShow(s) : null; },
};

function decorateShow(s) {
  const d = U.toDate(s.show_date);
  s.day = d ? String(d.getDate()).padStart(2, '0') : '--';
  s.monthLabel = d ? `Th ${d.getMonth() + 1}` : '';
  s.time = s.show_time;
  s.dateLabel = U.formatDateVN(s.show_date);
  s.url = '#lich-dien';
  return s;
}

module.exports = { posts, categories, tags, shows, decorate, decorateShow };
