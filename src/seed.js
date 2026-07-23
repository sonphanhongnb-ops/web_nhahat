'use strict';
const { q, setSetting, getSetting } = require('./db');
const A = require('./auth');
const U = require('./utils');
const SEO = require('./seo');
const config = require('./config');

// ============================================================
//  DỮ LIỆU MẪU — THỨC by SEASOUND
// ============================================================
const USERS = [
  { email: config.seedAdminEmail, name: 'Quản trị THỨC', role: 'admin', password: config.seedAdminPassword,
    bio: 'Tài khoản quản trị hệ thống website THỨC by SEASOUND.' },
  { email: 'bientap@seaphony.vn', name: 'Ban Biên Tập', role: 'editor', password: 'Bientap@2026',
    bio: 'Biên tập viên nội dung — duyệt và xuất bản bài viết.' },
  { email: 'tacgia@seaphony.vn', name: 'Cộng Tác Nội Dung', role: 'author', password: 'Tacgia@2026',
    bio: 'Tác giả nội dung của SEASOUND.' },
  { email: 'ctv@seaphony.vn', name: 'Cộng Tác Viên', role: 'viewer', password: 'Ctv@202666',
    bio: 'Cộng tác viên — soạn bản nháp và gửi duyệt.' },
];

const CATEGORIES = [
  { name: 'Nhật ký', slug: 'nhat-ky', description: 'Ghi chép hành trình dựng vở THỨC và dàn nhạc SEASOUND.',
    meta_title: 'Nhật ký THỨC by SEASOUND', meta_desc: 'Ghi chép hậu trường quá trình dựng vở THỨC — vở diễn đầu tiên của SEASOUND tại Alluvium, Hoa Lư, Ninh Bình.' },
  { name: 'Báo chí', slug: 'bao-chi', description: 'Báo chí và cảm nhận khán giả về THỨC.',
    meta_title: 'Báo chí về THỨC', meta_desc: 'Tổng hợp bài viết báo chí và cảm nhận khán giả về vở diễn THỨC của SEASOUND.' },
];

// Lịch diễn: Thứ Tư–Chủ Nhật, 2 suất/ngày (15:00 và 18:00), trong ~3 tuần tới
function buildShows() {
  const out = [];
  const today = new Date(); today.setHours(0, 0, 0, 0);
  for (let i = 1; i <= 21 && out.length < 24; i += 1) {
    const d = new Date(today.getTime() + i * 864e5);
    const wd = d.getDay();               // 0=CN … 6=T7
    if (wd === 1 || wd === 2) continue;  // nghỉ Thứ Hai & Thứ Ba
    const date = d.toISOString().slice(0, 10);
    for (const time of ['15:00', '18:00']) out.push({ date, time });
  }
  return out;
}

const POSTS = [
  {
    title: 'THỨC — vở diễn đầu tiên của SEASOUND ra mắt tại Alluvium',
    category: 'nhat-ky',
    focus_keyword: 'THỨC SEASOUND',
    meta_title: 'THỨC — vở diễn đầu tiên của SEASOUND',
    meta_desc: 'THỨC, vở diễn đầu tiên của SEASOUND — Dàn Khí Nhạc Bản Địa Đông Nam Á — ra mắt tại Trung tâm Biểu diễn Alluvium, Hoa Lư, Ninh Bình.',
    cover_image: '/img/space-1.jpg',
    cover_alt: 'Không gian biểu diễn Alluvium trước giờ diễn THỨC',
    tags: 'THỨC, SEASOUND, Alluvium, Ninh Bình',
    schema_type: 'NewsArticle',
    excerpt: 'THỨC là vở diễn đầu tiên của SEASOUND — sáu mươi phút khí nhạc bản địa, không lời, tại Trung tâm Biểu diễn Alluvium ở Hoa Lư, Ninh Bình.',
    content: `THỨC là vở diễn đầu tiên của SEASOUND — Dàn Khí Nhạc Bản Địa Đông Nam Á. Sáu mươi phút, không giờ giải lao, không lời.

## Một ngôn ngữ âm nhạc bản địa

Sáu đến tám tác phẩm khí nhạc được sáng tác riêng cho dàn nhạc này — không chuyển soạn, không phỏng theo. Âm thanh đến từ những nhạc cụ làm bằng tre, nứa, đồng và da: chất liệu của chính vùng đất này.

## Không gian Alluvium

Vở diễn được trình diễn tại Trung tâm Biểu diễn Alluvium trên đường Đinh Tiên Hoàng, Hoa Lư, Ninh Bình — trong vùng quần thể danh thắng Tràng An.

## Đặt vé

Vé được mở bán trực tuyến với ba hạng ECO, VIP và VVIP. Khán giả chọn suất diễn, chọn hạng vé và nhận vé điện tử qua email. Nên đến trước giờ diễn 20 phút.`,
  },
  {
    title: 'Tre, đồng, da — chất liệu của THỨC',
    category: 'nhat-ky',
    focus_keyword: 'nhạc cụ bản địa',
    meta_title: 'Tre, đồng, da — chất liệu của THỨC',
    meta_desc: 'Những nhạc cụ bản địa làm từ tre, nứa, đồng và da trong vở diễn THỨC của SEASOUND — chất liệu của vùng đất Đông Nam Á.',
    cover_image: '/img/space-2.jpg',
    cover_alt: 'Nhạc cụ bản địa làm từ tre và đồng',
    tags: 'nhạc cụ, tre nứa, đồng, SEASOUND',
    excerpt: 'THỨC được dựng trên những nhạc cụ bản địa: tre, nứa, đồng và da — chất liệu đã ở đây từ trước khi ta sinh ra.',
    content: `THỨC không dùng bất kỳ nhạc cụ phương Tây nào. Toàn bộ âm thanh đến từ nhạc cụ bản địa Đông Nam Á.

## Tre và nứa

Những ống tre, ống nứa cho âm thanh trong và ấm — nền của nhiều tác phẩm trong vở diễn.

## Đồng

Cồng, chiêng và các nhạc cụ đồng mang âm trầm ngân dài, giữ nhịp cho cả dàn nhạc.

## Da

Trống da tạo nên nhịp đập — nhịp trống trong một buổi lễ đã lâu, trở về trong THỨC.`,
  },
];

const PAGES = [
  {
    title: 'Về THỨC by SEASOUND',
    meta_desc: 'SEASOUND — Dàn Khí Nhạc Bản Địa Đông Nam Á. Dự án dàn nhạc lấy nhạc cụ bản địa làm trung tâm, khởi xướng bởi nhạc sĩ Nguyễn Nhất Lý, đầu tư bởi Alluvium Production. THỨC là vở diễn đầu tiên.',
    content: `## SEASOUND — Dàn Khí Nhạc Bản Địa Đông Nam Á

SEASOUND là dự án xây dựng dàn nhạc đầu tiên lấy các nhạc cụ bản địa Đông Nam Á làm trung tâm — không mô phỏng mô hình phương Tây, không bảo tàng hóa truyền thống, mà tạo ra ngôn ngữ âm nhạc của chính vùng đất này.

## Người khởi xướng

Được khởi xướng bởi nhạc sĩ **Nguyễn Nhất Lý**, đầu tư bởi **Alluvium Production**. THỨC là tiếng nói đầu tiên của dàn nhạc này.

## THỨC

Sáu mươi phút khí nhạc từ tre, nứa, đồng và da — chất liệu của đất này. Không có lời. Không cần lời.`,
  },
  {
    title: 'Liên hệ THỨC by SEASOUND',
    meta_desc: 'Thông tin liên hệ THỨC by SEASOUND: đặt vé, báo chí, đối tác và nhóm khách tại Trung tâm Biểu diễn Alluvium, Hoa Lư, Ninh Bình.',
    content: `## Địa điểm

Trung tâm Biểu diễn Alluvium · Đường Đinh Tiên Hoàng, Hoa Lư, Ninh Bình — trong vùng quần thể danh thắng Tràng An, Di sản Thế giới UNESCO.

## Lịch diễn

Thứ Tư đến Chủ Nhật, hai suất mỗi ngày: 15:00–16:00 và 18:00–19:00. Nghỉ Thứ Hai và Thứ Ba.

## Liên hệ

- Đặt vé: tickets@seasound.com
- Báo chí & press kit: press@seasound.com
- Đặt vé nhóm, tour & đối tác: group@seasound.com`,
  },
];

// ============================================================
//  KHỞI TẠO
// ============================================================
function ensureSeed({ force = false } = {}) {
  const hasUsers = q.get('SELECT COUNT(*) AS n FROM users').n > 0;
  if (hasUsers && !force) return { skipped: true };

  for (const u of USERS) {
    if (q.get('SELECT id FROM users WHERE email = ?', u.email)) continue;
    q.run('INSERT INTO users(email, name, password_hash, role, bio, active) VALUES(?,?,?,?,?,1)',
      u.email, u.name, A.hashPassword(u.password), u.role, u.bio);
  }

  for (const [i, c] of CATEGORIES.entries()) {
    if (q.get('SELECT id FROM categories WHERE slug = ?', c.slug)) continue;
    q.run('INSERT INTO categories(name, slug, description, meta_title, meta_desc, sort_order) VALUES(?,?,?,?,?,?)',
      c.name, c.slug, c.description, c.meta_title, c.meta_desc, i);
  }

  // Lịch diễn — mỗi suất là một buổi diễn THỨC. Khán đài A: hạng nhất; B1/B2: hạng phổ thông.
  for (const s of buildShows()) {
    const slug = U.slugify(`thuc-${s.date}-${s.time.replace(':', '')}`);
    if (q.get('SELECT id FROM shows WHERE slug = ?', slug)) continue;
    q.run(
      `INSERT INTO shows(title, slug, subtitle, description, show_date, show_time, venue, price_a, price_b, on_sale, active)
       VALUES('THỨC', ?, 'Vở diễn của SEASOUND', ?, ?, ?, 'Trung tâm Biểu diễn Alluvium', 600000, 450000, 1, 1)`,
      slug, 'THỨC — 60 phút khí nhạc bản địa Đông Nam Á tại Trung tâm Biểu diễn Alluvium.', s.date, s.time
    );
  }

  const admin = q.get("SELECT id FROM users WHERE role='admin' LIMIT 1");
  for (const pg of PAGES) {
    const slug = U.slugify(pg.title);
    if (q.get('SELECT id FROM posts WHERE slug = ?', slug)) continue;
    const html = U.renderContent(pg.content);
    q.run(
      `INSERT INTO posts(type, title, slug, excerpt, content, content_html, author_id, status,
        meta_desc, schema_type, seo_score, search_text, reading_time, published_at, sitemap_priority)
       VALUES('page',?,?,?,?,?,?,'published',?,'WebPage',?,?,?,datetime('now'),'0.8')`,
      pg.title, slug, U.excerptFrom(html), pg.content, html, admin?.id || null,
      pg.meta_desc, SEO.analyzePost({ ...pg, slug, content_html: html }).score,
      U.searchText(pg.title, html), U.readingTime(html)
    );
  }

  const author = q.get("SELECT id FROM users WHERE role='author' LIMIT 1") || admin;
  for (const [i, p] of POSTS.entries()) {
    const slug = U.slugify(p.title);
    if (q.get('SELECT id FROM posts WHERE slug = ?', slug)) continue;
    const cat = q.get('SELECT id FROM categories WHERE slug = ?', p.category);
    const html = U.renderContent(p.content);
    const publishedAt = new Date(Date.now() - (i + 1) * 3 * 864e5).toISOString().slice(0, 19).replace('T', ' ');
    const record = { ...p, slug, content_html: html, noindex: 0, schema_type: p.schema_type || 'Article' };
    const score = SEO.analyzePost(record).score;
    q.run(
      `INSERT INTO posts(type, title, slug, excerpt, content, content_html, cover_image, cover_alt, category_id,
        author_id, status, featured, meta_title, meta_desc, focus_keyword, schema_type, seo_score, search_text,
        reading_time, published_at, sitemap_priority)
       VALUES('post',?,?,?,?,?,?,?,?,?,'published',?,?,?,?,?,?,?,?,?,?)`,
      p.title, slug, p.excerpt, p.content, html, p.cover_image, p.cover_alt, cat?.id || null,
      author?.id || null, i === 0 ? 1 : 0, p.meta_title, p.meta_desc, p.focus_keyword,
      p.schema_type || 'Article', score, U.searchText(p.title, p.excerpt, html, p.focus_keyword, p.tags),
      U.readingTime(html), publishedAt, '0.7'
    );
    const postId = q.get('SELECT last_insert_rowid() AS id').id;
    require('./models').posts.syncTags(postId, p.tags);
  }

  if (!getSetting('seeded_at')) setSetting('seeded_at', new Date().toISOString());
  return { skipped: false };
}

// Chạy trực tiếp: node src/seed.js [--reset]
if (require.main === module) {
  const reset = process.argv.includes('--reset');
  if (reset) {
    for (const t of ['post_tags', 'post_revisions', 'post_views', 'posts', 'tags', 'categories',
      'bookings', 'shows', 'media', 'sessions', 'activity_log', 'redirects', 'subscribers', 'contacts', 'users']) {
      try { q.run(`DELETE FROM ${t}`); } catch (_e) { /* bảng có thể chưa tồn tại */ }
    }
    console.log('Đã xoá sạch dữ liệu cũ.');
  }
  const r = ensureSeed({ force: true });
  console.log(r.skipped ? 'Bỏ qua — đã có dữ liệu.' : 'Đã tạo dữ liệu khởi tạo cho THỨC by SEASOUND.');
  console.log('\nTài khoản mẫu:');
  for (const u of USERS) console.log(`  ${u.role.padEnd(7)} ${u.email.padEnd(24)} ${u.password}`);
}

module.exports = { ensureSeed, USERS };
