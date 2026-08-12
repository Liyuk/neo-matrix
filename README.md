<p align="right">
   <strong>中文</strong> | <a href="./README.en.md">English</a>
</p>


<p align="center">
  <a href="https://github.com/songquanpeng/one-api"><img src="https://raw.githubusercontent.com/songquanpeng/one-api/main/web/default/public/logo.png" width="150" height="150" alt="neo-matrix logo"></a>
</p>

<div align="center">

# Neo Matrix

_✨ 共享 AI 中转站：把闲置 API Key 汇成一个入口，按用量给供给方分成 ✨_

</div>

<p align="center">
  <a href="https://github.com/songquanpeng/one-api/blob/main/LICENSE">
    <img src="https://img.shields.io/badge/license-MIT-brightgreen" alt="license">
  </a>
</p>

## 这是什么

**Neo Matrix** 是基于 [one-api](https://github.com/songquanpeng/one-api)（MIT）改造的**共享 AI 中转站**。

- **消费者**：通过一个标准 OpenAI 兼容 API（`sk-xxx`）访问所有大模型，按用量付费。
- **供给方**：把闲置的 API Key 托管到平台，平台自动调度这些 Key 处理请求，供给方按实际用量获得分成、可提现。
- **调度**：同一模型有多家供给方时，自动走**成本最优**的渠道（平台利润最大化）。

> 完整改造方案见 [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md)。

## 核心特性

- 基于 one-api：渠道适配（40+ 上游）、额度计费、分组权限、渠道健康监控，全部继承
- **成本最优路由**：同模型多渠道时按成本倍率选最便宜的（平台利润最大化）
- **供给方 Key 托管**：提交 Key → 自动校验 → 自动建渠道 → 参与调度
- **分成结算**：按周期从消费日志聚合，平台与供给方按比例分账（幂等、可对账）
- **提现**：供给方申请提现，管理员审核打款/驳回退余额
- **扩展预留**：`SubscriptionToAPI` 渠道类型已打通五处注册点，订阅账号转 API 可直接接入

## 开发状态

| 阶段 | 内容 | 状态 |
|---|---|---|
| P0 | fork + 模块重命名 + 品牌化 | ✅ |
| P1 | 成本最优路由 + 消费日志成本记账（`cost_quota`） | ✅ 已测试 |
| P2 | 供给方角色 + Key 托管（`testChannel` 预校验） | ✅ 已端到端验证 |
| P3 | 分成结算 + 供给方看板（幂等、对账异常标记） | ✅ 已端到端验证 |
| P4 | 提现闭环（申请/打款/驳回退余额） | ✅ 已端到端验证 |
| P5 | 订阅转 API 扩展预留 | ✅ 已验证注册无 panic |

> 环境变量 `SETTLEMENT_FREQUENCY`（秒）开启后台自动结算；`BATCH_UPDATE_ENABLED=true` 开启批量落库。

## 快速开始

```sh
# 后端
cp .env.example .env   # 按需修改 SESSION_SECRET 等
go run .               # 或 ./bin/neo-matrix

# 前端（可选，默认用预构建产物）
cd web/default
npm install
npm run build
```

启动后访问 `http://localhost:3000`，默认管理员账号见 `.env.example`（首次启动自动创建 root 用户）。

## 文档

- [改造架构](docs/ARCHITECTURE.md)
- 分阶段计划、数据表设计、路由/计费机制详解

## License

[MIT](LICENSE)。本项目的上游为 [one-api](https://github.com/songquanpeng/one-api)（MIT, Copyright (c) 2023 JustSong），使用时请保留上游版权声明。
