import React, { useContext, useEffect, useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { UserContext } from '../context/User';
import { StatusContext } from '../context/Status';
import { API, getFooterHTML, getLogo, getSystemName, showSuccess } from '../helpers';
import { Button, Icon } from '../ui';
import { getIcon } from '../ui/Icon';

const DEMO_PERSONAS = [
  { value: 'admin', label: '管理员' },
  { value: 'supplier', label: '供给方' },
  { value: 'consumer', label: '消费者' },
];

const NAV_ITEMS = [
  { name: 'header.home', to: '/', icon: 'home', primary: true },
  { name: 'header.token', to: '/token', icon: 'key', primary: true },
  { name: 'header.chat', to: '/chat', icon: 'comments', optional: true, primary: true },
  { name: 'header.dashboard', to: '/dashboard', icon: 'bar chart', primary: true },
  { name: 'header.supplier', to: '/supplier', icon: 'share', primary: true },
  { name: 'header.settlement', to: '/settlement', icon: 'balance scale', admin: true, primary: true, adminPanel: true },
  { name: 'header.channel', to: '/channel', icon: 'sitemap', admin: true, adminPanel: true },
  { name: 'header.redemption', to: '/redemption', icon: 'dollar', admin: true, adminPanel: true },
  { name: 'header.topup', to: '/topup', icon: 'cart', primary: true },
  { name: 'header.user', to: '/user', icon: 'users', admin: true, adminPanel: true },
  { name: 'header.log', to: '/log', icon: 'book', admin: true, adminPanel: true },
  { name: 'header.setting', to: '/setting', icon: 'setting', admin: true, adminPanel: true },
  { name: 'header.about', to: '/about', icon: 'info', primary: true },
];

function getUser() {
  try {
    return JSON.parse(localStorage.getItem('user') || 'null');
  } catch (_) {
    return null;
  }
}

function Header() {
  const { t, i18n } = useTranslation();
  const userValue = useContext(UserContext);
  const userState = Array.isArray(userValue) ? userValue[0] : userValue;
  const userDispatch = Array.isArray(userValue) ? userValue[1] : () => {};
  const navigate = useNavigate();
  const location = useLocation();
  const [mobileOpen, setMobileOpen] = useState(false);
  const [languageOpen, setLanguageOpen] = useState(false);
  const [mobile, setMobile] = useState(() => window.innerWidth <= 600);
  const statusValue = useContext(StatusContext);
  const statusState = Array.isArray(statusValue) ? statusValue[0] : statusValue;
  const systemName = getSystemName();
  const logo = getLogo();
  const user = userState.user || getUser();
  const admin = Boolean(user && user.role >= 10);
  const items = NAV_ITEMS.filter((item) => {
    if (item.optional && !(statusState?.status?.chat_link || localStorage.getItem('chat_link'))) return false;
    return !item.admin || admin;
  });
  const primaryItems = items.filter((item) => item.primary && !item.adminPanel);
  const moreItems = items.filter((item) => !item.primary || item.adminPanel);
  const utilityItems = admin
    ? moreItems.filter((item) => !item.adminPanel)
    : items.filter((item) => !item.primary);

  useEffect(() => {
    const updateViewport = () => setMobile(window.innerWidth <= 600);
    window.addEventListener('resize', updateViewport);
    return () => window.removeEventListener('resize', updateViewport);
  }, []);

  async function logout() {
    setMobileOpen(false);
    await API.get('/api/user/logout');
    showSuccess('注销成功!');
    userDispatch({ type: 'logout' });
    localStorage.removeItem('user');
    navigate('/login');
  }

  function changeLanguage(language) {
    i18n.changeLanguage(language);
    setLanguageOpen(false);
  }

  function changeDemoPersona(persona) {
    const url = new URL(window.location.href);
    url.searchParams.set('demo_user', persona);
    window.location.assign(url.toString());
  }

  function renderLinks(linkItems = items, mobile = false) {
    return linkItems.map((item) => {
      const active = item.to === '/' ? location.pathname === '/' : location.pathname.startsWith(item.to);
      return (
        <Link
          key={item.name}
          to={item.to}
          className={`nm-shell-link${active ? ' nm-shell-link-active' : ''}`}
          onClick={() => mobile && setMobileOpen(false)}
        >
          <Icon icon={getIcon(item.icon)} size={15} />
          <span>{t(item.name)}</span>
        </Link>
      );
    });
  }

  return (
    <header className='nm-shell-header'>
      <div className='nm-shell-nav'>
        <Link to='/' className='nm-shell-brand' onClick={() => setMobileOpen(false)}>
          <img className='nm-shell-logo' src={logo} alt='' />
          <span>{systemName}</span>
        </Link>
        {!mobile ? (
          <nav className='nm-shell-links' aria-label='主导航'>
            {renderLinks(primaryItems)}
            {utilityItems.length ? (
              <div className='nm-shell-menu-wrap'>
                <Button variant='ghost' size='sm' aria-expanded={languageOpen === 'utility'} onClick={() => setLanguageOpen(languageOpen === 'utility' ? false : 'utility')}>
                  <span>更多</span>
                  <span aria-hidden='true'>···</span>
                </Button>
                {languageOpen === 'utility' ? <div className='nm-shell-popover'>{renderLinks(utilityItems)}</div> : null}
              </div>
            ) : null}
          </nav>
        ) : null}
        <div className='nm-shell-actions'>
          {process.env.REACT_APP_DEMO === 'true' ? (
            <label className='nm-demo-persona'>
              <span>演示身份</span>
              <select
                aria-label='切换演示身份'
                value={new URLSearchParams(window.location.search).get('demo_user') || 'admin'}
                onChange={(event) => changeDemoPersona(event.target.value)}
              >
                {DEMO_PERSONAS.map((persona) => (
                  <option key={persona.value} value={persona.value}>{persona.label}</option>
                ))}
              </select>
            </label>
          ) : null}
          <div className='nm-language-wrap'>
            <Button
              variant='ghost'
              size='sm'
              aria-expanded={languageOpen === 'language'}
              onClick={() => setLanguageOpen(languageOpen === 'language' ? false : 'language')}
            >
              <Icon icon={getIcon('language')} size={15} />
              <span>{i18n.language === 'zh' ? '中文' : 'EN'}</span>
            </Button>
            {languageOpen === 'language' ? (
              <div className='nm-language-menu' role='menu'>
                <button type='button' onClick={() => changeLanguage('zh')}>中文</button>
                <button type='button' onClick={() => changeLanguage('en')}>English</button>
              </div>
            ) : null}
          </div>
          {user ? (
            <>
              <span className='nm-shell-user'>{user.username}</span>
              <Button variant='ghost' size='sm' onClick={logout}>
                <Icon icon={getIcon('logout')} size={15} />
                <span>{t('header.logout')}</span>
              </Button>
            </>
          ) : (
            <Button as={Link} to='/login' variant='ghost' size='sm'>
              <Icon icon={getIcon('login')} size={15} />
              <span>{t('header.login')}</span>
            </Button>
          )}
        </div>
        <Button
          variant='ghost'
          size='sm'
          className='nm-menu-button'
          aria-label={mobileOpen ? '关闭导航' : '打开导航'}
          aria-expanded={mobileOpen}
          onClick={() => setMobileOpen((open) => !open)}
        >
          <Icon icon={getIcon(mobileOpen ? 'close' : 'menu')} size={18} />
        </Button>
      </div>
      {mobileOpen ? (
        <div className='nm-mobile-panel'>
          <nav aria-label='移动端主导航'>{renderLinks(items, true)}</nav>
          <div className='nm-mobile-actions'>
            <Button variant='secondary' size='sm' onClick={() => changeLanguage('zh')}>中文</Button>
            <Button variant='secondary' size='sm' onClick={() => changeLanguage('en')}>English</Button>
            {user ? (
              <Button variant='ghost' size='sm' onClick={logout}>{t('header.logout')}</Button>
            ) : (
              <>
                <Button as={Link} to='/login' variant='ghost' size='sm' onClick={() => setMobileOpen(false)}>
                  {t('header.login')}
                </Button>
                <Button as={Link} to='/register' variant='ghost' size='sm' onClick={() => setMobileOpen(false)}>
                  {t('header.register')}
                </Button>
              </>
            )}
          </div>
        </div>
      ) : null}
    </header>
  );
}

function AdminSidebar() {
  const { t } = useTranslation();
  const location = useLocation();
  const user = getUser();
  const links = NAV_ITEMS.filter((item) => item.adminPanel);
  const showOnHome = location.pathname === '/';
  if (!user || user.role < 10 || (!showOnHome && !links.some((item) => location.pathname.startsWith(item.to)))) return null;
  return (
    <aside className='nm-admin-sidebar' aria-label='管理工作台'>
      <div className='nm-admin-sidebar-label'>ADMIN WORKSPACE</div>
      <div className='nm-admin-sidebar-title'>管理工作台</div>
      <nav>
        {links.map((item) => {
          const active = location.pathname.startsWith(item.to);
          return (
            <Link key={item.name} to={item.to} className={`nm-admin-link${active ? ' nm-admin-link-active' : ''}`}>
              <Icon icon={getIcon(item.icon)} size={15} />
              <span>{t(item.name)}</span>
            </Link>
          );
        })}
      </nav>
      <div className='nm-admin-sidebar-note'>
        运营数据、渠道健康、结算与用户管理集中在这里。
      </div>
    </aside>
  );
}

function Footer() {
  const { t } = useTranslation();
  const statusValue = useContext(StatusContext);
  const statusState = Array.isArray(statusValue) ? statusValue[0] : statusValue;
  const [footer, setFooter] = React.useState(getFooterHTML());
  const systemName = statusState?.status?.system_name || getSystemName();

  const configuredFooter = statusState?.status?.footer_html;

  React.useEffect(() => {
    if (configuredFooter !== undefined) setFooter(configuredFooter || null);
  }, [configuredFooter]);

  React.useEffect(() => {
    let checks = 5;
    const timer = setInterval(() => {
      setFooter(localStorage.getItem('footer_html') || null);
      checks -= 1;
      if (checks <= 0) clearInterval(timer);
    }, 200);
    return () => clearInterval(timer);
  }, []);

  return (
    <footer className='nm-shell-footer'>
      {footer ? (
        <div className='custom-footer' dangerouslySetInnerHTML={{ __html: footer }} />
      ) : (
        <div className='custom-footer'>
          {systemName} {process.env.REACT_APP_VERSION} {t('footer.based_on')}
          <a href='https://github.com/songquanpeng/one-api' target='_blank' rel='noreferrer'>One API</a>
          {t('footer.license')}
          <a href='https://opensource.org/licenses/MIT' target='_blank' rel='noreferrer'>{t('footer.mit')}</a>
        </div>
      )}
    </footer>
  );
}

export default function AppShell({ children }) {
  return (
    <div className='nm-shell'>
      <Header />
      <div className='nm-shell-body'>
        <AdminSidebar />
        <main className='nm-shell-main'>{children}</main>
      </div>
      <Footer />
    </div>
  );
}
