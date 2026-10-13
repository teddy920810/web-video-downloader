# 测试与质量指南

本指南面向开发者、内容共创者和运维人员。目标不是追求测试数量，而是让测试能够阻止真实线上故障。

## 测试分层

| 层级 | 命令 | 覆盖内容 | 是否访问生产 |
|---|---|---|---|
| 单元/集成 | `npm test` | 内容 schema、环境变量、API、Job、Provider、R2 命令与安全错误 | 否 |
| 覆盖率 | `npm run test:coverage` | 核心服务与 API，强制阈值 | 否 |
| 浏览器 E2E | `npm run test:e2e` | 上传 UI、失败提示、GA page_view、SEO、路由、无障碍 | 否，本地 Astro |
| 完整验证 | `npm run verify` | 工作流检查、覆盖率、Lint、Build、E2E | 本地；勿继承生产 live 环境 |
| 发布门禁 | `npm run release:verify` | 高危依赖审计、站点检查、完整 verify 各一次 | 不含生产 Smoke；拒绝 production + live 环境 |
| 公共页面检查 | `npm run test:smoke:public` | 固定七个公共 GET、状态及最小内容标记，无凭据和重定向 | 是；无业务写入 |

## 首次准备

```sh
npm ci
npx playwright install chromium
npm run verify
```

不要安装或提交浏览器二进制。Playwright 会把浏览器放在用户缓存目录，GitHub Actions 会在 CI 中自动安装。

## 共创者应该做什么

### Pages CMS 内容编辑

Pages CMS 保存会提交到 `main`，随后触发 GitHub Actions 和 Vercel。内容编辑不需要在本地运行测试，但必须等待：

1. GitHub Actions 的 **CI / verify** 成功。
2. Vercel Production 状态变成 **Ready**。
3. 打开正式页面检查标题、图片、链接和移动端排版。

任一状态为 Error/Failed 时，停止重复保存，把文章名称、提交链接和错误截图交给开发者。

### 开发者

行为变更遵循 TDD：先添加会因目标行为缺失而失败的测试，再实现并运行 `npm run verify`。第三方集成必须验证真实信号，不能只检查脚本存在。

### 运维人员

授权部署后可运行 `npm run test:smoke:public` 检查七个固定公共页面。该检查不读 Cookie 或本地 env，不调用 API，也不证明部署 SHA、OAuth、支付、R2 或真实处理正确。环境、R2 或 CORS 改动仍须另行完成对应验收，不能用公共检查替代。旧文档所述 `test:smoke:production` 写入型脚本并不存在，不应执行或声称已经通过。

## 自动化保护

- `.github/workflows/ci.yml`：每次 PR 和 `main` 推送运行 `release:verify`，其中完整 `verify` 只执行一次。
- 公共页面检查当前为手动入口，没有定时生产 Smoke 工作流。
- `vercel.json`：实际构建命令为 `npm run build`，与 GitHub 发布门禁是独立过程，不能从部署成功推断 CI 通过。`prebuild` 仅在 `VERCEL_ENV=production` 且 `BILLING_MODE=live` 时进入正式账务迁移流程；本地 `release:verify` 遇到该组合会先拒绝运行。部署策略未在本次变更中调整。
- 覆盖率门槛：核心代码 lines/functions/statements ≥ 80%，branches ≥ 70%。当前结果应高于最低线，不能通过降低阈值掩盖缺失测试。

## 如何处理失败

- Vitest：定位失败用例，先确认是预期行为变化还是回归。
- Coverage：为未覆盖的重要分支补测试，不要先降低阈值。
- Build：检查 Astro content schema、Pages CMS 日期和必填字段。
- E2E：查看 `test-results/` 中的截图、错误上下文和 trace；这些目录不提交 Git。
- GA：确认 `g/collect` 中存在 `en=page_view` 和正确 Measurement ID，再看 GA Realtime。
- 公共检查：检查固定域名、页面状态和内容标记；脚本拒绝重定向，域名变更需评审白名单。真实业务故障依其对应验收处理。

## 安全边界

- 测试代码、日志和 CI 中不得出现真实 R2 凭据或签名 URL。
- 公共检查只报告路径、状态和通用失败原因，不打印响应正文、重定向目标或凭据。
- 本地 `.env.local` 和 `S3-info.txt` 永远不能提交。
- 不使用真实用户图片作为夹具，只使用仓库内生成或内嵌的无敏感测试图片。
