# 运维手册（RUNBOOK）

服务器：Ubuntu 24.04，应用目录 `/opt/research-hub`。所有服务器端脚本都在当前版本的
`/opt/research-hub/current/infra/remote/` 下，需要 `sudo`。下文用 `RH=/opt/research-hub/current/infra/remote`。

```
/opt/research-hub/
  .env                 生产配置与密钥（600，root）——只在服务器上，永不进仓库
  Caddyfile            由部署脚本写入（勿手改）
  current -> releases/<id>     当前版本
  previous -> releases/<id>    上一个版本（回滚目标）
  releases/            最近 5 个发布包
  site/                Phase 1 静态站（紧急回退用，不要删）
  data/uploads/        上传文件（slice 5 起）
  backups/daily|weekly 数据库与上传文件备份
```

---

## 1. 首次准备（只做一次）

### 1.1 安全（先做）
1. 把你自己的 SSH 公钥加到 `~ubuntu/.ssh/authorized_keys`，用密钥登录成功后：
   `sudo sed -i 's/^#\?PasswordAuthentication .*/PasswordAuthentication no/' /etc/ssh/sshd_config && sudo systemctl reload ssh`
2. 改掉 ubuntu 用户密码（`sudo passwd ubuntu`）。旧密码已明文外泄，不得复用。

### 1.2 Docker 镜像加速（大陆服务器必需）
Docker Hub 在大陆经常超时或限流。腾讯云服务器可用内网镜像：

```bash
sudo tee /etc/docker/daemon.json >/dev/null <<'EOF'
{ "registry-mirrors": ["https://mirror.ccs.tencentyun.com"] }
EOF
sudo systemctl restart docker      # 会重启正在运行的容器，约几秒
sudo docker pull node:24-alpine && sudo docker pull postgres:16-alpine && sudo docker pull caddy:2-alpine
```

已有 `/etc/docker/daemon.json` 时手工合并，不要覆盖。也可以在 `.env` 里用 `NODE_IMAGE` /
`POSTGRES_IMAGE` / `CADDY_IMAGE` 指向其它镜像仓库。

### 1.3 Bootstrap
在开发机上：

```powershell
powershell -ExecutionPolicy Bypass -File infra/deploy.ps1 -Bootstrap
```

它会：建目录、无 swap 时建 2 GB swapfile、生成 `.env`（随机数据库密码与 AUTH_SECRET）、
安装 cron（每晚 03:30 备份，每月 1 日 04:10 恢复演练），然后执行第一次部署。

首次部署就是 **静态站 → 服务端** 的切换：新应用先在旧静态站旁边启动并通过健康检查，
之后才替换旧 Caddy 容器（实测约 0.3 秒无响应）。如果切换后冒烟测试失败，脚本自动退回静态站。

---

## 2. 日常部署

```powershell
powershell -ExecutionPolicy Bypass -File infra/deploy.ps1
```

流程（`infra/remote/deploy.sh`）：
1. 解包到 `releases/<id>`，此时线上不受影响；
2. 检查/拉取镜像（拉不到就中止，线上不变）；
3. 用**新版本**跑数据库迁移和 `content/` 导入（迁移只增不删，旧版本照常运行）；
4. **预检**：在临时容器里启动新版本，`/`、`/robots.txt`、`/sitemap.xml` 必须 200，否则中止；
5. 切换 `current`/`previous`，重建 app 容器，Caddy 热加载（请求会被 Caddy 暂存，不报错）；
6. 冒烟测试：sitemap 中每个 URL 200、未知 slug 返回真正的 404 页、静态资源长缓存；失败自动回滚。

实测：正常部署与回滚期间 0 个失败请求；坏版本在预检阶段被拒绝，线上 0 影响。

只改了服务器 `.env`（不发新版本）时：`deploy.ps1 -ApplyConfig`。

## 3. 回滚

```powershell
powershell -ExecutionPolicy Bypass -File infra/deploy.ps1 -Rollback
```

= 服务器上 `sudo bash $RH/rollback.sh`，切回 `previous`，约 3 秒。
指定版本：`sudo bash $RH/rollback.sh --to /opt/research-hub/releases/<id>`。

只回滚**代码**。数据库结构不回退（迁移只增不删，旧代码兼容新结构）；数据库内容不回退——
要回到某个时间点的数据，用第 5 节的恢复。

### 紧急：退回 Phase 1 静态站
应用或数据库短时间内无法修复时：

```bash
sudo bash /opt/research-hub/current/infra/remote/rollback-static.sh
```

Caddy 直接托管 `site/` 下的 Phase 1 静态站（不需要 app 和数据库）。恢复：`sudo bash $RH/apply-config.sh`。

## 4. 备份

- 自动：每晚 03:30（cron，`/etc/cron.d/research-hub`），日志 `backups/backup.log`。
- 手动：`sudo bash $RH/backup.sh`
- 内容：`pg_dump -Fc` 数据库 + `data/uploads` 打包，各带 `.sha256`。日备份留 14 份，周日另存周备份留 8 份。
- **异地**：在 `.env` 里设置 `BACKUP_OFFSITE_CMD`，每个备份文件执行一次，`{file}` 替换为文件路径。例如腾讯云 COS：
  `BACKUP_OFFSITE_CMD=coscli cp {file} cos://<bucket>/nightly/`
  未设置时备份与数据库在同一块盘上，**磁盘损坏会同时丢失**，脚本每晚在日志里警告。另建议在腾讯云控制台为系统盘开启定期快照。

## 5. 恢复

### 5.1 恢复演练（不碰生产库）
```bash
sudo bash $RH/restore-drill.sh                 # 最新备份
sudo bash $RH/restore-drill.sh /path/db-....dump
```
把备份恢复到临时库 `rh_restore_drill`，逐表比对行数，并比对资源与附件内容的校验和，然后删除临时库。
结果写入 `backups/restore-drill.log`。每月 1 日自动执行一次。

### 5.2 真正恢复生产库（数据损坏/误删时）
会覆盖当前数据，先确认要恢复的文件：

```bash
cd /opt/research-hub
DUMP=backups/daily/db-YYYYmmdd-HHMMSS.dump
(cd "$(dirname $DUMP)" && sudo sha256sum -c "$(basename $DUMP).sha256")   # must print OK
sudo bash $RH/backup.sh                                   # 先给现状留一份
DC="docker compose --project-directory /opt/research-hub -f current/infra/compose.yaml"
sudo $DC stop app
sudo $DC exec -T db psql -U rh -d postgres -c "DROP DATABASE research_hub WITH (FORCE)" -c "CREATE DATABASE research_hub OWNER rh"
sudo sh -c "$DC exec -T db pg_restore -U rh -d research_hub --no-owner --exit-on-error < $DUMP"   # backups/ is root-only
sudo $DC start app
sudo bash $RH/smoke.sh
```

上传文件：`sudo tar -xzf backups/daily/uploads-....tar.gz -C /opt/research-hub/data`。

> 本流程已在模拟环境完整演练过：误删 3 个模块 → 按上述步骤恢复 → 15 个资源全部回来，冒烟测试通过。

## 6. 换域名 / 开 HTTPS（ICP 备案通过后）

只改服务器 `.env`，不改代码、不重新构建：

1. DNS：顶级域名和 `www` 的 A 记录指向服务器 IP。
2. 编辑 `/opt/research-hub/.env`：
   ```
   CADDY_SITE_ADDRESS=example.cn, www.example.cn
   SITE_URL=https://www.example.cn
   ICP_RECORD=粤ICP备XXXXXXXX号
   ```
3. `powershell -ExecutionPolicy Bypass -File infra/deploy.ps1 -ApplyConfig`
   Caddy 自动申请并续期证书，HTTP 自动跳转 HTTPS；canonical、sitemap、robots 全部切换到新域名。
4. 网站开通后 30 日内办理公安联网备案，拿到编号后填 `PSB_RECORD` 并再执行一次 `-ApplyConfig`。

> 页脚显示备案号（`ICP_RECORD`/`PSB_RECORD`）在后续切片中接入页面。
> 向用户收费可能需要公司主体的经营性 ICP 许可证（EDI/ICP），在做支付之前确认。

## 7. 查看状态与日志

```bash
DC="sudo docker compose --project-directory /opt/research-hub -f /opt/research-hub/current/infra/compose.yaml"
$DC ps                      # 三个服务：caddy / app / db
$DC logs --tail 100 app     # 应用日志
$DC logs --tail 100 caddy   # 访问日志
sudo docker stats --no-stream
cat /opt/research-hub/current/RELEASE.json
sudo bash $RH/smoke.sh
```

内存上限：caddy 128M、app 640M、db 640M（实测空闲约 14M / 90M / 50M）。

## 8. 内容导入

部署时自动执行。手动（例如只想重新导入、不发版本）：

```bash
DC="sudo docker compose --project-directory /opt/research-hub -f /opt/research-hub/current/infra/compose.yaml"
$DC run --rm importer                                   # 正常导入
$DC run --rm importer node scripts/import-content.mjs --content-dir /release/content --dry-run
$DC run --rm importer node scripts/import-content.mjs --content-dir /release/content --force
```

`--force` 会用文件覆盖后台改过的资源，谨慎使用。

## 9. 账户功能（slice 2）

账户功能代码已上线，但**默认关闭**：`.env` 里 `AUTH_ENABLED=0` 时所有账户页面返回 404、页头没有“登录”，
网站与没有账户功能时完全一致。只有同时满足以下条件才会开启（`lib/auth/config.ts`）：

- `AUTH_ENABLED=1`
- `SITE_URL` 是 `https://...`（明文 HTTP 下浏览器会丢弃 Secure Cookie，密码也不能明文传输）
- `AUTH_SECRET` 至少 32 个字符（bootstrap 已生成）

### 9.1 开启前的清单
1. HTTPS 已生效（第 6 节换域名后自动具备）。
2. 在 `.env` 填写运营者信息（隐私政策与用户协议中展示，PIPL 要求）：
   `OPERATOR_NAME=…`、`CONTACT_EMAIL=…`。未填写时页面会显示“（待填写）”。
3. 请法务审阅 `/privacy/` 与 `/terms/` 两页的文案（代码中为草案，内容与系统实际行为一致）。
4. 邮件：有邮件服务商时设置
   `MAIL_DRIVER=smtp`、`SMTP_URL=smtps://用户名:密码@smtp.服务商:465`、`MAIL_FROM=…`（腾讯云封禁 25 端口）。
   没有服务商时保持 `MAIL_DRIVER=hold`：注册照常，验证邮件留在发件箱（`mail_outbox` 表），**自助找回密码关闭**，
   未验证邮箱的账户不能开通会员（slice 4 执行）。
5. 创建管理员（见 9.2），然后 `.env` 设 `AUTH_ENABLED=1`，执行 `deploy.ps1 -ApplyConfig`。

### 9.2 管理员
```bash
DC="sudo docker compose --project-directory /opt/research-hub -f /opt/research-hub/current/infra/compose.yaml"
$DC run --rm cli node scripts/create-admin.mjs --email admin@example.cn                  # 创建或提升
$DC run --rm cli node scripts/create-admin.mjs --email admin@example.cn --reset-password  # 忘记密码
$DC run --rm cli node scripts/create-admin.mjs --email admin@example.cn --reset-mfa       # 手机丢失
```
脚本打印一次性生成的密码（只显示这一次）。管理员首次登录必须绑定身份验证器（TOTP）才能进入 `/admin/`；
以后每次登录都要输入 6 位验证码。管理员会话 12 小时过期，普通用户 30 天。

### 9.3 邮件处于 hold 状态时人工处理
```bash
$DC exec -T db psql -U rh -d research_hub -c \
  "SELECT id, to_email, template, payload->>'link' AS link, created_at FROM mail_outbox WHERE status='held' ORDER BY id DESC LIMIT 20"
```
把验证链接（24 小时内有效）通过其他渠道发给用户。更方便的方式：在后台 `/admin/users/` 按邮箱查找用户，
直接生成验证链接或重置密码链接（第 10 节）。

### 9.4 上线前验证
```bash
BASE_URL=https://www.example.cn DATABASE_URL=… ADMIN_EMAIL=… ADMIN_PASSWORD=… node tests/e2e/auth-flow.mjs
```
（在能访问数据库的机器上运行，例如通过 SSH 隧道；会创建并删除一个测试用户。）

## 10. 管理后台（slice 3）

入口 `/admin/`（需管理员账号 + 两步验证；账户功能关闭时整个后台返回 404）。

**提示词管理**（`/admin/prompts/`）
- 新建 → 草稿（网站上不可见）→ 在编辑页完善正文、模板、变量 → 保存 → 发布。
- 发布前检查：模板里每个 `{{变量}}` 都必须已定义；字段规则与文件导入完全相同（`lib/content/validation.ts`）。
- 已发布的提示词再编辑，保存后**立即生效**，并自动记录一个历史版本（`resource_versions`）。
- 取消发布：网站上立即消失（详情页 404、列表、搜索、sitemap 同步移除）。
- 归档：需要 10 分钟内验证过身份（再输入一次 6 位验证码）。可在“已归档”中恢复为草稿。
- 网址标识（slug）发布后不能修改，避免已有链接失效。
- 两人同时编辑：后保存的一方会被拒绝并提示刷新，不会互相覆盖。
- 顺序：列表顺序就是网站顺序，用 ↑ ↓ 调整；精选内容固定排在最前。

**文件导入与后台的关系**：资源一旦在后台**编辑、发布或取消发布过**，数据库即为准，
之后的文件导入会跳过它（导入日志显示 `skipped-admin-edited`）；只调整顺序不影响导入。
确需用文件覆盖：`importer ... --force`（第 8 节）。

**用户**（`/admin/users/`）：按邮箱查找；生成邮箱验证链接；生成重置密码链接（需再次验证身份，
务必先确认对方是账户本人）。所有后台操作记录在 `admin_audit_log`，概览页显示最近操作。

Skills、模块、网站的后台编辑尚未提供，仍通过 `content/` 文件导入。

## 11. 会员（slice 4）

会员等级：**免费（FREE）→ EI 会员 → SCI 会员**。等级表在数据库 `tiers` 中（等级之间留有空位，
以后加更高等级只需插入一行）。提示词和 Skills 永远免费（数据库约束保证）；代码模块可以设为需要某个等级。

**会员内容的规则**
- 会员模块的标题、简介、正文、环境依赖、适用场景对所有人可见，页面可被搜索引擎收录。
- **完整代码只发送给有权限的会员**：检查在服务端进行两次（页面数据层 + 数据库查询本身按等级过滤），
  无权限的请求里根本不包含代码（端到端测试逐个等级验证了 HTML 和客户端导航数据）。
- 会员到期在每次请求时判断，到期即刻失效，不依赖定时任务。
- 注意：模块“正文”（body.md）是公开的，不要把完整代码写进正文。

**开通会员**（支付上线前由管理员手动操作）：后台 `/admin/users/` → 选择用户 → “开通 / 变更会员”，
选择等级与有效期（30/90/180 天、1 年、指定日期或长期）。
- 用户邮箱必须已验证（未验证时可在同一页面生成验证链接发给用户）。
- 新开通会替换当前会员；“撤销会员”立即改为免费。
- 每次开通与撤销都记录在“会员记录”（`entitlements` 表）和操作日志中。

**设置模块等级**：后台 `/admin/modules/`，每个模块选择“免费 / 需要 EI 会员 / 需要 SCI 会员”，保存后立即生效。
等级由后台管理：文件导入只在资源**第一次**导入时使用 meta.json 的 `tier`（旧的 `PRO` 视为 EI），之后不会覆盖。

**许可证（重要）**：以 MIT 等开源许可证发布、并且已经公开过的代码，任何拿到的人都可以合法再分发。
把模块设为会员内容之前，请为它换用允许限制分发的许可证（并更新 meta.json / 资源信息中的“二次分发”）。

## 12. 模块画廊与结构图（slice 5）

**画廊** `/modules/`：卡片网格，缩略图是模块的结构图（没有上传时显示自动生成的文件结构）；
分类与标签筛选是普通链接（如 `/modules/?category=统计方法&tag=APA 报告`），可直接分享。

**模块详情页**顺序：结构图 → 介绍（正文）→ 适用任务 → 代码（每个文件一个标签页，各自带复制按钮）
→ 环境与依赖 → 用法示例。会员模块：结构图、介绍、适用任务、文件名、环境、用法对所有人可见，代码不发送。

**后台编辑**
- 模块：`/admin/modules/` → 编辑。可改基本信息、适用任务、介绍、语言、入口文件、环境、依赖、用法、
  代码文件（可多个，路径如 `examples/demo.py`）；会员等级在列表里设置。
- Skills：`/admin/skills/` → 编辑。可改 SKILL.md、兼容性矩阵（工具标识 + 支持范围 + 安装路径 + 备注）、
  文件清单、风险提示、依赖。
- 发布、取消发布、归档、恢复、调整顺序、版本记录与提示词完全一致（第 10 节）。

**上传结构图**（模块编辑页最上方）：PNG / JPEG / WebP，最大 2 MB，必须填写图片说明（替代文字）。
- 文件按内容识别格式（改扩展名伪装的文件会被拒绝；不支持 SVG）；JPEG 的 EXIF（含 GPS 定位）会被去除。
- 存放在 `/opt/research-hub/data/uploads/diagrams/年/月/随机名`，由 Caddy 以 `/media/...` 提供；
  替换或删除结构图时旧文件同时删除。
- **备份**：`data/uploads` 每晚随数据库一起备份（第 4 节）；恢复见第 5 节最后一步。
  只恢复数据库而不恢复 uploads，会出现图片 404（页面其余部分正常）。

## 13. 统计（slice 6）

后台 `/admin/analytics/`：今天 / 7 天 / 30 天的浏览量与访客、30 天访客趋势（可悬停、可用方向键查看、附数据表）、
复制最多的资源、热门搜索词、访问最多的资源页、来源网站、注册与登录、会员分布，以及
**“被看最多、但对方没有权限的会员资源”**（判断哪些模块值得推广会员）。

**怎么统计的（与隐私政策一致）**
- 第一方：浏览器向本站 `/api/e` 发送一条极小的记录（页面、复制、搜索）；不用第三方代码，不用 Cookie。
- 不存 IP：IP + 浏览器标识与当天的随机盐做 SHA-256，盐两天后删除。因此“访客”只在**当天**内去重；
  7 天 / 30 天显示“访客·天”（每天独立访客之和）和日均，不是去重后的人数。
- 不计入：爬虫与无头浏览器、开启“请勿追踪 / GPC”的访问、其他网站伪造的请求、后台页面。
- 页面访问、复制、搜索**不关联账户**；注册与登录事件关联账户（注销账户后自动去关联）。
- 原始记录保留 13 个月后自动删除。

**性能**：在 100 万条事件（约一年的量）上，单项查询 1–70 ms，整页约 150 ms。复测方法：
```bash
# 在测试库里造 100 万条（会写入 events 表，切勿对生产库执行）
psql "$TEST_DATABASE_URL" -c "INSERT INTO events (type, occurred_at, visitor_hash, path) SELECT 'page_view', now() - random() * interval '365 days', decode(md5((g % 40000)::text), 'hex'), '/' FROM generate_series(1, 1000000) g"
BENCH_DATABASE_URL="$TEST_DATABASE_URL" npx tsx scripts/bench-analytics.ts
```

## 14. DeepSeek 导入任务（slice 7）

后台 `/admin/ingest/`：贴入网址（每行一个，最多 20 个），或输入“搜索词 + 允许的域名”。服务器在后台逐条处理，
页面每 3 秒刷新状态（排队中 / 处理中 / 失败 / 完成）。**结果一律是 Skill 草稿，不会自动发布**；
在“已生成草稿”链接里审核、修改后再点“发布”。

**开启**（服务器 `/opt/research-hub/.env`，改完执行 `sudo bash $RH/apply-config.sh`）：
```
DEEPSEEK_API_KEY=sk-...                 # 只在服务器上；不进仓库、不进浏览器
DEEPSEEK_DAILY_TOKEN_LIMIT=2000000      # 当天用量到上限后暂停，次日 0 点（北京时间）自动继续
# 可选：按搜索导入（DeepSeek 自己不能联网搜索）
SEARCH_PROVIDER=bocha
BOCHA_API_KEY=...
```
未填 `DEEPSEEK_API_KEY` 时导入页显示“未开启”，后台任务不运行。处理程序跑在 app 容器里（一次一条，内存开销很小）；
部署预检的临时容器带 `INGEST_WORKER=0`，不会接任务。

**每条网址的处理过程**
1. 网址已收录（规范化后比较：忽略 http/https、www、末尾斜杠、`utm_*` 等跟踪参数、GitHub 大小写）→ 标记“重复”，不抓取、不花 token。
2. 抓取：遵守 robots.txt（User-Agent `ResearchHubBot`），10 秒超时，最大 2 MB，最多 2 次重定向；每一跳都重新检查。
   **拒绝内网/保留地址**（10/8、172.16/12、192.168/16、127/8、169.254/16（含腾讯云元数据）、100.64/10、IPv6 ULA/链路本地等），
   连接固定到校验过的 IP，防 DNS 重绑定。不发送 Cookie 或任何凭据。
   GitHub 网址读 `raw.githubusercontent.com` 上的 `SKILL.md`（没有则 `README.md`）和最近的 `LICENSE`。
3. 只把提取出的正文（最多 2.4 万字）发给 DeepSeek（JSON 模式），返回内容按固定格式校验；网页里的“指令”一律当作数据。
4. 标题与已有 Skill 相似（> 60%）→ 标记“重复”并链接到已有资源。
5. 生成草稿，并记录来源、抓取时间、HTTP 状态、内容 SHA-256、许可证及其依据（“来源与许可证依据”面板）。

**许可证规则（法律要求，不是偏好）**
- 许可证只由程序确定：LICENSE 文件全文匹配、`SPDX-License-Identifier`、页面 `rel="license"`、SKILL.md 头部 `license:`。
  **AI 对许可证的看法只显示给审核人，不作为转载依据。**
- 只有 MIT、Apache-2.0、BSD、ISC、0BSD、Unlicense、CC0、CC BY 4.0，且来源本身就是 SKILL.md 时，才保存原文（原样，附版权行与出处）。
- 其他情况（未声明、GPL、CC BY-SA/NC/ND、普通网页）一律**仅索引**：不保存原文，详情页显示“前往来源查看原文”。
  数据库约束保证许可证“未知”的资源不能设为可转载。
- 审核人确认来源许可允许转载时，在编辑页勾选“允许转载”并勾选“我已核实来源许可证允许转载”；
  记为“管理员核实声明”，写入审计日志。

**失败与重试**：网络错误、超时、5xx、DeepSeek 临时故障会自动重试（30 秒、2 分钟、10 分钟，共 3 次）；
robots.txt 禁止、内网地址、4xx、超过 2 MB、DeepSeek key 无效（401）或余额不足（402）直接失败，条目旁有“重试”按钮。
进程重启导致卡在“处理中”超过 10 分钟的条目会自动放回队列。

**常见问题**
- 全部失败、提示“DeepSeek 返回 HTTP 401/402”：key 错误或余额不足，到 DeepSeek 控制台处理，然后点“重试”。
- GitHub 网址超时：国内服务器访问 `raw.githubusercontent.com` 不稳定，稍后重试，或改用 Gitee 等国内镜像页面的网址。
- 网页“几乎没有可提取的正文”：页面需要登录或完全由脚本渲染，换成原始文件（如 SKILL.md 的 raw 链接）。
- 查看后台处理日志：`docker compose ... logs app | grep ingest`。

> 测试专用变量 `INGEST_TEST_ALLOW_PRIVATE_HOSTS` 会放开内网地址检查，**生产环境绝不能设置**；
> 部署脚本发现 `.env` 里有它会拒绝部署。

## 15. 批量上传 Skills 与模块（代码 + 结构图）

在自己的 Windows 电脑上整理好一个文件夹，一条命令传到服务器：先**检查**（不保存任何东西），
全部通过后再**保存**为草稿或直接发布。走的是和部署一样的 SSH 通道，不开放新的网页接口。
每一项都经过与后台编辑器相同的校验，保存后有版本记录和审计日志，和在后台手工创建的完全一样。

**准备（一次）**：与第 1 节相同的 `RH_TARGET`，再设置你的管理员邮箱：
```powershell
setx RH_ADMIN_EMAIL "admin@example.cn"
```

**目录结构**（`-New` 会生成一个带示例的文件夹）：
```
D:\我的批量\
├── skills\                      （也可以叫 技能\）
│   └── 审稿回复\                 每个 Skill 一个文件夹，文件夹名任意（中文会转成拼音网址）
│       ├── SKILL.md             必须有；头部 name → 网址标识，description → 摘要
│       └── templates\...        其他文件：显示在“包内文件”清单里（不保存内容）
├── modules\                     （也可以叫 模块\）
│   └── 统计工具\
│       ├── main.py              代码文件，可以有子文件夹；main.py / index.ts 等自动识别为入口
│       ├── requirements.txt     自动读取为依赖
│       ├── README.md            可选：第一行 # 标题，第一段 → 摘要，其余 → 正文
│       └── diagram.png          可选：结构图（也可叫 结构图.png / architecture.png；png/jpg/webp，≤ 2 MB，不支持 SVG）
└── 清单.csv                      第一次检查后自动生成，用 Excel 填写
```
自动跳过：`node_modules`、`.git`、`__pycache__`、`.venv`、`dist`、`build`、隐藏文件、二进制文件、符号链接。
限制：一次最多 200 项、200 MB；每个模块最多 20 个代码文件、单个文件 20 万字符。文本文件可以是 UTF-8 或 GBK。

**步骤**
```powershell
# 1. 生成示例文件夹（可选），把示例换成你自己的内容（example-* 示例文件夹不会被导入）
powershell -ExecutionPolicy Bypass -File infra/bulk.ps1 -New D:\我的批量
# 2. 检查：报告显示在屏幕上，同时保存为文件夹里的 检查报告.txt；第一次还会生成 清单.csv
powershell -ExecutionPolicy Bypass -File infra/bulk.ps1 -Folder D:\我的批量
# 3. 用 Excel 打开 清单.csv 补全空白（“分类”必填），保存（“CSV UTF-8”或普通 CSV 都可以），再检查一次
# 4. 全部通过后保存：草稿（到后台审核后发布）……
powershell -ExecutionPolicy Bypass -File infra/bulk.ps1 -Folder D:\我的批量 -Apply
#    ……或直接发布
powershell -ExecutionPolicy Bypass -File infra/bulk.ps1 -Folder D:\我的批量 -Apply -Publish
```
只要有一项标 ✗，`-Apply` 就不会保存任何内容（避免半批上线）。已存在同一网址标识的资源会被**跳过**；
本地改了代码想覆盖线上版本时加 `-Update`（已发布的会留下版本快照）。

**清单.csv 的列**（第一次检查时按文件内容预填；留空 = 用自动识别的值或默认值）

| 列 | 说明 |
|---|---|
| 类型、文件夹 | 对应哪个文件夹，不要改 |
| 网址标识 | 小写字母、数字、连字符；发布后不能再改 |
| 标题 / 摘要 | 摘要 20–110 字 |
| 分类 | **必填**，例如 统计分析、论文写作 |
| 标签 | 用顿号或逗号分隔，最多 12 个 |
| 会员等级 | 模块：FREE / EI / SCI（默认 FREE）；Skills 始终免费 |
| 作者 | 默认“平台原创” |
| 许可证 | 自己的内容默认：免费模块 MIT，会员模块 All rights reserved |
| 来源链接 | **填了就表示第三方内容**，见下 |
| 语言 / 入口文件 / 环境要求 / 依赖 | 模块用；自动识别不了时填写，环境要求、依赖用分号分隔 |
| 兼容工具 | Skill 用，例如 claude-code、codex（默认 claude-code） |
| 适用任务 | 用分号分隔 |
| 精选 | 填“是”表示精选 |

**第三方内容**（填了“来源链接”）：许可证由你在清单里声明（记为“管理员核实声明”）。
- 第三方**模块**必须是允许转载的许可证（MIT、Apache-2.0、BSD、ISC 等），否则拒绝上传代码。
- 第三方 **Skill** 许可证不允许转载或没填时，只建索引：不保存 SKILL.md 原文，详情页链接到来源。

**会员模块的许可证**：用 MIT 等开源许可证发布的会员模块，拿到代码的人可以合法转载；检查报告会提醒。
默认的 “All rights reserved” 不授予转载权；如需正式的会员许可条款，请自行拟定后填入“许可证”列。

**服务器上发生了什么**：上传到 `/tmp/rh-bulk-<编号>`，`infra/remote/bulk.sh` 复制到 `data/bulk/`（删除其中的符号链接），
在一次性的 `bulk` 容器里运行 `scripts/bulk-import.mjs`，把报告放回给你的电脑，然后删除这批文件。
服务器上只留下导入的结果（数据库记录、`data/uploads/` 里的结构图）。

**在本机开发库上试运行**（不经过服务器）：
```powershell
npm.cmd run bulk -- --dir D:\我的批量 --as owner@example.com            # 检查
npm.cmd run bulk -- --dir D:\我的批量 --as owner@example.com --apply    # 保存到本机开发库
```

## 16. 2.3 版新增功能的运维要点

部署方式不变（第 2 节）。本版带一个数据库迁移（`0005`：浏览/下载计数、公告、API 令牌），部署时自动执行，只增不删。
`content/` 未改动。新增依赖都是纯 JavaScript（fflate、字体包），发布包约 10 MB（上限 15 MB）。

**公告**（后台 → 公告，`/admin/announcements/`）：写标题和 Markdown 正文、可设起止时间（北京时间）。访客每天第一次打开网站时弹出一次；
同时只显示“启用中、在时间范围内、最近修改”的一条；修改后当天会再显示一次。网站上 1 分钟内生效。后台页面不弹。

**科研导航**（后台 → 导航，`/admin/sites/`）：新建站点、填网址/收费方式/地区、上传图标（PNG/JPEG/WebP，≤ 2 MB，建议正方形 128 px 以上；
不上传则显示自动生成的字母图标）、发布。导航页按分类显示图标卡片，点击进入详情页，详情页上“打开 xxx”按钮跳转官网。
请只上传你有权使用的图标（多数网站的 favicon 受商标保护，用于导航链接通常没问题，但不要修改或用于其他用途）。

**API 批量上传**（后台 → API，`/admin/api/`）：
1. 创建令牌（需 10 分钟内验证过两步验证码）。令牌只显示一次，服务器只存散列；可设有效期，可随时撤销；你不再是管理员时自动失效。
2. 把批量文件夹（目录结构同第 15 节，支持 `skills/`、`modules/`、`prompts/` 和 `清单.csv`）打成 ZIP，调用：
```bash
curl -X POST "https://你的域名/api/admin/bulk/" -H "Authorization: Bearer rhk_..." -H "Content-Type: application/zip" --data-binary @batch.zip
```
   不带参数只检查（返回每项结果和中文报告，状态码 200 或 422）；`?apply=1` 保存为草稿，`&publish=1` 同时发布，`&update=1` 覆盖同名资源。
3. 限制：ZIP ≤ 30 MB、解压后 ≤ 200 MB、单文件 ≤ 10 MB、≤ 5000 个文件；每个令牌每小时 30 次；接口只在开通账户（HTTPS）后可用。

**提示词也能批量上传**：`prompts/<文件夹>/template.md`（必需，变量写成 `{{topic}}`，只能用英文字母数字下划线）+ 可选 `README.md`；
变量的中文显示名在清单的“变量”列填写，如 `topic=研究主题；draft=初稿`。

**浏览量与下载量**：详情页按“访客 + 资源 + 当天”去重计数（访客标识与统计相同：IP 与浏览器标识加每日随机盐的散列，不保存 IP）。
不计入：爬虫、开启“请勿追踪/GPC”的访问；浏览量另外不计非浏览器客户端，下载量允许 curl/PowerShell（安装命令用它们下载）。
下载地址 `/api/download/skills/<slug>/`、`/api/download/modules/<slug>/`：先检查权限（会员模块需相应等级、仅索引的 Skill 不提供下载）再计数、再返回 ZIP。

**Skill 安装说明**：由各 Skill 的 `compat` 列表驱动，工具的目录与命令写在 `lib/skills/install.ts`，每个工具附官方文档出处
（2026-11-20 核实：Claude Code、Codex、Cursor、Gemini CLI）。没有核实的工具（如 Trae）显示“未验证”，不给路径。
核实新工具：读官方文档 → 在该文件补上目录和出处 → `verified: true`。

**外部聚合检索**：七类检索的引擎和 URL 模板在 `lib/external-search.ts`，增删引擎只改这个表（模板里用 `{q}` 表示搜索词）。
只在新标签页打开第三方网站，本站不抓取、不代理、不保存任何结果。

**更新日志**：公开页 `/changelog/` 的内容在 `lib/changelog.ts`，发布新版本时在最前面加一条。

**普通用户注册**：密码至少 8 位（常见密码表已覆盖 8–9 位的弱密码），邮箱验证可选（只在开通会员时需要），不需要两步验证；
管理员仍是 14 位密码 + 两步验证。

**草稿批次（办公技能 11 个、降重降AI 6 个、提示词 6 个）**：`tools/seed-batches/office-and-writing/`，用第 15 节的命令先检查再 `-Apply`，
到后台审核后逐条发布。
