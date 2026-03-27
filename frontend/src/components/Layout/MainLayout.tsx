import React, { useState } from 'react';
import { Outlet, useNavigate, useLocation } from 'react-router-dom';
import { Menu, Button, Dropdown, MessagePlugin, Dialog, Form, Input } from 'tdesign-react';
import {
  LinkIcon,
  TagIcon,
  SettingIcon,
  MenuFoldIcon,
  MenuUnfoldIcon,
  UserCircleIcon,
  LogoutIcon,
  LockOnIcon,
  DashboardIcon,
} from 'tdesign-icons-react';
import { getUsername, clearAuth } from '../../lib/auth';
import { changePassword } from '../../lib/api';
import logoSvg from '../../assets/img/bigger-dzq.svg';
import ParticleBackground from '../ParticleBackground';

const { MenuItem } = Menu;
const { FormItem } = Form;

const menuItems = [
  { path: '/', label: '回调配置', icon: <LinkIcon /> },
  { path: '/tags', label: '标签管理', icon: <TagIcon /> },
  { path: '/dispatch-history', label: '分发记录', icon: <DashboardIcon /> },
  { path: '/settings', label: '系统设置', icon: <SettingIcon /> },
];

const MainLayout: React.FC = () => {
  const [collapsed, setCollapsed] = useState(false);
  const [passwordDialogVisible, setPasswordDialogVisible] = useState(false);
  const [passwordLoading, setPasswordLoading] = useState(false);
  const navigate = useNavigate();
  const location = useLocation();

  const currentPath = location.pathname === '/' ? '/' : location.pathname;
  const username = getUsername() || 'admin';

  const handleLogout = () => {
    clearAuth();
    MessagePlugin.success('已退出登录');
    navigate('/login', { replace: true });
  };

  const handlePasswordSubmit = async (ctx: { validateResult: boolean | Record<string, unknown>; fields?: Record<string, string> }) => {
    if (ctx.validateResult !== true) return;
    const { oldPassword, newPassword, confirmPassword } = ctx.fields || {};

    if (newPassword !== confirmPassword) {
      MessagePlugin.error('两次输入的密码不一致');
      return;
    }

    setPasswordLoading(true);
    try {
      await changePassword(oldPassword, newPassword);
      MessagePlugin.success('密码修改成功，请重新登录');
      setPasswordDialogVisible(false);
      clearAuth();
      navigate('/login', { replace: true });
    } catch (err: unknown) {
      const axiosErr = err as { response?: { data?: { message?: string } } };
      const msg = axiosErr?.response?.data?.message || '密码修改失败';
      MessagePlugin.error(msg);
    } finally {
      setPasswordLoading(false);
    }
  };

  const dropdownOptions = [
    { content: '修改密码', value: 'password', prefixIcon: <LockOnIcon /> },
    { content: '退出登录', value: 'logout', prefixIcon: <LogoutIcon />, theme: 'error' as const },
  ];

  const handleDropdownClick = (data: { value?: string | number | { [key: string]: unknown } }) => {
    if (data.value === 'logout') {
      handleLogout();
    } else if (data.value === 'password') {
      setPasswordDialogVisible(true);
    }
  };

  return (
    <div className="flex h-screen overflow-hidden" style={{ background: 'linear-gradient(135deg, #0b1120 0%, #0f172a 40%, #0c1a2e 100%)' }}>
      {/* Ambient glow effects */}
      <div
        className="fixed w-[600px] h-[600px] rounded-full pointer-events-none"
        style={{
          background: 'radial-gradient(circle, rgba(56,189,248,0.06) 0%, transparent 70%)',
          top: '-15%',
          right: '-10%',
          zIndex: 0,
        }}
      />
      <div
        className="fixed w-[500px] h-[500px] rounded-full pointer-events-none"
        style={{
          background: 'radial-gradient(circle, rgba(13,148,136,0.05) 0%, transparent 70%)',
          bottom: '-10%',
          left: '10%',
          zIndex: 0,
        }}
      />

      {/* Particle Animation Background */}
      <div className="fixed inset-0 pointer-events-none" style={{ zIndex: 0 }}>
        <ParticleBackground />
      </div>

      {/* Sidebar */}
      <div
        className={`${
          collapsed ? 'w-[64px]' : 'w-[240px]'
        } flex flex-col transition-all duration-300 ease-in-out flex-shrink-0 relative z-10`}
        style={{
          background: 'rgba(15, 23, 42, 0.7)',
          backdropFilter: 'blur(16px)',
          borderRight: '1px solid rgba(56, 189, 248, 0.08)',
        }}
      >
        {/* Logo */}
        <div className={`${collapsed ? 'h-[64px] flex items-center justify-center' : 'h-[64px] flex items-center'} px-4 overflow-hidden`}
          style={{ borderBottom: '1px solid rgba(56, 189, 248, 0.08)' }}
        >
          {!collapsed ? (
            <div className="flex items-center gap-2">
              <img src={logoSvg} alt="logo" className="h-7 flex-shrink-0" />
            </div>
          ) : (
            <div className="w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0" style={{ background: 'linear-gradient(135deg, #0f172a 0%, #0d9488 100%)' }}>
              <span className="text-white text-sm font-bold">签</span>
            </div>
          )}
        </div>

        {/* Menu */}
        <div className="flex-1 py-3 px-2">
          <nav className="space-y-1">
            {menuItems.map((item) => {
              const isActive = currentPath === item.path;
              return (
                <button
                  key={item.path}
                  onClick={() => navigate(item.path)}
                  aria-label={item.label}
                  aria-current={isActive ? 'page' : undefined}
                  className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm transition-all duration-200 cursor-pointer ${
                    collapsed ? 'justify-center' : ''
                  } ${
                    isActive
                      ? 'text-sky-300 font-medium'
                      : 'text-slate-400 hover:text-slate-200'
                  }`}
                  style={
                    isActive
                      ? {
                          background: 'rgba(56, 189, 248, 0.1)',
                          boxShadow: 'inset 0 0 0 1px rgba(56, 189, 248, 0.15)',
                        }
                      : { background: 'transparent' }
                  }
                  onMouseEnter={(e) => {
                    if (!isActive) {
                      (e.currentTarget as HTMLElement).style.background = 'rgba(255,255,255,0.04)';
                    }
                  }}
                  onMouseLeave={(e) => {
                    if (!isActive) {
                      (e.currentTarget as HTMLElement).style.background = 'transparent';
                    }
                  }}
                >
                  <span className="text-lg flex-shrink-0">{item.icon}</span>
                  {!collapsed && <span>{item.label}</span>}
                </button>
              );
            })}
          </nav>
        </div>

        {/* Collapse Toggle */}
        <div className="p-3" style={{ borderTop: '1px solid rgba(56, 189, 248, 0.08)' }}>
          <button
            onClick={() => setCollapsed(!collapsed)}
            aria-label={collapsed ? '展开侧边栏' : '折叠侧边栏'}
            className="w-full flex items-center justify-center p-2 rounded-lg text-slate-500 hover:text-slate-300 hover:bg-white/5 transition-colors cursor-pointer"
          >
            {collapsed ? <MenuUnfoldIcon size={18} /> : <MenuFoldIcon size={18} />}
          </button>
        </div>
      </div>

      {/* Main Content */}
      <div className="flex-1 flex flex-col overflow-hidden relative z-10">
        {/* Header */}
        <header
          className="h-[64px] flex items-center justify-between px-6 flex-shrink-0"
          style={{
            background: 'rgba(15, 23, 42, 0.5)',
            backdropFilter: 'blur(16px)',
            borderBottom: '1px solid rgba(56, 189, 248, 0.08)',
          }}
        >
          <div>
            <h1 className="text-lg font-semibold text-slate-100 tracking-tight">
              {menuItems.find((m) => m.path === currentPath)?.label || '电子签回调分发'}
            </h1>
          </div>
          <div className="flex items-center gap-4">
            <div className="flex items-center gap-2 text-sm text-slate-400">
              <div className="w-2 h-2 rounded-full bg-emerald-400 tech-pulse" />
              <span className="font-mono text-xs">ONLINE</span>
            </div>
            <div className="w-px h-5 bg-white/10" />
            <Dropdown options={dropdownOptions} onClick={handleDropdownClick}>
              <Button variant="text" shape="round" icon={<UserCircleIcon />} style={{ color: '#94a3b8' }}>
                {username}
              </Button>
            </Dropdown>
          </div>
        </header>

        {/* Content */}
        <main className="flex-1 overflow-auto p-6 tech-grid-bg animate-fade-slide-in">
          <Outlet />
        </main>
      </div>

      {/* Change Password Dialog */}
      <Dialog
        header="修改密码"
        visible={passwordDialogVisible}
        onClose={() => setPasswordDialogVisible(false)}
        footer={false}
        width={420}
      >
        <Form onSubmit={handlePasswordSubmit} colon labelWidth={80} labelAlign="right">
          <FormItem label="当前密码" name="oldPassword" rules={[{ required: true, message: '请输入当前密码' }]}>
            <Input type="password" placeholder="请输入当前密码" />
          </FormItem>
          <FormItem
            label="新密码"
            name="newPassword"
            rules={[
              { required: true, message: '请输入新密码' },
              { min: 8, message: '密码至少8位' },
            ]}
          >
            <Input type="password" placeholder="至少8位字符" />
          </FormItem>
          <FormItem
            label="确认密码"
            name="confirmPassword"
            rules={[
              { required: true, message: '请确认新密码' },
              {
                validator: (val: string) => {
                  return true;
                },
              },
            ]}
          >
            <Input type="password" placeholder="再次输入新密码" />
          </FormItem>
          <FormItem style={{ textAlign: 'right' }}>
            <Button
              theme="default"
              onClick={() => setPasswordDialogVisible(false)}
              style={{ marginRight: 8 }}
            >
              取消
            </Button>
            <Button type="submit" theme="primary" loading={passwordLoading}>
              确认修改
            </Button>
          </FormItem>
        </Form>
      </Dialog>
    </div>
  );
};

export default MainLayout;
