/**
 * NotificationBell.tsx — 通知中心（v2.3.0）
 * 登录用户在导航栏显示铃铛：未读红点 → 下拉通知列表 → 一键全部已读。
 * 每 60s 轮询未读数；若浏览器通知已授权且未读数增加，弹出系统通知。
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Bell, BellOff, CheckCheck } from 'lucide-react';
import { client } from '@/lib/sync';
import { useAuth } from '@/lib/auth';
import { showToast } from '@/components/Toast';
import { cn } from '@/lib/utils';

interface NotificationItem {
  id: number;
  title: string;
  body: string;
  type: string;
  readAt: string | Date | null;
  createdAt: string | Date;
}

export default function NotificationBell() {
  const { user } = useAuth();
  const [unread, setUnread] = useState(0);
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState<NotificationItem[]>([]);
  const [loadingList, setLoadingList] = useState(false);
  const [browserGranted, setBrowserGranted] = useState(
    typeof Notification !== 'undefined' && Notification.permission === 'granted',
  );
  const prevUnreadRef = useRef(0);

  /** 拉未读数；新增未读时若浏览器通知已授权则弹系统通知 */
  const pollUnread = useCallback(async () => {
    if (!user) return;
    try {
      const { count } = await client.notify.unreadCount.query();
      if (
        count > prevUnreadRef.current &&
        typeof Notification !== 'undefined' &&
        Notification.permission === 'granted' &&
        document.hidden
      ) {
        new Notification('韩之语', { body: `你有 ${count} 条未读通知，记得回来学习哦` });
      }
      prevUnreadRef.current = count;
      setUnread(count);
    } catch { /* 离线静默 */ }
  }, [user]);

  useEffect(() => {
    if (!user) return;
    void pollUnread();
    const timer = setInterval(() => void pollUnread(), 60_000);
    return () => clearInterval(timer);
  }, [user, pollUnread]);

  /** 展开时拉取通知列表 */
  const toggleOpen = async () => {
    if (!open) {
      setLoadingList(true);
      try {
        const list = await client.notify.list.query();
        setItems(list as NotificationItem[]);
      } catch { /* 静默 */ }
      setLoadingList(false);
    }
    setOpen(!open);
  };

  const markAllRead = async () => {
    try {
      await client.notify.markAllRead.mutate();
      setUnread(0);
      prevUnreadRef.current = 0;
      setItems((list) => list.map((n) => ({ ...n, readAt: new Date() })));
    } catch { /* 静默 */ }
  };

  /** 请求浏览器通知授权 */
  const requestBrowserNotify = async () => {
    if (typeof Notification === 'undefined') {
      showToast('当前浏览器不支持系统通知');
      return;
    }
    const result = await Notification.requestPermission();
    setBrowserGranted(result === 'granted');
    showToast(result === 'granted' ? '浏览器通知已开启' : '未授权，仍可在站内查看通知');
  };

  if (!user) return null;

  return (
    <div className="relative">
      <button
        onClick={() => void toggleOpen()}
        aria-label={`通知中心，${unread} 条未读`}
        className="relative rounded-full p-2 text-ink-secondary transition-colors hover:bg-sand hover:text-terracotta"
      >
        <Bell size={20} />
        {unread > 0 && (
          <span className="absolute right-0.5 top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-terracotta px-1 text-[10px] font-bold text-paper">
            {unread > 99 ? '99+' : unread}
          </span>
        )}
      </button>

      <AnimatePresence>
        {open && (
          <>
            {/* 点击遮罩关闭 */}
            <div className="fixed inset-0 z-[60]" onClick={() => setOpen(false)} />
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: -6 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.97 }}
              transition={{ duration: 0.15 }}
              className="absolute right-0 top-11 z-[61] w-80 overflow-hidden rounded-2xl border border-warm bg-paper shadow-lift"
            >
              <div className="flex items-center justify-between border-b border-warm px-4 py-3">
                <span className="text-sm font-medium text-ink">通知中心</span>
                <div className="flex items-center gap-1">
                  <button
                    onClick={() => void requestBrowserNotify()}
                    title={browserGranted ? '浏览器通知已开启' : '开启浏览器系统通知'}
                    className={cn(
                      'rounded-full p-1.5 transition-colors hover:bg-sand',
                      browserGranted ? 'text-olive' : 'text-ink-muted',
                    )}
                  >
                    {browserGranted ? <Bell size={14} /> : <BellOff size={14} />}
                  </button>
                  <button
                    onClick={() => void markAllRead()}
                    title="全部标为已读"
                    className="rounded-full p-1.5 text-ink-muted transition-colors hover:bg-sand hover:text-terracotta"
                  >
                    <CheckCheck size={14} />
                  </button>
                </div>
              </div>
              <div className="max-h-80 overflow-y-auto">
                {loadingList ? (
                  <p className="px-4 py-6 text-center text-xs text-ink-muted">加载中…</p>
                ) : items.length === 0 ? (
                  <p className="px-4 py-6 text-center text-xs text-ink-muted">暂无通知</p>
                ) : (
                  items.map((n) => (
                    <div
                      key={n.id}
                      className={cn(
                        'border-b border-warm/60 px-4 py-3 last:border-0',
                        !n.readAt && 'bg-terracotta-soft/30',
                      )}
                    >
                      <p className="flex items-center gap-2 text-sm font-medium text-ink">
                        {!n.readAt && <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-terracotta" />}
                        {n.title}
                      </p>
                      {n.body && <p className="mt-0.5 text-xs leading-relaxed text-ink-secondary">{n.body}</p>}
                      <p className="mt-1 text-[10px] text-ink-muted">
                        {new Date(n.createdAt).toLocaleString('zh-CN', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
                      </p>
                    </div>
                  ))
                )}
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </div>
  );
}
