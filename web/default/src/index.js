import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter, HashRouter } from 'react-router-dom';
import { Container } from 'semantic-ui-react';
import App from './App';
import Header from './components/Header';
import Footer from './components/Footer';
import 'semantic-ui-css/semantic.min.css';
import './index.css';
import { UserProvider } from './context/User';
import { ToastContainer } from 'react-toastify';
import 'react-toastify/dist/ReactToastify.css';
import { StatusProvider } from './context/Status';
import './i18n';

const isDemo = process.env.REACT_APP_DEMO === 'true';
const Router = isDemo ? HashRouter : BrowserRouter;

if (isDemo) {
  // 纯静态 demo：预置 root 登录态，打开即已登录管理员。
  const demoUser = {
    id: 1,
    username: 'root',
    display_name: '演示管理员',
    role: 100,
    status: 1,
    token: 'demo-token',
    email: 'root@neo-matrix.dev',
  };
  if (!localStorage.getItem('user')) {
    localStorage.setItem('user', JSON.stringify(demoUser));
  }
  // 预置 status，避免 getLogo/getSystemName 在 /api/status 返回前读到绝对路径兜底
  if (!localStorage.getItem('status')) {
    localStorage.setItem(
      'status',
      JSON.stringify({
        version: 'v0.0.0',
        system_name: 'Neo Matrix',
        logo: 'logo.png',
        footer_html: 'Neo Matrix 纯静态演示 · 数据为本地 mock',
        quota_per_unit: '500000',
        display_in_currency: true,
        chat_link: '',
        top_up_link: '',
      })
    );
  }
  // 预置 status 派生的 localStorage 键，避免 Header 首次渲染读到绝对路径兜底（/logo.png）
  const seed = {
    system_name: 'Neo Matrix',
    logo: 'logo.png',
    footer_html: 'Neo Matrix 纯静态演示 · 数据为本地 mock',
    quota_per_unit: '500000',
    display_in_currency: 'true',
  };
  Object.entries(seed).forEach(([k, v]) => {
    if (!localStorage.getItem(k)) localStorage.setItem(k, v);
  });
  localStorage.removeItem('chat_link');
}

const root = ReactDOM.createRoot(document.getElementById('root'));
root.render(
  <React.StrictMode>
    <StatusProvider>
      <UserProvider>
        <Router>
          <Header />
          <Container className={'main-content'}>
            <App />
          </Container>
          <ToastContainer />
          <Footer />
        </Router>
      </UserProvider>
    </StatusProvider>
  </React.StrictMode>
);
