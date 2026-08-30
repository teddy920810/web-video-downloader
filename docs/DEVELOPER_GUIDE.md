# 开发者指南

> 产品边界：Streamnest 共享品牌、Google 登录、视频转换和视频压缩属于公共能力；下载器是由站点模式控制的可选产品模块。完整边界见 `docs/ARCHITECTURE.md` 和 `docs/SITE_MODES.md`。

## 环境准备

- Node.js 22 LTS（项目支持 `>=22.12.0 <25`）
- npm 10 或更高版本
- Git
- Cloudflare R2 与 Vercel 项目权限（仅在调试线上资源时需要）

```sh
git pull --ff-only origin main
npm ci
npm run dev
```

按操作系统习惯从 `.env.example` 创建 `.env.local`。该文件只保存本机密钥且已被 Git 忽略；真实凭据由管理员通过密码管理器等安全渠道提供。

Google 登录还需要：

- `GOOGLE_CLIENT_ID`
- `GOOGLE_CLIENT_SECRET`
- `BETTER_AUTH_SECRET`（至少 32 字节随机值）
- `BETTER_AUTH_URL`（本地测试为 `http://localhost:4321`）

可运行 `npm run auth:import -- "Google OAuth JSON 路径"` 安全导入本地凭据。原始 JSON 会保存在被 Git 忽略的 `.secrets/`，不得提交或复制到浏览器代码。Google Cloud 本地回调为 `http://localhost:4321/api/auth/callback/google`。

## 应用结构

Astro 负责内容路由、模式边界和服务端 API；React 用于 Google 登录、下载交互以及本地媒体处理。视频转换和压缩通过同源加载的 FFmpeg WebAssembly 在浏览器中完成，不上传用户媒体。下载器 API 仅在 `downloader` 模式开放，并继续使用独立的媒体下载服务。

## 内容模型

- 博客 schema：`src/lib/content/blog-entry.ts`，文件位于 `src/content/blog/`；`productArea` 决定内容在两种站点模式下是否公开。
- 落地页 schema：同上，文件位于 `src/content/landing-pages/`。
- 转换器、压缩器和工具首页文案：`src/content/settings/utilities.json`。
- CMS 表单：`.pages.yml`。

新增或调整字段必须同步修改 Astro schema、Pages CMS 配置、页面渲染组件及测试。Pages CMS 的 `merge: true` 会保留表单未管理的字段；不要移除这一设置。

## 数据边界

- 本地转换和压缩不得请求处理 API，也不得上传选中的媒体文件。
- 下载器的对象存储和代理凭据只存在于独立后端及生产环境，不得进入浏览器代码或仓库。
- 日志不得输出签名 URL、密钥、代理凭据或完整用户媒体内容。

## 测试与发布

```sh
npm test
npm run lint
npm run build
# 或一次执行全部：
npm run verify
```

Pages CMS 可能随时提交到 `main`。推送前执行 `git fetch origin main` 并检查分歧；如远端领先，先安全 rebase/merge，禁止 force push。合并到 `main` 后 Vercel 自动发布。

