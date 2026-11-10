#!/usr/bin/env node
/**
 * fetch-products.mjs - 从官网 auth.ggdoc.cn 抓取产品数据，更新 data/products.json
 *
 * 自动发现新产品：扫描 1 ~ config.productCount 的所有 id，
 * 已存在的默认跳过；官网新增源码后重新运行即可自动补齐。
 *
 * 用法：
 *   node scripts/fetch-products.mjs             # 抓取缺失的产品
 *   node scripts/fetch-products.mjs --update    # 已存在的产品也重新抓取（刷新价格/描述）
 *   node scripts/fetch-products.mjs --ids 5,6   # 只抓指定 id
 *   node scripts/fetch-products.mjs --force     # 强制刷新全部
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const cfg = JSON.parse(fs.readFileSync(path.join(root, 'config.json'), 'utf-8'));
const dataFile = path.join(root, 'data/products.json');
const products = fs.existsSync(dataFile)
  ? JSON.parse(fs.readFileSync(dataFile, 'utf-8'))
  : [];

const args = process.argv.slice(2);
const wantUpdate = args.includes('--update') || args.includes('--force');
const idsArg = args.find(a => a.startsWith('--ids'));
const ids = idsArg
  ? idsArg.split('=')[1].split(',').map(Number)
  : Array.from({ length: cfg.productCount }, (_, i) => i + 1);

const existing = new Map(products.map(p => [p.id, p]));
const UA = { headers: { 'User-Agent': 'Mozilla/5.0 (compatible; ggdoc-pages-bot/1.0)' } };

function decode(s) {
  return s.replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&nbsp;/g, ' ').trim();
}

function meta(html, name) {
  const m = html.match(new RegExp(`<meta[^>]+(?:property|name)=["']${name}["'][^>]+content=["']([^"']*)["']`, 'i'))
    || html.match(new RegExp(`<meta[^>]+content=["']([^"']*)["'][^>]+(?:property|name)=["']${name}["']`, 'i'));
  return m ? decode(m[1]) : '';
}

function parseProduct(id, html) {
  const title = meta(html, 'og:title') || decode((html.match(/<title>([^<]*)<\/title>/i) || [])[1] || '');
  const name = title.split(/[-|–]/)[0].replace(/-果果源码$/, '').trim() || `产品${id}`;
  const desc = meta(html, 'og:description') || meta(html, 'description') || '';

  // 价格：取页面中第一个 ¥xx.xx
  const priceM = html.match(/[¥￥]\s*([0-9]+(?:\.[0-9]{1,2})?)/);
  const price = priceM ? Number(priceM[1]) : null;

  // 销量 / 评分
  const salesM = html.match(/销量\s*(\d+)/);
  const ratingM = html.match(/评分\s*([0-9.]+)/);
  const rcM = html.match(/(\d+)\s*条评价/);
  const rcM2 = html.match(/(\d+)\s*人评分/);

  // 截图：正文中的 wp-content 图片
  const images = [...html.matchAll(/https?:\/\/[^\s"'<>]+wp-content\/uploads\/[^\s"'<>]+\.(?:png|jpe?g|webp)/gi)]
    .map(m => m[0]);
  const uniqueImages = [...new Set(images)];

  // 功能清单：h2/h3 标题含“功能”之后的 ul 里的 li
  const features = [];
  const secM = html.match(/<h[23][^>]*>[^<]*功能[^<]*<\/h[23]>([\s\S]*?)<h[23]/i);
  if (secM) {
    for (const li of secM[1].matchAll(/<li[^>]*>([\s\S]*?)<\/li>/gi)) {
      const t = decode(li[1].replace(/<[^>]+>/g, ''));
      if (t) features.push(t);
    }
  }

  return {
    id,
    name,
    ...(desc ? { desc } : {}),
    ...(price ? { price } : {}),
    ...(salesM ? { sales: Number(salesM[1]) } : {}),
    ...(ratingM ? { rating: Number(ratingM[1]) } : {}),
    ...(rcM || rcM2 ? { ratingCount: Number((rcM || rcM2)[1]) } : {}),
    ...(features.length ? { features } : {}),
    ...(uniqueImages.length ? { images: uniqueImages } : {}),
    fetchedAt: new Date().toISOString().slice(0, 10)
  };
}

let added = 0, updated = 0, failed = 0;

for (const id of ids) {
  const has = existing.has(id);
  if (has && !wantUpdate) continue;

  const url = `${cfg.mainSite.replace(/\/+$/, '')}/product/${id}`;
  try {
    const res = await fetch(url, UA);
    if (res.status === 404) {
      console.log(`- id=${id} 官网不存在（跳过）`);
      continue;
    }
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const html = await res.text();
    const p = parseProduct(id, html);

    if (!p.name || /^产品\d+$/.test(p.name)) throw new Error('无法解析产品名');

    if (has) {
      // 更新时保留手工维护的字段优先级：不覆盖为空值
      const old = existing.get(id);
      const merged = { ...old };
      for (const [k, v] of Object.entries(p)) {
        if (v !== null && v !== '' && !(Array.isArray(v) && !v.length)) merged[k] = v;
      }
      existing.set(id, merged);
      updated++;
      console.log(`✔ id=${id} 更新：${p.name}`);
    } else {
      existing.set(id, p);
      added++;
      console.log(`✔ id=${id} 新增：${p.name}（${p.desc.slice(0, 40)}...）`);
    }
  } catch (e) {
    failed++;
    console.log(`✖ id=${id} 抓取失败：${e.message}`);
  }
}

const sorted = [...existing.values()].sort((a, b) => a.id - b.id);
fs.mkdirSync(path.dirname(dataFile), { recursive: true });
fs.writeFileSync(dataFile, JSON.stringify(sorted, null, 2) + '\n');

console.log(`\n完成：新增 ${added}，更新 ${updated}，失败 ${failed}，当前共 ${sorted.length} 个产品`);
if (failed > 0) process.exitCode = 1;
