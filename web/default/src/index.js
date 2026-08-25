import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter, HashRouter } from 'react-router-dom';
import App from './App';
import AppShell from './components/AppShell';
import './index.css';
import { UserProvider } from './context/User';
import { ToastContainer } from 'react-toastify';
import 'react-toastify/dist/ReactToastify.css';
import { StatusProvider } from './context/Status';
import './i18n';

const isDemo = process.env.REACT_APP_DEMO === 'true';
const Router = isDemo ? HashRouter : BrowserRouter;

if (isDemo) {
  // 纯静态 demo：默认 root；可用 ?demo_user=consumer|supplier 预览不同角色。
  const demoUsers = {
    admin: {
      id: 1,
      username: 'root',
      display_name: '演示管理员',
      role: 100,
      status: 1,
      token: 'demo-token',
      email: 'root@neo-matrix.dev',
    },
    supplier: {
      id: 3,
      username: 'supplier_ali',
      display_name: '阿里云供给方',
      role: 1,
      status: 1,
      token: 'demo-supplier-token',
      email: 'ali@neo-matrix.dev',
      group: 'supplier',
    },
    consumer: {
      id: 4,
      username: 'consumer',
      display_name: '演示消费者',
      role: 1,
      status: 1,
      token: 'demo-consumer-token',
      email: 'consumer@neo-matrix.dev',
    },
  };
  const requestedPersona = new URLSearchParams(window.location.search).get('demo_user');
  const demoUser = demoUsers[requestedPersona] || demoUsers.admin;
  if (requestedPersona || isDemo) {
    localStorage.setItem('user', JSON.stringify(demoUser));
  }
  // 预置 status，避免 getLogo/getSystemName 在 /api/status 返回前读到绝对路径兜底
  if (!localStorage.getItem('status')) {
    localStorage.setItem(
      'status',
      JSON.stringify({
        version: 'v0.0.0',
        system_name: 'Neo Matrix',
        logo: 'logo.svg',
        footer_html: 'Neo Matrix 纯静态演示 · 数据为本地 mock',
        quota_per_unit: '500000',
        display_in_currency: true,
        chat_link: '',
        top_up_link: '',
      })
    );
  }
  // 预置 status 派生的 localStorage 键，避免 Shell 首次渲染读到绝对路径兜底
  const seed = {
    system_name: 'Neo Matrix',
    logo: 'logo.svg',
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
          <AppShell>
            <App />
          </AppShell>
          <ToastContainer />
        </Router>
      </UserProvider>
    </StatusProvider>
  </React.StrictMode>
);
