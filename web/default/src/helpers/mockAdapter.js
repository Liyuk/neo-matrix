// 纯静态 demo 的 axios mock adapter（仅当 REACT_APP_DEMO=true 构建时启用）。
// 通过替换 axios.defaults.adapter 拦截所有 /api/* 请求，按后端真实响应形状返回演示数据。
// 挂在全局 axios 默认 adapter 上：裸 axios.get（Dashboard）和 API 实例都走这里。
//
// 注意：查询串可能嵌在 URL 里（/api/channel/?p=0），也可能在 config.params（axios params 选项），
// 路由前先把 URL 里的查询串剥掉、解析成 params 合并，保证匹配稳定。

import axios from 'axios';
import { demoState } from './demoData';

const ROOT = {
  id: 1,
  username: 'root',
  display_name: '演示管理员',
  role: 100,
  status: 1,
  token: 'demo-token',
  email: 'root@neo-matrix.dev',
  quota: 5000000000,
  used_quota: 123450000,
  request_count: 1234,
  group: 'default',
};

const PAGE_SIZE = 10;
const ok = (data, message = '') => ({ success: true, message, data });
const fail = (message) => ({ success: false, message });

const st = (key) => demoState[key];

function currentDemoUser() {
  try {
    return JSON.parse(localStorage.getItem('user') || 'null');
  } catch (_) {
    return null;
  }
}

// 返回数组的深拷贝，避免 React setState 同引用跳过重渲染（mock 改动后 loadAll 需要刷新）
const listCopy = (arr) => arr.map((x) => (Array.isArray(x) ? x.slice() : { ...x }));

// 剥掉 URL 里的查询串，并把查询参数合并进 config.params
function normalize(config) {
  const url = String(config.url || '');
  const qIdx = url.indexOf('?');
  let path = url;
  const merged = { ...(config.params || {}) };
  if (qIdx >= 0) {
    path = url.slice(0, qIdx);
    new URLSearchParams(url.slice(qIdx + 1)).forEach((v, k) => {
      merged[k] = v;
    });
  }
  return { path, params: merged, method: String(config.method || 'get').toLowerCase(), data: config.data };
}

// 安全解析请求体：axios 的 transformRequest 已把对象序列化成 JSON 字符串；
// 个别情况（FormData 等）保持原样。
function bodyOf(ctx) {
  if (!ctx.data) return {};
  if (typeof ctx.data === 'string') {
    try {
      return JSON.parse(ctx.data);
    } catch (e) {
      return {};
    }
  }
  return ctx.data;
}

function paginate(arr, params) {
  // 始终返回新数组，避免 React setState 同引用跳过重渲染
  if (params.p === undefined) return arr.slice();
  const p = parseInt(params.p, 10) || 0;
  return arr.slice(p * PAGE_SIZE, p * PAGE_SIZE + PAGE_SIZE);
}

function filterLogs(params = {}) {
  let rows = st('logs');
  // 与后端一致：0 / 空串 / NaN 表示"不过滤"
  if (params.type && params.type !== '0') rows = rows.filter((l) => String(l.type) === String(params.type));
  if (params.username) rows = rows.filter((l) => (l.username || '').includes(params.username));
  if (params.token_name) rows = rows.filter((l) => (l.token_name || '').includes(params.token_name));
  if (params.model_name) rows = rows.filter((l) => (l.model_name || '').includes(params.model_name));
  if (params.channel && params.channel !== '0') rows = rows.filter((l) => String(l.channel) === String(params.channel));
  // start/end 为 0 或 NaN（前端 Date.parse('') 产生）时跳过时间过滤
  const start = parseInt(params.start_timestamp, 10);
  const end = parseInt(params.end_timestamp, 10);
  if (start && !Number.isNaN(start)) rows = rows.filter((l) => l.created_at >= start);
  if (end && !Number.isNaN(end)) rows = rows.filter((l) => l.created_at <= end);
  return rows;
}

function matchKeyword(arr, kw, fields) {
  if (!kw) return arr;
  return arr.filter((x) => fields.some((f) => String(x[f] || '').includes(kw)));
}

const nowSec = () => Math.floor(Date.now() / 1000);

function route(ctx) {
  const { path, params, method } = ctx;
  const is = (p) => path === p;
  const match = (re) => path.match(re);

  // ---------------- 状态与公开接口 ----------------
  if (is('/api/status') && method === 'get') {
    return ok({
      version: 'v0.0.0', // 与前端「新版本可用」检查的豁免值一致，避免演示弹 toast
      start_time: nowSec() - 86400 * 12,
      email_verification: false,
      github_oauth: false,
      github_client_id: '',
      lark_client_id: '',
      system_name: 'Neo Matrix',
      logo: 'logo.svg',
      footer_html: 'Neo Matrix 纯静态演示 · 数据为本地 mock',
      wechat_qrcode: '',
      wechat_login: false,
      server_address: '',
      turnstile_check: false,
      turnstile_site_key: '',
      top_up_link: '',
      chat_link: '',
      quota_per_unit: '500000',
      display_in_currency: true,
      oidc: false,
      oidc_client_id: '',
      oidc_well_known: '',
      oidc_authorization_endpoint: '',
      oidc_token_endpoint: '',
      oidc_userinfo_endpoint: '',
    });
  }
  if (is('/api/notice') && method === 'get') {
    return ok(
      '## Neo Matrix 演示环境\n\n这是**纯静态可交互演示**，所有数据均为本地 mock。\n\n- 已自动登录 root 管理员\n- 四个渠道、12 张结算单、1 张对账异常\n- 可尝试「确认入账」「打款」「提交 API Key」等操作'
    );
  }
  if (is('/api/about') && method === 'get') {
    return ok(
      '**Neo Matrix** 演示环境 —— 基于 one-api 改造的共享 AI 中转站。\n\n本页为纯静态演示，数据全部本地生成，未连接任何真实上游。'
    );
  }
  if (is('/api/home_page_content') && method === 'get') {
    return ok(
      '欢迎使用 **Neo Matrix** 共享 AI 中转站演示！\n\n- 消费者：一个 `sk-` 令牌用遍所有大模型\n- 供给方：闲置 Key 托管，按用量分成、可提现\n- 调度：同模型多渠道自动走成本最优渠道'
    );
  }
  if (is('/api/models') && method === 'get') return ok({ ...st('channelModels') });
  if (is('/api/group/') && method === 'get') return ok(listCopy(st('groups')));
  if (is('/api/user/available_models') && method === 'get') return ok(listCopy(st('availableModels')));
  if (is('/api/channel/models') && method === 'get') {
    return ok(st('availableModels').map((m) => ({ id: m, name: m })));
  }
  if (is('/api/oauth/state') && method === 'get') return ok('demo-state-123456');
  if (path.startsWith('/api/verification') && method === 'get') return ok(null);
  if (path.startsWith('/api/reset_password') && method === 'get') return ok(null);

  // ---------------- 鉴权 ----------------
  if (is('/api/user/login') && method === 'post') {
    const body = bodyOf(ctx);
    const isRoot = body.username === 'root' && body.password === '123456';
    return ok({
      ...ROOT,
      username: body.username || 'root',
      role: isRoot ? 100 : 1,
      display_name: isRoot ? '演示管理员' : body.username || 'root',
    });
  }
  if (is('/api/user/register') && method === 'post') {
    const body = bodyOf(ctx);
    return ok({
      id: 99,
      username: body.username,
      display_name: body.username,
      role: 1,
      status: 1,
      quota: 200000,
      used_quota: 0,
      request_count: 0,
      group: 'default',
    });
  }
  if (is('/api/user/logout') && method === 'get') return ok(null);
  if (is('/api/user/reset') && method === 'post') return ok('Demo123456');
  if (path.startsWith('/api/oauth/wechat') && method === 'get') {
    if (path.includes('/bind')) return ok(null);
    return ok({ ...ROOT, username: 'wechat_demo' });
  }
  if (path.startsWith('/api/oauth/email/bind') && method === 'get') return ok(null);
  if (path.startsWith('/api/oauth/github') && method === 'get') return ok({ ...ROOT, username: 'github_demo' });
  if (path.startsWith('/api/oauth/lark') && method === 'get') return ok({ ...ROOT, username: 'lark_demo' });

  // ---------------- 用户 ----------------
  if (is('/api/user/') && method === 'get') return ok(paginate(st('users'), params));
  if (is('/api/user/search') && method === 'get') {
    return ok(matchKeyword(st('users'), params.keyword, ['username', 'display_name']));
  }
  if (is('/api/user/self') && method === 'get') {
    const demoUser = currentDemoUser();
    const fixture = st('users').find((item) => item.id === demoUser?.id);
    return ok({ ...ROOT, ...(fixture || {}), ...(demoUser || {}), token: demoUser?.token || ROOT.token });
  }
  if (is('/api/user/self') && method === 'put') {
    const body = bodyOf(ctx);
    const demoUser = currentDemoUser();
    const fixture = st('users').find((item) => item.id === demoUser?.id);
    Object.assign(fixture || ROOT, body);
    return ok({ ...ROOT, ...(fixture || {}), ...(demoUser || {}), ...body });
  }
  if (is('/api/user/self') && method === 'delete') return ok(null);
  if (is('/api/user/token') && method === 'get') return ok('demo_access_token_abcd1234');
  if (is('/api/user/aff') && method === 'get') return ok('DEMO888');
  if (is('/api/user/manage') && method === 'post') {
    const body = bodyOf(ctx);
    const u = st('users').find((x) => x.username === body.username);
    if (!u) return fail('用户不存在');
    switch (body.action) {
      case 'promote': u.role = u.role === 1 ? 10 : 100; break;
      case 'demote': u.role = u.role === 100 ? 10 : 1; break;
      case 'disable': u.status = 2; break;
      case 'enable': u.status = 1; break;
      case 'delete': u.status = -1; break;
      default: break;
    }
    return ok({ role: u.role, status: u.status });
  }
  if (is('/api/user/topup') && method === 'post') {
    const body = bodyOf(ctx);
    const rd = st('redemptions').find((r) => r.key === body.key);
    if (!rd) return fail('无效的兑换码');
    if (rd.status !== 1) return fail('兑换码已使用或已禁用');
    rd.status = 3;
    rd.redeemed_time = nowSec();
    ROOT.quota += rd.quota;
    return ok(rd.quota);
  }
  if (is('/api/user/dashboard') && method === 'get') return ok(listCopy(st('dashboard')));
  if (is('/api/user/') && method === 'post') {
    const body = bodyOf(ctx);
    const id = demoState.nextUserId++;
    st('users').unshift({
      id,
      username: body.username,
      display_name: body.display_name || body.username,
      role: 1,
      status: 1,
      quota: 200000,
      used_quota: 0,
      request_count: 0,
      group: 'default',
    });
    return ok({ ...st('users')[0] });
  }
  const userOne = match(/^\/api\/user\/(\d+)$/);
  if (userOne && method === 'get') {
    const u = st('users').find((x) => x.id === Number(userOne[1]));
    return u ? ok(u) : ok({ ...ROOT });
  }

  // ---------------- 渠道 ----------------
  if (is('/api/channel/') && method === 'get') return ok(paginate(st('channels'), params));
  if (is('/api/channel/') && method === 'post') {
    const body = bodyOf(ctx);
    const id = demoState.nextChannelId++;
    st('channels').unshift({
      id,
      type: body.type || 1,
      name: body.name || '新渠道',
      key: body.key || '',
      status: 1,
      base_url: body.base_url || '',
      models: body.models || '',
      group: body.group || 'default',
      balance: 0,
      used_quota: 0,
      priority: 0,
      weight: 0,
      response_time: 0,
      test_time: 0,
      cost_ratio: body.cost_ratio || 1.0,
      trust_level: 1,
      cost_decl_status: 0,
      cost_decl_note: '',
      is_shared: 1,
      owner_id: 3,
      settle_enabled: 1,
      created_time: nowSec(),
    });
    return ok(st('channels')[0]);
  }
  if (is('/api/channel/') && method === 'put') {
    const body = bodyOf(ctx);
    const ch = st('channels').find((x) => x.id === body.id);
    if (!ch) return fail('渠道不存在');
    if (body.status !== undefined) ch.status = body.status;
    if (body.priority !== undefined) ch.priority = body.priority;
    if (body.weight !== undefined) ch.weight = body.weight;
    if (body.name !== undefined) {
      Object.assign(ch, {
        name: body.name,
        type: body.type,
        key: body.key,
        base_url: body.base_url,
        models: body.models,
        group: body.group,
        model_mapping: body.model_mapping,
        config: body.config,
        other: body.other,
        system_prompt: body.system_prompt,
      });
    }
    return ok(ch);
  }
  if (is('/api/channel/search') && method === 'get') {
    return ok(matchKeyword(st('channels'), params.keyword, ['name', 'models']));
  }
  const chDel = match(/^\/api\/channel\/(\d+)\/$/);
  if (chDel && method === 'delete') {
    const idx = st('channels').findIndex((x) => x.id === Number(chDel[1]));
    if (idx >= 0) st('channels').splice(idx, 1);
    return ok(null);
  }
  const chTest = match(/^\/api\/channel\/test\/(\d+)$/);
  if (chTest && method === 'get') {
    const ch = st('channels').find((x) => x.id === Number(chTest[1]));
    return {
      success: true,
      message: '',
      time: ch ? ch.response_time / 1000 : 1.2,
      model: params.model || 'gpt-4o-mini',
    };
  }
  if (is('/api/channel/test') && method === 'get') return ok(null);
  if (is('/api/channel/disabled') && method === 'delete') return ok(2);
  const chBal = match(/^\/api\/channel\/update_balance\/(\d+)\/$/);
  if (chBal && method === 'get') {
    const ch = st('channels').find((x) => x.id === Number(chBal[1]));
    return { success: true, message: '', balance: ch ? ch.balance : 0 };
  }
  if (is('/api/channel/update_balance') && method === 'get') return ok(null);
  const chOne = match(/^\/api\/channel\/(\d+)$/);
  if (chOne && method === 'get') {
    const ch = st('channels').find((x) => x.id === Number(chOne[1]));
    return ch ? ok(ch) : fail('渠道不存在');
  }

  // ---------------- 令牌 ----------------
  if (is('/api/token/') && method === 'get') {
    const demoUser = currentDemoUser();
    return ok(paginate(st('tokens').filter((item) => !demoUser?.id || item.user_id === demoUser.id), params));
  }
  if (is('/api/token/') && method === 'post') {
    const body = bodyOf(ctx);
    const id = demoState.nextTokenId++;
    const created = nowSec();
    const key = `sk-demo-${id}-${String(id).padEnd(16, String(id % 10))}`;
    st('tokens').unshift({
      id,
      user_id: currentDemoUser()?.id || 1,
      key,
      status: 1,
      name: body.name || '新令牌',
      created_time: created,
      accessed_time: created,
      expired_time: body.expired_time || -1,
      remain_quota: body.remain_quota || 0,
      unlimited_quota: !!body.unlimited_quota,
      used_quota: 0,
      models: body.models || '',
      subnet: body.subnet || '',
    });
    return ok(st('tokens')[0]);
  }
  if (is('/api/token/') && method === 'put') {
    const body = bodyOf(ctx);
    const tk = st('tokens').find((x) => x.id === body.id);
    if (!tk) return fail('令牌不存在');
    if (body.status !== undefined) tk.status = body.status;
    if (body.name !== undefined) {
      Object.assign(tk, {
        name: body.name,
        expired_time: body.expired_time,
        remain_quota: body.remain_quota,
        unlimited_quota: !!body.unlimited_quota,
        models: body.models,
        subnet: body.subnet,
      });
    }
    return ok(tk);
  }
  if (is('/api/token/search') && method === 'get') {
    return ok(matchKeyword(st('tokens'), params.keyword, ['name', 'key']));
  }
  const tkDel = match(/^\/api\/token\/(\d+)\/$/);
  if (tkDel && method === 'delete') {
    const idx = st('tokens').findIndex((x) => x.id === Number(tkDel[1]));
    if (idx >= 0) st('tokens').splice(idx, 1);
    return ok(null);
  }
  const tkOne = match(/^\/api\/token\/(\d+)$/);
  if (tkOne && method === 'get') {
    const tk = st('tokens').find((x) => x.id === Number(tkOne[1]));
    return tk ? ok(tk) : fail('令牌不存在');
  }

  // ---------------- 兑换码 ----------------
  if (is('/api/redemption/') && method === 'get') return ok(paginate(st('redemptions'), params));
  if (is('/api/redemption/') && method === 'post') {
    const body = bodyOf(ctx);
    const codes = [];
    for (let i = 0; i < (body.count || 1); i++) {
      codes.push('NM-' + Math.random().toString(36).slice(2, 10).toUpperCase());
    }
    return ok(codes);
  }
  if (is('/api/redemption/') && method === 'put') {
    const body = bodyOf(ctx);
    const rd = st('redemptions').find((x) => x.id === body.id);
    if (!rd) return fail('兑换码不存在');
    if (body.status !== undefined) rd.status = body.status;
    if (body.name !== undefined) rd.name = body.name;
    return ok(rd);
  }
  if (is('/api/redemption/search') && method === 'get') {
    return ok(matchKeyword(st('redemptions'), params.keyword, ['name', 'key']));
  }
  const rdDel = match(/^\/api\/redemption\/(\d+)\/$/);
  if (rdDel && method === 'delete') {
    const idx = st('redemptions').findIndex((x) => x.id === Number(rdDel[1]));
    if (idx >= 0) st('redemptions').splice(idx, 1);
    return ok(null);
  }
  const rdOne = match(/^\/api\/redemption\/(\d+)$/);
  if (rdOne && method === 'get') {
    const rd = st('redemptions').find((x) => x.id === Number(rdOne[1]));
    return rd ? ok(rd) : fail('兑换码不存在');
  }

  // ---------------- 日志 ----------------
  if (is('/api/log/self/stat') && method === 'get') {
    const rows = filterLogs(params);
    return ok({ quota: rows.reduce((s, l) => s + l.quota, 0), token: 0 });
  }
  if (is('/api/log/stat') && method === 'get') {
    const rows = filterLogs(params);
    return ok({ quota: rows.reduce((s, l) => s + l.quota, 0), token: 0 });
  }
  if (is('/api/log/self/search') && method === 'get') {
    return ok(matchKeyword(filterLogs(params), params.keyword, ['request_id', 'content']));
  }
  if (is('/api/log/') && method === 'get') return ok(paginate(filterLogs(params), params));
  if (is('/api/log/self/') && method === 'get') return ok(paginate(filterLogs(params), params));
  if (is('/api/log/') && method === 'delete') return ok(3);

  // ---------------- 系统设置 ----------------
  if (is('/api/option/') && method === 'get') return ok(listCopy(st('options')));
  if (is('/api/option/') && method === 'put') {
    const body = bodyOf(ctx);
    const opt = st('options').find((o) => o.key === body.key);
    if (opt) opt.value = String(body.value);
    else st('options').push({ key: body.key, value: String(body.value) });
    return ok(null);
  }

  // ---------------- 供给方 ----------------
  const demoUser = currentDemoUser();
  const supplier = st('suppliers').find((item) => item.user_id === demoUser?.id);
  if (is('/api/supplier/apply') && method === 'post') {
    const userId = demoUser?.id || 4;
    const existing = st('suppliers').find((item) => item.user_id === userId);
    if (existing) return ok(existing, '已提交过申请');
    const pending = {
      id: st('suppliers').length + 1,
      user_id: userId,
      status: 2,
      platform_ratio: 0.2,
      withdraw_balance: 0,
      settling_balance: 0,
      total_income: 0,
      trust_level: 1,
      cost_decl_status: 0,
      created_time: nowSec(),
      updated_time: nowSec(),
    };
    st('suppliers').push(pending);
    return ok(pending, '申请已提交，等待管理员审核');
  }
  if (is('/api/supplier/self') && method === 'get') {
    return supplier ? ok(supplier) : fail('还不是供给方，请先提交申请');
  }
  if (is('/api/supplier/dashboard') && method === 'get') {
    if (!supplier) return fail('还不是供给方，请先提交申请');
    return ok({
      supplier: { ...supplier },
      channels: listCopy(st('channels').filter((c) => c.owner_id === supplier.user_id)),
      settlements: listCopy(st('settlements').filter((s) => s.supplier_id === supplier.id)),
    });
  }
  if (is('/api/supplier/withdrawals') && method === 'get') {
    return supplier ? ok(listCopy(st('withdrawals').filter((item) => item.supplier_id === supplier.id))) : ok([]);
  }
  if (is('/api/supplier/channel') && method === 'post') {
    if (!supplier) return fail('还不是供给方，请先提交申请');
    const body = bodyOf(ctx);
    const id = demoState.nextChannelId++;
    st('channels').unshift({
      id,
      type: body.type || 1,
      name: body.name || '新托管渠道',
      key: body.key || '',
      status: 1,
      base_url: body.base_url || '',
      models: body.models || '',
      group: 'default',
      balance: 0,
      used_quota: 0,
      priority: 0,
      weight: 0,
      response_time: 0,
      test_time: 0,
      cost_ratio: body.cost_ratio || 1.0,
      trust_level: 1,
      cost_decl_status: 0,
      cost_decl_note: '',
      is_shared: 1,
      owner_id: demoUser?.id || 3,
      settle_enabled: 1,
      created_time: nowSec(),
    });
    return ok(null, '渠道创建成功');
  }
  const supDel = match(/^\/api\/supplier\/channel\/(\d+)$/);
  if (supDel && method === 'delete') {
    const idx = st('channels').findIndex((x) => x.id === Number(supDel[1]));
    if (idx >= 0) st('channels').splice(idx, 1);
    return ok(null, '删除成功');
  }
  if (is('/api/supplier/withdraw') && method === 'post') {
    if (!supplier) return fail('还不是供给方，请先提交申请');
    const body = bodyOf(ctx);
    const id = demoState.nextWithdrawalId++;
    const created = nowSec();
    st('withdrawals').unshift({
      id,
      supplier_id: supplier?.id || 1,
      user_id: demoUser?.id || 3,
      amount_quota: body.amount_quota,
      amount_fiat: (body.amount_quota * 7) / 500000,
      pay_method: body.pay_method,
      pay_account: body.pay_account,
      status: 0,
      reason: '',
      created_time: created,
      updated_time: created,
    });
    supplier.withdraw_balance = Math.max(0, supplier.withdraw_balance - body.amount_quota);
    return ok(null, '提现申请已提交，等待审核');
  }

  // ---------------- 结算 + 提现（管理端） ----------------
  if (is('/api/settlement/') && method === 'get') return ok(listCopy(st('settlements')));
  if (is('/api/settlement/run') && method === 'post') {
    let count = 0;
    st('settlements')
      .filter((s) => s.status === 0)
      .forEach((s) => {
        s.status = 1;
        count++;
      });
    return ok({ count }, `结算完成，生成 ${count} 条记录`);
  }
  const stConfirm = match(/^\/api\/settlement\/(\d+)$/);
  if (stConfirm && method === 'put') {
    const s = st('settlements').find((x) => x.id === Number(stConfirm[1]));
    if (s) s.status = 2;
    return ok(null, '结算已确认');
  }
  if (is('/api/withdrawal/') && method === 'get') return ok(listCopy(st('withdrawals')));
  const wd = match(/^\/api\/withdrawal\/(\d+)$/);
  if (wd && method === 'put') {
    const body = bodyOf(ctx);
    const w = st('withdrawals').find((x) => x.id === Number(wd[1]));
    if (w) {
      w.status = body.status;
      w.reason = body.reason || '';
      w.updated_time = nowSec();
    }
    return ok(null, '操作成功');
  }

  return null;
}

// 替换 axios 默认 adapter：请求走内存数据，永远本地解析成功。
// 先记住原始 adapter，未命中的非 /api 请求才交给浏览器默认实现。
export function installMock() {
  const originalAdapter = axios.defaults.adapter;
  axios.defaults.adapter = async (config) => {
    const ctx = normalize(config);
    const body = route(ctx);
    if (body !== null && body !== undefined) {
      return {
        data: body,
        status: 200,
        statusText: 'OK',
        headers: {},
        config,
        request: {},
      };
    }
    if (ctx.path.startsWith('/api/')) {
      // 未匹配的 /api 路由：405 触发前端「本站仅作演示之用」提示
      return {
        data: fail('接口在演示环境中不可用'),
        status: 405,
        statusText: 'Method Not Allowed',
        headers: {},
        config,
        request: {},
      };
    }
    if (typeof originalAdapter === 'function') return originalAdapter(config);
    if (Array.isArray(originalAdapter)) {
      // 新版 axios 的 adapter 是数组，取浏览器端实现
      const browser = originalAdapter.find((a) => typeof a === 'function');
      if (browser) return browser(config);
    }
    throw new Error('No adapter available for non-API request in demo mode');
  };
}
