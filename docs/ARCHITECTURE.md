# Neo Matrix 改造架构

> 本文档基于 one-api（MIT）改造，描述 neo-matrix 的架构设计与分阶段实施计划。

## 1. 业务模型

Neo Matrix 是一个**共享 AI 中转站**：

- **消费者**：通过标准 OpenAI 兼容 API（`sk-xxx`）访问所有大模型，按用量付费（quota 体系，1 美元 = 500,000 quota）。
- **供给方**：把闲置的 API Key 托管到平台（`suppliers` 表，与 `users` 1:1）。平台自动调度这些 Key 处理请求。
- **结算**：平台按周期从消费日志聚合，计算零售额与成本额，按 `platform_ratio`（平台抽利润比例，默认 20%）分账，供给方收益可提现。
- **调度**：同一模型多家供给方时，走**成本最优**渠道（零售价统一 → 成本最低 = 平台利润最高）。

## 2. 模块图

```
 消费者 sk-xxx ──POST /v1/chat/completions──▶
   │  middleware.TokenAuth → Distribute → controller.Relay
   │       │                      │
   │       ▼                      ▼
   │  CacheGetRandomSatisfied    relay.GetAdaptor(apiType)
   │  [改造①成本最优排序]       → adaptor.DoRequest(改写Auth=供给方Key)
   │       ▼                      ▼
   │  SetupContextForSelected    上游 Provider
   │
   │  billing[改造②渠道级成本价] → cost_quota
   │  preConsume(扣零售) → postConsume(实扣+退补) → RecordConsumeLog(+cost_quota)
   │       ▼
   │  SettlementSvc(后台周期) → settlements 表 → 供给方看板 / withdrawals 提现
```

## 3. 核心改造点

### 3a. 成本最优路由

**现状**（`model/cache.go:227-255`）：`CacheGetRandomSatisfiedChannel` 在最高优先级 tier 内**随机**选渠道；`Channel.Weight` 字段定义了但未参与路由；零售价 `ModelRatio` 是全局 map，与渠道无关。

**改造**：

| 文件 | 改动 |
|---|---|
| `model/channel.go` | `Channel` 加 `OwnerId`/`CostRatio`/`ModelCostRatio`/`IsShared`/`SettleEnabled` 字段；新方法 `GetCostRatio(model)`（ModelCostRatio JSON 命中返回，否则回退 CostRatio）、`EffectiveCost(model)` |
| `model/cache.go` | `InitChannelCache`(203-211) 排序改为"优先级降序 → 同优先级内成本升序"（模型粒度）；`CacheGetRandomSatisfiedChannel`(227-255) 去掉随机取 `channels[0]`（成本最低），成本相同才随机平摊 |
| `model/ability.go` | DB 路径（`MEMORY_CACHE_ENABLED=false` 时）改 `ORDER BY RANDOM()` 为拉全量后 Go 侧按成本排序取首个 |
| `relay/billing/ratio/model.go` | 新增 `GetChannelCostQuota(channel, model, prompt, completion)`：`ceil((prompt + completion×GetCompletionRatio) × GetModelRatio × channel.EffectiveCost(model))` |

零售价 `ModelRatio` 保持不变，消费者端价格统一；`controller/relay.go` 重试逻辑无需改动（`ignoreFirstPriority` 自动跳过失败 tier）。

### 3b. 供给方角色 + Key 托管

- 不加新角色枚举，复用 `users` 表 + `suppliers` 表 1:1。`middleware/auth.go` 加 `SupplierAuth()`（CommonUser + IsSupplier）。
- `POST /api/supplier/apply`（存量用户申请）或注册带 `?as=supplier`。
- `POST /api/supplier/channel`（供给方提交 Key → 建 Channel）：
  1. 入参 `{type, name, key, base_url, models, model_mapping, cost_ratio}`，type 白名单收敛
  2. **Key 预校验**：复用 `controller/channel-test.go:68 testChannel`
  3. 组装 `Channel{OwnerId, IsShared:1, Status:Enabled, Group:"supplier"}`，`channel.Insert()`（内含 AddAbilities）
  4. 插入后立即 `InitChannelCache()`（否则 SyncFrequency=600s 延迟 10 分钟生效）
  5. OpenAI 系 Key 调 `updateChannelBalance` 拉余额，balance<=0 置禁用

### 3c. 分成结算 + 提现

- 结算模型：`total_quota`=SUM(logs.quota)；`cost_quota`=SUM(logs.cost_quota)；利润=total-cost；供给方分成 `revenue = cost + 利润×(1-platform_ratio)`。
- `model/settlement.go` + 后台 goroutine（仿 `AutomaticallyTestChannels`）：按周期对 LOG_DB `GROUP BY channel_id` 聚合 type=2 日志，UPSERT settlements（幂等），与 `channel.used_quota` 对账标异常。
- 提现：`POST /api/supplier/withdraw` → 管理员审核（通过入账、驳回退余额），状态机 0→1→2/3。

## 4. 数据库变更

全部 GORM AutoMigrate（`model/main.go:137-164` migrateDB() 追加）：

| 表 | 变更 |
|---|---|
| `channels` | +`owner_id`(默认0=平台自有) +`cost_ratio`(REAL默认1.0) +`model_cost_ratio`(TEXT默认'{}') +`is_shared` +`settle_enabled` |
| `suppliers`（新） | `user_id`(UNIQUE)、`status`、`platform_ratio`(REAL默认0.2)、`withdraw_balance`、`settling_balance`、`total_income`、时间戳 |
| `settlements`（新） | `period_start/end`、`supplier_id`、`channel_id`、`total_quota`、`cost_quota`、`revenue_quota`、`platform_quota`、`status`(0待结算/1已确认/2已入账/3对账异常)，`UNIQUE(period,channel)` |
| `withdrawals`（新） | `supplier_id`、`amount_quota`、`amount_fiat`、`pay_method/account`、`status`(0待审核/1打款中/2已打款/3已驳回)、`reason` |
| `logs` | +`cost_quota INT DEFAULT 0`（LOG_DB 独立库时同步 migrateLOGDB()） |

## 5. 分阶段实施

| 阶段 | 内容 | 验收标准 |
|---|---|---|
| P0 工程化 | fork、改模块名、保留 MIT LICENSE | `go build` 通过、可启动 |
| P1 成本路由+记账 | Schema、GetCostRatio、cache/ability 排序、helper.go 写 cost_quota | 同模型两渠道不同 cost_ratio 稳定落低成本渠道；计费无回归 |
| P2 供给方+Key托管 | suppliers 表、鉴权、/supplier/channel 预校验 | 注册→提交Key→建渠道参与路由；坏Key被拒 |
| P3 分成结算+看板 | settlement 表+周期任务+对账、dashboard API/页面 | 周期结算正确、看板与日志一致、幂等 |
| P4 提现闭环 | withdrawals 表+审核、余额状态机 | 申请→审核→入账/驳回，余额正确 |
| P5 订阅转API预留 | 新 Adaptor 协议 + channeltype | 新上游可接入不破坏 Dummy 对齐 |

## 6. 关键风险

1. **MIT**：fork 保留版权声明即可，无 AGPL 传染。
2. **Dummy 对齐坑**（P5 加渠道类型时）：`channeltype/define.go` + `url.go`(init panic) + `apitype/define.go` + `relay/adaptor.go` + 前端 CHANNEL_OPTIONS **五处同步**。
3. **封号风险**（P5 订阅转 API）：`monitor/manage.go` 自动禁失效渠道；条款明确供给方承担账号风险。
4. **流式结算**：usage 流结束才知，cost_quota 必须在 `postConsumeQuota`（goroutine, text.go:86）同处落库。
5. **对账/防超卖**：settlement 与 used_quota 对账标异常；Key 托管靠 balance 校验；`RetryTimes` 默认 0 需显式配置。
6. **缓存陈旧**：渠道改动 SyncFrequency=600s 生效，插入后手动 InitChannelCache。
7. **成本价篡改**：供给方填 cost_ratio 平台复核，加成本价下限校验 + 管理员可覆盖。
