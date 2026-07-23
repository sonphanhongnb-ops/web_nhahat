<?xml version="1.0" encoding="UTF-8"?>
<xsl:stylesheet version="1.0"
  xmlns:xsl="http://www.w3.org/1999/XSL/Transform"
  xmlns:s="http://www.sitemaps.org/schemas/sitemap/0.9"
  xmlns:image="http://www.google.com/schemas/sitemap-image/1.1">
<xsl:output method="html" encoding="UTF-8" indent="yes"
  doctype-system="about:legacy-compat"/>

<xsl:template match="/">
<html lang="vi">
<head>
<meta charset="utf-8"/>
<meta name="viewport" content="width=device-width, initial-scale=1"/>
<meta name="robots" content="noindex,follow"/>
<title>Sơ đồ website · THỨC by SEASOUND</title>
<style>
  :root{--ink:#14100a;--ink2:#1c160d;--ink3:#241c11;--gold:#c9a35c;--gold2:#e6c47c;--cream:#ece2cd;--muted:#a49a83;--line:rgba(201,163,92,.20);--soft:rgba(236,226,205,.10)}
  *{box-sizing:border-box}
  body{margin:0;background:var(--ink);color:var(--cream);font-family:"Be Vietnam Pro",system-ui,-apple-system,Segoe UI,sans-serif;font-weight:300;line-height:1.6;-webkit-font-smoothing:antialiased}
  a{color:var(--gold);text-decoration:none;word-break:break-all}
  a:hover{color:var(--gold2);text-decoration:underline}
  .wrap{max-width:1000px;margin:0 auto;padding:clamp(24px,5vw,56px) clamp(18px,5vw,40px)}
  header{border-bottom:1px solid var(--line);padding-bottom:1.6rem;margin-bottom:1.8rem}
  .brand{font-weight:600;letter-spacing:.28em;font-size:1.05rem}
  .brand span{color:var(--gold);font-weight:400}
  h1{font-family:Georgia,"Times New Roman",serif;font-weight:400;font-size:clamp(1.5rem,4vw,2.1rem);margin:.9rem 0 .4rem}
  .lead{color:var(--muted);font-size:.95rem;margin:0}
  .note{margin:1.4rem 0 0;padding:.8rem 1rem;border:1px solid var(--soft);border-left:2px solid var(--gold);border-radius:3px;background:var(--ink2);color:var(--muted);font-size:.86rem}
  .count{display:inline-block;margin:1.8rem 0 .8rem;font-size:.72rem;letter-spacing:.22em;text-transform:uppercase;color:var(--gold)}
  table{width:100%;border-collapse:collapse;font-size:.9rem;background:var(--ink2);border:1px solid var(--soft);border-radius:4px;overflow:hidden}
  th,td{text-align:left;padding:.75rem .9rem;border-bottom:1px solid var(--soft);vertical-align:top}
  th{font-size:.68rem;letter-spacing:.14em;text-transform:uppercase;color:var(--muted);font-weight:500;background:var(--ink3);white-space:nowrap}
  tbody tr:hover{background:rgba(201,163,92,.05)}
  td.num{color:var(--muted);width:3rem}
  td.meta{color:var(--muted);white-space:nowrap;font-variant-numeric:tabular-nums}
  .tag{display:inline-block;font-size:.72rem;padding:.15rem .55rem;border:1px solid var(--line);border-radius:999px;color:var(--muted)}
  footer{margin-top:2.4rem;padding-top:1.4rem;border-top:1px solid var(--soft);color:var(--muted);font-size:.82rem}
  footer a{color:var(--muted)}
  @media(max-width:640px){.hide-sm{display:none}}
</style>
</head>
<body>
<div class="wrap">
  <header>
    <div class="brand">THỨC <span>by SEASOUND</span></div>
    <h1>Sơ đồ website (XML Sitemap)</h1>
    <p class="lead">Danh sách địa chỉ dành cho công cụ tìm kiếm như Google &amp; Bing.</p>
    <div class="note">Đây là tệp XML hợp lệ dành cho robot tìm kiếm — không phải trang lỗi. Trang này chỉ được tô màu để bạn dễ đọc.</div>
  </header>
  <xsl:apply-templates/>
  <footer>
    © THỨC by SEASOUND · <a href="/">Về trang chủ</a>
  </footer>
</div>
</body>
</html>
</xsl:template>

<!-- ===== Sitemap index (danh sách các sitemap con) ===== -->
<xsl:template match="s:sitemapindex">
  <span class="count"><xsl:value-of select="count(s:sitemap)"/> sitemap</span>
  <table>
    <thead><tr><th class="num">#</th><th>Sitemap</th><th class="hide-sm">Cập nhật</th></tr></thead>
    <tbody>
      <xsl:for-each select="s:sitemap">
        <tr>
          <td class="num"><xsl:value-of select="position()"/></td>
          <td><a href="{s:loc}"><xsl:value-of select="s:loc"/></a></td>
          <td class="meta hide-sm"><xsl:value-of select="substring(s:lastmod,1,10)"/></td>
        </tr>
      </xsl:for-each>
    </tbody>
  </table>
</xsl:template>

<!-- ===== Urlset (danh sách địa chỉ) ===== -->
<xsl:template match="s:urlset">
  <span class="count"><xsl:value-of select="count(s:url)"/> địa chỉ</span>
  <table>
    <thead>
      <tr>
        <th class="num">#</th>
        <th>URL</th>
        <th class="hide-sm">Tần suất</th>
        <th class="hide-sm">Ưu tiên</th>
        <th class="hide-sm">Cập nhật</th>
      </tr>
    </thead>
    <tbody>
      <xsl:for-each select="s:url">
        <tr>
          <td class="num"><xsl:value-of select="position()"/></td>
          <td><a href="{s:loc}"><xsl:value-of select="s:loc"/></a></td>
          <td class="meta hide-sm"><xsl:value-of select="s:changefreq"/></td>
          <td class="hide-sm"><span class="tag"><xsl:value-of select="s:priority"/></span></td>
          <td class="meta hide-sm"><xsl:value-of select="substring(s:lastmod,1,10)"/></td>
        </tr>
      </xsl:for-each>
    </tbody>
  </table>
</xsl:template>

</xsl:stylesheet>
