#!/usr/bin/env node
/**
 * indexnow.mjs - 把站点 URL 推送给 IndexNow（Bing / Yandex / Seznam 等共享入口）
 *
 * 通过内容哈希记录状态（data/.indexnow-state.json），只推送新增或内容有变化的 URL，
 * 避免重复推送被搜索引擎降权。首次运行会推送全部 URL。
 *
 * 用法：
 *   node scripts/indexnow.mjs          # 只推新增/变化的 URL
 *   node scripts/indexnow.mjs --all    # 强制推送全部 URL
 */

import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const cfg = JSON.parse(fs.readFileSync(path.join(root, 'config.json'), 'utf-8'));
const stateFile = path.join(root, 'data/.indexnow-state.json');
const forceAll = process.argv.includes('--all');

const siteUrl = cfg.siteUrl.replace(/\/+$/, '');
const products = JSON.parse(fs.readFileSync(path.join(root, 'data/products.json'), 'utf-8'))
  .filter(p => p && p.id && p.name);

const state = fs.existsSync(stateFile)
  ? JSON.parse(fs.readFileSync(stateFile, 'utf-8'))
  : {};

const hash = s => crypto.createHash('md5').update(s).digest('hex');

// 组装 URL 及内容指纹：列表页指纹 = 全部产品摘要；详情页指纹 = 产品字段
const entries = [];
const listFingerprint = hash(products.map(p => `${p.id}:${p.name}:${p.price}:${p.desc}`).join('|'));
entries.push({ url: `${siteUrl}/`, fingerprint: listFingerprint });

for (const p of products) {
  entries.push({
    url: `${siteUrl}/product/${p.id}/`,
    fingerprint: hash(JSON.stringify([p.name, p.desc, p.price, p.features, p.images]))
  });
}

// 计算需要推送的 URL
const toPush = [];
for (const e of entries) {
  if (forceAll || state[e.url] !== e.fingerprint) toPush.push(e.url);
}

if (!toPush.length) {
  console.log('✔ 无新增或变化的 URL，无需推送 IndexNow');
  process.exit(0);
}

console.log(`待推送 ${toPush.length} 个 URL：`);
toPush.forEach(u => console.log(`  ${u}`));

// IndexNow 单次最多 10000 个 URL，这里不会超限，直接一次推送
const payload = {
  host: siteUrl.replace(/^https?:\/\//, ''),
  key: cfg.indexNow.key,
  keyLocation: `${siteUrl}/${cfg.indexNow.key}.txt`,
  urlList: toPush
};

const res = await fetch(cfg.indexNow.endpoint, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json; charset=utf-8' },
  body: JSON.stringify(payload)
});

if (res.status === 200 || res.status === 202) {
  console.log(`✔ IndexNow 推送成功（HTTP ${res.status}）`);
  for (const e of entries) state[e.url] = e.fingerprint;
  fs.mkdirSync(path.dirname(stateFile), { recursive: true });
  fs.writeFileSync(stateFile, JSON.stringify(state, null, 2) + '\n');
} else if (res.status === 400) {
  console.error('✖ 推送失败 400：URL 格式错误或 keyLocation 不可访问，请检查 config.json 的 siteUrl 与线上 key 文件');
  process.exitCode = 1;
} else if (res.status === 403) {
  console.error('✖ 推送失败 403：key 校验失败，请确认 public/ 下的密钥文件已部署到线上');
  process.exitCode = 1;
} else if (res.status === 429) {
  console.error('✖ 推送失败 429：请求过于频繁，请稍后重试');
  process.exitCode = 1;
} else {
  console.error(`✖ 推送失败：HTTP ${res.status}`);
  process.exitCode = 1;
}
