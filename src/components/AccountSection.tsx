/**
 * AccountSection.tsx — 用户中心「账号与通知」区块（v2.3.0）
 * 未登录：登录/注册引导卡。
 * 已登录：账号信息（邮箱/手机绑定与换绑）、修改密码、通知偏好（邮件/站内/每日提醒时间）、退出登录。
 */
import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Link } from 'react-router';
import { Mail, Smartphone, KeyRound, LogOut, BellRing, Loader2, CircleUserRound, X } from 'lucide-react';
import { client } from '@/lib/sync';
import { useAuth } from '@/lib/auth';
import { showToast } from '@/components/Toast';
import { cn } from '@/lib/utils';

/** 绑定/换绑 邮箱或手机号 的内联弹层 */
function BindModal({ channel, onClose }: { channel: 'email' | 'phone'; onClose: () => void }) {
  const { refresh } = useAuth();
  const [target, setTarget] = useState('');
  const [code, setCode] = useState('');
  const [devCode, setDevCode] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const isEmail = channel === 'email';

  const send = async () => {
    if (!target.trim()) { showToast(isEmail ? '请输入邮箱' : '请输入手机号'); return; }
    setBusy(true);
    try {
      const res = await client.auth.sendCode.mutate({ channel, target: target.trim(), purpose: 'bind' });
      if (res.devCode) { setDevCode(res.devCode); setCode(res.devCode); }
      showToast('验证码已生成（开发模式直接显示）');
    } catch (e) {
      showToast(e instanceof Error ? e.message : '发送失败');
    } finally {
      setBusy(false);
    }
  };

  const bind = async () => {
    if (!code) { showToast('请输入验证码'); return; }
    setBusy(true);
    try {
      if (isEmail) {
        await client.auth.bindEmail.mutate({ email: target.trim(), code });
      } else {
        await client.auth.bindPhone.mutate({ phone: target.trim(), code });
      }
      await refresh();
      showToast(isEmail ? '邮箱绑定成功' : '手机号绑定成功');
      onClose();
    } catch (e) {
      showToast(e instanceof Error ? e.message : '绑定失败');
    } finally {
      setBusy(false);
    }
  };

  return (
    <motion.div
      className="fixed inset-0 z-[70] flex items-center justify-center p-4"
      style={{ background: 'rgba(46,42,38,0.4)' }}
      initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
      onClick={onClose}
    >
      <motion.div
        className="w-full max-w-sm rounded-3xl border border-warm bg-paper p-6 shadow-lift"
        initial={{ scale: 0.9, y: 16 }} animate={{ scale: 1, y: 0 }} exit={{ scale: 0.95, opacity: 0 }}
        transition={{ duration: 0.25, ease: [0.22, 1, 0.36, 1] }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-4 flex items-center justify-between">
          <h3 className="font-serif text-lg font-bold text-ink">{isEmail ? '绑定邮箱' : '绑定手机号'}</h3>
          <button onClick={onClose} aria-label="关闭" className="rounded-full p-1 text-ink-muted hover:bg-sand">
            <X size={18} />
          </button>
        </div>
        <div className="flex flex-col gap-3">
          <input
            type={isEmail ? 'email' : 'tel'}
            value={target}
            onChange={(e) => setTarget(e.target.value)}
            placeholder={isEmail ? '邮箱地址' : '手机号（11 位）'}
            maxLength={isEmail ? 191 : 11}
            className="w-full rounded-xl border border-warm bg-base px-4 py-2.5 text-sm text-ink outline-none focus:border-terracotta"
          />
          <div className="flex gap-2">
            <input
              type="text"
              inputMode="numeric"
              value={code}
              onChange={(e) => setCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
              placeholder="6 位验证码"
              maxLength={6}
              className="w-full rounded-xl border border-warm bg-base px-4 py-2.5 text-sm text-ink outline-none focus:border-terracotta"
            />
            <button
              onClick={() => void send()}
              disabled={busy}
              className="shrink-0 rounded-xl border border-terracotta/50 px-3 text-sm font-medium text-terracotta hover:bg-terracotta-soft disabled:opacity-50"
            >
              发送验证码
            </button>
          </div>
          {devCode && (
            <p className="rounded-xl bg-honey/10 px-4 py-2 text-sm text-ink-secondary">
              开发模式验证码：<strong className="font-mono tracking-widest text-terracotta">{devCode}</strong>
            </p>
          )}
          <button
            onClick={() => void bind()}
            disabled={busy}
            className="flex items-center justify-center gap-2 rounded-full bg-terracotta px-4 py-2.5 text-sm font-medium text-paper hover:bg-terracotta-deep disabled:opacity-50"
          >
            {busy && <Loader2 size={14} className="animate-spin" />} 确认绑定
          </button>
        </div>
      </motion.div>
    </motion.div>
  );
}

/** 修改密码弹层（首次设置时原密码留空即可） */
function PasswordModal({ onClose }: { onClose: () => void }) {
  const [oldPassword, setOldPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    if (newPassword.length < 6) { showToast('新密码至少 6 位'); return; }
    setBusy(true);
    try {
      await client.auth.changePassword.mutate({
        oldPassword: oldPassword || undefined,
        newPassword,
      });
      showToast('密码已更新');
      onClose();
    } catch (e) {
      showToast(e instanceof Error ? e.message : '修改失败');
    } finally {
      setBusy(false);
    }
  };

  return (
    <motion.div
      className="fixed inset-0 z-[70] flex items-center justify-center p-4"
      style={{ background: 'rgba(46,42,38,0.4)' }}
      initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
      onClick={onClose}
    >
      <motion.div
        className="w-full max-w-sm rounded-3xl border border-warm bg-paper p-6 shadow-lift"
        initial={{ scale: 0.9, y: 16 }} animate={{ scale: 1, y: 0 }} exit={{ scale: 0.95, opacity: 0 }}
        transition={{ duration: 0.25, ease: [0.22, 1, 0.36, 1] }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-4 flex items-center justify-between">
          <h3 className="font-serif text-lg font-bold text-ink">修改密码</h3>
          <button onClick={onClose} aria-label="关闭" className="rounded-full p-1 text-ink-muted hover:bg-sand">
            <X size={18} />
          </button>
        </div>
        <div className="flex flex-col gap-3">
          <input
            type="password"
            value={oldPassword}
            onChange={(e) => setOldPassword(e.target.value)}
            placeholder="原密码（验证码注册、首次设置可留空）"
            className="w-full rounded-xl border border-warm bg-base px-4 py-2.5 text-sm text-ink outline-none focus:border-terracotta"
          />
          <input
            type="password"
            value={newPassword}
            onChange={(e) => setNewPassword(e.target.value)}
            placeholder="新密码（至少 6 位）"
            className="w-full rounded-xl border border-warm bg-base px-4 py-2.5 text-sm text-ink outline-none focus:border-terracotta"
          />
          <button
            onClick={() => void submit()}
            disabled={busy}
            className="flex items-center justify-center gap-2 rounded-full bg-terracotta px-4 py-2.5 text-sm font-medium text-paper hover:bg-terracotta-deep disabled:opacity-50"
          >
            {busy && <Loader2 size={14} className="animate-spin" />} 保存
          </button>
        </div>
      </motion.div>
    </motion.div>
  );
}

/** 开关行 */
function ToggleRow({ label, desc, checked, onChange }: {
  label: string; desc: string; checked: boolean; onChange: (v: boolean) => void;
}) {
  return (
    <div className="flex items-center justify-between gap-4 py-2">
      <div>
        <p className="text-sm font-medium text-ink">{label}</p>
        <p className="mt-0.5 text-xs text-ink-muted">{desc}</p>
      </div>
      <button
        role="switch"
        aria-checked={checked}
        aria-label={label}
        onClick={() => onChange(!checked)}
        className={cn(
          'relative h-6 w-11 shrink-0 rounded-full transition-colors duration-200',
          checked ? 'bg-terracotta' : 'bg-sand',
        )}
      >
        <span
          className={cn(
            'absolute top-0.5 h-5 w-5 rounded-full bg-paper shadow transition-transform duration-200',
            checked ? 'translate-x-[22px]' : 'translate-x-0.5',
          )}
        />
      </button>
    </div>
  );
}

export default function AccountSection() {
  const { user, loading, refresh, logout } = useAuth();
  const [bindChannel, setBindChannel] = useState<'email' | 'phone' | null>(null);
  const [pwdOpen, setPwdOpen] = useState(false);

  const updatePref = async (patch: { notifyEmail?: boolean; notifyBrowser?: boolean; remindTime?: string }) => {
    try {
      await client.notify.updatePrefs.mutate(patch);
      await refresh();
      showToast('通知偏好已保存');
    } catch (e) {
      showToast(e instanceof Error ? e.message : '保存失败');
    }
  };

  if (loading) return null;

  /* 未登录：引导卡 */
  if (!user) {
    return (
      <motion.section
        initial={{ opacity: 0, y: 24 }} animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
        className="rounded-3xl border border-warm bg-paper p-6 shadow-card"
      >
        <div className="flex flex-wrap items-center gap-4">
          <span className="flex h-14 w-14 items-center justify-center rounded-full bg-sand text-ink-muted">
            <CircleUserRound size={28} />
          </span>
          <div className="min-w-0 flex-1">
            <h2 className="font-serif text-lg font-bold text-ink">登录账号，同步学习数据</h2>
            <p className="mt-1 text-sm text-ink-secondary">
              支持邮箱密码 / 邮箱验证码 / 手机验证码登录；登录后数据云端备份，还能接收每日学习提醒。
            </p>
          </div>
          <Link
            to="/auth"
            className="rounded-full bg-terracotta px-6 py-2.5 text-sm font-medium text-paper shadow-card transition-colors hover:bg-terracotta-deep"
          >
            登录 / 注册
          </Link>
        </div>
      </motion.section>
    );
  }

  /* 已登录 */
  return (
    <motion.section
      initial={{ opacity: 0, y: 24 }} animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
      className="rounded-3xl border border-warm bg-paper p-6 shadow-card"
    >
      <div className="flex flex-wrap items-center gap-4">
        <span className="flex h-14 w-14 items-center justify-center rounded-full bg-terracotta-soft text-terracotta">
          <CircleUserRound size={28} />
        </span>
        <div className="min-w-0 flex-1">
          <h2 className="font-serif text-lg font-bold text-ink">{user.nickname}</h2>
          <p className="mt-0.5 text-xs text-ink-muted">
            {user.plan === 'pro' ? 'Pro 会员' : '免费用户'} · 注册于 {new Date(user.createdAt).toLocaleDateString('zh-CN')}
          </p>
        </div>
        <button
          onClick={() => { void logout().then(() => showToast('已退出登录')); }}
          className="flex items-center gap-1.5 rounded-full border border-warm bg-paper px-4 py-2 text-sm text-ink-secondary transition-colors hover:border-terracotta hover:text-terracotta"
        >
          <LogOut size={14} /> 退出登录
        </button>
      </div>

      {/* 绑定信息 */}
      <div className="mt-5 grid grid-cols-1 gap-2 sm:grid-cols-3">
        <button
          onClick={() => setBindChannel('email')}
          className="flex items-center gap-2 rounded-xl border border-warm bg-base/60 px-4 py-3 text-left text-sm transition-colors hover:border-terracotta"
        >
          <Mail size={15} className="shrink-0 text-ink-muted" />
          <span className="min-w-0 flex-1 truncate text-ink-secondary">{user.email ?? '未绑定邮箱'}</span>
          <span className="shrink-0 text-xs font-medium text-terracotta">{user.email ? '换绑' : '绑定'}</span>
        </button>
        <button
          onClick={() => setBindChannel('phone')}
          className="flex items-center gap-2 rounded-xl border border-warm bg-base/60 px-4 py-3 text-left text-sm transition-colors hover:border-terracotta"
        >
          <Smartphone size={15} className="shrink-0 text-ink-muted" />
          <span className="min-w-0 flex-1 truncate text-ink-secondary">{user.phone ?? '未绑定手机'}</span>
          <span className="shrink-0 text-xs font-medium text-terracotta">{user.phone ? '换绑' : '绑定'}</span>
        </button>
        <button
          onClick={() => setPwdOpen(true)}
          className="flex items-center gap-2 rounded-xl border border-warm bg-base/60 px-4 py-3 text-left text-sm transition-colors hover:border-terracotta"
        >
          <KeyRound size={15} className="shrink-0 text-ink-muted" />
          <span className="min-w-0 flex-1 truncate text-ink-secondary">登录密码</span>
          <span className="shrink-0 text-xs font-medium text-terracotta">修改</span>
        </button>
      </div>

      {/* 通知偏好 */}
      <div className="mt-5 rounded-2xl bg-base/60 px-4 py-2">
        <p className="flex items-center gap-1.5 pt-2 text-xs font-medium text-ink-muted">
          <BellRing size={13} /> 学习通知
        </p>
        <ToggleRow
          label="邮件通知"
          desc={user.email ? `每日提醒发送至 ${user.email}（当前为开发模式，记录于发件箱）` : '绑定邮箱后可接收每日学习提醒邮件'}
          checked={user.notifyEmail}
          onChange={(v) => void updatePref({ notifyEmail: v })}
        />
        <ToggleRow
          label="站内通知"
          desc="到点后在通知中心提醒你学习（铃铛红点）"
          checked={user.notifyBrowser}
          onChange={(v) => void updatePref({ notifyBrowser: v })}
        />
        <div className="flex items-center justify-between gap-4 border-t border-warm/60 py-2">
          <div>
            <p className="text-sm font-medium text-ink">每日提醒时间</p>
            <p className="mt-0.5 text-xs text-ink-muted">到点推送学习提醒（按小时生效）</p>
          </div>
          <input
            type="time"
            value={user.remindTime}
            onChange={(e) => void updatePref({ remindTime: e.target.value })}
            aria-label="每日提醒时间"
            className="rounded-xl border border-warm bg-paper px-3 py-1.5 text-sm text-ink outline-none focus:border-terracotta"
          />
        </div>
      </div>

      {/* 弹层 */}
      <AnimatePresence>
        {bindChannel && <BindModal channel={bindChannel} onClose={() => setBindChannel(null)} />}
        {pwdOpen && <PasswordModal onClose={() => setPwdOpen(false)} />}
      </AnimatePresence>
    </motion.section>
  );
}
