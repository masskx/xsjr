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

## 11. DeepSeek 导入任务

Slice 7 实现，届时补充。
