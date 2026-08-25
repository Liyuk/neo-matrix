import React, { useEffect, useState } from 'react';
import {
  Button,
  Container,
  Divider,
  Form,
  Header,
  Icon,
  Message,
  Modal,
  Segment,
  Table,
} from '../../ui/primitives';
import { API, showError, showSuccess } from '../../helpers';
import { useTranslation } from 'react-i18next';
import BrandMark from '../../ui/BrandMark';

const Settlement = () => {
  const { t } = useTranslation();
  const [settlements, setSettlements] = useState([]);
  const [withdrawals, setWithdrawals] = useState([]);
  const [showRun, setShowRun] = useState(false);
  const [period, setPeriod] = useState({
    period_start: Math.floor(Date.now() / 1000) - 86400,
    period_end: Math.floor(Date.now() / 1000),
  });
  const [withdrawalForm, setWithdrawalForm] = useState({ id: 0, status: 0, reason: '' });

  const loadAll = async () => {
    try {
      const sRes = await API.get('/api/settlement/');
      const res = sRes.data;
      if (res.success) setSettlements(res.data || []);
    } catch (err) {
      showError('加载结算失败：' + err.message);
    }
    try {
      const wRes = await API.get('/api/withdrawal/');
      const res = wRes.data;
      if (res.success) setWithdrawals(res.data || []);
    } catch (err) {
      showError('加载提现失败：' + err.message);
    }
  };

  useEffect(() => {
    loadAll();
  }, []);

  const runSettlement = async () => {
    try {
      const res = (await API.post('/api/settlement/run', period)).data;
      if (res.success) {
        showSuccess(`结算完成，生成 ${res.data.count} 条记录`);
        setShowRun(false);
        loadAll();
      } else {
        showError(res.message);
      }
    } catch (err) {
      showError('结算失败：' + err.message);
    }
  };

  const confirmSettlement = async (id) => {
    try {
      const res = (await API.put(`/api/settlement/${id}`, {})).data;
      if (res.success) {
        showSuccess('结算已确认');
        loadAll();
      } else {
        showError(res.message);
      }
    } catch (err) {
      showError('操作失败：' + err.message);
    }
  };

  const processWithdrawal = async () => {
    try {
      const res = (await API.put(`/api/withdrawal/${withdrawalForm.id}`, {
        status: withdrawalForm.status,
        reason: withdrawalForm.reason,
      })).data;
      if (res.success) {
        showSuccess('操作成功');
        setWithdrawalForm({ id: 0, status: 0, reason: '' });
        loadAll();
      } else {
        showError(res.message);
      }
    } catch (err) {
      showError('操作失败：' + err.message);
    }
  };

  const quotaToRMB = (quota) => (quota * 7.0 / 500000).toFixed(2);
  const statusText = (s) => (s === 2 ? '已入账' : s === 3 ? '对账异常' : '待结算');

  return (
    <Container>
      <div className='supplier-heading settlement-heading'>
        <BrandMark size='lg' label='Neo Matrix 结算与提现管理' />
        <div>
          <Header as='h2'>结算与提现管理</Header>
          <p>核对渠道账单、确认供给方收入，并处理提现申请。</p>
        </div>
        <div className='supplier-heading-actions'>
          <span className='settlement-flow-step'>待核验</span>
          <span>确认后进入可提现余额</span>
        </div>
      </div>

      <Segment>
        <Button primary onClick={() => setShowRun(true)}>
          <Icon name='play' /> 手动触发结算
        </Button>
      </Segment>

      <Divider horizontal>结算单</Divider>
      <Table basic='very' compact size='small'>
        <Table.Header>
          <Table.Row>
            <Table.HeaderCell>ID</Table.HeaderCell>
            <Table.HeaderCell>周期</Table.HeaderCell>
            <Table.HeaderCell>渠道</Table.HeaderCell>
            <Table.HeaderCell>零售额</Table.HeaderCell>
            <Table.HeaderCell>成本</Table.HeaderCell>
            <Table.HeaderCell>分成</Table.HeaderCell>
            <Table.HeaderCell>平台留存</Table.HeaderCell>
            <Table.HeaderCell>状态</Table.HeaderCell>
            <Table.HeaderCell>操作</Table.HeaderCell>
          </Table.Row>
        </Table.Header>
        <Table.Body>
          {settlements.length === 0 && (
            <Table.Row><Table.Cell colSpan={9} textAlign='center'>暂无结算单</Table.Cell></Table.Row>
          )}
          {settlements.map((s) => (
            <Table.Row key={s.id}>
              <Table.Cell>{s.id}</Table.Cell>
              <Table.Cell>
                {new Date(s.period_start * 1000).toLocaleDateString()} ~{' '}
                {new Date(s.period_end * 1000).toLocaleDateString()}
              </Table.Cell>
              <Table.Cell>{s.channel_id}</Table.Cell>
              <Table.Cell>{quotaToRMB(s.total_quota)}</Table.Cell>
              <Table.Cell>{quotaToRMB(s.cost_quota)}</Table.Cell>
              <Table.Cell>{quotaToRMB(s.revenue_quota)}</Table.Cell>
              <Table.Cell>{quotaToRMB(s.platform_quota)}</Table.Cell>
              <Table.Cell>{statusText(s.status)}</Table.Cell>
              <Table.Cell>
                {s.status === 3 && (
                  <Button
                    size='tiny'
                    color='orange'
                    onClick={() => confirmSettlement(s.id)}
                    title='对账异常，核验后确认入账'
                  >
                    核验入账
                  </Button>
                )}
                {s.status === 0 && (
                  <Button size='tiny' color='green' onClick={() => confirmSettlement(s.id)}>
                    确认入账
                  </Button>
                )}
              </Table.Cell>
            </Table.Row>
          ))}
        </Table.Body>
      </Table>

      <Divider horizontal>提现审核</Divider>
      <Table basic='very' compact size='small'>
        <Table.Header>
          <Table.Row>
            <Table.HeaderCell>ID</Table.HeaderCell>
            <Table.HeaderCell>用户</Table.HeaderCell>
            <Table.HeaderCell>金额</Table.HeaderCell>
            <Table.HeaderCell>方式</Table.HeaderCell>
            <Table.HeaderCell>状态</Table.HeaderCell>
            <Table.HeaderCell>操作</Table.HeaderCell>
          </Table.Row>
        </Table.Header>
        <Table.Body>
          {withdrawals.length === 0 && (
            <Table.Row><Table.Cell colSpan={6} textAlign='center'>暂无提现申请</Table.Cell></Table.Row>
          )}
          {withdrawals.map((w) => (
            <Table.Row key={w.id}>
              <Table.Cell>{w.id}</Table.Cell>
              <Table.Cell>{w.user_id}</Table.Cell>
              <Table.Cell>{quotaToRMB(w.amount_quota)}</Table.Cell>
              <Table.Cell>{w.pay_method} / {w.pay_account}</Table.Cell>
              <Table.Cell>
                {w.status === 2 ? '已打款' : w.status === 1 ? '打款中' : w.status === 3 ? '已驳回' : '待审核'}
              </Table.Cell>
              <Table.Cell>
                {w.status === 0 && (
                  <Button.Group size='tiny'>
                    <Button
                      color='green'
                      onClick={() => setWithdrawalForm({ id: w.id, status: 2, reason: '' })}
                    >
                      打款
                    </Button>
                    <Button
                      color='red'
                      onClick={() => setWithdrawalForm({ id: w.id, status: 3, reason: '驳回' })}
                    >
                      驳回
                    </Button>
                  </Button.Group>
                )}
              </Table.Cell>
            </Table.Row>
          ))}
        </Table.Body>
      </Table>

      {/* 手动结算弹窗 */}
      <Modal open={showRun} onClose={() => setShowRun(false)}>
        <Modal.Header>手动触发结算</Modal.Header>
        <Modal.Content>
          <Form>
            <Form.Input
              label='周期开始（unix 秒）'
              value={period.period_start}
              onChange={(e, { value }) => setPeriod({ ...period, period_start: parseInt(value) || 0 })}
            />
            <Form.Input
              label='周期结束（unix 秒）'
              value={period.period_end}
              onChange={(e, { value }) => setPeriod({ ...period, period_end: parseInt(value) || 0 })}
            />
          </Form>
        </Modal.Content>
        <Modal.Actions>
          <Button onClick={() => setShowRun(false)}>取消</Button>
          <Button primary onClick={runSettlement}>执行结算</Button>
        </Modal.Actions>
      </Modal>

      {/* 提现审核弹窗 */}
      <Modal open={withdrawalForm.id !== 0} onClose={() => setWithdrawalForm({ id: 0, status: 0, reason: '' })}>
        <Modal.Header>处理提现 #{withdrawalForm.id}</Modal.Header>
        <Modal.Content>
          <Form>
            <Form.Input
              label='备注/驳回原因'
              value={withdrawalForm.reason}
              onChange={(e, { value }) => setWithdrawalForm({ ...withdrawalForm, reason: value })}
            />
            {withdrawalForm.status === 3 && (
              <Message warning>驳回后金额将退回供给方可提现余额。</Message>
            )}
          </Form>
        </Modal.Content>
        <Modal.Actions>
          <Button onClick={() => setWithdrawalForm({ id: 0, status: 0, reason: '' })}>取消</Button>
          <Button
            color={withdrawalForm.status === 2 ? 'green' : 'red'}
            onClick={processWithdrawal}
          >
            {withdrawalForm.status === 2 ? '确认打款' : '确认驳回'}
          </Button>
        </Modal.Actions>
      </Modal>
    </Container>
  );
};

export default Settlement;
