/**
 * Home — 首页
 * 结构（按批注重构）：
 *   1. SplashScreen 开屏页 —— 品牌标语全屏展示 3 秒后淡出进入主界面（每会话仅一次，点击可跳过）
 *   2. 每日一句卡片 —— 压缩版，约占首屏 30%
 *   3. 今日学习概览（合并「开始今日学习」CTA）—— 约占首屏 70%
 * 已删除：Hero 插画区、「学习 40 音」按钮、功能入口区块、学习路径区块
 * 设计依据：home.md + design.md（暖色纸感、easeOutQuint、入场 stagger）
 */
import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router';
import { motion, useInView, AnimatePresence } from 'framer-motion';
import {
  ArrowRight, Flame, BookOpen, Target, Type, Star, RefreshCw,
  ChevronDown, Volume2, Download,
} from 'lucide-react';
import SpeakButton from '@/components/SpeakButton';
import SectionHeading from '@/components/SectionHeading';
import StatChip from '@/components/StatChip';
import ProgressRing from '@/components/ProgressRing';
import { showToast } from '@/components/Toast';
import { getSentenceOfDay, DAILY_SENTENCES } from '@/data/sentences';
import { getStats, updateStats, STORAGE_KEYS, readStorage, writeStorage } from '@/lib/storage';
import { cn } from '@/lib/utils';

/** 全局质感曲线 easeOutQuint */
const EASE = [0.22, 1, 0.36, 1] as [number, number, number, number];

/** 开屏页「每会话只显示一次」的会话标记键 */
const SPLASH_KEY = 'hjy:splash-shown';

/* ---------------- 开屏页（停留 3 秒后消失进入主界面） ---------------- */

function SplashScreen({ onDone }: { onDone: () => void }) {
  // closing=true 触发 CSS 淡出，淡出完成后卸载（纯 CSS 过渡，兼容性最好）
  const [closing, setClosing] = useState(false);

  // 3 秒停留 → 0.6s 淡出 → 进入主界面
  useEffect(() => {
    const t1 = setTimeout(() => setClosing(true), 3000);
    const t2 = setTimeout(onDone, 3600);
    return () => { clearTimeout(t1); clearTimeout(t2); };
  }, [onDone]);

  // 点击跳过（立即淡出）
  const dismiss = () => {
    setClosing(true);
    setTimeout(onDone, 500);
  };

  return (
    <div
      role="button"
      aria-label="点击进入主界面"
      onClick={dismiss}
      className={cn(
        'fixed inset-0 z-[100] flex cursor-pointer flex-col items-center justify-center bg-base px-6 text-center',
        'transition-opacity duration-500 ease-out',
        closing && 'pointer-events-none opacity-0',
      )}
      style={{ backgroundImage: "url('/daily-texture.svg')" }}
    >
      {/* 装饰浮动字符（从每日一句卡片移至开屏，视口四角缓慢漂浮，随开屏一起淡出） */}
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 0.8, delay: 0.8 }}
        aria-hidden
      >
        <FloatingChar char="안녕" className="left-[10%] top-[18%] text-3xl text-olive/70 md:text-4xl" delay={0} />
        <FloatingChar char="사랑" className="right-[10%] top-[30%] text-2xl text-terracotta/70 md:text-3xl" delay={1.5} />
        <FloatingChar char="꿈" className="bottom-[24%] left-[16%] text-2xl text-honey/80 md:text-3xl" delay={3} />
        <FloatingChar char="한국어" className="bottom-[30%] right-[14%] text-xl text-terracotta-deep/60 md:text-2xl" delay={2.2} />
      </motion.div>
      {/* Logo */}
      <motion.img
        src="/logo.svg"
        alt="韩之语"
        className="h-14 w-auto md:h-16"
        initial={{ opacity: 0, scale: 0.9 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ duration: 0.5, ease: EASE }}
      />
      {/* 品牌标语（原 Hero 文案，词级 stagger 入场） */}
      <motion.p
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 0.5, delay: 0.3 }}
        className="mt-8 text-xs font-medium uppercase tracking-[2px] text-honey"
      >
        오늘도 화이팅 · 今天也加油
      </motion.p>
      <h1 className="mt-4 font-serif text-4xl font-bold leading-snug text-ink md:text-6xl">
        {['每天一句，', '慢慢', '开口说韩语', '。'].map((w, i) => (
          <motion.span
            key={i}
            className={cn('inline-block', w === '开口说韩语' && 'text-terracotta')}
            initial={{ opacity: 0, y: 30 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, delay: 0.4 + i * 0.08, ease: EASE }}
          >
            {w}
          </motion.span>
        ))}
      </h1>
      <motion.p
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 0.5, delay: 1 }}
        className="mt-6 flex items-center gap-1.5 text-xs text-ink-muted"
      >
        <Volume2 size={14} />
        支持离线使用 · 可安装到主屏幕
      </motion.p>
      {/* 3 秒进度条提示 */}
      <motion.div
        className="absolute bottom-16 h-0.5 w-32 overflow-hidden rounded-full bg-warm"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 0.6 }}
      >
        <motion.div
          className="h-full bg-terracotta"
          initial={{ x: '-100%' }}
          animate={{ x: '0%' }}
          transition={{ duration: 2.4, ease: 'linear', delay: 0.6 }}
        />
      </motion.div>
    </div>
  );
}

/* ---------------- 插画内浮动的韩文字符（memo 微组件，6s 慢速循环） ---------------- */

function FloatingChar({ char, className, delay }: { char: string; className: string; delay: number }) {
  return (
    <motion.span
      className={cn('absolute font-kr font-bold', className)}
      animate={{ y: [-6, 6, -6] }}
      transition={{ duration: 6, repeat: Infinity, ease: 'easeInOut', delay }}
      aria-hidden
    >
      {char}
    </motion.span>
  );
}

/* ---------------- 每日一句卡片（压缩版，约占首屏 30%） ---------------- */

function DailySentenceCard() {
  const today = getSentenceOfDay();
  const [index, setIndex] = useState(() => DAILY_SENTENCES.indexOf(today));
  const [expanded, setExpanded] = useState(false);
  const sentence = DAILY_SENTENCES[index];
  const ref = useRef<HTMLDivElement>(null);
  const inView = useInView(ref, { amount: 0.25, once: true });

  // 收藏状态（localStorage 持久化）
  const [favorites, setFavorites] = useState<string[]>(() => readStorage<string[]>(STORAGE_KEYS.FAVORITE_SENTENCES, []));
  const isFav = favorites.includes(sentence.korean);

  const toggleFavorite = () => {
    const next = isFav ? favorites.filter((k) => k !== sentence.korean) : [...favorites, sentence.korean];
    setFavorites(next);
    writeStorage(STORAGE_KEYS.FAVORITE_SENTENCES, next);
    showToast(isFav ? '已取消收藏' : '已收藏到生词本');
  };

  // 换一句：循环切换
  const nextSentence = () => setIndex((i) => (i + 1) % DAILY_SENTENCES.length);

  const now = new Date();
  const dateStr = `${now.getFullYear()}年${now.getMonth() + 1}月${now.getDate()}日 星期${'日一二三四五六'[now.getDay()]}`;

  return (
    // 压缩版卡片：随父容器弹性伸缩，移动端自然堆叠
    <motion.div
      ref={ref}
      initial={{ opacity: 0, y: 24 }}
      animate={inView ? { opacity: 1, y: 0 } : undefined}
      transition={{ duration: 0.5, ease: EASE }}
      className="relative w-full rounded-3xl border border-warm bg-paper p-5 shadow-card md:p-6"
      style={{ backgroundImage: "url('/daily-texture.svg')" }}
    >
      {/* 顶部：标签 + 日期 + 换一句 */}
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0">
          <span className="text-xs font-medium uppercase tracking-widest text-honey">每日一句 Daily Sentence</span>
          <p className="mt-0.5 truncate text-xs text-ink-muted">{dateStr}</p>
        </div>
        <button
          type="button"
          onClick={nextSentence}
          aria-label="换一句"
          className="shrink-0 rounded-full border border-warm p-2.5 text-ink-secondary transition-all hover:rotate-90 hover:bg-sand hover:text-terracotta"
        >
          <RefreshCw size={16} />
        </button>
      </div>

      {/* 句子主体（换句时滑入淡出，压缩版字号） */}
      <AnimatePresence mode="wait">
        <motion.div
          key={sentence.korean}
          initial={{ opacity: 0, x: 24 }}
          animate={{ opacity: 1, x: 0 }}
          exit={{ opacity: 0, x: -24 }}
          transition={{ duration: 0.3, ease: EASE }}
          className="relative mt-4 text-center"
        >
          {/* 装饰浮动字符已按批注移至开屏动画 */}
          <p className="font-kr text-xl font-bold leading-relaxed text-ink md:text-2xl">
            {sentence.korean.split(' ').map((word, i) => (
              <span key={i} className="rounded-md px-1 transition-colors hover:bg-sand">
                {word}{' '}
              </span>
            ))}
          </p>
          <p className="mt-2 truncate text-xs italic text-ink-muted">{sentence.romanization}</p>
          <p className="mt-2 text-base text-ink">{sentence.chinese}</p>
        </motion.div>
      </AnimatePresence>

      {/* 底部操作条（压缩间距） */}
      <div className="mt-4 flex flex-wrap items-center justify-center gap-3 border-t border-warm pt-4">
        <SpeakButton text={sentence.korean} size="md" />
        <SpeakButton text={sentence.korean} rate={0.7} size="sm" className="bg-olive hover:bg-olive/80" />
        <span className="text-xs text-ink-muted">常速 / 慢速 0.7×</span>
        <motion.button
          type="button"
          whileTap={{ scale: 0.85 }}
          onClick={toggleFavorite}
          aria-label="收藏"
          className="rounded-full border border-warm p-2.5 transition-colors hover:bg-sand"
        >
          <Star size={18} className={isFav ? 'fill-honey text-honey' : 'text-ink-muted'} />
        </motion.button>
      </div>

      {/* 单词拆解折叠区 */}
      <button
        type="button"
        onClick={() => setExpanded((v) => !v)}
        className="mt-3 flex w-full items-center justify-center gap-1 text-sm text-ink-secondary transition-colors hover:text-terracotta"
      >
        单词拆解
        <ChevronDown size={16} className={cn('transition-transform duration-200', expanded && 'rotate-180')} />
      </button>
      <AnimatePresence>
        {expanded && (
          <motion.ul
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.3, ease: EASE }}
            className="overflow-hidden"
          >
            <div className="mt-3 space-y-2">
              {sentence.words.map((w) => (
                <li key={w.word} className="flex list-none items-center gap-3 rounded-xl bg-sand px-4 py-2.5">
                  <span className="font-kr text-lg font-bold text-ink">{w.word}</span>
                  <span className="text-xs text-ink-muted">{w.pos}</span>
                  <span className="flex-1 text-sm text-ink-secondary">{w.meaning}</span>
                  <SpeakButton text={w.word} size="sm" />
                </li>
              ))}
            </div>
          </motion.ul>
        )}
      </AnimatePresence>
    </motion.div>
  );
}

/* ---------------- 今日学习概览（合并「开始今日学习」CTA，约占首屏 70%） ---------------- */

/** 数字计数动画（0→目标值，800ms ease-out） */
function useCountUp(target: number, start: boolean, duration = 800): number {
  const [value, setValue] = useState(0);
  useEffect(() => {
    if (!start) return;
    let raf = 0;
    const t0 = performance.now();
    const tick = (now: number) => {
      const p = Math.min(1, (now - t0) / duration);
      const eased = 1 - Math.pow(1 - p, 3); // ease-out cubic
      setValue(Math.round(target * eased));
      if (p < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [target, start, duration]);
  return value;
}

function StatsOverview() {
  const ref = useRef<HTMLDivElement>(null);
  const inView = useInView(ref, { amount: 0.3, once: true });
  const stats = getStats();
  // 演示默认值：无历史数据时给友好占位
  const streak = useCountUp(stats.streakDays, inView);
  const words = useCountUp(stats.wordsLearned, inView);
  const todayDone = useCountUp(stats.todayDone, inView);
  const hangul = useCountUp(stats.hangulPercent, inView);
  const goalPct = stats.todayGoal > 0 ? (stats.todayDone / stats.todayGoal) * 100 : 0;

  return (
    <div className="flex h-full flex-col justify-center">
      <SectionHeading title="今日学习概览" sub="오늘의 학습" className="mb-8" />
      <motion.div
        ref={ref}
        initial="hidden"
        animate={inView ? 'show' : undefined}
        variants={{ show: { transition: { staggerChildren: 0.1 } } }}
        className="grid grid-cols-2 gap-4 lg:grid-cols-4"
      >
        {[
          <StatChip key="s" icon={<Flame size={20} />} label="连续学习" tone="honey"
            value={stats.streakDays > 0 ? streak : '从今日第一句开始'} unit={stats.streakDays > 0 ? '天' : undefined} />,
          <StatChip key="w" icon={<BookOpen size={20} />} label="已学单词" tone="terracotta"
            value={stats.wordsLearned > 0 ? words : '待开始'} />,
          <StatChip key="g" icon={<Target size={20} />} label="今日目标" tone="olive"
            value={`${todayDone}/${stats.todayGoal}`} unit="句"
            extra={<ProgressRing percent={goalPct} size={44} strokeWidth={5} label="" />} />,
          <StatChip key="h" icon={<Type size={20} />} label="40音掌握" tone="clay"
            value={hangul} unit="%"
            extra={<ProgressRing percent={stats.hangulPercent} size={44} strokeWidth={5} color="#7A8450" label="" />} />,
        ].map((chip) => (
          <motion.div key={chip.key} variants={{ hidden: { opacity: 0, y: 24 }, show: { opacity: 1, y: 0, transition: { duration: 0.5, ease: EASE } } }}>
            {chip}
          </motion.div>
        ))}
      </motion.div>

      {/* 合并自 Hero 的主 CTA（按批注界面居中；「学习 40 音」按钮已按批注删除） */}
      <motion.div
        initial={{ opacity: 0, y: 24 }}
        animate={inView ? { opacity: 1, y: 0 } : undefined}
        transition={{ duration: 0.5, delay: 0.4, ease: EASE }}
        className="mt-10 flex flex-col items-center gap-3"
      >
        {/* 主 CTA「开始今日学习」+ 次要「复习」（同级横向排列、整体居中，移动端允许换行） */}
        <div className="flex flex-wrap items-center justify-center gap-3">
          <motion.div whileHover={{ scale: 1.03 }} whileTap={{ scale: 0.97 }}>
            <Link
              to="/vocabulary"
              className="group inline-flex items-center gap-2 rounded-full bg-terracotta px-7 py-3.5 font-medium text-paper shadow-card transition-colors hover:bg-terracotta-deep"
            >
              开始今日学习
              <ArrowRight size={18} className="transition-transform group-hover:translate-x-0.5" />
            </Link>
          </motion.div>
          <motion.div whileHover={{ scale: 1.03 }} whileTap={{ scale: 0.97 }}>
            <Link
              to="/review"
              className="inline-flex items-center gap-2 rounded-full border border-olive px-7 py-3.5 font-medium text-olive transition-colors hover:bg-olive hover:text-paper"
            >
              复习
            </Link>
          </motion.div>
        </div>
        {/* 「安装到主屏幕」按钮：按批注从页脚移至此处并缩小 */}
        <button
          type="button"
          className="inline-flex items-center gap-1.5 rounded-full border border-terracotta px-3 py-1 text-xs text-terracotta transition-colors hover:bg-terracotta hover:text-paper"
          onClick={() => alert('iOS：Safari 分享 → 添加到主屏幕\n桌面：浏览器地址栏右侧安装图标')}
        >
          <Download size={12} />
          安装到主屏幕
        </button>
      </motion.div>
    </div>
  );
}

/* ---------------- 页面组装 ---------------- */

export default function Home() {
  // 开屏页状态：每会话只显示一次
  const [showSplash, setShowSplash] = useState(
    () => typeof sessionStorage !== 'undefined' && !sessionStorage.getItem(SPLASH_KEY),
  );
  const dismissSplash = () => {
    sessionStorage.setItem(SPLASH_KEY, '1');
    setShowSplash(false);
  };

  // 记录今日访问，累计连续学习天数（简单实现）
  useEffect(() => {
    const today = new Date().toDateString();
    const lastVisit = readStorage<string>(`${STORAGE_KEYS.STATS}:last-visit`, '');
    if (lastVisit !== today) {
      const stats = getStats();
      updateStats({ streakDays: lastVisit ? stats.streakDays + 1 : Math.max(1, stats.streakDays) });
      writeStorage(`${STORAGE_KEYS.STATS}:last-visit`, today);
    }
  }, []);

  return (
    <>
      {/* 开屏页：停留 3 秒后淡出（点击可跳过） */}
      {showSplash && <SplashScreen onDone={dismissSplash} />}

      {/* 主界面：每日一句（约 30%）+ 今日学习概览（约 70%），移动端自然堆叠 */}
      <div className="mx-auto grid max-w-content gap-10 px-4 py-8 md:px-6 lg:h-[calc(100dvh-64px)] lg:grid-rows-[3fr_7fr] lg:gap-6 lg:py-6">
        {/* 上：每日一句卡片（含装饰字符） */}
        <section className="relative flex min-h-0 items-center">
          <motion.div
            initial={{ opacity: 0, scale: 0.96 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ duration: 0.6, ease: EASE, delay: showSplash ? 3 : 0 }}
            className="relative w-full min-w-0"
          >
            <div className="absolute inset-0 -rotate-3 rounded-3xl border border-warm bg-sand" aria-hidden />
            <DailySentenceCard />
          </motion.div>
        </section>

        {/* 下：今日学习概览 + 开始今日学习 CTA */}
        <section className="min-h-0 rounded-3xl bg-sand px-5 py-8 md:px-8">
          <StatsOverview />
        </section>
      </div>
    </>
  );
}
