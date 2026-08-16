/**
 * Layout — AppShell：顶部导航 + 页面容器(Outlet) + 移动端底部 Tab Bar
 * 路由约定：本组件渲染 <Outlet/>，App.tsx 必须将页面路由嵌套在 <Route element={<Layout/>}> 下。
 * 注：页脚已按批注删除，「安装到主屏幕」按钮移至首页 CTA 下方。
 */
import { Outlet, NavLink, useLocation } from 'react-router';
import { useEffect } from 'react';
import { Home, Type, BookOpenText, Mic2, FolderOpen } from 'lucide-react';
import Navbar from './Navbar';
import { AppToaster } from './Toast';
import { syncEnsureUser } from '@/lib/sync';
import { startStudyTimer } from '@/lib/studyTime';
import { cn } from '@/lib/utils';

/** 移动端底部 Tab Bar 五项（与路由一致） */
const TAB_ITEMS = [
  { to: '/', label: '首页', icon: Home },
  { to: '/hangul', label: '40音', icon: Type },
  { to: '/vocabulary', label: '单词', icon: BookOpenText },
  { to: '/pronunciation', label: '发音', icon: Mic2 },
  { to: '/corpus', label: '语料', icon: FolderOpen },
] as const;

export default function Layout() {
  const { pathname } = useLocation();

  // 路由切换时回到顶部
  useEffect(() => {
    window.scrollTo(0, 0);
  }, [pathname]);

  // Layout 挂载时云端建档（fire-and-forget，离线静默失败）
  useEffect(() => {
    void syncEnsureUser();
  }, []);

  // 学习时长计时：pathname 变化时重启（旧页面的秒数先落库再切换）
  useEffect(() => {
    return startStudyTimer(pathname);
  }, [pathname]);

  return (
    <div className="flex min-h-[100dvh] flex-col">
      <Navbar />
      {/* 页面容器：移动端底部预留 Tab Bar 高度（64px + safe-area） */}
      <main className="flex-1 pb-24 lg:pb-0">
        <Outlet />
      </main>

      {/* 移动端底部 Tab Bar（safe-area 适配） */}
      <nav
        aria-label="底部导航"
        className="fixed inset-x-0 bottom-0 z-50 border-t border-warm bg-paper/95 backdrop-blur lg:hidden"
        style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}
      >
        <div className="flex h-16 items-stretch">
          {TAB_ITEMS.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.to === '/'}
              className={({ isActive }) =>
                cn(
                  'flex flex-1 flex-col items-center justify-center gap-1 text-xs transition-colors duration-200',
                  isActive ? 'text-terracotta' : 'text-ink-muted',
                )
              }
            >
              {({ isActive }) => (
                <>
                  {/* 激活态图标上跳微动效 */}
                  <item.icon
                    size={22}
                    className={cn('transition-transform duration-200 ease-quint', isActive && '-translate-y-0.5')}
                  />
                  <span className={cn(isActive && 'font-medium')}>{item.label}</span>
                </>
              )}
            </NavLink>
          ))}
        </div>
      </nav>

      <AppToaster />
    </div>
  );
}
