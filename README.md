# 科研 AI 资源工作台（Research Hub）

面向科研人员的 AI 资源发现与分发站点：提示词、Agent Skills、可复用代码模块、科研网站导航。

**Phase 2 起本站是服务端渲染应用**：Next.js（standalone）+ PostgreSQL 16，前面仍是 Caddy。
内容存数据库；`content/` 目录保留为**导入格式**，每次部署自动导入（幂等，不会覆盖后台改过的资源）。

- 运维手册（部署、回滚、备份恢复、换域名）：[`docs/RUNBOOK.md`](docs/RUNBOOK.md)
- Phase 2 方案、表结构与风险：[`docs/phase2/PLAN.md`](docs/phase2/PLAN.md)
- 变更记录：[`CHANGELOG.md`](CHANGELOG.md)

## 架构

```
浏览器 ──► Caddy :80/:443 ──► app（Next.js standalone, :3000）──► db（PostgreSQL 16，不对外暴露端口）
             │  /_next/static/*  长缓存（immutable）
             └─ /media/*         上传的结构图（slice 5 起使用）
```

| 决策 | 结论 | 理由 |
|---|---|---|
| 渲染 | Next.js 16 App Router，`output: "standalone"`，所有页面按请求渲染 | 会员权限、后台、统计都需要服务端；构建时**不连数据库** |
| 数据 | PostgreSQL 16 + Drizzle ORM（`lib/db/schema.ts`，迁移在 `drizzle/`） | 无二进制查询引擎、迁移是可审阅的 SQL |
| 数据访问 | 页面只调用 `lib/repo`（函数名与 Phase 1 的 `lib/content.ts` 相同，改为 async） | 页面不直接碰数据库，由测试强制 |
| 缓存 | 已发布内容在进程内做快照；`NOTIFY content_changed` 即时失效，最长 5 分钟兜底 | 下架后下一个请求就从列表、搜索、sitemap、详情页消失 |
| 404 | `proxy.ts` 把不存在/未发布的 slug 改写到 404 页 | Next 16.4 在动态页里 `notFound()` 只输出空壳 HTML（见 `proxy.ts` 注释） |
| 搜索 | 服务端用 `pinyin-pro` 生成索引（中文/全拼/首字母），客户端打分 | 拼音库不进浏览器包 |
| 构建产物 | `scripts/build-release.mjs` 产出无原生依赖、无符号链接的发布包 | Windows 上构建的包可以直接在 Linux 服务器运行；**永远不在服务器上构建** |
| 客户端 | 不做（含 CLI） | 见 `docs/ADR-001-*.md` |

## 目录结构

```
app/                    页面路由（App Router），全部服务端按需渲染
proxy.ts                请求进入页面前：未发布/不存在的 slug → 404 页
components/             UI 组件
lib/
  types.ts              资源数据契约
  repo/                 页面唯一的数据入口（快照缓存、附件读取、slug 索引）
  db/                   Drizzle schema 与连接池
  import/               content/ → PostgreSQL 导入器
  content-files.ts      content/ 文件格式的读取与校验（导入器使用）
  search.ts             搜索索引（拼音/首字母）
  markdown.ts           Markdown 渲染（html:false 防 XSS）
drizzle/                SQL 迁移（只增不删，保证可回滚）
content/                资源内容（导入格式，见下）
scripts/                migrate / import-content / build-release
tests/                  Vitest：往返一致性、导入器、架构约束
tools/parity/           页面一致性比对工具（迁移零可见变化的证据）
infra/                  compose.yaml、Caddyfile、部署脚本、服务器端脚本（infra/remote/）
```

## 新增一个资源（文件方式）

以提示词为例，新建 `content/prompts/<slug>/`，然后部署即可（部署时自动导入）：

```
content/prompts/my-prompt/
├── meta.json          # 元数据 + 变量定义
├── body.md            # 详情页正文
└── files/
    └── template.md    # 提示词模板，用 {{variable}} 占位
```

`meta.json` 最小示例：

```json
{
  "title": "资源标题",
  "summary": "30–80 字说明（校验：20–110 字，越界导入失败）",
  "category": "论文写作",
  "tags": ["标签1", "标签2"],
  "author": "平台原创",
  "license": "MIT",
  "redistribution": true,
  "tier": "FREE",
  "updatedAt": "2026-11-19",
  "variables": [
    { "key": "topic", "label": "研究主题", "type": "text", "required": true }
  ]
}
```

- `slug` 与 `type` 由目录名推导，**不要**写进 meta.json；目录名即 URL：`/prompts/my-prompt/`。
- 四类资源的专属字段见 `lib/types.ts`。
- 导入规则：内容没变 → 跳过；后台改过的资源 → 不覆盖（需 `--force`）；文件被删 → 只报告，不删库。
- 后台（slice 3 起）上线后，日常编辑以后台为准，文件方式用于批量导入。

## 本地开发（Windows）

需要一个 PostgreSQL。有 Docker Desktop 时：

```powershell
docker compose -f infra/dev/compose.yaml up -d     # 本机 127.0.0.1:5432
copy .env.example .env.local                       # 本地配置（已被 git 忽略）
npm.cmd install
npm.cmd run db:migrate
npm.cmd run content:import
npm.cmd run dev                                    # http://localhost:3000
```

没有 Docker 时安装 PostgreSQL 16 for Windows，建库后把连接串写进 `.env.local`。

```powershell
npm.cmd run typecheck
npm.cmd test          # 需要 .env.local 里的 TEST_DATABASE_URL（会清空该库，库名必须含 test）
```

> Windows 上 `npm` 的 `.ps1` 入口可能被执行策略拦截，用 `npm.cmd`。

## 部署

```powershell
$env:RH_TARGET = "ubuntu@<服务器IP>"     # 或 setx RH_TARGET ...，主机地址不进仓库
powershell -ExecutionPolicy Bypass -File infra/deploy.ps1
```

一条命令完成：本地构建发布包 → 上传 → 服务器上迁移与导入 → 新版本预检 → 原子切换 → 冒烟测试，
失败自动回滚。首次部署前需执行一次 `-Bootstrap`。细节、回滚与备份见 [`docs/RUNBOOK.md`](docs/RUNBOOK.md)。

## 待办

- [ ] 域名 + ICP 备案：备案通过前只能 IP 访问。备案后只改服务器 `.env`，无需改代码（RUNBOOK「换域名」）
- [ ] 异地备份：在 `.env` 配置 `BACKUP_OFFSITE_CMD`（如腾讯云 COS），否则备份与数据库在同一块盘
- [ ] 举报邮箱：`app/about/page.tsx` 里是占位，上线前替换
- [ ] OG 图片：目前只有文本 metadata
- [ ] Skill ZIP 打包下载：当前提供 SKILL.md 复制与安装说明
- [ ] Phase 2 后续切片：登录 → 后台 → 会员分级 → 模块画廊 → 统计 → DeepSeek 导入（见 PLAN.md）
