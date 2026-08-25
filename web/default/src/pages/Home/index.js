import React, { useContext, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Badge, Button, Card, Grid, Header, Icon } from '../../ui/primitives';
import { API, showError, showNotice, timestamp2string } from '../../helpers';
import { StatusContext } from '../../context/Status';
import { marked } from 'marked';
import { UserContext } from '../../context/User';
import { Link } from 'react-router-dom';

const MODEL_LANES = [
  { name: 'GPT', provider: 'OpenAI', icon: 'sparkles', tone: 'info', hint: '通用对话与工具调用' },
  { name: 'Claude', provider: 'Anthropic', icon: 'message', tone: 'primary', hint: '长上下文与深度推理' },
  { name: 'Grok', provider: 'xAI', icon: 'orbit', tone: 'neutral', hint: '实时信息与探索' },
  { name: 'Gemini', provider: 'Google', icon: 'layers', tone: 'success', hint: '多模态与快速响应' },
];

const MODEL_CATALOG = [
  { name: 'gpt-4o', family: 'GPT', description: '旗舰多模态模型', tone: 'info' },
  { name: 'gpt-4o-mini', family: 'GPT', description: '低成本、快速响应', tone: 'info' },
  { name: 'claude-3-5-sonnet', family: 'Claude', description: '长上下文与复杂推理', tone: 'primary' },
  { name: 'gemini-1.5-pro', family: 'Gemini', description: '多模态长上下文', tone: 'success' },
  { name: 'grok-3', family: 'Grok', description: '实时探索与分析', tone: 'neutral' },
  { name: 'deepseek-reasoner', family: 'DeepSeek', description: '深度推理模型', tone: 'warning' },
  { name: 'qwen-max', family: 'Qwen', description: '中文与通用任务', tone: 'warning' },
  { name: 'doubao-pro', family: '豆包', description: '中文对话与创作', tone: 'neutral' },
];

const Home = () => {
  const { t } = useTranslation();
  const [statusState, statusDispatch] = useContext(StatusContext);
  const [homePageContentLoaded, setHomePageContentLoaded] = useState(false);
  const [homePageContent, setHomePageContent] = useState('');
  const [userState] = useContext(UserContext);

  const displayNotice = async () => {
    const res = await API.get('/api/notice');
    const { success, message, data } = res.data;
    if (success) {
      let oldNotice = localStorage.getItem('notice');
      if (data !== oldNotice && data !== '') {
        const htmlNotice = marked(data);
        showNotice(htmlNotice, true);
        localStorage.setItem('notice', data);
      }
    } else {
      showError(message);
    }
  };

  const displayHomePageContent = async () => {
    setHomePageContent(localStorage.getItem('home_page_content') || '');
    const res = await API.get('/api/home_page_content');
    const { success, message, data } = res.data;
    if (success) {
      let content = data;
      if (!data.startsWith('https://')) {
        content = marked.parse(data);
      }
      setHomePageContent(content);
      localStorage.setItem('home_page_content', content);
    } else {
      showError(message);
      setHomePageContent(t('home.loading_failed'));
    }
    setHomePageContentLoaded(true);
  };

  const getStartTimeString = () => {
    const timestamp = statusState?.status?.start_time;
    return timestamp2string(timestamp);
  };

  useEffect(() => {
    displayNotice().then();
    displayHomePageContent().then();
  }, []);

  const showEmbeddedHome = homePageContent.startsWith('https://');

  return (
    <div className='home-page'>
      {!showEmbeddedHome ? (
        <section className='home-hero'>
          <div className='home-hero-copy'>
            <Badge tone='neutral'>Neo Matrix · Unified model gateway</Badge>
            <h1>一个入口，连接你的全部模型。</h1>
            <p>
              用统一的 API Token 访问 GPT、Claude、Grok 和 Gemini；让路由、成本、供给与结算都在一个控制台里清晰可见。
            </p>
            <div className='home-hero-actions'>
              <Button as={Link} to={userState.user ? '/token' : '/login'} size='lg'>
                {userState.user ? '进入模型工作台' : '开始使用'}
              </Button>
              <Button as={Link} to='/about' variant='secondary' size='lg'>了解 Neo Matrix</Button>
            </div>
          </div>
          <div className='home-hero-orbit' aria-hidden='true'>
            <div className='home-orbit-core'><Icon name='sparkles' /></div>
            <span className='home-orbit-node home-orbit-node-a'>GPT</span>
            <span className='home-orbit-node home-orbit-node-b'>Claude</span>
            <span className='home-orbit-node home-orbit-node-c'>Grok</span>
            <span className='home-orbit-node home-orbit-node-d'>Gemini</span>
          </div>
        </section>
      ) : null}

      {!showEmbeddedHome ? (
        <section className='model-lanes' aria-label='模型接入概览'>
          {MODEL_LANES.map((model) => (
            <Card key={model.name} className={`model-lane model-lane-${model.tone}`}>
              <Card.Content>
                <div className='model-lane-icon'><Icon name={model.icon} /></div>
                <div className='model-lane-copy'>
                  <strong>{model.name}</strong>
                  <span>{model.provider}</span>
                  <small>{model.hint}</small>
                </div>
                <Badge tone={model.tone === 'primary' ? 'warning' : model.tone}>{model.tone === 'primary' ? '主力' : '已接入'}</Badge>
              </Card.Content>
            </Card>
          ))}
        </section>
      ) : null}

      {!showEmbeddedHome ? (
        <section className='model-catalog-section' aria-labelledby='model-catalog-title'>
          <div className='section-heading-row'>
            <div>
              <span className='section-kicker'>MODEL CATALOG</span>
              <h2 id='model-catalog-title'>常用模型清单</h2>
              <p>统一入口支持多家模型，使用同一个平台令牌即可切换。</p>
            </div>
            <Button as={Link} to='/token' variant='ghost' size='sm'>查看我的令牌 →</Button>
          </div>
          <div className='model-catalog-grid'>
            {MODEL_CATALOG.map((model) => (
              <div className='model-catalog-item' key={model.name}>
                <div className={`model-catalog-dot model-catalog-dot-${model.tone}`} />
                <div className='model-catalog-copy'><strong>{model.name}</strong><span>{model.family} · {model.description}</span></div>
                <span className='model-catalog-arrow' aria-hidden='true'>↗</span>
              </div>
            ))}
          </div>
        </section>
      ) : null}

      {homePageContentLoaded && homePageContent === '' ? (
        <div className='dashboard-container'>
          <Card fluid className='chart-card'>
            <Card.Content>
              <Card.Header className='header'>
                {t('home.welcome.title')}
              </Card.Header>
              <Card.Description style={{ lineHeight: '1.6' }}>
                <p>{t('home.welcome.description')}</p>
                {!userState.user && <p>{t('home.welcome.login_notice')}</p>}
              </Card.Description>
            </Card.Content>
          </Card>
          <Card fluid className='chart-card'>
            <Card.Content>
              <Card.Header>
                <Header as='h3'>{t('home.system_status.title')}</Header>
              </Card.Header>
              <Grid columns={2} stackable>
                <Grid.Column>
                  <Card
                    fluid
                    className='chart-card'
                    style={{ boxShadow: '0 1px 3px rgba(0,0,0,0.12)' }}
                  >
                    <Card.Content>
                      <Card.Header>
                        <Header as='h3' style={{ color: '#444' }}>
                          {t('home.system_status.info.title')}
                        </Header>
                      </Card.Header>
                      <Card.Description
                        style={{ lineHeight: '2', marginTop: '1em' }}
                      >
                        <p
                          style={{
                            display: 'flex',
                            alignItems: 'center',
                            gap: '0.5em',
                          }}
                        >
                          <Icon name='info' />
                          <span style={{ fontWeight: 'bold' }}>
                            {t('home.system_status.info.name')}
                          </span>
                          <span>{statusState?.status?.system_name}</span>
                        </p>
                        <p
                          style={{
                            display: 'flex',
                            alignItems: 'center',
                            gap: '0.5em',
                          }}
                        >
                          <Icon name='code branch' />
                          <span style={{ fontWeight: 'bold' }}>
                            {t('home.system_status.info.version')}
                          </span>
                          <span>
                            {statusState?.status?.version || 'unknown'}
                          </span>
                        </p>
                        <p
                          style={{
                            display: 'flex',
                            alignItems: 'center',
                            gap: '0.5em',
                          }}
                        >
                          <Icon name='github' />
                          <span style={{ fontWeight: 'bold' }}>
                            {t('home.system_status.info.source')}
                          </span>
                          <a
                            href='https://github.com/songquanpeng/one-api'
                            target='_blank'
                            style={{ color: '#2185d0' }}
                          >
                            {t('home.system_status.info.source_link')}
                          </a>
                        </p>
                        <p
                          style={{
                            display: 'flex',
                            alignItems: 'center',
                            gap: '0.5em',
                          }}
                        >
                          <Icon name='clock outline' />
                          <span style={{ fontWeight: 'bold' }}>
                            {t('home.system_status.info.start_time')}
                          </span>
                          <span>{getStartTimeString()}</span>
                        </p>
                      </Card.Description>
                    </Card.Content>
                  </Card>
                </Grid.Column>

                <Grid.Column>
                  <Card
                    fluid
                    className='chart-card'
                    style={{ boxShadow: '0 1px 3px rgba(0,0,0,0.12)' }}
                  >
                    <Card.Content>
                      <Card.Header>
                        <Header as='h3' style={{ color: '#444' }}>
                          {t('home.system_status.config.title')}
                        </Header>
                      </Card.Header>
                      <Card.Description
                        style={{ lineHeight: '2', marginTop: '1em' }}
                      >
                        <p
                          style={{
                            display: 'flex',
                            alignItems: 'center',
                            gap: '0.5em',
                          }}
                        >
                          <Icon name='envelope' />
                          <span style={{ fontWeight: 'bold' }}>
                            {t('home.system_status.config.email_verify')}
                          </span>
                          <span
                            style={{
                              color: statusState?.status?.email_verification
                                ? '#21ba45'
                                : '#db2828',
                              fontWeight: '500',
                            }}
                          >
                            {statusState?.status?.email_verification
                              ? t('home.system_status.config.enabled')
                              : t('home.system_status.config.disabled')}
                          </span>
                        </p>
                        <p
                          style={{
                            display: 'flex',
                            alignItems: 'center',
                            gap: '0.5em',
                          }}
                        >
                          <Icon name='github' />
                          <span style={{ fontWeight: 'bold' }}>
                            {t('home.system_status.config.github_oauth')}
                          </span>
                          <span
                            style={{
                              color: statusState?.status?.github_oauth
                                ? '#21ba45'
                                : '#db2828',
                              fontWeight: '500',
                            }}
                          >
                            {statusState?.status?.github_oauth
                              ? t('home.system_status.config.enabled')
                              : t('home.system_status.config.disabled')}
                          </span>
                        </p>
                        <p
                          style={{
                            display: 'flex',
                            alignItems: 'center',
                            gap: '0.5em',
                          }}
                        >
                          <Icon name='wechat' />
                          <span style={{ fontWeight: 'bold' }}>
                            {t('home.system_status.config.wechat_login')}
                          </span>
                          <span
                            style={{
                              color: statusState?.status?.wechat_login
                                ? '#21ba45'
                                : '#db2828',
                              fontWeight: '500',
                            }}
                          >
                            {statusState?.status?.wechat_login
                              ? t('home.system_status.config.enabled')
                              : t('home.system_status.config.disabled')}
                          </span>
                        </p>
                        <p
                          style={{
                            display: 'flex',
                            alignItems: 'center',
                            gap: '0.5em',
                          }}
                        >
                          <Icon name='shield alternate' />
                          <span style={{ fontWeight: 'bold' }}>
                            {t('home.system_status.config.turnstile')}
                          </span>
                          <span
                            style={{
                              color: statusState?.status?.turnstile_check
                                ? '#21ba45'
                                : '#db2828',
                              fontWeight: '500',
                            }}
                          >
                            {statusState?.status?.turnstile_check
                              ? t('home.system_status.config.enabled')
                              : t('home.system_status.config.disabled')}
                          </span>
                        </p>
                      </Card.Description>
                    </Card.Content>
                  </Card>
                </Grid.Column>
              </Grid>
            </Card.Content>
          </Card>
        </div>
      ) : (
        <>
          {homePageContent.startsWith('https://') ? (
            <iframe
              src={homePageContent}
              style={{ width: '100%', height: '100vh', border: 'none' }}
            />
          ) : (
            <div
              style={{ fontSize: 'larger' }}
              dangerouslySetInnerHTML={{ __html: homePageContent }}
            ></div>
          )}
        </>
      )}
    </div>
  );
};

export default Home;
