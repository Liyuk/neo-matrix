import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Button,
  Card,
  Container,
  Divider,
  Form,
  Grid,
  Header,
  Icon,
  Message,
  Modal,
  Segment,
  Statistic,
  Table,
} from 'semantic-ui-react';
import { API, showError, showSuccess } from '../../helpers';
import { useTranslation } from 'react-i18next';

const Supplier = () => {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [supplier, setSupplier] = useState(null);
  const [channels, setChannels] = useState([]);
  const [settlements, setSettlements] = useState([]);
  const [withdrawals, setWithdrawals] = useState([]);

  // 提交 Key 表单
  const [showAdd, setShowAdd] = useState(false);
  const [addForm, setAddForm] = useState({
    type: 1,
    name: '',
    key: '',
    base_url: '',
    models: '',
    cost_ratio: 1.0,
  });
  // 提现表单
  const [showWithdraw, setShowWithdraw] = useState(false);
  const [withdrawForm, setWithdrawForm] = useState({
    amount_quota: 0,
    pay_method: '',
    pay_account: '',
  });

  const loadSupplier = async () => {
    setLoading(true);
    try {
      const res = await API.get('/api/supplier/self');
      if (res.success) {
        setSupplier(res.data);
      } else {
        showError(res.message);
        navigate('/');
      }
    } catch (err) {
      showError('加载供给方信息失败：' + err.message);
    }
    setLoading(false);
  };

  const loadDashboard = async () => {
    try {
      const res = await API.get('/api/supplier/dashboard');
      if (res.success) {
        setSupplier(res.data.supplier);
        setChannels(res.data.channels || []);
        setSettlements(res.data.settlements || []);
      } else {
        showError(res.message);
      }
    } catch (err) {
      showError('加载看板失败：' + err.message);
    }
  };

  const loadWithdrawals = async () => {
    try {
      const res = await API.get('/api/supplier/withdrawals');
      if (res.success) {
        setWithdrawals(res.data || []);
      }
    } catch (err) {
      showError('加载提现记录失败：' + err.message);
    }
  };

  useEffect(() => {
    loadSupplier();
    loadDashboard();
    loadWithdrawals();
  }, []);

  const submitChannel = async () => {
    if (!addForm.name || !addForm.key || !addForm.models) {
      showError('请填写名称、API Key 和模型列表');
      return;
    }
    try {
      const res = await API.post('/api/supplier/channel', addForm);
      if (res.success) {
        showSuccess('渠道创建成功');
        setShowAdd(false);
        setAddForm({ type: 1, name: '', key: '', base_url: '', models: '', cost_ratio: 1.0 });
        loadDashboard();
      } else {
        showError(res.message);
      }
    } catch (err) {
      showError('提交失败：' + err.message);
    }
  };

  const deleteChannel = async (id) => {
    try {
      const res = await API.delete(`/api/supplier/channel/${id}`);
      if (res.success) {
        showSuccess('删除成功');
        loadDashboard();
      } else {
        showError(res.message);
      }
    } catch (err) {
      showError('删除失败：' + err.message);
    }
  };

  const submitWithdraw = async () => {
    if (!withdrawForm.pay_method || !withdrawForm.pay_account || withdrawForm.amount_quota <= 0) {
      showError('请填写收款方式、账号和提现金额');
      return;
    }
    try {
      const res = await API.post('/api/supplier/withdraw', withdrawForm);
      if (res.success) {
        showSuccess('提现申请已提交');
        setShowWithdraw(false);
        loadDashboard();
        loadWithdrawals();
      } else {
        showError(res.message);
      }
    } catch (err) {
      showError('提现失败：' + err.message);
    }
  };

  const quotaToRMB = (quota) => (quota * 7.0 / 500000).toFixed(2);

  if (loading) {
    return <Container><Segment loading>加载中...</Segment></Container>;
  }

  return (
    <Container>
      <Header as='h2' icon>
        <Icon name='share alternate' />
        供给方中心
        <Header.Subheader>把闲置的 API Key 托管到这里，按用量获得分成</Header.Subheader>
      </Header>
      {supplier && (
        <Grid stackable columns={4}>
          <Grid.Column>
            <Statistic color='green'>
              <Statistic.Value>{quotaToRMB(supplier.withdraw_balance)}</Statistic.Value>
              <Statistic.Label>可提现余额（元）</Statistic.Label>
            </Statistic>
          </Grid.Column>
          <Grid.Column>
            <Statistic color='blue'>
              <Statistic.Value>{quotaToRMB(supplier.settling_balance)}</Statistic.Value>
              <Statistic.Label>结算中（元）</Statistic.Label>
            </Statistic>
          </Grid.Column>
          <Grid.Column>
            <Statistic color='teal'>
              <Statistic.Value>{quotaToRMB(supplier.total_income)}</Statistic.Value>
              <Statistic.Label>累计收益（元）</Statistic.Label>
            </Statistic>
          </Grid.Column>
          <Grid.Column>
            <Statistic>
              <Statistic.Value>{(supplier.platform_ratio * 100).toFixed(0)}%</Statistic.Value>
              <Statistic.Label>平台抽成（利润）</Statistic.Label>
            </Statistic>
          </Grid.Column>
        </Grid>
      )}

      <Segment>
        <Grid columns={2}>
          <Grid.Column>
            <Button primary onClick={() => setShowAdd(true)}>
              <Icon name='plus' /> 提交 API Key
            </Button>
          </Grid.Column>
          <Grid.Column textAlign='right'>
            <Button color='green' onClick={() => setShowWithdraw(true)}>
              <Icon name='money bill alternate outline' /> 申请提现
            </Button>
          </Grid.Column>
        </Grid>
      </Segment>

      <Divider horizontal>我的托管渠道</Divider>
      <Table basic='very' compact>
        <Table.Header>
          <Table.Row>
            <Table.HeaderCell>名称</Table.HeaderCell>
            <Table.HeaderCell>模型</Table.HeaderCell>
            <Table.HeaderCell>成本倍率</Table.HeaderCell>
            <Table.HeaderCell>状态</Table.HeaderCell>
            <Table.HeaderCell>操作</Table.HeaderCell>
          </Table.Row>
        </Table.Header>
        <Table.Body>
          {channels.length === 0 && (
            <Table.Row>
              <Table.Cell colSpan={5} textAlign='center'>还没有托管渠道</Table.Cell>
            </Table.Row>
          )}
          {channels.map((ch) => (
            <Table.Row key={ch.id}>
              <Table.Cell>{ch.name}</Table.Cell>
              <Table.Cell>{ch.models}</Table.Cell>
              <Table.Cell>{ch.cost_ratio}</Table.Cell>
              <Table.Cell>{ch.status === 1 ? '启用' : ch.status === 3 ? '已禁用' : '停用'}</Table.Cell>
              <Table.Cell>
                <Button size='tiny' negative onClick={() => deleteChannel(ch.id)}>删除</Button>
              </Table.Cell>
            </Table.Row>
          ))}
        </Table.Body>
      </Table>

      <Divider horizontal>最近结算</Divider>
      <Table basic='very' compact size='small'>
        <Table.Header>
          <Table.Row>
            <Table.HeaderCell>周期</Table.HeaderCell>
            <Table.HeaderCell>零售额（元）</Table.HeaderCell>
            <Table.HeaderCell>成本（元）</Table.HeaderCell>
            <Table.HeaderCell>分成（元）</Table.HeaderCell>
            <Table.HeaderCell>状态</Table.HeaderCell>
          </Table.Row>
        </Table.Header>
        <Table.Body>
          {settlements.length === 0 && (
            <Table.Row>
              <Table.Cell colSpan={5} textAlign='center'>暂无结算记录</Table.Cell>
            </Table.Row>
          )}
          {settlements.slice(0, 5).map((s) => (
            <Table.Row key={s.id}>
              <Table.Cell>{new Date(s.period_start * 1000).toLocaleDateString()}</Table.Cell>
              <Table.Cell>{quotaToRMB(s.total_quota)}</Table.Cell>
              <Table.Cell>{quotaToRMB(s.cost_quota)}</Table.Cell>
              <Table.Cell>{quotaToRMB(s.revenue_quota)}</Table.Cell>
              <Table.Cell>
                {s.status === 2 ? '已入账' : s.status === 1 ? '已确认' : s.status === 3 ? '异常' : '待结算'}
              </Table.Cell>
            </Table.Row>
          ))}
        </Table.Body>
      </Table>

      <Divider horizontal>提现记录</Divider>
      <Table basic='very' compact size='small'>
        <Table.Header>
          <Table.Row>
            <Table.HeaderCell>金额（元）</Table.HeaderCell>
            <Table.HeaderCell>方式</Table.HeaderCell>
            <Table.HeaderCell>状态</Table.HeaderCell>
            <Table.HeaderCell>备注</Table.HeaderCell>
          </Table.Row>
        </Table.Header>
        <Table.Body>
          {withdrawals.length === 0 && (
            <Table.Row>
              <Table.Cell colSpan={4} textAlign='center'>暂无提现记录</Table.Cell>
            </Table.Row>
          )}
          {withdrawals.map((w) => (
            <Table.Row key={w.id}>
              <Table.Cell>{quotaToRMB(w.amount_quota)}</Table.Cell>
              <Table.Cell>{w.pay_method} / {w.pay_account}</Table.Cell>
              <Table.Cell>
                {w.status === 2 ? '已打款' : w.status === 1 ? '打款中' : w.status === 3 ? '已驳回' : '待审核'}
              </Table.Cell>
              <Table.Cell>{w.reason || ''}</Table.Cell>
            </Table.Row>
          ))}
        </Table.Body>
      </Table>

      {/* 提交 Key 弹窗 */}
      <Modal open={showAdd} onClose={() => setShowAdd(false)}>
        <Modal.Header>提交 API Key</Modal.Header>
        <Modal.Content>
          <Form>
            <Form.Input
              label='渠道名称'
              placeholder='例如：我的 OpenAI Key'
              value={addForm.name}
              onChange={(e, { value }) => setAddForm({ ...addForm, name: value })}
            />
            <Form.Input
              label='API Key'
              placeholder='sk-...'
              value={addForm.key}
              onChange={(e, { value }) => setAddForm({ ...addForm, key: value })}
            />
            <Form.Input
              label='模型列表（逗号分隔）'
              placeholder='gpt-4o,gpt-4o-mini'
              value={addForm.models}
              onChange={(e, { value }) => setAddForm({ ...addForm, models: value })}
            />
            <Form.Input
              label='Base URL（可选）'
              placeholder='留空使用默认'
              value={addForm.base_url}
              onChange={(e, { value }) => setAddForm({ ...addForm, base_url: value })}
            />
            <Form.Input
              label='成本倍率（平台据此调度，1.0 = 官方原价）'
              type='number'
              step='0.01'
              min='0.01'
              value={addForm.cost_ratio}
              onChange={(e, { value }) => setAddForm({ ...addForm, cost_ratio: parseFloat(value) || 1.0 })}
            />
            <Message info>提交后平台会自动校验 Key 有效性，无效 Key 会被拒绝。</Message>
          </Form>
        </Modal.Content>
        <Modal.Actions>
          <Button onClick={() => setShowAdd(false)}>取消</Button>
          <Button primary onClick={submitChannel}>提交</Button>
        </Modal.Actions>
      </Modal>

      {/* 提现弹窗 */}
      <Modal open={showWithdraw} onClose={() => setShowWithdraw(false)}>
        <Modal.Header>申请提现</Modal.Header>
        <Modal.Content>
          <Form>
            <Form.Input
              label='提现额度（quota）'
              type='number'
              min='0'
              value={withdrawForm.amount_quota}
              onChange={(e, { value }) => setWithdrawForm({ ...withdrawForm, amount_quota: parseInt(value) || 0 })}
            />
            {supplier && (
              <p style={{ color: 'grey' }}>
                可提现余额：{quotaToRMB(supplier.withdraw_balance)} 元（{supplier.withdraw_balance} quota）
              </p>
            )}
            <Form.Input
              label='收款方式'
              placeholder='支付宝 / 微信 / 银行卡'
              value={withdrawForm.pay_method}
              onChange={(e, { value }) => setWithdrawForm({ ...withdrawForm, pay_method: value })}
            />
            <Form.Input
              label='收款账号'
              value={withdrawForm.pay_account}
              onChange={(e, { value }) => setWithdrawForm({ ...withdrawForm, pay_account: value })}
            />
          </Form>
        </Modal.Content>
        <Modal.Actions>
          <Button onClick={() => setShowWithdraw(false)}>取消</Button>
          <Button color='green' onClick={submitWithdraw}>提交申请</Button>
        </Modal.Actions>
      </Modal>
    </Container>
  );
};

export default Supplier;
