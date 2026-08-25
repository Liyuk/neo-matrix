// 纯静态 demo 演示数据（仅当 REACT_APP_DEMO=true 构建时加载）。
// 数据故事对齐 docs/PROJECT.md：4 个渠道、12 张结算单、¥123 流水、
// 6 张已入账、1 张对账异常、供给方可提现 ¥54.06、结算中 ¥63.05、平台抽成 20%。
// 金额换算与后端一致：quotaToRMB = quota * 7 / 500000。

const DAY = 86400;
const now = Math.floor(Date.now() / 1000);
const dayAgo = (n) => now - n * DAY;

// 各实体自增 id
let nextUserId = 10;
let nextChannelId = 10;
let nextTokenId = 10;
let nextSettlementId = 13;
let nextWithdrawalId = 4;
let nextLogId = 41;
let nextRedemptionId = 5;

const role = { user: 1, admin: 10, root: 100 };
const channelStatus = { enabled: 1, disabled: 2, autoDisabled: 3 };
const tokenStatus = { enabled: 1, disabled: 2, expired: 3, exhausted: 4 };
const settlementStatus = { pending: 0, confirmed: 1, settled: 2, mismatch: 3 };
const withdrawalStatus = { pending: 0, paying: 1, paid: 2, rejected: 3 };
const logType = { recharge: 1, consume: 2, manage: 3, system: 4, test: 5 };
const redemptionStatus = { unused: 1, disabled: 2, used: 3 };

// ---------- 用户 ----------
const users = [
  {
    id: 1,
    username: 'root',
    display_name: '演示管理员',
    role: role.root,
    status: 1,
    email: 'root@neo-matrix.dev',
    quota: 5000000000,
    used_quota: 123450000,
    request_count: 1234,
    group: 'default',
  },
  {
    id: 2,
    username: 'admin',
    display_name: '运营小二',
    role: role.admin,
    status: 1,
    email: 'admin@neo-matrix.dev',
    quota: 100000000,
    used_quota: 1000000,
    request_count: 56,
    group: 'default',
  },
  {
    id: 3,
    username: 'supplier_ali',
    display_name: '阿里云供给方',
    role: role.user,
    status: 1,
    email: 'ali@neo-matrix.dev',
    quota: 0,
    used_quota: 0,
    request_count: 0,
    group: 'supplier',
  },
  {
    id: 4,
    username: 'consumer',
    display_name: '小明（消费者）',
    role: role.user,
    status: 1,
    email: 'consumer@neo-matrix.dev',
    quota: 9000000,
    used_quota: 14350000,
    request_count: 120,
    group: 'default',
  },
  {
    id: 5,
    username: 'vip_user',
    display_name: 'VIP 用户',
    role: role.user,
    status: 1,
    email: 'vip@neo-matrix.dev',
    quota: 20000000,
    used_quota: 5000000,
    request_count: 88,
    group: 'vip',
  },
];

// ---------- 供给方（与用户 3 关联） ----------
// 结算单 split（与后端 computeSettlementSplit 一致）：
//   利润 = 零售 - 成本；分成 = 成本 + 利润×(1-0.2)；平台 = 零售 - 分成
const suppliers = [
  {
    id: 1,
    user_id: 3,
    status: 1,
    platform_ratio: 0.2,
    // 与下方结算单 + 提现记录严格自洽：
    // 已入账分成合计 = 5040000；已打款提现 = 300000(¥4.2) + 100000(¥1.4)
    // withdraw_balance = 5040000 - 400000 = 4640000（¥64.96）
    // settling_balance = 待结算 2950000 + 异常 480000 + 提现中 120000 = 3550000（¥49.70）
    // total_income = 5040000 + 2950000 + 480000 = 8470000（¥118.58）
    withdraw_balance: 4640000,
    settling_balance: 3550000,
    total_income: 8470000,
    trust_level: 4,
    cost_decl_status: 2,
    cost_decl_note: '订阅转 API 成本低于官方价，已核准',
    created_time: dayAgo(20),
    updated_time: now,
  },
];

// ---------- 渠道（4 个，对齐 PROJECT.md） ----------
const channels = [
  {
    id: 1,
    type: 1, // OpenAI
    name: 'OpenAI 官方直连',
    key: 'sk-official-xxxxxxxxxxxx',
    status: channelStatus.enabled,
    base_url: '',
    models: 'gpt-4o,gpt-4o-mini,gpt-4-turbo',
    group: 'default',
    balance: 128.45,
    used_quota: 17200000,
    priority: 0,
    weight: 0,
    response_time: 842,
    test_time: dayAgo(1),
    cost_ratio: 1.0,
    trust_level: 5,
    cost_decl_status: 2,
    cost_decl_note: '',
    is_shared: 0,
    owner_id: 0,
    settle_enabled: 1,
    created_time: dayAgo(18),
  },
  {
    id: 2,
    type: 50, // OpenAI 兼容
    name: '聚合平台（兼容）',
    key: 'sk-agg-xxxxxxxxxxxx',
    status: channelStatus.enabled,
    base_url: 'https://aggregator.example.com/v1',
    models: 'gpt-4o-mini,gpt-4o,claude-3-5-sonnet',
    group: 'default',
    balance: 56.2,
    used_quota: 14600000,
    priority: 0,
    weight: 0,
    response_time: 1201,
    test_time: dayAgo(1),
    cost_ratio: 1.2,
    trust_level: 4,
    cost_decl_status: 2,
    cost_decl_note: '',
    is_shared: 1,
    owner_id: 3,
    settle_enabled: 1,
    created_time: dayAgo(15),
  },
  {
    id: 3,
    type: 52, // 订阅转 API（扩展预留）
    name: '订阅转 API · 优化路由',
    key: 'sk-sub-xxxxxxxxxxxx',
    status: channelStatus.enabled,
    base_url: '',
    models: 'gpt-4o-mini,gpt-4o',
    group: 'default',
    balance: 0,
    used_quota: 19300000,
    priority: 0,
    weight: 0,
    response_time: 623,
    test_time: dayAgo(2),
    cost_ratio: 0.8, // 低于官方价，需成本申报审批
    trust_level: 2,
    cost_decl_status: 2, // 已核准
    cost_decl_note: '订阅额度成本分摊，已审批',
    is_shared: 1,
    owner_id: 3,
    settle_enabled: 1,
    created_time: dayAgo(12),
  },
  {
    id: 4,
    type: 36, // DeepSeek
    name: 'DeepSeek 新渠道',
    key: 'sk-ds-xxxxxxxxxxxx',
    status: channelStatus.enabled,
    base_url: '',
    models: 'deepseek-chat,deepseek-reasoner',
    group: 'default',
    balance: 12.8,
    used_quota: 4600000,
    priority: 0,
    weight: 0,
    response_time: 1555,
    test_time: dayAgo(3),
    cost_ratio: 1.0,
    trust_level: 1, // 新渠道默认信任 1（爬坡）
    cost_decl_status: 0,
    cost_decl_note: '',
    is_shared: 1,
    owner_id: 3,
    settle_enabled: 1,
    created_time: dayAgo(6),
  },
];

// ---------- 令牌（消费者 side） ----------
const tokens = [
  {
    id: 1,
    user_id: 4,
    key: 'sk-demo-consumer-1111111111111111',
    status: tokenStatus.enabled,
    name: '我的主令牌',
    created_time: dayAgo(14),
    accessed_time: dayAgo(0),
    expired_time: -1,
    remain_quota: 8500000,
    unlimited_quota: false,
    used_quota: 12300000,
    models: 'gpt-4o-mini,gpt-4o,deepseek-chat',
    subnet: '',
  },
  {
    id: 2,
    user_id: 4,
    key: 'sk-demo-vip-2222222222222222',
    status: tokenStatus.enabled,
    name: 'VIP 渠道令牌',
    created_time: dayAgo(10),
    accessed_time: dayAgo(1),
    expired_time: -1,
    remain_quota: 0,
    unlimited_quota: true,
    used_quota: 2050000,
    models: 'gpt-4o',
    subnet: '',
  },
  {
    id: 3,
    user_id: 5,
    key: 'sk-demo-vipuser-3333333333333333',
    status: tokenStatus.enabled,
    name: 'VIP 用户令牌',
    created_time: dayAgo(8),
    accessed_time: dayAgo(0),
    expired_time: dayAgo(-7),
    remain_quota: 3000000,
    unlimited_quota: false,
    used_quota: 2000000,
    models: 'gpt-4o,gpt-4o-mini',
    subnet: '',
  },
  {
    id: 4,
    user_id: 2,
    key: 'sk-demo-admin-4444444444444444',
    status: tokenStatus.enabled,
    name: '运维测试令牌',
    created_time: dayAgo(5),
    accessed_time: dayAgo(1),
    expired_time: -1,
    remain_quota: 500000,
    unlimited_quota: false,
    used_quota: 500000,
    models: '',
    subnet: '',
  },
  {
    id: 5,
    user_id: 4,
    key: 'sk-demo-expired-5555555555555555',
    status: tokenStatus.expired,
    name: '已过期令牌',
    created_time: dayAgo(20),
    accessed_time: dayAgo(20),
    expired_time: dayAgo(3),
    remain_quota: 1000000,
    unlimited_quota: false,
    used_quota: 800000,
    models: 'gpt-4o-mini',
    subnet: '',
  },
  {
    id: 6,
    user_id: 4,
    key: 'sk-demo-exhausted-6666666666666666',
    status: tokenStatus.exhausted,
    name: '额度耗尽令牌',
    created_time: dayAgo(9),
    accessed_time: dayAgo(4),
    expired_time: -1,
    remain_quota: 0,
    unlimited_quota: false,
    used_quota: 5000000,
    models: 'gpt-4o-mini',
    subnet: '',
  },
];

// ---------- 兑换码（充值） ----------
const redemptions = [
  {
    id: 1,
    name: '体验礼包',
    status: redemptionStatus.used,
    quota: 1000000,
    created_time: dayAgo(6),
    redeemed_time: dayAgo(6),
    key: 'NM-XF3K9Q2W',
  },
  {
    id: 2,
    name: '体验礼包',
    status: redemptionStatus.unused,
    quota: 1000000,
    created_time: dayAgo(6),
    redeemed_time: 0,
    key: 'NM-8PR7MW2D',
  },
  {
    id: 3,
    name: '月度畅聊包',
    status: redemptionStatus.unused,
    quota: 5000000,
    created_time: dayAgo(2),
    redeemed_time: 0,
    key: 'NM-K2Q9ZX8V',
  },
  {
    id: 4,
    name: '月度畅聊包',
    status: redemptionStatus.disabled,
    quota: 5000000,
    created_time: dayAgo(2),
    redeemed_time: 0,
    key: 'NM-H5TN3W6P',
  },
];

// ---------- 结算单（12 张：零售合计 ¥120.54，接近文档的 ¥123 演示口径） ----------
// cost_ratio 同渠道：ch1=1.0, ch2=1.2, ch3=0.8, ch4=1.0
// split(总零售, 成本, 0.2)
const s = (retail, cost) => {
  const profit = retail - cost;
  let revenue = cost + Math.floor(profit * 0.8);
  if (revenue < 0 || revenue > retail) revenue = retail;
  return { revenue, platform: retail - revenue };
};
const settleRows = [
  { id: 1, ch: 3, retail: 1100000, status: settlementStatus.settled }, // 16.16
  { id: 2, ch: 3, retail: 1000000, status: settlementStatus.settled }, // 14.69
  { id: 3, ch: 3, retail: 900000, status: settlementStatus.settled }, // 13.22
  { id: 4, ch: 1, retail: 800000, status: settlementStatus.settled }, // 11.20
  { id: 5, ch: 1, retail: 720000, status: settlementStatus.settled }, // 10.08
  { id: 6, ch: 1, retail: 640000, status: settlementStatus.settled }, // 8.96
  { id: 7, ch: 2, retail: 700000, status: settlementStatus.pending }, // 9.80
  { id: 8, ch: 2, retail: 650000, status: settlementStatus.pending }, // 9.10
  { id: 9, ch: 4, retail: 600000, status: settlementStatus.pending }, // 8.40
  { id: 10, ch: 4, retail: 550000, status: settlementStatus.pending }, // 7.70
  { id: 11, ch: 3, retail: 500000, status: settlementStatus.mismatch }, // 7.34 对账异常
  { id: 12, ch: 2, retail: 450000, status: settlementStatus.pending }, // 6.30
];
const costRatioOf = { 1: 1.0, 2: 1.2, 3: 0.8, 4: 1.0 };
const usedQuotaSeq = [0, 1700000, 3400000, 4800000, 6100000, 7400000];
const settlements = settleRows.map((r, i) => {
  const cost = Math.round(r.retail * costRatioOf[r.ch]);
  const { revenue, platform } = s(r.retail, cost);
  return {
    id: r.id,
    period_start: dayAgo(12 - i),
    period_end: dayAgo(11 - i),
    supplier_id: 1,
    channel_id: r.ch,
    total_quota: r.retail,
    cost_quota: cost,
    revenue_quota: revenue,
    platform_quota: platform,
    status: r.status,
    used_quota_end: usedQuotaSeq[Math.min(i, 5)],
    created_time: dayAgo(11 - i),
  };
});

// ---------- 提现记录 ----------
const withdrawals = [
  {
    id: 1,
    supplier_id: 1,
    user_id: 3,
    amount_quota: 120000, // ¥1.68 审核中
    amount_fiat: 1.68,
    pay_method: '支付宝',
    pay_account: '138****0000',
    status: withdrawalStatus.pending,
    reason: '',
    created_time: dayAgo(1),
    updated_time: dayAgo(1),
  },
  {
    id: 2,
    supplier_id: 1,
    user_id: 3,
    amount_quota: 300000, // ¥4.20
    amount_fiat: 4.2,
    pay_method: '支付宝',
    pay_account: '138****0000',
    status: withdrawalStatus.paid,
    reason: '',
    created_time: dayAgo(5),
    updated_time: dayAgo(4),
  },
  {
    id: 3,
    supplier_id: 1,
    user_id: 3,
    amount_quota: 100000, // ¥1.40
    amount_fiat: 1.4,
    pay_method: '微信',
    pay_account: 'wx_****1234',
    status: withdrawalStatus.paid,
    reason: '',
    created_time: dayAgo(8),
    updated_time: dayAgo(7),
  },
];

// ---------- 日志（41 条：消费 2、充值 1、测试 5、管理 3、系统 4） ----------
const logs = [];
const models = ['gpt-4o-mini', 'gpt-4o', 'deepseek-chat', 'gpt-4-turbo'];
for (let i = 1; i <= 40; i++) {
  const isConsume = i % 5 !== 0; // 消费为主
  const type = isConsume ? logType.consume : [logType.recharge, logType.test][i % 2];
  const model = models[i % models.length];
  const prompt = 300 + ((i * 137) % 600);
  const completion = 200 + ((i * 89) % 500);
  const quota = 50000 + ((i * 733) % 400000); // ¥0.7 ~ ¥6.3
  const ch = (i % 4) + 1;
  logs.push({
    id: i,
    created_at: dayAgo(11) + i * 3600,
    request_id: `req_${1000 + i}abc${i}def`,
    channel: ch,
    type,
    model_name: model,
    username: i % 3 === 0 ? 'supplier_ali' : i % 2 === 0 ? 'consumer' : 'vip_user',
    user_id: i % 3 === 0 ? 3 : i % 2 === 0 ? 4 : 5,
    token_name: `令牌${i % 4 + 1}`,
    prompt_tokens: prompt,
    completion_tokens: completion,
    quota,
    content: `{"model":"${model}","prompt_tokens":${prompt},"completion_tokens":${completion}}`,
    elapsed_time: 300 + ((i * 77) % 3000),
    is_stream: i % 2 === 0,
    system_prompt_reset: 0,
  });
}
// 一条充值日志
logs.unshift({
  id: 41,
  created_at: dayAgo(0),
  request_id: 'req_recharge_001',
  channel: 0,
  type: logType.recharge,
  model_name: '',
  username: 'consumer',
  user_id: 4,
  token_name: '',
  prompt_tokens: 0,
  completion_tokens: 0,
  quota: 1000000,
  content: '充值 1000000 quota',
  elapsed_time: 0,
  is_stream: false,
  system_prompt_reset: 0,
});

// ---------- 消费者 Dashboard（7 天，大写驼峰字段） ----------
const dashboard = [];
for (let d = 6; d >= 0; d--) {
  const dt = new Date(now * 1000);
  dt.setDate(dt.getDate() - d);
  const day = dt.toISOString().split('T')[0];
  dashboard.push({
    Day: day,
    RequestCount: 18 + ((7 - d) * 3) % 12,
    Quota: (200000 + ((7 - d) * 140000) % 600000),
    PromptTokens: 4000 + ((7 - d) * 137) % 2000,
    CompletionTokens: 3000 + ((7 - d) * 91) % 1500,
    ModelName: d % 2 === 0 ? 'gpt-4o-mini' : 'gpt-4o',
  });
}

// ---------- 系统设置项（/api/option 的 key/value） ----------
const options = [
  ['PasswordLoginEnabled', 'true'],
  ['PasswordRegisterEnabled', 'true'],
  ['RegisterEnabled', 'true'],
  ['EmailVerificationEnabled', 'false'],
  ['GitHubOAuthEnabled', 'false'],
  ['GitHubClientId', ''],
  ['GitHubClientSecret', ''],
  ['LarkClientId', ''],
  ['LarkClientSecret', ''],
  ['WeChatAuthEnabled', 'false'],
  ['WeChatServerAddress', ''],
  ['WeChatServerToken', ''],
  ['WeChatAccountQRCodeImageURL', ''],
  ['Notice', '## Neo Matrix 演示环境\n\n这是**纯静态可交互演示**，所有数据均为本地 mock。\n\n- 已自动登录 root 管理员\n- 四个渠道、12 张结算单、1 张对账异常\n- 可尝试「确认入账」「打款」「提交 API Key」等操作'],
  ['HomePageContent', '欢迎使用 **Neo Matrix** 共享 AI 中转站演示！\n\n- 消费者：一个 `sk-` 令牌用遍所有大模型\n- 供给方：闲置 Key 托管，按用量分成、可提现\n- 调度：同模型多渠道自动走成本最优渠道'],
  ['About', '**Neo Matrix** 演示环境 —— 基于 one-api 改造的共享 AI 中转站。\n\n本页为纯静态演示，数据全部本地生成，未连接任何真实上游。'],
  ['Footer', 'Neo Matrix 纯静态演示 · 数据为本地 mock'],
  ['SystemName', 'Neo Matrix'],
  ['Logo', 'logo.svg'],
  ['Theme', 'default'],
  ['TopUpLink', ''],
  ['ChatLink', ''],
  ['QuotaPerUnit', '500000'],
  ['DisplayInCurrencyEnabled', 'true'],
  ['QuotaForNewUser', '200000'],
  ['QuotaForInviter', '0'],
  ['QuotaForInvitee', '0'],
  ['QuotaRemindThreshold', '500'],
  ['PreConsumedQuota', '1000'],
  ['ModelRatio', '{"gpt-4o-mini":500000,"gpt-4o":1000000,"gpt-4-turbo":1200000,"deepseek-chat":200000,"deepseek-reasoner":600000}'],
  ['CompletionRatio', '{"gpt-4o-mini":1,"gpt-4o":1,"gpt-4-turbo":1,"deepseek-chat":1,"deepseek-reasoner":1}'],
  ['GroupRatio', '{"default":1,"vip":1,"svip":1}'],
  ['AutomaticDisableChannelEnabled', 'true'],
  ['AutomaticEnableChannelEnabled', 'false'],
  ['ChannelDisableThreshold', '0'],
  ['LogConsumeEnabled', 'true'],
  ['DisplayTokenStatEnabled', 'true'],
  ['ApproximateTokenEnabled', 'true'],
  ['RetryTimes', '3'],
  ['SMTPServer', ''],
  ['SMTPPort', ''],
  ['SMTPAccount', ''],
  ['SMTPFrom', ''],
  ['SMTPToken', ''],
  ['ServerAddress', ''],
  ['MessagePusherAddress', ''],
  ['MessagePusherToken', ''],
  ['TurnstileCheckEnabled', 'false'],
  ['TurnstileSiteKey', ''],
  ['TurnstileSecretKey', ''],
  ['EmailDomainRestrictionEnabled', 'false'],
  ['EmailDomainWhitelist', ''],
];
const optionMap = options.map(([key, value]) => ({ key, value }));

// ---------- /api/models 渠道类型 -> 模型列表 ----------
const channelModels = {
  1: ['gpt-4o', 'gpt-4o-mini', 'gpt-4-turbo'],
  50: ['gpt-4o-mini', 'gpt-4o', 'claude-3-5-sonnet'],
  52: ['gpt-4o-mini', 'gpt-4o'],
  36: ['deepseek-chat', 'deepseek-reasoner'],
};

// 所有模型（用于 /api/user/available_models、/api/channel/models）
const availableModels = [
  'gpt-4o',
  'gpt-4o-mini',
  'gpt-4-turbo',
  'deepseek-chat',
  'deepseek-reasoner',
  'claude-3-5-sonnet',
];

// 渠道分组
const groups = ['default', 'vip', 'svip', 'supplier'];

export const demoState = {
  users,
  suppliers,
  channels,
  tokens,
  redemptions,
  settlements,
  withdrawals,
  logs,
  dashboard,
  options: optionMap,
  channelModels,
  availableModels,
  groups,
  nextUserId,
  nextChannelId,
  nextTokenId,
  nextSettlementId,
  nextWithdrawalId,
  nextLogId,
  nextRedemptionId,
};

export { settlementStatus, withdrawalStatus, tokenStatus, channelStatus };
