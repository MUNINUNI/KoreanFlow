/**
 * Auth.tsx — 登录 / 注册页（v2.3.0）
 * 三种方式：邮箱+密码（注册/登录）、邮箱+验证码、手机+验证码。
 * 开发模式：点击「发送验证码」后验证码直接显示在页面上（后续接入真实 SMTP/短信即可切换）。
 * 登录/注册成功后：若匿名设备有历史数据，弹「合并到账号 / 重新开始」选择框。
 */
import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Link, useNavigate } from 'react-router';
import { Mail, Smartphone, KeyRound, ArrowLeft, Loader2, X, DatabaseZap, Sparkles } from 'lucide-react';
import { cn } from '@/lib/utils';
import { client } from '@/lib/sync';
import { useAuth, checkAnonymousData, resolveAnonymousData } from '@/lib/auth';
import { showToast } from '@/components/Toast';
import type { AuthUser } from '@/lib/auth';

type Mode = 'email-password' | 'email-code' | 'phone-code';

const MODES: { key: Mode; label: string; icon: typeof Mail }[] = [
  { key: 'email-password', label: '邮箱密码', icon: KeyRound },
  { key: 'email-code', label: '邮箱验证码', icon: Mail },
  { key: 'phone-code', label: '手机验证码', icon: Smartphone },
];

/** 匿名数据合并选择弹窗 */
function MergeDialog({ summary, onDone }: {
  summary: { vocab: number; reviews: number; sessions: number; corpus: number };
  onDone: () => void;
}) {
  const [busy, setBusy] = useState(false);
  const choose = async (choice: 'merge' | 'fresh') => {
    setBusy(true);
    const res = await resolveAnonymousData(choice);
    setBusy(false);
    showToast(choice === 'merge' ? (res.merged ? '历史数据已合并到账号' : '没有可合并的数据') : '好的，账号全新开始');
    onDone();
  };
  return (
    <motion.div
      className="fixed inset-0 z-[70] flex items-center justify-center p-4"
      style={{ background: 'rgba(46,42,38,0.4)' }}
      initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
    >
      <motion.div
        className="w-full max-w-sm rounded-3xl border border-warm bg-paper p-6 shadow-lift"
        initial={{ scale: 0.9, y: 16 }} animate={{ scale: 1, y: 0 }}
        transition={{ duration: 0.25, ease: [0.22, 1, 0.36, 1] }}
      >
        <h3 className="font-serif text-lg font-bold text-ink">发现本机历史学习数据</h3>
        <p className="mt-2 text-sm leading-relaxed text-ink-secondary">
          这台设备上有未登录时积累的学习数据：
          {summary.vocab > 0 && ` ${summary.vocab} 条生词`}
          {summary.reviews > 0 && ` ${summary.reviews} 条复习记录`}
          {summary.sessions > 0 && ` ${summary.sessions} 段学习时长`}
          {summary.corpus > 0 && ` ${summary.corpus} 份语料`}。
        </p>
        <div className="mt-5 flex flex-col gap-2">
          <button
            onClick={() => void choose('merge')}
            disabled={busy}
            className="flex items-center justify-center gap-2 rounded-full bg-terracotta px-4 py-2.5 text-sm font-medium text-paper transition-colors hover:bg-terracotta-deep disabled:opacity-50"
          >
            <DatabaseZap size={15} /> 合并到我的账号
          </button>
          <button
            onClick={() => void choose('fresh')}
            disabled={busy}
            className="flex items-center justify-center gap-2 rounded-full border border-warm bg-paper px-4 py-2.5 text-sm text-ink-secondary transition-colors hover:bg-sand disabled:opacity-50"
          >
            <Sparkles size={15} /> 不用了，全新开始
          </button>
        </div>
      </motion.div>
    </motion.div>
  );
}

export default function Auth() {
  const navigate = useNavigate();
  const { applyAuth } = useAuth();
  const [mode, setMode] = useState<Mode>('email-password');
  const [action, setAction] = useState<'login' | 'register'>('login');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [password, setPassword] = useState('');
  const [code, setCode] = useState('');
  const [nickname, setNickname] = useState('');
  const [busy, setBusy] = useState(false);
  const [sending, setSending] = useState(false);
  /** 开发模式回显的验证码 */
  const [devCode, setDevCode] = useState<string | null>(null);
  const [mergeSummary, setMergeSummary] = useState<{ vocab: number; reviews: number; sessions: number; corpus: number } | null>(null);

  const isPasswordMode = mode === 'email-password';

  /** 登录/注册成功后的统一收尾：保存会话 → 检查匿名数据 → 弹合并框或回用户中心 */
  const afterAuth = async (token: string, user: AuthUser) => {
    applyAuth(token, user);
    const anon = await checkAnonymousData();
    if (anon.hasData) {
      setMergeSummary(anon);
    } else {
      showToast('登录成功');
      navigate('/profile');
    }
  };

  const sendCode = async () => {
    const channel = mode === 'phone-code' ? 'phone' : 'email';
    const target = mode === 'phone-code' ? phone.trim() : email.trim();
    if (!target) {
      showToast(channel === 'phone' ? '请先输入手机号' : '请先输入邮箱');
      return;
    }
    setSending(true);
    try {
      const res = await client.auth.sendCode.mutate({
        channel, target,
        purpose: action === 'register' ? 'register' : 'login',
      });
      if (res.devCode) {
        setDevCode(res.devCode);
        setCode(res.devCode);
      }
      showToast('验证码已生成（开发模式直接显示在下方）');
    } catch (e) {
      showToast(e instanceof Error ? e.message : '发送失败，请稍后重试');
    } finally {
      setSending(false);
    }
  };

  const submit = async () => {
    setBusy(true);
    try {
      let res: { token: string; user: unknown };
      if (mode === 'email-password') {
        if (!email.trim() || !password) { showToast('请输入邮箱和密码'); return; }
        res = action === 'register'
          ? await client.auth.register.mutate({ mode, email: email.trim(), password, nickname: nickname.trim() || undefined })
          : await client.auth.login.mutate({ mode, email: email.trim(), password });
      } else if (mode === 'email-code') {
        if (!email.trim() || !code) { showToast('请输入邮箱和验证码'); return; }
        res = action === 'register'
          ? await client.auth.register.mutate({ mode, email: email.trim(), code, nickname: nickname.trim() || undefined })
          : await client.auth.login.mutate({ mode, email: email.trim(), code });
      } else {
        if (!phone.trim() || !code) { showToast('请输入手机号和验证码'); return; }
        res = action === 'register'
          ? await client.auth.register.mutate({ mode, phone: phone.trim(), code, nickname: nickname.trim() || undefined })
          : await client.auth.login.mutate({ mode, phone: phone.trim(), code });
      }
      await afterAuth(res.token, res.user as AuthUser);
    } catch (e) {
      showToast(e instanceof Error ? e.message : '操作失败，请稍后重试');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="mx-auto flex max-w-content justify-center px-4 py-10 md:py-16">
      <motion.div
        initial={{ opacity: 0, y: 24 }} animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
        className="w-full max-w-md rounded-3xl border border-warm bg-paper p-8 shadow-card"
      >
        <Link to="/" className="flex items-center gap-1 text-sm text-ink-muted transition-colors hover:text-terracotta">
          <ArrowLeft size={15} /> 返回首页
        </Link>
        <h1 className="mt-4 font-serif text-2xl font-bold text-ink">
          {action === 'login' ? '登录账号' : '注册账号'}
        </h1>
        <p className="mt-1 text-sm text-ink-secondary">
          登录后学习数据云端同步，还能接收每日学习提醒。不登录也可以继续使用。
        </p>

        {/* 登录 / 注册切换 */}
        <div className="mt-6 flex gap-1 rounded-full bg-sand p-1">
          {(['login', 'register'] as const).map((a) => (
            <button
              key={a}
              onClick={() => { setAction(a); setDevCode(null); }}
              className={cn(
                'flex-1 rounded-full py-2 text-sm font-medium transition-colors',
                action === a ? 'bg-paper text-terracotta shadow-card' : 'text-ink-secondary',
              )}
            >
              {a === 'login' ? '登录' : '注册'}
            </button>
          ))}
        </div>

        {/* 三种方式 Tab */}
        <div className="mt-4 flex gap-1 rounded-full bg-sand p-1">
          {MODES.map((m) => (
            <button
              key={m.key}
              onClick={() => { setMode(m.key); setDevCode(null); setCode(''); }}
              className={cn(
                'flex flex-1 items-center justify-center gap-1 rounded-full py-2 text-xs font-medium transition-colors',
                mode === m.key ? 'bg-terracotta text-paper' : 'text-ink-secondary hover:text-ink',
              )}
            >
              <m.icon size={13} /> {m.label}
            </button>
          ))}
        </div>

        {/* 表单 */}
        <div className="mt-6 flex flex-col gap-3">
          {mode !== 'phone-code' && (
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="邮箱地址"
              autoComplete="email"
              className="w-full rounded-xl border border-warm bg-base px-4 py-3 text-sm text-ink outline-none focus:border-terracotta"
            />
          )}
          {mode === 'phone-code' && (
            <input
              type="tel"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              placeholder="手机号（11 位）"
              autoComplete="tel"
              maxLength={11}
              className="w-full rounded-xl border border-warm bg-base px-4 py-3 text-sm text-ink outline-none focus:border-terracotta"
            />
          )}
          {isPasswordMode ? (
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder={action === 'register' ? '设置密码（至少 6 位）' : '密码'}
              autoComplete={action === 'register' ? 'new-password' : 'current-password'}
              className="w-full rounded-xl border border-warm bg-base px-4 py-3 text-sm text-ink outline-none focus:border-terracotta"
            />
          ) : (
            <div className="flex gap-2">
              <input
                type="text"
                inputMode="numeric"
                value={code}
                onChange={(e) => setCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
                placeholder="6 位验证码"
                maxLength={6}
                className="w-full rounded-xl border border-warm bg-base px-4 py-3 text-sm text-ink outline-none focus:border-terracotta"
              />
              <button
                onClick={() => void sendCode()}
                disabled={sending}
                className="shrink-0 rounded-xl border border-terracotta/50 px-4 text-sm font-medium text-terracotta transition-colors hover:bg-terracotta-soft disabled:opacity-50"
              >
                {sending ? <Loader2 size={15} className="animate-spin" /> : '发送验证码'}
              </button>
            </div>
          )}
          {action === 'register' && (
            <input
              type="text"
              value={nickname}
              onChange={(e) => setNickname(e.target.value)}
              placeholder="昵称（可选，默认「韩语学习者」）"
              maxLength={64}
              className="w-full rounded-xl border border-warm bg-base px-4 py-3 text-sm text-ink outline-none focus:border-terracotta"
            />
          )}

          {/* 开发模式验证码回显 */}
          <AnimatePresence>
            {devCode && (
              <motion.div
                initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}
                className="flex items-center justify-between rounded-xl bg-honey/10 px-4 py-2.5 text-sm"
              >
                <span className="text-ink-secondary">
                  开发模式验证码：<strong className="font-mono text-lg tracking-widest text-terracotta">{devCode}</strong>
                </span>
                <button onClick={() => setDevCode(null)} aria-label="关闭" className="text-ink-muted hover:text-ink">
                  <X size={14} />
                </button>
              </motion.div>
            )}
          </AnimatePresence>

          <button
            onClick={() => void submit()}
            disabled={busy}
            className="mt-2 flex w-full items-center justify-center gap-2 rounded-full bg-terracotta px-4 py-3 text-sm font-medium text-paper shadow-card transition-colors hover:bg-terracotta-deep disabled:opacity-50"
          >
            {busy && <Loader2 size={15} className="animate-spin" />}
            {action === 'login' ? '登录' : '注册并登录'}
          </button>
        </div>

        <p className="mt-4 text-center text-xs leading-relaxed text-ink-muted">
          当前为开发模式：验证码直接显示在页面上，不会真实发送邮件/短信；
          接入邮件/短信服务后将自动切换为真实下发。
        </p>
      </motion.div>

      {/* 匿名数据合并选择 */}
      <AnimatePresence>
        {mergeSummary && (
          <MergeDialog summary={mergeSummary} onDone={() => navigate('/profile')} />
        )}
      </AnimatePresence>
    </div>
  );
}
