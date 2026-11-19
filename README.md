# 科研 AI 资源工作台（Research Hub）

面向科研人员的 AI 资源发现与分发站点：提示词、Agent Skills、可复用代码模块、科研网站导航。

当前版本是**纯静态站**——所有页面在构建时生成，服务器上只有一个 Caddy 容器，不需要 Node 运行时、不需要数据库。

## 技术决策

| 决策 | 结论 | 理由 |
|---|---|---|
| 渲染方式 | Next.js 16 App Router + `output: "export"` | 内容站无需服务端，静态产物可 CDN 化，服务器内存占用 ≈50MB |
| 后端 | 暂不引入（无 FastAPI、无 DB） | 首发要验证的是「有没有人来取资源」，不是权限系统；数据先以文件承载 |
| 内容存储 | `content/` 下每个资源一个目录（meta.json + body.md + files/） | 零依赖、可 diff、可 review；迁 PostgreSQL 时只替换 `lib/content.ts` 一个适配层 |
| 搜索 | 构建期生成索引 + 客户端打分（含拼音/首字母） | 数据量小，无需 Meilisearch；`pinyin-pro` 只在构建期跑，不进客户端包 |
| 客户端 | 不做（含 CLI） | 见 `研究/科研AI资源工作台_ADR-001_首发不含桌面客户端.md` |

## 目录结构

```
app/                    页面路由（App Router）
  prompts/[slug]/       提示词详情（参数表单 + 实时预览 + 复制）
  skills/[slug]/        Skill 详情（兼容矩阵、文件树、SKILL.md 预览）
  modules/[slug]/       模块详情（环境依赖 + 完整代码）
  directory/[slug]/     网站详情（外链、收费模式）
  search/               全站搜索
components/             UI 组件（服务端为主，交互部分标 "use client"）
lib/
  types.ts              资源数据契约（未来可直接映射数据库表）
  content.ts            内容加载器（唯一数据入口，换 DB 只改这里）
  search.ts             构建期搜索索引（拼音/首字母）
  markdown.ts           Markdown 渲染（html:false 防 XSS）
content/                资源内容（见下）
infra/                  Caddyfile、compose.yaml、部署脚本
out/                    构建产物（git 忽略）
```

## 新增一个资源

以提示词为例，新建 `content/prompts/<slug>/`：

```
content/prompts/my-prompt/
├── meta.json          # 元数据 + 变量定义
├── body.md            # 详情页正文（解决什么问题 / 适用场景 / 使用说明）
└── files/
    └── template.md    # 真正的提示词模板，用 {{variable}} 占位
```

`meta.json` 最小示例：

```json
{
  "title": "资源标题",
  "summary": "30–80 字说明（校验：20–110 字，越界会让 build 失败）",
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

- `slug` 与 `type` 由目录名自动推导，**不要**写进 meta.json。
- 四类资源的专属字段见 `lib/types.ts`；`validate()` 会拦截缺字段与 summary 长度异常。
- 目录名即 URL：`/prompts/my-prompt/`。

## 本地开发

```powershell
npm.cmd install
npm.cmd run dev        # http://localhost:3000
```

> Windows 上 `npm` 的 `.ps1` 入口可能被执行策略拦截，用 `npm.cmd`。

## 构建与部署

```powershell
npm.cmd run build                     # 产物在 out/
$env:RH_TARGET = "ubuntu@<你的服务器IP>"   # 只需设置一次
powershell -ExecutionPolicy Bypass -File infra/deploy.ps1
```

部署脚本做的事：打包 `out/` → scp 到服务器 → 原子替换 `/opt/research-hub/site` → `docker compose up -d --force-recreate` 重启 Caddy。

> 服务器地址不写进仓库。目标主机从 `-Target` 参数或 `RH_TARGET` 环境变量读取，
> 构建用的 `NEXT_PUBLIC_SITE_URL` 会按目标主机自动推导（换域名时用 `-SiteUrl` 覆盖）。

服务器要求：Ubuntu 22.04+、Docker 与 Compose 可用、80/443 端口放行。静态文件只读挂载进 Caddy 容器。

## 待办

- [ ] 域名 + ICP 备案：备案通过前只能 IP 访问；域名解析到大陆服务器后需备案才能开通 80/443
- [ ] HTTPS：备案后把 `infra/Caddyfile` 的 `:80` 改成域名，删掉 `auto_https off`，Caddy 自动签发
- [ ] 举报邮箱：`app/about/page.tsx` 里是占位，上线前替换
- [ ] OG 图片：目前只有文本 metadata，社交分享缺配图
- [ ] 资源数量：当前 15 条（4 提示词 / 3 Skills / 3 模块 / 5 网站），首批目标约 60 条
- [ ] Skill ZIP 打包下载：当前提供 SKILL.md 复制与安装说明，未提供二进制包
