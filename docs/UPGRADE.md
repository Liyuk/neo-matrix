# Neo Matrix 升级指南

> 从旧版(one-api 基础 / 早期 fork 版本)升级到当前版本的步骤、兼容性说明与已知坑。

## 升级前必读

1. **数据库结构由 GORM AutoMigrate 自动变更**,无需手写 SQL 迁移(除 settlements 唯一索引去重,见下文)。
2. **升级前必须备份数据库**(SQLite 直接备份 `.db` 文件;MySQL `mysqldump`)。
3. 本次升级涉及**安全修复导致的行为变更**,升级后需重新核对这些点。

## 一、备份数据库

```sh
# SQLite
cp one-api.db one-api.db.bak.$(date +%Y%m%d)

# MySQL
mysqldump -u user -p neo-matrix > neo-matrix-backup-$(date +%Y%m%d).sql
```

## 二、拉取新代码 + 构建

```sh
git pull origin main
cd web/default && npm install && npm run build && cd ../..
go build -o neo-matrix .
```

> 若 `web/build` 缺失导致启动 panic,先构建前端(仓库不提交构建产物)。

## 三、重启应用(自动迁移)

启动时 `migrateDB()` 自动执行:

- **补列**:`channels`(+`owner_id`/`cost_ratio`/`model_cost_ratio`/`is_shared`/`settle_enabled`/`trust_level`/`cost_decl_*`)、`suppliers`(+`trust_level`/`cost_decl_*`)、`settlements`(+`used_quota_end`)、`logs`(+`cost_quota`)。
- **settlements 唯一索引**:`idx_settlement_period_channel(period_start, period_end, channel_id)` 自动创建;若存量库存在重复行,迁移会**自动去重**(每组保留最新一条)后再建索引。

### 升级失败的已知场景

| 报错 | 原因 | 处理 |
|---|---|---|
| `duplicate column name: xxx` | 半迁移状态(上次启动中断,列已加但进程退出) | 属已修复的重复 AutoMigrate bug;确认列存在后直接重启即可(新代码不再重复 ADD) |
| `failed to look up field ... from DDL` | 旧表结构被手工改动,与模型不符 | 对照 `model/channel.go`/`model/supplier.go` 手工补齐缺失列 |
| `UNIQUE constraint failed: settlements...` | 老库有重复结算单 | 新迁移会自动去重;若仍报,先手动 `DELETE` 重复行(保留每组 id 最大一条) |
| `database is locked`(SQLite) | 旧代码连接池 1000 并发写锁 | 新代码默认 `SetMaxOpenConns(1)`,重启即恢复 |

## 四、升级后必须核对的配置与行为变更

### 新增必需配置
- **`SESSION_SECRET`**(必须设置):之前每次重启随机生成导致会话失效;现在从环境变量读取。`openssl rand -hex 32` 生成后写入 `.env`。**升级后所有用户需重新登录**(旧会话密钥已变)。

### 安全修复导致的行为变更(重要)

| 变更 | 影响 | 管理员动作 |
|---|---|---|
| **供给方申请需人工审核** | 存量供给方不受影响(状态保留);**新申请默认"冻结待审"**,无法立即提交 Key | 在 `/api/supplier-admin` 审核通过 |
| **BaseURL 仅允许 https + 公网域名** | 存量渠道若用 `http://` 或内网地址,供给方无法新增此类渠道 | 需要内网渠道的,由管理员在 `/api/channel` 手动创建(管理端不受 SSRF 限制) |
| **cost_ratio / model_cost_ratio 限 `[1.0, MAX_COST_RATIO]`** | 存量渠道若申报低于 1.0,结算口径不变(已核准的不受影响);**新增**渠道必须 >= 1.0 | 低成本申报(如订阅转 API)走 `/api/cost-decl` 审批 |
| **代理转发 `/v1/oneapi/proxy/:channelid` 仅限管理员** | 普通用户/供给方不能再通过该路径指定渠道 | 无,这是堵漏洞 |
| **用户列表不再返回 access_token** | admin 不能再读取他人 access_token | 无(原可读即是漏洞) |
| **提现/结算审核原子化** | 并发重复确认/驳回不再双重入账/退款 | 无,行为更安全 |
| **重跑结算不再污染对账基准** | 重跑历史周期不再改写 `used_quota_end` 快照(原会写入当前 `used_quota`,污染下周期对账增量 → 误判异常/误降权);且已入账结算单不可被重跑覆盖 | 无 |
| **对账异常结算单可人工入账** | `mismatch(3)` 状态结算单现可在管理端"核验入账",不再被永久冻结 | 对账异常单核验后手动确认入账 |
| **quota 扣减防负数** | 并发请求不再把余额扣成负 | 无 |
| **tiktoken 下载失败降级** | 离线/内网环境不再启动崩溃,改用近似计费 | 建议设 `TIKTOKEN_CACHE_DIR` 离线缓存,保证精确计费 |

### 新增可选配置(建议设置)

```sh
# .env 追加
MAX_COST_RATIO=3.0          # 供给方成本倍率上限
TRUST_PENALTY_LV1=5.0       # 低信任渠道调度惩罚
TRUST_PENALTY_LV2=3.0
SETTLEMENT_FREQUENCY=86400  # 结算周期(秒),按天
BATCH_UPDATE_ENABLED=true   # 批量落库
CHANNEL_TEST_FREQUENCY=600  # 渠道自动测试(秒)
LOG_MAX_SIZE_MB=50          # 单日志文件大小上限(MB)
MAX_BODY_MB=10              # 请求体大小上限(MB)
TIKTOKEN_CACHE_DIR=/data/tiktoken-cache  # 离线词表缓存
```

## 五、升级后验证清单

- [ ] `/api/status` 返回 `success:true`
- [ ] 管理员能登录,且 `/api/user` 列表不再含 `access_token`
- [ ] 供给方列表可见,存量供给方状态为"正常"
- [ ] 提交一个新渠道,`cost_ratio=1.0`、`https://` BaseURL 能通过预校验
- [ ] 提交 `http://内网IP` BaseURL 被拒绝(SSRF 防护生效)
- [ ] `SETTLEMENT_FREQUENCY` 设置后,结算周期任务自动运行(看日志 `settlement loop enabled`)
- [ ] 无 `database is locked` 报错(SQLite 连接池已压到 1)

## 六、回滚

如需回滚到旧版本:

1. 停服,恢复数据库备份(`one-api.db.bak.*`)。
2. `git checkout <旧提交>` 重建旧二进制。
3. 旧代码对新列**容忍**(新列不会导致旧代码崩溃,旧代码不读它们);若旧代码崩溃于未知列,需手工 `DROP` 新列。

> 注意:新结算单/提现记录由新代码写入,回滚后这些数据仍在库中,旧代码可读但不会主动处理,不会造成资金错误。

## 七、历史版本变更摘要

| 版本 | 内容 |
|---|---|
| P7b(当前) | P2 加固:图片/音频 cost_quota、结算窗口 backfill+重叠防重、日志轮转、SQLite 连接池、密码重置明文回传修复、body 限制、验证码扩容 |
| P7 | 上线前安全修复:提现原子扣减、审核状态原子翻转、成本申报白名单+SSRF 防护、代理限管理员、access_token 泄漏修复、quota 防负数、可信代理、CORS/SameSite、SESSION_SECRET、goroutine recover、优雅停机、tiktoken 降级 |
| P6 | 微供应商:信任阶梯、成本申报审批、套利防线、对账降权 |
| P0-P5 | fork + 成本路由 + 供给方 + 结算 + 提现 + 订阅转 API 预留 |

## 八、增量迁移脚本

本 fork 的表结构变更均由 AutoMigrate 处理,不新增 `bin/migration_*.sql`(仓库中 `bin/` 下的 `migration_v0.2-v0.3.sql` / `migration_v0.3-v0.4.sql` 为上游 one-api 遗留,与本 fork 无关,无需执行)。
