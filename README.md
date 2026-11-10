# 果果源码 · GitHub Pages SEO 推广站

从官网 `auth.ggdoc.cn` 的源码产品（id 1~42）自动生成静态 SEO 页面并托管到 GitHub Pages，购买流量回流官网。

## 目录结构

```
├── config.json                    # 站点配置（域名、官网地址、IndexNow 密钥）
├── data/products.json             # 产品数据（脚本自动抓取 + 可手工补充）
├── scripts/
│   ├── fetch-products.mjs         # 从官网抓取产品数据（自动发现新源码）
│   ├── build.mjs                  # 生成静态页面到 public/
│   └── indexnow.mjs               # 推送新增/变化 URL 到 IndexNow
├── .github/workflows/deploy.yml   # 自动化：构建 → 部署 Pages → IndexNow
└── public/                        # 构建产物（不要手工修改，gitignore）
```

## 首次部署（4 步）

1. **修改 `config.json` 的 `siteUrl`**
   - 推荐自定义域名：`https://code.ggdoc.cn`（在 DNS 添加 CNAME 记录指向 `<用户名>.github.io`，构建时会自动生成 CNAME 文件）
   - 或使用 GitHub 默认：`https://<用户名>.github.io/<仓库名>/`

2. **推送到 GitHub**，并确认仓库名与 `siteUrl` 一致。

3. **开启 GitHub Pages**：仓库 Settings → Pages → Source 选择 **GitHub Actions**。

4. **提交 IndexNow**（首次让搜索引擎尽快收录）：
   - 部署完成后，访问 `https://你的域名/sitemap.xml` 和 `https://你的域名/{key}.txt` 确认可访问；
   - 手动触发一次 Actions（Run workflow），它会在部署后自动推送 IndexNow。

## 日常新增源码（全自动，无需操作）

- 工作流每天北京时间 10:00 自动抓取官网全部产品页（id 1~42），发现新产品会：
  自动生成产品页 → 自动部署 Pages → 自动提交数据到仓库 → 自动推送 IndexNow。
- 产品页面的数量上限由 `config.json` 的 `productCount` 控制，官网扩容后改这个数字即可。

## 本地命令

```bash
npm run fetch        # 抓取/更新产品数据（支持 --update --ids 5,6 --force）
npm run build        # 生成页面到 public/
npm run indexnow     # 推送变化的 URL（--all 强制全量）
npm run all          # fetch → build → indexnow 一条龙
```

## SEO 说明

- 每个产品页含独立 title / description / canonical / Open Graph / JSON-LD（Product + AggregateRating）
- 详情页之间“相关源码”互链，列表页链到全部产品页，结构利于爬虫遍历
- `sitemap.xml`、`robots.txt`、IndexNow 密钥文件每次构建自动生成
- 购买按钮链接官网 `auth.ggdoc.cn/product/{id}`，官网建议在页脚加回链本站形成双向导流

## IndexNow 密钥

`config.json` → `indexNow.key` = `1107aeb69d40d1fe4cbe13a04cdbf4c3`
（构建时自动生成 `public/{key}.txt` 验证文件；如需更换密钥，改 config.json 后重新构建即可）
