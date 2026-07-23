'use strict';
const config = require('./config');
const { allSettings } = require('./db');
const U = require('./utils');

const abs = (p = '/') => (/^https?:\/\//i.test(p) ? p : config.siteUrl + (p.startsWith('/') ? p : `/${p}`));

// ============================================================
//  BỘ THẺ META CHO MỌI TRANG
// ============================================================
/**
 * Dựng đối tượng `seo` để layout render <head>.
 * @param {object} o { title, description, path, image, imageAlt, type, noindex, nofollow,
 *                     publishedTime, modifiedTime, author, section, tags[], canonical, keywords }
 */
function buildMeta(o = {}) {
  const s = allSettings();
  const site = s.site_name;
  const rawTitle = o.title || `${site} — ${s.site_tagline}`;
  const title = o.title
    ? (s.seo_title_template || '%title% — %site%').replace('%title%', o.title).replace('%site%', site)
    : rawTitle;

  const description = U.stripTags(o.description || s.site_description).slice(0, 300);
  const url = abs(o.canonical || o.path || '/');
  const image = abs(o.image || s.default_og_image);

  const robots = [];
  robots.push(o.noindex ? 'noindex' : 'index');
  robots.push(o.nofollow ? 'nofollow' : 'follow');
  if (!o.noindex) robots.push('max-image-preview:large', 'max-snippet:-1', 'max-video-preview:-1');

  return {
    title,
    rawTitle: o.title || site,
    description,
    url,
    canonical: url,
    image,
    imageAlt: o.imageAlt || o.title || site,
    type: o.type || 'website',
    robots: robots.join(', '),
    keywords: o.keywords || s.site_keywords,
    siteName: site,
    locale: s.site_locale || 'vi_VN',
    publishedTime: o.publishedTime || '',
    modifiedTime: o.modifiedTime || '',
    author: o.author || '',
    section: o.section || '',
    tags: o.tags || [],
    twitterCard: o.image ? 'summary_large_image' : 'summary_large_image',
    prev: o.prev ? abs(o.prev) : '',
    next: o.next ? abs(o.next) : '',
    ga: s.google_analytics_id,
    verifications: {
      google: s.google_site_verification,
      bing: s.bing_site_verification,
      facebook: s.facebook_domain_verification,
    },
  };
}

// ============================================================
//  DỮ LIỆU CÓ CẤU TRÚC (JSON-LD)
// ============================================================
function organizationLd() {
  const s = allSettings();
  const sameAs = [s.social_facebook, s.social_youtube, s.social_instagram].filter(Boolean);
  return {
    '@context': 'https://schema.org',
    '@type': 'PerformingArtsTheater',
    '@id': `${config.siteUrl}/#organization`,
    name: s.organization_name,
    alternateName: s.site_name,
    url: config.siteUrl,
    logo: abs(s.default_og_image),
    image: abs(s.default_og_image),
    description: s.site_description,
    ...(s.organization_email ? { email: s.organization_email } : {}),
    ...(s.organization_phone ? { telephone: s.organization_phone } : {}),
    address: {
      '@type': 'PostalAddress',
      streetAddress: s.organization_address,
      addressLocality: 'Hoa Lư',
      addressRegion: 'Ninh Bình',
      addressCountry: 'VN',
    },
    ...(s.organization_lat && s.organization_lng
      ? { geo: { '@type': 'GeoCoordinates', latitude: s.organization_lat, longitude: s.organization_lng } }
      : {}),
    ...(sameAs.length ? { sameAs } : {}),
  };
}

function websiteLd() {
  const s = allSettings();
  return {
    '@context': 'https://schema.org',
    '@type': 'WebSite',
    '@id': `${config.siteUrl}/#website`,
    url: config.siteUrl,
    name: s.site_name,
    description: s.site_description,
    inLanguage: 'vi-VN',
    publisher: { '@id': `${config.siteUrl}/#organization` },
    potentialAction: {
      '@type': 'SearchAction',
      target: { '@type': 'EntryPoint', urlTemplate: `${config.siteUrl}/tim-kiem?q={search_term_string}` },
      'query-input': 'required name=search_term_string',
    },
  };
}

function breadcrumbLd(items = []) {
  return {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: items.map((it, i) => ({
      '@type': 'ListItem',
      position: i + 1,
      name: it.name,
      item: abs(it.url),
    })),
  };
}

function articleLd(post) {
  const s = allSettings();
  const url = abs(post.canonical_url || `/tin-tuc/${post.slug}`);
  return {
    '@context': 'https://schema.org',
    '@type': post.schema_type && post.schema_type !== 'Event' ? post.schema_type : 'Article',
    mainEntityOfPage: { '@type': 'WebPage', '@id': url },
    headline: (post.meta_title || post.title).slice(0, 110),
    name: post.title,
    description: post.meta_desc || post.excerpt,
    image: [abs(post.og_image || post.cover_image || s.default_og_image)],
    datePublished: U.isoDate(post.published_at || post.created_at),
    dateModified: U.isoDate(post.updated_at || post.published_at || post.created_at),
    author: {
      '@type': 'Person',
      name: post.author_name || s.organization_name,
      url: `${config.siteUrl}/tac-gia/${U.slugify(post.author_name || s.organization_name)}`,
    },
    publisher: { '@id': `${config.siteUrl}/#organization` },
    inLanguage: 'vi-VN',
    ...(post.category_name ? { articleSection: post.category_name } : {}),
    ...(post.tag_names?.length ? { keywords: post.tag_names.join(', ') } : {}),
    wordCount: U.wordCount(post.content_html || ''),
    timeRequired: `PT${post.reading_time || 1}M`,
    url,
  };
}

function eventLd(show) {
  const s = allSettings();
  const start = `${show.show_date}T${(show.show_time || '20:00')}:00+07:00`;
  return {
    '@context': 'https://schema.org',
    '@type': 'TheaterEvent',
    name: show.title,
    description: show.description || show.subtitle,
    startDate: start,
    eventStatus: 'https://schema.org/EventScheduled',
    eventAttendanceMode: 'https://schema.org/OfflineEventAttendanceMode',
    location: {
      '@type': 'Place',
      name: show.venue || s.organization_name,
      address: {
        '@type': 'PostalAddress',
        streetAddress: s.organization_address,
        addressLocality: 'Hoa Lư',
        addressRegion: 'Ninh Bình',
        addressCountry: 'VN',
      },
    },
    image: [abs(s.default_og_image)],
    organizer: { '@id': `${config.siteUrl}/#organization` },
    performer: { '@type': 'PerformingGroup', name: s.organization_name },
    offers: {
      '@type': 'Offer',
      url: `${config.siteUrl}/#lich-dien`,
      price: show.price_b || show.price_a,
      priceCurrency: 'VND',
      availability: show.on_sale ? 'https://schema.org/InStock' : 'https://schema.org/PreOrder',
      validFrom: U.isoDate(show.created_at),
    },
  };
}

function faqLd(items = []) {
  return {
    '@context': 'https://schema.org',
    '@type': 'FAQPage',
    mainEntity: items.map((it) => ({
      '@type': 'Question',
      name: it.q,
      acceptedAnswer: { '@type': 'Answer', text: it.a },
    })),
  };
}

function itemListLd(posts = [], name = 'Tin tức') {
  return {
    '@context': 'https://schema.org',
    '@type': 'ItemList',
    name,
    itemListElement: posts.map((p, i) => ({
      '@type': 'ListItem',
      position: i + 1,
      url: abs(`/tin-tuc/${p.slug}`),
      name: p.title,
    })),
  };
}

// ============================================================
//  CHẤM ĐIỂM SEO CHO BÀI VIẾT
// ============================================================
/**
 * Phân tích một bài viết và trả về { score, grade, checks[] }.
 * checks[]: { id, label, status: 'good'|'warn'|'bad', hint, weight }
 */
function analyzePost(post = {}) {
  const title = String(post.title || '');
  const metaTitle = String(post.meta_title || title);
  const metaDesc = String(post.meta_desc || post.excerpt || '');
  const kw = String(post.focus_keyword || '').trim();
  const kwN = U.deaccent(kw).toLowerCase();
  const html = String(post.content_html || post.content || '');
  const text = U.stripTags(html);
  const textN = U.deaccent(text).toLowerCase();
  const slug = String(post.slug || '');
  const words = U.wordCount(html);

  const checks = [];
  const add = (id, label, status, hint, weight = 1) => checks.push({ id, label, status, hint, weight });

  // --- Tiêu đề SEO ---
  const tl = metaTitle.length;
  if (tl === 0) add('title', 'Tiêu đề SEO', 'bad', 'Chưa có tiêu đề.', 3);
  else if (tl < 30) add('title', 'Tiêu đề SEO', 'warn', `Hơi ngắn (${tl} ký tự) — nên 50–60 ký tự.`, 3);
  else if (tl > 65) add('title', 'Tiêu đề SEO', 'warn', `Hơi dài (${tl} ký tự) — Google thường cắt sau ~60.`, 3);
  else add('title', 'Tiêu đề SEO', 'good', `Độ dài tốt (${tl} ký tự).`, 3);

  // --- Mô tả meta ---
  const dl = metaDesc.length;
  if (dl === 0) add('desc', 'Mô tả meta', 'bad', 'Chưa có mô tả meta — Google sẽ tự trích, khó kiểm soát CTR.', 3);
  else if (dl < 110) add('desc', 'Mô tả meta', 'warn', `Hơi ngắn (${dl} ký tự) — nên 140–160 ký tự.`, 3);
  else if (dl > 165) add('desc', 'Mô tả meta', 'warn', `Hơi dài (${dl} ký tự) — sẽ bị cắt trên kết quả tìm kiếm.`, 3);
  else add('desc', 'Mô tả meta', 'good', `Độ dài tốt (${dl} ký tự).`, 3);

  // --- Từ khoá chính ---
  if (!kw) {
    add('kw', 'Từ khoá chính', 'warn', 'Chưa đặt từ khoá chính — không thể đánh giá mức độ tối ưu.', 2);
  } else {
    const inTitle = U.deaccent(metaTitle).toLowerCase().includes(kwN);
    add('kw-title', 'Từ khoá trong tiêu đề', inTitle ? 'good' : 'bad',
      inTitle ? 'Tiêu đề có chứa từ khoá chính.' : 'Nên đưa từ khoá chính vào tiêu đề, ưu tiên phần đầu.', 3);

    const inSlug = U.deaccent(slug).toLowerCase().includes(kwN.replace(/\s+/g, '-'));
    add('kw-slug', 'Từ khoá trong đường dẫn', inSlug ? 'good' : 'warn',
      inSlug ? 'Đường dẫn chứa từ khoá.' : 'Nên đưa từ khoá vào slug để URL rõ nghĩa.', 2);

    const inDesc = U.deaccent(metaDesc).toLowerCase().includes(kwN);
    add('kw-desc', 'Từ khoá trong mô tả meta', inDesc ? 'good' : 'warn',
      inDesc ? 'Mô tả meta có từ khoá.' : 'Thêm từ khoá vào mô tả meta để tăng độ liên quan.', 2);

    const first = textN.slice(0, 220);
    const inIntro = first.includes(kwN);
    add('kw-intro', 'Từ khoá trong đoạn mở đầu', inIntro ? 'good' : 'warn',
      inIntro ? 'Đoạn mở đầu có từ khoá.' : 'Nên nhắc từ khoá trong ~150 từ đầu tiên.', 2);

    const headings = [...html.matchAll(/<h[23][^>]*>([\s\S]*?)<\/h[23]>/g)].map((m) => U.deaccent(U.stripTags(m[1])).toLowerCase());
    const inH = headings.some((h) => h.includes(kwN));
    add('kw-heading', 'Từ khoá trong tiêu đề phụ', inH ? 'good' : 'warn',
      inH ? 'Có tiêu đề phụ chứa từ khoá.' : 'Thêm từ khoá vào ít nhất một thẻ H2/H3.', 2);

    // Mật độ
    const occ = kwN ? (textN.match(new RegExp(kwN.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g')) || []).length : 0;
    const density = words ? (occ * kwN.split(/\s+/).length * 100) / words : 0;
    if (occ === 0) add('kw-density', 'Mật độ từ khoá', 'bad', 'Từ khoá không xuất hiện trong nội dung.', 3);
    else if (density < 0.4) add('kw-density', 'Mật độ từ khoá', 'warn', `Thấp (${density.toFixed(2)}%) — nên 0,5–2,5%.`, 3);
    else if (density > 3) add('kw-density', 'Mật độ từ khoá', 'warn', `Cao (${density.toFixed(2)}%) — coi chừng nhồi từ khoá.`, 3);
    else add('kw-density', 'Mật độ từ khoá', 'good', `Hợp lý (${density.toFixed(2)}%, ${occ} lần).`, 3);
  }

  // --- Độ dài nội dung ---
  if (words < 150) add('len', 'Độ dài nội dung', 'bad', `Chỉ ${words} từ — quá ngắn để xếp hạng tốt (tối thiểu ~300 từ).`, 3);
  else if (words < 300) add('len', 'Độ dài nội dung', 'warn', `${words} từ — nên tăng lên ít nhất 300 từ.`, 3);
  else if (words < 600) add('len', 'Độ dài nội dung', 'good', `${words} từ — đạt yêu cầu cơ bản.`, 3);
  else add('len', 'Độ dài nội dung', 'good', `${words} từ — nội dung chuyên sâu, rất tốt.`, 3);

  // --- Cấu trúc heading ---
  const h2 = (html.match(/<h2[\s>]/g) || []).length;
  if (h2 === 0) add('h2', 'Cấu trúc tiêu đề phụ', words > 300 ? 'bad' : 'warn', 'Chưa có H2 — chia nội dung thành các mục để dễ đọc và dễ lên top.', 2);
  else add('h2', 'Cấu trúc tiêu đề phụ', 'good', `Có ${h2} thẻ H2.`, 2);

  // --- Ảnh đại diện & ALT ---
  add('cover', 'Ảnh đại diện', post.cover_image ? 'good' : 'bad',
    post.cover_image ? 'Đã có ảnh đại diện cho chia sẻ mạng xã hội.' : 'Chưa có ảnh đại diện — bài sẽ hiển thị kém khi chia sẻ.', 2);

  const imgs = [...html.matchAll(/<img[^>]*>/g)].map((m) => m[0]);
  const noAlt = imgs.filter((t) => !/alt="[^"]+"/.test(t)).length;
  if (!imgs.length) add('img', 'Ảnh minh hoạ trong bài', 'warn', 'Bài viết chưa có ảnh minh hoạ nào.', 1);
  else if (noAlt) add('img', 'Thuộc tính ALT của ảnh', 'bad', `${noAlt}/${imgs.length} ảnh thiếu ALT — ảnh hưởng SEO ảnh & khả năng tiếp cận.`, 2);
  else add('img', 'Thuộc tính ALT của ảnh', 'good', `${imgs.length} ảnh đều có ALT.`, 2);

  // --- Liên kết ---
  const links = [...html.matchAll(/<a[^>]+href="([^"]+)"/g)].map((m) => m[1]);
  const internal = links.filter((h) => h.startsWith('/') || h.includes(config.siteUrl)).length;
  const external = links.length - internal;
  add('link-in', 'Liên kết nội bộ', internal > 0 ? 'good' : 'warn',
    internal > 0 ? `${internal} liên kết nội bộ.` : 'Chưa có liên kết nội bộ — nên dẫn sang bài liên quan.', 2);
  add('link-out', 'Liên kết ngoài', external > 0 ? 'good' : 'warn',
    external > 0 ? `${external} liên kết ngoài (dẫn nguồn).` : 'Cân nhắc dẫn nguồn uy tín bên ngoài.', 1);

  // --- Slug ---
  if (!slug) add('slug', 'Đường dẫn', 'bad', 'Chưa có slug.', 2);
  else if (slug.length > 75) add('slug', 'Đường dẫn', 'warn', `Slug dài (${slug.length} ký tự) — nên rút gọn.`, 2);
  else add('slug', 'Đường dẫn', 'good', `Slug gọn (${slug.length} ký tự).`, 2);

  // --- Đoạn văn dài (dễ đọc) ---
  const paras = [...html.matchAll(/<p[^>]*>([\s\S]*?)<\/p>/g)].map((m) => U.stripTags(m[1]));
  const longParas = paras.filter((p) => p.split(/\s+/).length > 150).length;
  add('read', 'Khả năng đọc', longParas ? 'warn' : 'good',
    longParas ? `${longParas} đoạn văn quá dài (>150 từ) — nên tách nhỏ.` : 'Các đoạn văn có độ dài hợp lý.', 1);

  // --- Chỉ mục ---
  if (post.noindex) add('index', 'Cho phép lập chỉ mục', 'bad', 'Bài đang bật NOINDEX — Google sẽ không hiển thị bài này.', 2);
  else add('index', 'Cho phép lập chỉ mục', 'good', 'Bài cho phép Google lập chỉ mục.', 2);

  // --- Tính điểm ---
  const totalW = checks.reduce((t, c) => t + c.weight, 0) || 1;
  const gained = checks.reduce((t, c) => t + c.weight * (c.status === 'good' ? 1 : c.status === 'warn' ? 0.5 : 0), 0);
  const score = Math.round((gained / totalW) * 100);
  const grade = score >= 85 ? 'Xuất sắc' : score >= 70 ? 'Tốt' : score >= 50 ? 'Cần cải thiện' : 'Yếu';

  return {
    score,
    grade,
    checks,
    stats: { words, readingTime: U.readingTime(html), images: imgs.length, internal, external, h2 },
  };
}

// ============================================================
//  SITEMAP & RSS
// ============================================================
function sitemapIndex(parts = []) {
  const now = new Date().toISOString();
  return `<?xml version="1.0" encoding="UTF-8"?>
<?xml-stylesheet type="text/xsl" href="/sitemap.xsl"?>
<sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${parts.map((p) => `  <sitemap><loc>${U.escapeXml(abs(p))}</loc><lastmod>${now}</lastmod></sitemap>`).join('\n')}
</sitemapindex>`;
}

/** urls: [{ loc, lastmod, changefreq, priority, images:[{loc,title}] }] */
function urlset(urls = []) {
  const body = urls.map((u) => {
    const imgs = (u.images || []).map((im) =>
      `\n    <image:image><image:loc>${U.escapeXml(abs(im.loc))}</image:loc>${im.title ? `<image:title>${U.escapeXml(im.title)}</image:title>` : ''}</image:image>`
    ).join('');
    return `  <url>
    <loc>${U.escapeXml(abs(u.loc))}</loc>${u.lastmod ? `\n    <lastmod>${U.escapeXml(u.lastmod)}</lastmod>` : ''}
    <changefreq>${u.changefreq || 'weekly'}</changefreq>
    <priority>${u.priority || '0.7'}</priority>${imgs}
  </url>`;
  }).join('\n');
  return `<?xml version="1.0" encoding="UTF-8"?>
<?xml-stylesheet type="text/xsl" href="/sitemap.xsl"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:image="http://www.google.com/schemas/sitemap-image/1.1">
${body}
</urlset>`;
}

function rss(posts = []) {
  const s = allSettings();
  const items = posts.map((p) => `    <item>
      <title>${U.escapeXml(p.title)}</title>
      <link>${U.escapeXml(abs(`/tin-tuc/${p.slug}`))}</link>
      <guid isPermaLink="true">${U.escapeXml(abs(`/tin-tuc/${p.slug}`))}</guid>
      <pubDate>${new Date(U.isoDate(p.published_at || p.created_at)).toUTCString()}</pubDate>
      <description>${U.escapeXml(p.excerpt || '')}</description>
      ${p.category_name ? `<category>${U.escapeXml(p.category_name)}</category>` : ''}
    </item>`).join('\n');
  return `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom">
  <channel>
    <title>${U.escapeXml(s.site_name)}</title>
    <link>${config.siteUrl}</link>
    <atom:link href="${config.siteUrl}/rss.xml" rel="self" type="application/rss+xml" />
    <description>${U.escapeXml(s.site_description)}</description>
    <language>vi-VN</language>
    <lastBuildDate>${new Date().toUTCString()}</lastBuildDate>
${items}
  </channel>
</rss>`;
}

function robotsTxt() {
  const s = allSettings();
  return `User-agent: *
Allow: /
Disallow: /admin
Disallow: /dang-nhap
Disallow: /api/
Disallow: /*?q=

Sitemap: ${config.siteUrl}/sitemap.xml
${s.robots_extra || ''}`.trim() + '\n';
}

module.exports = {
  abs, buildMeta,
  organizationLd, websiteLd, breadcrumbLd, articleLd, eventLd, faqLd, itemListLd,
  analyzePost,
  sitemapIndex, urlset, rss, robotsTxt,
};
