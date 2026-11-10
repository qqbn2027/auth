#!/usr/bin/env node
/**
 * build.mjs - 从 data/products.json 生成静态 SEO 页面
 *
 * 输出到 public/：
 *   index.html               产品列表页
 *   product/{id}/index.html  每个源码的详情页
 *   sitemap.xml / robots.txt
 *   CNAME（自定义域名时）
 *   {indexnow-key}.txt       IndexNow 密钥验证文件
 *
 * 用法：node scripts/build.mjs
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const cfg = JSON.parse(fs.readFileSync(path.join(root, 'config.json'), 'utf-8'));
const products = JSON.parse(fs.readFileSync(path.join(root, 'data/products.json'), 'utf-8'))
  .filter(p => p && p.id && p.name) // 过滤占位数据
  .sort((a, b) => a.id - b.id);

const outDir = path.join(root, 'public');
const siteUrl = cfg.siteUrl.replace(/\/+$/, '');
const mainSite = cfg.mainSite.replace(/\/+$/, '');
const esc = s => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;')
  .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const money = n => `¥${Number(n).toFixed(2)}`;
const productUrl = id => `${siteUrl}/product/${id}/`;
const buyUrl = id => `${mainSite}/product/${id}`;
const now = new Date().toISOString().slice(0, 10);

/* ---------------- 公共样式 ---------------- */
const CSS = `
:root{--primary:#2563eb;--dark:#111827;--gray:#6b7280;--bg:#f8fafc;--card:#ffffff;--border:#e5e7eb}
*{margin:0;padding:0;box-sizing:border-box}
body{font-family:-apple-system,BlinkMacSystemFont,"Segoe UI","PingFang SC","Microsoft YaHei",sans-serif;color:var(--dark);background:var(--bg);line-height:1.7}
a{color:var(--primary);text-decoration:none}
header{background:var(--card);border-bottom:1px solid var(--border);padding:16px 24px;display:flex;align-items:center;justify-content:space-between;max-width:100%}
header .brand{font-size:20px;font-weight:700;color:var(--dark)}
header nav a{margin-left:20px;color:var(--gray);font-size:14px}
header nav a:hover{color:var(--primary)}
.wrap{max-width:1080px;margin:0 auto;padding:24px}
.hero{text-align:center;padding:48px 16px 32px}
.hero h1{font-size:30px;margin-bottom:12px}
.hero p{color:var(--gray);max-width:640px;margin:0 auto}
.grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(300px,1fr));gap:20px;padding:24px 0 48px}
.card{background:var(--card);border:1px solid var(--border);border-radius:10px;padding:20px;display:flex;flex-direction:column;transition:box-shadow .2s}
.card:hover{box-shadow:0 6px 18px rgba(0,0,0,.08)}
.card h2{font-size:17px;margin-bottom:8px}
.card h2 a{color:var(--dark)}
.card .desc{color:var(--gray);font-size:14px;flex:1;display:-webkit-box;-webkit-line-clamp:3;-webkit-box-orient:vertical;overflow:hidden}
.card .meta{display:flex;justify-content:space-between;align-items:center;margin-top:14px}
.price{color:#dc2626;font-weight:700;font-size:18px}
.tag{display:inline-block;background:#eff6ff;color:var(--primary);font-size:12px;border-radius:4px;padding:2px 8px;margin-bottom:8px}
.detail{background:var(--card);border:1px solid var(--border);border-radius:10px;padding:32px;max-width:860px;margin:24px auto}
.detail h1{font-size:26px;margin-bottom:8px}
.detail .sub{color:var(--gray);font-size:14px;margin-bottom:20px}
.detail .desc{font-size:16px;margin-bottom:24px}
.detail h2{font-size:20px;margin:28px 0 12px;border-left:4px solid var(--primary);padding-left:10px}
.detail ul{padding-left:22px}
.detail li{margin-bottom:6px;color:#374151}
.gallery img{max-width:100%;border:1px solid var(--border);border-radius:8px;margin-bottom:12px}
.buybox{background:#f0f9ff;border:1px solid #bae6fd;border-radius:10px;padding:20px;margin:24px 0;display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:12px}
.btn{display:inline-block;background:var(--primary);color:#fff!important;font-size:16px;font-weight:600;padding:12px 28px;border-radius:8px}
.btn:hover{background:#1d4ed8}
.related{margin-top:12px}
footer{border-top:1px solid var(--border);background:var(--card);text-align:center;color:var(--gray);font-size:13px;padding:24px}
@media(max-width:640px){.detail{padding:20px}.hero h1{font-size:24px}}
`;

const header = (title) => `
<header>
  <a class="brand" href="${siteUrl}/">${esc(cfg.siteName)} · 源码展示</a>
  <nav>
    <a href="${siteUrl}/">全部源码</a>
    <a href="${mainSite}/market" rel="nofollow">在线选购</a>
    <a href="${mainSite}" rel="nofollow">官方网站</a>
  </nav>
</header>`;

const footer = `
<footer>
  <p>${esc(cfg.siteName)}（${esc(mainSite.replace('https://', ''))}）— 源码购买后自动发货，附带完整使用教程。</p>
  <p>本站为 ${esc(cfg.siteName)} 源码展示与推广页面，购买请前往 <a href="${mainSite}" rel="nofollow">${esc(mainSite.replace('https://', ''))}</a></p>
</footer>`;

/* ---------------- 详情页 ---------------- */
function renderProduct(p, all) {
  const url = productUrl(p.id);
  const related = all.filter(x => x.id !== p.id).slice(0, 6);
  const jsonLd = {
    '@context': 'https://schema.org',
    '@type': 'Product',
    name: p.name,
    description: p.desc,
    image: p.images?.length ? p.images : undefined,
    brand: { '@type': 'Brand', name: cfg.siteName },
    offers: {
      '@type': 'Offer',
      price: String(p.price),
      priceCurrency: 'CNY',
      availability: 'https://schema.org/InStock',
      url: buyUrl(p.id)
    },
    ...(p.rating && p.ratingCount ? {
      aggregateRating: {
        '@type': 'AggregateRating',
        ratingValue: p.rating,
        ratingCount: p.ratingCount
      }
    } : {})
  };
  const featureList = p.features?.length
    ? `<h2>功能清单</h2><ul>${p.features.map(f => `<li>${esc(f)}</li>`).join('')}</ul>`
    : '';
  const gallery = p.images?.length
    ? `<h2>截图预览</h2><div class="gallery">${p.images.map(i => `<img src="${esc(i)}" alt="${esc(p.name)} 截图" loading="lazy">`).join('')}</div>`
    : '';
  const title = `${p.name} - ${p.category || '源码'} | ${cfg.siteName}`;

  return `<!DOCTYPE html>
<html lang="zh-CN">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>${esc(title)}</title>
<meta name="description" content="${esc(p.desc)}">
<link rel="canonical" href="${url}">
<meta property="og:type" content="product">
<meta property="og:title" content="${esc(p.name)}">
<meta property="og:description" content="${esc(p.desc)}">
<meta property="og:url" content="${url}">
${p.images?.length ? `<meta property="og:image" content="${esc(p.images[0])}">` : ''}
<script type="application/ld+json">${JSON.stringify(jsonLd)}</script>
<style>${CSS}</style>
</head>
<body>
${header()}
<div class="wrap">
  <article class="detail">
    <span class="tag">${esc(p.category || '源码')}</span>
    <h1>${esc(p.name)}</h1>
    <p class="sub">已售 ${p.sales ?? '-'} · 评分 ${p.rating ?? '-'} · 自动发货 · 附带完整使用教程</p>
    <p class="desc">${esc(p.desc)}</p>
    <div class="buybox">
      <span class="price">${money(p.price)}</span>
      <a class="btn" href="${buyUrl(p.id)}" rel="nofollow" title="前往${esc(cfg.siteName)}购买${esc(p.name)}">前往官网购买</a>
    </div>
    ${featureList}
    ${gallery}
    <div class="related">
      <h2>更多${esc(cfg.siteName)}源码</h2>
      <ul>${related.map(r => `<li><a href="${productUrl(r.id)}">${esc(r.name)}</a>（${money(r.price)}）</li>`).join('')}</ul>
      <p><a href="${siteUrl}/">查看全部 ${all.length} 款源码 →</a></p>
    </div>
  </article>
</div>
${footer}
</body>
</html>`;
}

/* ---------------- 列表页 ---------------- */
function renderIndex(all) {
  const cards = all.map(p => `
    <div class="card">
      <span class="tag">${esc(p.category || '源码')}</span>
      <h2><a href="${productUrl(p.id)}" title="${esc(p.name)}">${esc(p.name)}</a></h2>
      <p class="desc">${esc(p.desc)}</p>
      <div class="meta">
        <span class="price">${money(p.price)}</span>
        <a href="${productUrl(p.id)}">查看详情 →</a>
      </div>
    </div>`).join('\n');

  return `<!DOCTYPE html>
<html lang="zh-CN">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>${esc(cfg.siteName)}源码商城 - ${all.length}款WordPress插件/主题源码下载</title>
<meta name="description" content="${esc(cfg.siteDesc)} 全部${all.length}款源码在线展示，购买后自动发货。">
<link rel="canonical" href="${siteUrl}/">
<meta property="og:type" content="website">
<meta property="og:title" content="${esc(cfg.siteName)}源码商城">
<meta property="og:description" content="${esc(cfg.siteDesc)}">
<meta property="og:url" content="${siteUrl}/">
<script type="application/ld+json">${JSON.stringify({
    '@context': 'https://schema.org',
    '@type': 'WebSite',
    name: cfg.siteName,
    url: siteUrl + '/',
    description: cfg.siteDesc
  })}</script>
<style>${CSS}</style>
</head>
<body>
${header()}
<div class="wrap">
  <section class="hero">
    <h1>${esc(cfg.siteName)}，让创业起步更快一点</h1>
    <p>${esc(cfg.siteDesc)} 共 ${all.length} 款源码在线展示，购买请前往官网，购买后自动发货。</p>
  </section>
  <section class="grid">${cards}</section>
</div>
${footer}
</body>
</html>`;
}

/* ---------------- 输出 ---------------- */
fs.rmSync(outDir, { recursive: true, force: true });
fs.mkdirSync(outDir, { recursive: true });

fs.writeFileSync(path.join(outDir, 'index.html'), renderIndex(products));

for (const p of products) {
  const dir = path.join(outDir, 'product', String(p.id));
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, 'index.html'), renderProduct(p, products));
}

// sitemap.xml
const sitemapUrls = [`${siteUrl}/`, ...products.map(p => productUrl(p.id))];
fs.writeFileSync(path.join(outDir, 'sitemap.xml'),
  `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${sitemapUrls.map(u => `  <url><loc>${u}</loc><lastmod>${now}</lastmod></url>`).join('\n')}
</urlset>`);

// robots.txt
fs.writeFileSync(path.join(outDir, 'robots.txt'),
  `User-agent: *\nAllow: /\nSitemap: ${siteUrl}/sitemap.xml\n`);

// IndexNow 密钥验证文件
fs.writeFileSync(path.join(outDir, `${cfg.indexNow.key}.txt`), cfg.indexNow.key);

// CNAME（使用自定义域名时生成；github.io 子路径则不生成）
if (!siteUrl.includes('github.io')) {
  fs.writeFileSync(path.join(outDir, 'CNAME'), siteUrl.replace(/^https?:\/\//, ''));
}

console.log(`✔ 构建完成：${products.length} 个产品页 + 列表页，输出到 public/`);
console.log(`  站点地址: ${siteUrl}`);
console.log(`  购买跳转: ${mainSite}/product/{id}`);
