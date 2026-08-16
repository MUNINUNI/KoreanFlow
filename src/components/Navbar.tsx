/**
 * Navbar — PC 顶部导航 + 移动端精简顶栏
 * PC：Logo + 全部路由链接 + 连续天数统计；当前页赤陶橘 + layoutId 滑动下划线。
 * 移动端：精简 Logo + 统计图标（主导航在底部 Tab Bar）。
 */
import { useEffect, useState } from 'react';
import { Link, NavLink } from 'react-router';
import { motion } from 'framer-motion';
import { Flame, CircleUserRound } from 'lucide-react';
import { getStats } from '@/lib/storage';
import { cn } from '@/lib/utils';

/** 全站路由导航项（与 App.tsx 路由保持一致） */
export const NAV_ITEMS = [
  { to: '/', label: '首页' },
  { to: '/hangul', label: '40音入门' },
  { to: '/vocabulary', label: '单词学习' },
  { to: '/pronunciation', label: '发音练习' },
  { to: '/corpus', label: '语料中心' },
] as const;

export default function Navbar() {
  const [scrolled, setScrolled] = useState(false);
  const streak = getStats().streakDays;

  // 滚动时加轻阴影
  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 8);
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  return (
    <header
      className={cn(
        'sticky top-0 z-50 border-b border-warm bg-paper/95 backdrop-blur transition-shadow duration-200',
        scrolled && 'shadow-card',
      )}
    >
      <div className="mx-auto flex h-16 max-w-content items-center justify-between px-4 md:px-6">
        {/* 左：Logo */}
        <Link to="/" aria-label="韩之语首页" className="flex items-center">
          <img src="/logo.svg" alt="韩之语" className="h-10 w-auto" />
        </Link>

        {/* 中：导航链接（PC 显示） */}
        <nav className="hidden items-center gap-1 lg:flex" aria-label="主导航">
          {NAV_ITEMS.map((item) => (
            <NavLink key={item.to} to={item.to} end={item.to === '/'}>
              {({ isActive }) => (
                <span
                  className={cn(
                    'relative block px-4 py-2 text-sm transition-colors duration-200',
                    isActive ? 'font-medium text-terracotta' : 'text-ink-secondary hover:text-ink',
                  )}
                >
                  {item.label}
                  {/* 当前页下划线：layoutId 滑动动画 */}
                  {isActive && (
                    <motion.span
                      layoutId="nav-underline"
                      className="absolute inset-x-4 -bottom-0.5 h-0.5 rounded-full bg-terracotta"
                      transition={{ type: 'spring', stiffness: 500, damping: 40 }}
                    />
                  )}
                </span>
              )}
            </NavLink>
          ))}
        </nav>

        {/* 右：连续学习天数统计 + 个人中心入口（PC/移动端均显示） */}
        <div className="flex items-center gap-2">
          <div
            className="flex items-center gap-1.5 rounded-full bg-honey/15 px-3 py-1.5 text-sm font-medium text-honey"
            title={`已连续学习 ${streak} 天`}
          >
            <Flame size={16} />
            <span>{streak} 天</span>
          </div>
          <Link
            to="/profile"
            aria-label="我的"
            className="rounded-full p-2 text-ink-secondary transition-colors hover:bg-sand hover:text-terracotta"
          >
            <CircleUserRound size={22} />
          </Link>
        </div>
      </div>
    </header>
  );
}
