'use strict';
const fs = require('node:fs');
const path = require('node:path');
const express = require('express');
const config = require('../config');
const { q, getSetting, allSettings } = require('../db');
const { posts, categories, tags, shows } = require('../models');
const SEO = require('../seo');
const U = require('../utils');

const router = express.Router();

// Stylesheet tô màu cho sitemap khi mở bằng trình duyệt (nạp một lần)
const SITEMAP_XSL = fs.readFileSync(path.join(config.ROOT, 'src', 'sitemap.xsl'), 'utf8');
router.get('/sitemap.xsl', (_req, res) => {
  res.type('text/xsl').set('Cache-Control', 'public, max-age=86400').send(SITEMAP_XSL);
});

const FAQ_VI = [
  { q: 'Đặt vé online như thế nào?', a: 'Chọn "Đặt vé", chọn suất diễn và hạng vé (ECO / VIP / VVIP), điền thông tin và xác nhận. Vé điện tử sẽ được gửi qua email.' },
  { q: 'Lịch biểu diễn ra sao?', a: 'Thứ Tư đến Chủ Nhật, hai suất mỗi ngày: 15:00–16:00 và 18:00–19:00. Thứ Hai và Thứ Ba nghỉ. Mỗi suất kéo dài 60 phút, không có giờ giải lao.' },
  { q: 'Trẻ em có được vào xem không?', a: 'Trẻ em dưới 6 tuổi được miễn phí. Trẻ em dưới 3 tuổi không được vào khán phòng.' },
  { q: 'Nên đến lúc nào, trang phục ra sao?', a: 'Nên đến trước giờ diễn 20 phút. Trang phục thoải mái — không yêu cầu trang trọng.' },
  { q: 'Có được chụp ảnh, quay phim không?', a: 'Không chụp ảnh và quay phim trong suốt suất diễn, để giữ trọn không gian âm thanh cho tất cả khán giả.' },
  { q: 'Liên hệ báo chí & đối tác ở đâu?', a: 'Báo chí, press kit và ảnh độ phân giải cao: press@seasound.com. Đặt vé nhóm, tour & đối tác: group@seasound.com.' },
];
const FAQ_EN = [
  { q: 'How do I book online?', a: 'Choose "Reserve", pick a performance and a ticket tier (ECO / VIP / VVIP), fill in your details and confirm. E-tickets are sent by email.' },
  { q: 'What is the performance schedule?', a: 'Wednesday to Sunday, two shows daily: 3:00 PM–4:00 PM and 6:00 PM–7:00 PM. Closed Monday and Tuesday. Each show runs 60 minutes with no intermission.' },
  { q: 'Are children admitted?', a: 'Children under 6 enter free. Children under 3 are not admitted to the auditorium.' },
  { q: 'When should I arrive, and what should I wear?', a: 'Arrive at least 20 minutes before the performance. Dress comfortably — no formal dress code required.' },
  { q: 'Is photography or filming allowed?', a: 'Photography and recording are not permitted during the performance, to preserve the sound for all audiences.' },
  { q: 'How do press and partners get in touch?', a: 'Press, press kit and high-resolution images: press@seasound.com. Group bookings, tours & partners: group@seasound.com.' },
];

// ============================================================
//  TRANG CHỦ
// ============================================================
router.get('/', (req, res) => {
  const s = allSettings();
  const en = req.lang === 'en';
  const upcoming = shows.upcoming(4);
  const { rows: latest } = posts.published({ page: 1, perPage: 3 });
  const faq = en ? FAQ_EN : FAQ_VI;

  res.render('home', {
    shows: upcoming,
    posts: latest,
    faq,
    showsJson: JSON.stringify(upcoming.map((x) => ({
      id: x.id, d: x.day, m: x.monthLabel, title: x.title, time: x.show_time,
      onsale: !!x.on_sale, priceA: x.price_a, priceB: x.price_b,
    }))),
    seo: SEO.buildMeta({
      // VI: để trống -> "Tên site — Khẩu hiệu". EN: đặt khẩu hiệu tiếng Anh (mẫu template sẽ nối tên site).
      title: en ? 'Southeast Asian Indigenous Music Ensemble' : '',
      description: en ? (s.site_description_en || s.site_description) : s.site_description,
      path: '/',
      image: s.default_og_image,
      type: 'website',
    }),
    jsonLd: [
      SEO.organizationLd(),
      SEO.websiteLd(),
      SEO.faqLd(faq),
      ...upcoming.map(SEO.eventLd),
    ],
  });
});

// ============================================================
//  TRANG DỰ ÁN SEASOUND
// ============================================================
router.get('/seasound', (req, res) => {
  const s = allSettings();
  const en = req.lang === 'en';
  res.render('seasound', {
    seo: SEO.buildMeta({
      title: en ? 'SEASOUND — Southeast Asian Indigenous Orchestra' : 'SEASOUND — Dàn Khí Nhạc Bản Địa Đông Nam Á',
      description: en
        ? 'A long-term research and practice project building the first orchestral model centered on the indigenous instruments of Southeast Asia.'
        : 'Dự án nghiên cứu và thực hành âm nhạc dài hạn, xây dựng đại dàn nhạc đầu tiên lấy nhạc khí bản địa Đông Nam Á làm trung tâm.',
      path: '/seasound',
      image: s.default_og_image,
      type: 'website',
    }),
    jsonLd: [
      SEO.breadcrumbLd([{ name: 'Trang chủ', url: '/' }, { name: 'SEASOUND', url: '/seasound' }]),
    ],
  });
});

// ============================================================
//  TIN TỨC — DANH SÁCH
// ============================================================
router.get('/tin-tuc', (req, res) => {
  const perPage = Number(getSetting('posts_per_page', '9')) || 9;
  const page = U.clamp(req.query.page, 1, 9999);
  const { rows, pg } = posts.published({ page, perPage });

  res.render('blog', {
    posts: rows,
    pg,
    heading: req.lang === 'en' ? 'News & Events' : 'Tin tức & Sự kiện',
    lead: req.lang === 'en'
      ? 'The latest from THỨC and SEASOUND — performances, the ensemble and behind the scenes.'
      : 'Chuyện mới từ THỨC và SEASOUND — đêm diễn, dàn nhạc và hậu trường.',
    categories: categories.all(),
    tags: tags.all().slice(0, 18),
    baseUrl: '/tin-tuc',
    activeCategory: null,
    activeTag: null,
    seo: SEO.buildMeta({
      title: page > 1 ? `Tin tức & Sự kiện — Trang ${page}` : 'Tin tức & Sự kiện',
      description: 'Cập nhật tin tức, lịch diễn, hậu trường và câu chuyện nghệ nhân của Nhà hát Seaphony tại Hoa Lư, Ninh Bình.',
      path: page > 1 ? `/tin-tuc?page=${page}` : '/tin-tuc',
      canonical: page > 1 ? `/tin-tuc?page=${page}` : '/tin-tuc',
      prev: pg.hasPrev ? (pg.page - 1 === 1 ? '/tin-tuc' : `/tin-tuc?page=${pg.page - 1}`) : '',
      next: pg.hasNext ? `/tin-tuc?page=${pg.page + 1}` : '',
    }),
    jsonLd: [
      SEO.breadcrumbLd([{ name: 'Trang chủ', url: '/' }, { name: 'Tin tức', url: '/tin-tuc' }]),
      SEO.itemListLd(rows),
    ],
  });
});

// ============================================================
//  CHUYÊN MỤC
// ============================================================
router.get('/chuyen-muc/:slug', (req, res, next) => {
  const cat = categories.bySlug(req.params.slug);
  if (!cat) return next();
  const perPage = Number(getSetting('posts_per_page', '9')) || 9;
  const page = U.clamp(req.query.page, 1, 9999);
  const { rows, pg } = posts.published({ page, perPage, categorySlug: cat.slug });
  const base = `/chuyen-muc/${cat.slug}`;

  res.render('blog', {
    posts: rows,
    pg,
    heading: cat.name,
    lead: cat.description || `Các bài viết thuộc chuyên mục ${cat.name}.`,
    categories: categories.all(),
    tags: tags.all().slice(0, 18),
    baseUrl: base,
    activeCategory: cat.slug,
    activeTag: null,
    seo: SEO.buildMeta({
      title: cat.meta_title || (page > 1 ? `${cat.name} — Trang ${page}` : cat.name),
      description: cat.meta_desc || cat.description || `Tổng hợp bài viết chuyên mục ${cat.name} của Nhà hát Seaphony.`,
      path: page > 1 ? `${base}?page=${page}` : base,
      prev: pg.hasPrev ? (pg.page - 1 === 1 ? base : `${base}?page=${pg.page - 1}`) : '',
      next: pg.hasNext ? `${base}?page=${pg.page + 1}` : '',
    }),
    jsonLd: [
      SEO.breadcrumbLd([
        { name: 'Trang chủ', url: '/' },
        { name: 'Tin tức', url: '/tin-tuc' },
        { name: cat.name, url: base },
      ]),
      SEO.itemListLd(rows, cat.name),
    ],
  });
});

// ============================================================
//  THẺ
// ============================================================
router.get('/tag/:slug', (req, res, next) => {
  const tag = tags.bySlug(req.params.slug);
  if (!tag) return next();
  const perPage = Number(getSetting('posts_per_page', '9')) || 9;
  const page = U.clamp(req.query.page, 1, 9999);
  const { rows, pg } = posts.published({ page, perPage, tagSlug: tag.slug });
  const base = `/tag/${tag.slug}`;

  res.render('blog', {
    posts: rows,
    pg,
    heading: `#${tag.name}`,
    lead: `Bài viết được gắn thẻ “${tag.name}”.`,
    categories: categories.all(),
    tags: tags.all().slice(0, 18),
    baseUrl: base,
    activeCategory: null,
    activeTag: tag.slug,
    seo: SEO.buildMeta({
      title: page > 1 ? `Thẻ: ${tag.name} — Trang ${page}` : `Thẻ: ${tag.name}`,
      description: `Tổng hợp bài viết gắn thẻ ${tag.name} tại Nhà hát Seaphony.`,
      path: page > 1 ? `${base}?page=${page}` : base,
      noindex: pg.total < 2, // tránh trang mỏng bị index
      prev: pg.hasPrev ? (pg.page - 1 === 1 ? base : `${base}?page=${pg.page - 1}`) : '',
      next: pg.hasNext ? `${base}?page=${pg.page + 1}` : '',
    }),
    jsonLd: [SEO.breadcrumbLd([
      { name: 'Trang chủ', url: '/' },
      { name: 'Tin tức', url: '/tin-tuc' },
      { name: tag.name, url: base },
    ])],
  });
});

// ============================================================
//  TÌM KIẾM
// ============================================================
router.get('/tim-kiem', (req, res) => {
  const kw = String(req.query.q || '').trim().slice(0, 100);
  const page = U.clamp(req.query.page, 1, 9999);
  const { rows, pg } = kw
    ? posts.published({ page, perPage: 9, search: kw })
    : { rows: [], pg: U.paginate(0, 1, 9) };

  res.render('search', {
    posts: rows,
    pg,
    kw,
    categories: categories.all(),
    tags: tags.all().slice(0, 18),
    baseUrl: `/tim-kiem?q=${encodeURIComponent(kw)}`,
    seo: SEO.buildMeta({
      title: kw ? `Kết quả tìm kiếm: ${kw}` : 'Tìm kiếm',
      description: `Tìm kiếm bài viết, đêm diễn và thông tin tại Nhà hát Seaphony.`,
      path: '/tim-kiem',
      noindex: true, // trang kết quả tìm kiếm không nên được index
    }),
    jsonLd: [],
  });
});

// ============================================================
//  TRANG TĨNH DO CMS QUẢN LÝ
// ============================================================
router.get('/trang/:slug', (req, res, next) => {
  const page = posts.bySlug(req.params.slug);
  if (!page || page.type !== 'page') return next();

  res.render('page', {
    post: page,
    toc: U.tableOfContents(page.content_html),
    seo: SEO.buildMeta({
      title: page.meta_title || page.title,
      description: page.meta_desc || page.excerpt,
      path: `/trang/${page.slug}`,
      canonical: page.canonical_url || `/trang/${page.slug}`,
      image: page.og_image || page.cover_image,
      imageAlt: page.cover_alt,
      type: 'article',
      noindex: !!page.noindex,
      nofollow: !!page.nofollow,
      modifiedTime: U.isoDate(page.updated_at),
    }),
    jsonLd: [
      SEO.breadcrumbLd([{ name: 'Trang chủ', url: '/' }, { name: page.title, url: `/trang/${page.slug}` }]),
      { ...SEO.articleLd(page), '@type': 'WebPage' },
    ],
  });
});

// ============================================================
//  BÀI VIẾT CHI TIẾT
// ============================================================
router.get('/tin-tuc/:slug', (req, res, next) => {
  // Người có quyền được xem trước bản nháp qua ?preview=1
  const allowDraft = req.user && req.query.preview === '1';
  const post = posts.bySlug(req.params.slug, { onlyPublished: !allowDraft });
  if (!post || post.type !== 'post') return next();

  if (post.status === 'published') posts.incrementView(post.id);

  const related = posts.related(post, 3);
  const { prev, next: nextPost } = posts.neighbours(post);

  res.render('post', {
    post,
    related,
    prevPost: prev,
    nextPost,
    toc: U.tableOfContents(post.content_html),
    isPreview: post.status !== 'published',
    seo: SEO.buildMeta({
      title: post.meta_title || post.title,
      description: post.meta_desc || post.excerpt,
      path: `/tin-tuc/${post.slug}`,
      canonical: post.canonical_url || `/tin-tuc/${post.slug}`,
      image: post.og_image || post.cover_image,
      imageAlt: post.cover_alt || post.title,
      type: 'article',
      noindex: !!post.noindex || post.status !== 'published',
      nofollow: !!post.nofollow,
      keywords: [post.focus_keyword, ...post.tag_names].filter(Boolean).join(', '),
      publishedTime: U.isoDate(post.published_at),
      modifiedTime: U.isoDate(post.updated_at),
      author: post.author_name,
      section: post.category_name,
      tags: post.tag_names,
    }),
    jsonLd: [
      SEO.breadcrumbLd([
        { name: 'Trang chủ', url: '/' },
        { name: 'Tin tức', url: '/tin-tuc' },
        ...(post.category_name ? [{ name: post.category_name, url: `/chuyen-muc/${post.category_slug}` }] : []),
        { name: post.title, url: `/tin-tuc/${post.slug}` },
      ]),
      SEO.articleLd(post),
    ],
  });
});

// ============================================================
//  SITEMAP / ROBOTS / RSS
// ============================================================
router.get('/robots.txt', (_req, res) => {
  res.type('text/plain').send(SEO.robotsTxt());
});

router.get('/sitemap.xml', (_req, res) => {
  res.type('application/xml').send(SEO.sitemapIndex([
    '/sitemap-pages.xml', '/sitemap-posts.xml', '/sitemap-taxonomies.xml',
  ]));
});

router.get('/sitemap-pages.xml', (_req, res) => {
  const pages = q.all(
    "SELECT slug, updated_at, sitemap_priority, sitemap_freq FROM posts WHERE type='page' AND status='published' AND noindex=0"
  );
  const urls = [
    { loc: '/', lastmod: new Date().toISOString(), changefreq: 'daily', priority: '1.0' },
    { loc: '/tin-tuc', lastmod: new Date().toISOString(), changefreq: 'daily', priority: '0.9' },
    ...pages.map((p) => ({
      loc: `/trang/${p.slug}`,
      lastmod: U.isoDate(p.updated_at),
      changefreq: p.sitemap_freq,
      priority: p.sitemap_priority,
    })),
  ];
  res.type('application/xml').send(SEO.urlset(urls));
});

router.get('/sitemap-posts.xml', (_req, res) => {
  const rows = q.all(`
    SELECT slug, title, updated_at, published_at, cover_image, cover_alt, sitemap_priority, sitemap_freq
      FROM posts
     WHERE type='post' AND status='published' AND noindex=0 AND published_at <= datetime('now')
     ORDER BY published_at DESC LIMIT 5000`);
  res.type('application/xml').send(SEO.urlset(rows.map((p) => ({
    loc: `/tin-tuc/${p.slug}`,
    lastmod: U.isoDate(p.updated_at || p.published_at),
    changefreq: p.sitemap_freq,
    priority: p.sitemap_priority,
    images: p.cover_image ? [{ loc: p.cover_image, title: p.cover_alt || p.title }] : [],
  }))));
});

router.get('/sitemap-taxonomies.xml', (_req, res) => {
  const cats = q.all('SELECT slug FROM categories');
  const tgs = q.all(`
    SELECT t.slug FROM tags t
     WHERE (SELECT COUNT(*) FROM post_tags pt WHERE pt.tag_id = t.id) >= 2`);
  res.type('application/xml').send(SEO.urlset([
    ...cats.map((c) => ({ loc: `/chuyen-muc/${c.slug}`, changefreq: 'weekly', priority: '0.6' })),
    ...tgs.map((t) => ({ loc: `/tag/${t.slug}`, changefreq: 'monthly', priority: '0.4' })),
  ]));
});

router.get('/rss.xml', (_req, res) => {
  const { rows } = posts.published({ page: 1, perPage: 30 });
  res.type('application/rss+xml').send(SEO.rss(rows));
});

// Manifest PWA nhẹ (tăng điểm Lighthouse)
router.get('/site.webmanifest', (_req, res) => {
  const s = allSettings();
  res.type('application/manifest+json').json({
    name: s.site_name,
    short_name: 'Seaphony',
    description: s.site_description,
    start_url: '/',
    display: 'standalone',
    background_color: '#14100a',
    theme_color: '#14100a',
    lang: 'vi',
    icons: [{ src: '/img/hero.jpg', sizes: '512x512', type: 'image/jpeg' }],
  });
});

module.exports = router;
