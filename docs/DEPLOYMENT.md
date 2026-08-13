# Neo Matrix 部署指南

单机 SQLite 与生产 MySQL 两套方案,含升级与故障排查。

## 一、单机部署(SQLite,最简)

### 前置
- Go 1.20+、Node 16+(仅首次构建前端需要)

### 步骤
```sh
# 1. 构建前端(必须,仓库不提交 web/build 产物)
cd web/default && npm install && npm run build && cd ../..

# 2. 配置环境
cp .env.example .env
# 必须设置 SESSION_SECRET:openssl rand -hex 32

# 3. 启动
go run .
```

访问 `http://localhost:3000`,首次启动自动创建 root 账号(密码 123456,上线立即修改)。

### Docker 方式
```sh
docker compose up -d    # 已改为本 fork 镜像(neo-matrix:local),SQLite 单容器
```

## 二、生产部署(MySQL + 可选 Redis)

1. 建库 `neo-matrix`;`.env` 设置 `SQL_DSN=user:pass@tcp(host:3306)/neo-matrix`。
2. 多机部署设置 `REDIS_CONN_STRING` + `MEMORY_CACHE_ENABLED=true` + 固定 `SESSION_SECRET`(多节点一致)。
3. 设置后台任务:`SETTLEMENT_FREQUENCY`(结算周期,如 86400)、`CHANNEL_TEST_FREQUENCY`、`BATCH_UPDATE_ENABLED=true`。
4. 建议在反代(Nginx/Caddy)后设置 `SetTrustedProxies` 对应的可信代理链(本程序默认不信任任何代理)。

### 离线/内网部署(tiktoken 词表)
服务启动需加载 tiktoken 词表,离线环境先在有网机器预下载缓存目录:
```sh
mkdir -p /data/tiktoken-cache && cd /data/tiktoken-cache
for u in cl100k_base o200k_base p50k_base r50k_base; do
  curl -s -o "$(printf '%s' "https://openaipublic.blob.core.windows.net/encodings/$u.tiktoken" | shasum -a1 | cut -d' ' -f1)" \
    "https://openaipublic.blob.core.windows.net/encodings/$u.tiktoken"
done
```
然后设置 `TIKTOKEN_CACHE_DIR=/data/tiktoken-cache`。词表下载失败时会自动降级到近似计费(不阻塞启动)。

## 三、升级指南

- **数据库迁移**:GORM AutoMigrate 自动补列/建表。升级前**备份 SQLite 文件**(或 MySQL dump)。
- **已知坑**:
  - 老库升级会自动补 `channels`/`suppliers`/`settlements` 新列,若报 `duplicate column`,说明半迁移状态,重启前确认表结构;
  - `settlements` 唯一索引迁移会自动去重(保留每组最新一条)。
- 升级后验证:`/api/status` 返回 success、管理员能登录、供给方列表可见。

## 四、故障排查

| 症状 | 排查 |
|---|---|
| 启动报 tiktoken 下载失败 | 设 `TIKTOKEN_CACHE_DIR` 或检查代理/网络(见"离线部署") |
| 启动报 migration 失败 | 备份 DB,检查表结构是否半迁移;必要时人工补列 |
| 前端白屏/空 | `web/build` 未构建,执行 `npm run build` |
| 后台循环崩溃 | 已加 recover,查日志 `background goroutine panic recovered` |
| 结算未执行 | 确认 `SETTLEMENT_FREQUENCY` 已设置 |
| 渠道不生效 | 渠道改动后手动触发缓存刷新或等 `SYNC_FREQUENCY` |
| 会话频繁失效 | `SESSION_SECRET` 每次重启变化所致,设固定值 |

## 五、安全清单(上线前核对)

- [ ] `SESSION_SECRET` 设为随机固定值
- [ ] root 默认密码 123456 已修改
- [ ] 供给方申请需人工审核(默认冻结,管理员批准)
- [ ] `.env` 未提交 git
- [ ] 生产用 MySQL(非 SQLite)并开启 `BATCH_UPDATE_ENABLED`
- [ ] 反代后设置可信代理配置
- [ ] 读 `docs/rules/RULES.md` 确认平台规则与合规红线
