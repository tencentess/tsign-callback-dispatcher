import React, { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { Form, Input, Button, MessagePlugin } from 'tdesign-react';
import { LockOnIcon, UserIcon } from 'tdesign-icons-react';
import { login } from '../lib/api';
import { setAuth } from '../lib/auth';
import logoSvg from '../assets/img/bigger-dzq.svg';

const { FormItem } = Form;

/* ── Animated particle canvas for the left brand panel ── */
const ParticleCanvas: React.FC = () => {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    let animId: number;
    const dpr = window.devicePixelRatio || 1;

    const resize = () => {
      const rect = canvas.getBoundingClientRect();
      canvas.width = rect.width * dpr;
      canvas.height = rect.height * dpr;
      ctx.scale(dpr, dpr);
    };
    resize();
    window.addEventListener('resize', resize);

    interface Particle {
      x: number; y: number; vx: number; vy: number; r: number; o: number;
    }

    const particles: Particle[] = [];
    const count = 60;
    const rect = canvas.getBoundingClientRect();

    for (let i = 0; i < count; i++) {
      particles.push({
        x: Math.random() * rect.width,
        y: Math.random() * rect.height,
        vx: (Math.random() - 0.5) * 0.4,
        vy: (Math.random() - 0.5) * 0.4,
        r: Math.random() * 1.5 + 0.5,
        o: Math.random() * 0.5 + 0.2,
      });
    }

    const draw = () => {
      const { width, height } = canvas.getBoundingClientRect();
      ctx.clearRect(0, 0, width, height);

      // draw lines between nearby particles
      for (let i = 0; i < particles.length; i++) {
        for (let j = i + 1; j < particles.length; j++) {
          const dx = particles[i].x - particles[j].x;
          const dy = particles[i].y - particles[j].y;
          const dist = Math.sqrt(dx * dx + dy * dy);
          if (dist < 120) {
            ctx.beginPath();
            ctx.moveTo(particles[i].x, particles[i].y);
            ctx.lineTo(particles[j].x, particles[j].y);
            ctx.strokeStyle = `rgba(255,255,255,${0.12 * (1 - dist / 120)})`;
            ctx.lineWidth = 0.5;
            ctx.stroke();
          }
        }
      }

      // draw particles
      for (const p of particles) {
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
        ctx.fillStyle = `rgba(255,255,255,${p.o})`;
        ctx.fill();

        p.x += p.vx;
        p.y += p.vy;
        if (p.x < 0 || p.x > width) p.vx *= -1;
        if (p.y < 0 || p.y > height) p.vy *= -1;
      }

      animId = requestAnimationFrame(draw);
    };
    draw();

    return () => {
      cancelAnimationFrame(animId);
      window.removeEventListener('resize', resize);
    };
  }, []);

  return (
    <canvas
      ref={canvasRef}
      className="absolute inset-0 w-full h-full"
      style={{ pointerEvents: 'none' }}
    />
  );
};

/* ── Main Login Page ── */
const LoginPage: React.FC = () => {
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();

  const handleSubmit = async (ctx: { validateResult: boolean | Record<string, unknown>; fields?: Record<string, string> }) => {
    if (ctx.validateResult !== true) return;
    const { username, password } = ctx.fields || {};
    setLoading(true);
    try {
      const data = await login(username, password);
      setAuth(data.token, data.username);
      MessagePlugin.success('登录成功');
      navigate('/', { replace: true });
    } catch (err: unknown) {
      const axiosErr = err as { response?: { data?: { message?: string } } };
      const msg = axiosErr?.response?.data?.message || '登录失败，请检查用户名和密码';
      MessagePlugin.error(msg);
    } finally {
      setLoading(false);
    }
  };

  const features = [
    { icon: '⚡', title: '智能路由', desc: '基于标签规则精准分发回调事件' },
    { icon: '📊', title: '实时监控', desc: '可视化查看回调处理状态与日志' },
    { icon: '🔧', title: '灵活配置', desc: '支持多回调地址与优先级管理' },
    { icon: '🔐', title: '安全可靠', desc: '签名验证与加密传输保障数据安全' },
  ];

  return (
    <div className="min-h-screen flex">
      {/* ── Left Brand Panel ── */}
      <div
        className="hidden lg:flex lg:w-[54%] relative overflow-hidden items-center justify-center"
        style={{
          background: 'linear-gradient(135deg, #0f172a 0%, #1e3a5f 40%, #0d9488 100%)',
        }}
      >
        {/* Animated particles */}
        <ParticleCanvas />

        {/* Decorative glow orbs */}
        <div
          className="absolute w-[500px] h-[500px] rounded-full opacity-20"
          style={{
            background: 'radial-gradient(circle, rgba(13,148,136,0.6) 0%, transparent 70%)',
            top: '-10%',
            right: '-10%',
          }}
        />
        <div
          className="absolute w-[400px] h-[400px] rounded-full opacity-15"
          style={{
            background: 'radial-gradient(circle, rgba(59,130,246,0.5) 0%, transparent 70%)',
            bottom: '-5%',
            left: '-5%',
          }}
        />

        {/* Grid pattern overlay */}
        <div
          className="absolute inset-0 opacity-[0.03]"
          style={{
            backgroundImage:
              'linear-gradient(rgba(255,255,255,.5) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,.5) 1px, transparent 1px)',
            backgroundSize: '40px 40px',
          }}
        />

        {/* Content */}
        <div className="relative z-10 px-12 xl:px-20 max-w-[540px]">
          {/* Logo */}
          <div className="mb-10">
            <div className="inline-flex items-center justify-center rounded-xl bg-white/10 backdrop-blur-md border border-white/10 px-5 py-3 shadow-lg">
              <img src={logoSvg} alt="电子签 Logo" className="h-8" />
            </div>
          </div>

          {/* Tagline */}
          <h1 className="text-3xl xl:text-4xl font-bold text-white mb-3 leading-tight tracking-tight">
            回调分发服务
          </h1>
          <p className="text-base text-white/50 mb-10 font-mono tracking-wide">
            TSign Callback Dispatcher
          </p>

          {/* Divider */}
          <div className="w-12 h-[2px] bg-gradient-to-r from-teal-400 to-blue-400 mb-10 rounded-full" />

          {/* Feature list */}
          <div className="grid grid-cols-2 gap-5">
            {features.map((f) => (
              <div
                key={f.title}
                className="group rounded-xl bg-white/[0.04] backdrop-blur-sm border border-white/[0.06] p-4 hover:bg-white/[0.08] hover:border-white/[0.12] transition-all duration-300"
              >
                <div className="text-xl mb-2">{f.icon}</div>
                <div className="text-sm font-semibold text-white mb-1">{f.title}</div>
                <div className="text-xs text-white/40 leading-relaxed">{f.desc}</div>
              </div>
            ))}
          </div>

          {/* Bottom tech text */}
          <div className="mt-12 flex items-center gap-3 text-[11px] text-white/20 font-mono">
            <div className="w-1.5 h-1.5 rounded-full bg-teal-400/60 animate-pulse" />
            <span>SYSTEM ONLINE</span>
            <span className="mx-1">·</span>
            <span>v1.0</span>
            <span className="mx-1">·</span>
            <span>ENCRYPTED</span>
          </div>
        </div>
      </div>

      {/* ── Right Login Panel ── */}
      <div className="flex-1 flex items-center justify-center bg-[#fafbfc] p-6 relative overflow-hidden">
        {/* Subtle background pattern */}
        <div
          className="absolute inset-0 opacity-[0.015]"
          style={{
            backgroundImage: 'radial-gradient(circle at 1px 1px, #94a3b8 1px, transparent 0)',
            backgroundSize: '24px 24px',
          }}
        />

        <div className="w-full max-w-[380px] relative z-10">
          {/* Mobile logo (visible only on small screens) */}
          <div className="lg:hidden text-center mb-8">
            <div className="inline-flex items-center justify-center rounded-xl shadow-lg mb-4 p-3 bg-white border border-gray-100">
              <img src={logoSvg} alt="电子签 Logo" className="h-8" />
            </div>
            <h1 className="text-xl font-bold text-gray-800">回调分发服务</h1>
          </div>

          {/* Welcome text */}
          <div className="mb-8">
            <h2 className="text-2xl font-bold text-gray-900 tracking-tight">欢迎回来</h2>
            <p className="text-sm text-gray-500 mt-2">请登录管理账号以继续操作</p>
          </div>

          {/* Login Card */}
          <div className="bg-white rounded-2xl shadow-lg shadow-gray-200/50 p-8 border border-gray-100/80 login-card-light">
            <Form onSubmit={handleSubmit} colon labelWidth={0}>
              <div className="mb-1">
                <label className="text-sm font-medium text-gray-600 mb-1.5 block">用户名</label>
              </div>
              <FormItem name="username" rules={[{ required: true, message: '请输入用户名' }]}>
                <Input
                  prefixIcon={<UserIcon />}
                  placeholder="请输入管理员用户名"
                  size="large"
                  clearable
                  aria-label="用户名"
                />
              </FormItem>
              <div className="mb-1 mt-2">
                <label className="text-sm font-medium text-gray-600 mb-1.5 block">密码</label>
              </div>
              <FormItem name="password" rules={[{ required: true, message: '请输入密码' }]}>
                <Input
                  prefixIcon={<LockOnIcon />}
                  placeholder="请输入登录密码"
                  type="password"
                  size="large"
                  aria-label="密码"
                />
              </FormItem>
              <FormItem>
                <Button
                  type="submit"
                  theme="primary"
                  block
                  size="large"
                  loading={loading}
                  style={{
                    borderRadius: '10px',
                    height: '44px',
                    fontSize: '15px',
                    background: 'linear-gradient(135deg, #0f172a 0%, #1e3a5f 50%, #0d9488 100%)',
                    border: 'none',
                    transition: 'all 0.3s ease',
                    boxShadow: '0 2px 12px rgba(13, 148, 136, 0.2)',
                  }}
                >
                  登 录
                </Button>
              </FormItem>
            </Form>
          </div>

          <p className="text-center text-xs text-gray-400 mt-6">
            首次登录请使用默认账号，登录后请及时修改密码
          </p>
        </div>
      </div>
    </div>
  );
};

export default LoginPage;
