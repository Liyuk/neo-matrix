import React from 'react';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { UserProvider } from '../context/User';
import i18n from '../i18n';
import AppShell from './AppShell';

function renderShell(children = <div>页面内容</div>, entry = '/') {
  return render(
    <MemoryRouter initialEntries={[entry]}>
      <UserProvider>
        <AppShell>{children}</AppShell>
      </UserProvider>
    </MemoryRouter>
  );
}

describe('AppShell', () => {
  beforeEach(() => {
    i18n.changeLanguage('zh');
    localStorage.clear();
    Object.defineProperty(window, 'innerWidth', {
      configurable: true,
      value: 1280,
    });
  });

  it('renders the configured brand, route content, and public navigation', () => {
    localStorage.setItem('system_name', 'Matrix Console');
    localStorage.setItem('logo', 'logo.svg');

    renderShell();

    expect(screen.getByText('Matrix Console')).toBeInTheDocument();
    expect(screen.getByText('页面内容')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /首页|Home/ })).toHaveAttribute(
      'href',
      '/'
    );
    expect(screen.getByRole('link', { name: /登录/ })).toHaveAttribute(
      'href',
      '/login'
    );
  });

  it('shows administrator navigation only for an administrator', async () => {
    localStorage.setItem(
      'user',
      JSON.stringify({ username: 'root', role: 100, status: 1 })
    );

    renderShell();

    expect(screen.getAllByRole('link', { name: /渠道/ }).length).toBeGreaterThan(0);
    expect(screen.getAllByRole('link', { name: /用户/ }).length).toBeGreaterThan(0);
    expect(screen.getAllByRole('link', { name: /结算管理/ }).length).toBeGreaterThan(0);
    expect(screen.getByRole('button', { name: /注销/ })).toBeInTheDocument();
  });

  it('reveals and closes navigation on a narrow viewport', async () => {
    Object.defineProperty(window, 'innerWidth', {
      configurable: true,
      value: 420,
    });
    const user = userEvent.setup();

    renderShell();

    const menuButton = screen.getByRole('button', { name: /打开导航/ });
    expect(screen.queryByRole('link', { name: /关于/ })).not.toBeInTheDocument();

    await user.click(menuButton);
    expect(screen.getByRole('link', { name: /关于/ })).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: /关闭导航/ }));
    expect(screen.queryByRole('link', { name: /关于/ })).not.toBeInTheDocument();
  });

  it('renders configured footer HTML', () => {
    localStorage.setItem('footer_html', '<strong>Neo Matrix footer</strong>');

    renderShell();

    expect(screen.getByText('Neo Matrix footer')).toBeInTheDocument();
  });
});
