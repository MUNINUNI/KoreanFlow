/**
 * Hangul — 40音入门页
 * 模块：页头+进度环 / 元音21分组Tab网格 / 辅音19分组Tab网格（发音要领tooltip）/
 *       音节拼合互动区 / 笔顺小贴士 / 底部引导。
 * 交互：点击字母 TTS 发音+涟漪；双击切换「点亮掌握」（localStorage `hjy:hangul-progress: string[]`）。
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router';
import { motion, AnimatePresence, useInView } from 'framer-motion';
import { Check, Dices, RotateCcw, ArrowRight } from 'lucide-react';
import { VOWELS, CONSONANTS, TOTAL_LETTERS, combineSyllable, SYLLABLE_WORDS } from '@/data/hangul';
import type { HangulLetter } from '@/data/hangul';
import { speakKorean, stopSpeaking, isTtsSupported } from '@/lib/tts';
import { readStorage, writeStorage, removeStorage, STORAGE_KEYS } from '@/lib/storage';
import SectionHeading from '@/components/SectionHeading';
import ProgressRing from '@/components/ProgressRing';
import SpeakButton from '@/components/SpeakButton';
import { cn } from '@/lib/utils';

/** 全局动效曲线（design.md：easeOutQuint 质感） */
const EASE = [0.22, 1, 0.36, 1] as [number, number, number, number];
/** 「双击标记已会」提示只显示一次的 localStorage 键 */
const HINT_KEY = 'hjy:hangul-dblclick-hint';

/** 读取已点亮字母集合 */
function loadProgress(): Set<string> {
  return new Set(readStorage<string[]>(STORAGE_KEYS.HANGUL_PROGRESS, []));
}

// ---------------------------------------------------------------------------
// 字母卡片：点击发音+涟漪，双击点亮；辅音悬停/点击显示发音要领 tooltip
// ---------------------------------------------------------------------------
function LetterCard({
  letter,
  mastered,
  showTip,
  onSpeak,
  onToggle,
}: {
  letter: HangulLetter;
  mastered: boolean;
  /** 是否显示发音要领 tooltip（辅音卡片用） */
  showTip: boolean;
  onSpeak: (letter: HangulLetter) => void;
  onToggle: (letter: HangulLetter) => void;
}) {
  const [rippleKey, setRippleKey] = useState(0);
  const [tipOpen, setTipOpen] = useState(false);

  /** 单击：发音 + 涟漪 */
  const handleClick = () => {
    setRippleKey((k) => k + 1);
    onSpeak(letter);
  };

  return (
    <motion.div
      className="group relative"
      initial={{ opacity: 0, scale: 0.9 }}
      animate={{ opacity: 1, scale: 1 }}
      transition={{ duration: 0.3, ease: EASE }}
    >
      <motion.button
        type="button"
        aria-label={`字母 ${letter.char}，罗马音 ${letter.roman}，点击发音，双击${mastered ? '取消' : ''}标记已会`}
        onClick={handleClick}
        onDoubleClick={() => onToggle(letter)}
        // 移动端 tooltip：触摸时切换展开
        onTouchStart={() => showTip && setTipOpen(true)}
        onMouseEnter={() => showTip && setTipOpen(true)}
        onMouseLeave={() => setTipOpen(false)}
        whileTap={{ scale: 0.94 }}
        className={cn(
          'relative flex h-20 w-full flex-col items-center justify-center gap-0.5 overflow-hidden rounded-2xl border bg-paper shadow-card transition-colors duration-200 hover:bg-sand md:h-24',
          mastered ? 'border-2 border-olive' : 'border-warm',
        )}
      >
        {/* 发音涟漪：从中心扩散 */}
        <AnimatePresence>
          {rippleKey > 0 && (
            <motion.span
              key={rippleKey}
              className="pointer-events-none absolute inset-0 rounded-2xl border-2 border-terracotta"
              initial={{ scale: 0.8, opacity: 0.5 }}
              animate={{ scale: 1.6, opacity: 0 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.6, ease: 'easeOut' }}
            />
          )}
        </AnimatePresence>
        {/* 大字字母 */}
        <span className="font-kr text-3xl font-semibold text-ink md:text-4xl">{letter.char}</span>
        {/* 罗马音小字 */}
        <span className="text-xs text-ink-muted">{letter.roman}</span>
        {/* 已点亮 ✓ 角标 */}
        {mastered && (
          <span className="absolute right-1.5 top-1.5 flex h-4 w-4 items-center justify-center rounded-full bg-olive text-paper">
            <Check size={10} strokeWidth={3} />
          </span>
        )}
      </motion.button>

      {/* 发音要领 tooltip：悬停/触摸显示，淡入+上移 4px */}
      {showTip && (
        <AnimatePresence>
          {tipOpen && (
            <motion.div
              role="tooltip"
              className="pointer-events-none absolute -top-2 left-1/2 z-20 w-44 max-w-[calc(100vw-2rem)] -translate-x-1/2 -translate-y-full rounded-lg border border-warm bg-paper px-3 py-2 text-xs leading-5 text-ink-secondary shadow-lift"
              initial={{ opacity: 0, y: 4 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 4 }}
              transition={{ duration: 0.15 }}
            >
              <span className="mr-1 font-kr font-semibold text-ink">{letter.char}</span>
              {letter.tip}
            </motion.div>
          )}
        </AnimatePresence>
      )}
    </motion.div>
  );
}

// ---------------------------------------------------------------------------
// 字母分区（元音区 / 辅音区 共用）：分组 Tab + 字母网格
// ---------------------------------------------------------------------------
function LetterSection({
  title,
  sub,
  tabs,
  activeTab,
  onTabChange,
  letters,
  masteredSet,
  withTips,
  onSpeak,
  onToggle,
}: {
  title: string;
  sub: string;
  tabs: { key: string; label: string }[];
  activeTab: string;
  onTabChange: (key: string) => void;
  letters: HangulLetter[];
  masteredSet: Set<string>;
  /** 是否给卡片加发音要领 tooltip（辅音区 true） */
  withTips: boolean;
  onSpeak: (letter: HangulLetter) => void;
  onToggle: (letter: HangulLetter) => void;
}) {
  return (
    <section className="relative">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <h2 className="font-serif text-2xl font-bold text-ink">
          {title} <span className="font-kr text-lg font-medium text-ink-secondary">{sub}</span>
        </h2>
        {/* 分组 Tab：下划线滑动 */}
        <div className="flex gap-6 border-b border-warm" role="tablist">
          {tabs.map((tab) => (
            <button
              key={tab.key}
              role="tab"
              aria-selected={activeTab === tab.key}
              onClick={() => onTabChange(tab.key)}
              className={cn(
                'relative pb-2 text-sm transition-colors duration-200',
                activeTab === tab.key ? 'font-medium text-terracotta' : 'text-ink-secondary hover:text-ink',
              )}
            >
              {tab.label}
              {activeTab === tab.key && (
                <motion.span
                  layoutId={`tab-underline-${title}`}
                  className="absolute inset-x-0 -bottom-px h-0.5 rounded-full bg-terracotta"
                  transition={{ type: 'spring', stiffness: 500, damping: 40 }}
                />
              )}
            </button>
          ))}
        </div>
      </div>

      {/* 字母网格：桌面 5 列 / 移动端 4 列；Tab 切换时 key 变化重新 stagger 入场 */}
      <motion.div
        key={activeTab}
        className="mt-6 grid grid-cols-4 gap-3 md:grid-cols-5"
        initial="hidden"
        whileInView="show"
        viewport={{ once: true, amount: 0.2 }}
        transition={{ staggerChildren: 0.03 }}
        variants={{ show: { transition: { staggerChildren: 0.03 } } }}
      >
        {letters.map((letter) => (
          <LetterCard
            key={letter.char}
            letter={letter}
            mastered={masteredSet.has(letter.char)}
            showTip={withTips}
            onSpeak={onSpeak}
            onToggle={onToggle}
          />
        ))}
      </motion.div>
    </section>
  );
}

// ---------------------------------------------------------------------------
// 音节拼合互动区
// ---------------------------------------------------------------------------
function SyllableMixer() {
  const [consonant, setConsonant] = useState('ㅎ');
  const [vowel, setVowel] = useState('ㅏ');
  const [diceSpin, setDiceSpin] = useState(0);

  /** 实时组合的音节 */
  const syllable = useMemo(() => combineSyllable(consonant, vowel) ?? '', [consonant, vowel]);
  /** 该初声开头的常见单词 1–2 个 */
  const words = SYLLABLE_WORDS[consonant] ?? [];

  /** 选择并发音 */
  const pick = useCallback((c: string, v: string) => {
    setConsonant(c);
    setVowel(v);
    const syl = combineSyllable(c, v);
    if (syl) speakKorean(syl);
  }, []);

  /** 随机组合：随机挑一对辅音元音并发音，按钮旋转 180° */
  const randomPick = () => {
    const c = CONSONANTS[Math.floor(Math.random() * CONSONANTS.length)].char;
    const v = VOWELS[Math.floor(Math.random() * VOWELS.length)].char;
    setDiceSpin((s) => s + 180);
    pick(c, v);
  };

  /** 胶囊选择条 */
  const Chip = ({ label, active, onClick }: { label: string; active: boolean; onClick: () => void }) => (
    <motion.button
      type="button"
      onClick={onClick}
      // 选中回弹 spring
      animate={{ scale: active ? 1 : 0.95 }}
      transition={{ type: 'spring', stiffness: 500, damping: 22 }}
      className={cn(
        'flex h-10 w-10 shrink-0 items-center justify-center rounded-full font-kr text-lg transition-colors duration-200',
        active ? 'bg-terracotta text-paper shadow-card' : 'bg-sand text-ink-secondary hover:bg-terracotta-soft hover:text-terracotta',
      )}
    >
      {label}
    </motion.button>
  );

  return (
    <section className="rounded-3xl border border-warm bg-paper p-6 shadow-card md:p-10">
      <SectionHeading title="试着拼一个音节" sub="음절을 만들어 보세요" />

      {/* 辅音选择条（横向滚动） */}
      <div className="mt-8">
        <p className="mb-2 text-sm text-ink-muted">① 选一个辅音</p>
        <div className="flex gap-2 overflow-x-auto pb-2">
          {CONSONANTS.map((c) => (
            <Chip key={c.char} label={c.char} active={consonant === c.char} onClick={() => pick(c.char, vowel)} />
          ))}
        </div>
      </div>
      {/* 元音选择条（横向滚动） */}
      <div className="mt-4">
        <p className="mb-2 text-sm text-ink-muted">② 选一个元音</p>
        <div className="flex gap-2 overflow-x-auto pb-2">
          {VOWELS.map((v) => (
            <Chip key={v.char} label={v.char} active={vowel === v.char} onClick={() => pick(consonant, v.char)} />
          ))}
        </div>
      </div>

      {/* 中央大字预览区 */}
      <div className="mt-8 flex flex-col items-center gap-4">
        <div className="flex items-center gap-3 text-2xl text-ink-muted">
          <span className="font-kr">{consonant}</span>
          <span>+</span>
          <span className="font-kr">{vowel}</span>
          <span>=</span>
          {/* 音节字切换：旧字下沉淡出，新字上浮淡入 */}
          <AnimatePresence mode="popLayout">
            <motion.span
              key={syllable}
              className="font-kr text-6xl font-bold text-terracotta md:text-7xl"
              initial={{ opacity: 0, y: -16 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 16 }}
              transition={{ duration: 0.25, ease: EASE }}
            >
              {syllable}
            </motion.span>
          </AnimatePresence>
        </div>

        {/* 常见单词示例（各带小喇叭） */}
        {words.length > 0 && (
          <div className="flex flex-wrap items-center justify-center gap-3">
            <span className="text-xs text-ink-muted">常见单词</span>
            {words.slice(0, 2).map((w) => (
              <span key={w.word} className="flex items-center gap-2 rounded-full bg-sand px-3 py-1.5 text-sm">
                <span className="font-kr font-medium text-ink">{w.word}</span>
                <span className="text-ink-secondary">{w.meaning}</span>
                <SpeakButton text={w.word} size="sm" className="!h-6 !w-6 [&_svg]:!h-3 [&_svg]:!w-3" />
              </span>
            ))}
          </div>
        )}

        {/* 随机组合按钮 */}
        <motion.button
          type="button"
          onClick={randomPick}
          whileTap={{ scale: 0.95 }}
          className="mt-2 inline-flex items-center gap-2 rounded-full bg-terracotta px-6 py-2.5 text-sm font-medium text-paper shadow-card transition-colors hover:bg-terracotta-deep"
        >
          <motion.span animate={{ rotate: diceSpin }} transition={{ duration: 0.4, ease: EASE }} className="inline-flex">
            <Dices size={18} />
          </motion.span>
          随机组合
        </motion.button>
      </div>
    </section>
  );
}

// ---------------------------------------------------------------------------
// 笔顺小贴士卡片 1：ㅎ+ㅏ+ㄴ → 한 分步组合示意（进入视口自动播放一次）
// ---------------------------------------------------------------------------
function ComposeDemo() {
  const ref = useRef<HTMLDivElement>(null);
  const inView = useInView(ref, { once: true, amount: 0.4 });
  // 分步：0=ㅎ 1=ㅎ+ㅏ 2=한
  const [step, setStep] = useState(0);
  const STEPS = ['ㅎ', '하', '한'];

  useEffect(() => {
    if (!inView) return;
    // 每 400ms 推进一步，播放一次后停在最终字
    const timers = [1, 2].map((s) => window.setTimeout(() => setStep(s), s * 400));
    return () => timers.forEach((t) => window.clearTimeout(t));
  }, [inView]);

  return (
    <div ref={ref} className="flex h-16 items-center justify-center">
      <AnimatePresence mode="popLayout">
        <motion.span
          key={step}
          className="font-kr text-5xl font-bold text-terracotta"
          initial={{ opacity: 0, y: -12 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: 12 }}
          transition={{ duration: 0.3, ease: EASE }}
        >
          {STEPS[step]}
        </motion.span>
      </AnimatePresence>
    </div>
  );
}

// ---------------------------------------------------------------------------
// 页面主体
// ---------------------------------------------------------------------------
export default function Hangul() {
  const [masteredSet, setMasteredSet] = useState<Set<string>>(loadProgress);
  const [vowelTab, setVowelTab] = useState('basic');
  const [consonantTab, setConsonantTab] = useState('basic');
  /** 首次点击后浮现的「双击标记已会」提示（用一次后不再显示） */
  const [showHint, setShowHint] = useState(() => !readStorage<boolean>(HINT_KEY, false));

  // 组件卸载时停止朗读
  useEffect(() => () => stopSpeaking(), []);

  /** 点击字母：TTS 发音 + 首次提示 */
  const handleSpeak = useCallback(
    (letter: HangulLetter) => {
      const ok = speakKorean(letter.speak, { rate: 0.8 });
      if (!ok) console.warn('当前浏览器不支持语音合成');
      if (showHint) {
        writeStorage(HINT_KEY, true);
        // 提示展示 3s 后淡出
        window.setTimeout(() => setShowHint(false), 3000);
      }
    },
    [showHint],
  );

  /** 双击：切换点亮状态并持久化 */
  const handleToggle = useCallback((letter: HangulLetter) => {
    setMasteredSet((prev) => {
      const next = new Set(prev);
      if (next.has(letter.char)) next.delete(letter.char);
      else next.add(letter.char);
      writeStorage(STORAGE_KEYS.HANGUL_PROGRESS, [...next]);
      return next;
    });
    setShowHint(false);
  }, []);

  /** 重置进度 */
  const resetProgress = () => {
    removeStorage(STORAGE_KEYS.HANGUL_PROGRESS);
    setMasteredSet(new Set());
  };

  const masteredCount = masteredSet.size;
  const percent = Math.round((masteredCount / TOTAL_LETTERS) * 100);
  const vowelLetters = VOWELS.filter((v) => v.group === vowelTab);
  const consonantLetters = CONSONANTS.filter((c) => c.group === consonantTab);
  const ttsOk = isTtsSupported();

  return (
    <div className="mx-auto max-w-content px-4 md:px-6">
      {/* ================= Section 1 — 页头 ================= */}
      <header className="mx-auto flex max-w-[720px] flex-col items-center gap-6 pt-16 text-center md:pt-24">
        <motion.span
          className="text-sm font-medium tracking-widest text-olive"
          initial={{ opacity: 0, y: 24 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, ease: EASE }}
        >
          한글 기초 · HANGUL BASICS
        </motion.span>
        {/* 主标：词级上移淡入 stagger */}
        <h1 className="font-serif text-3xl font-bold leading-snug text-ink md:text-4xl">
          {['韩语', '40', '音，', '一切的', '起点'].map((w, i) => (
            <motion.span
              key={i}
              className="mr-2 inline-block"
              initial={{ opacity: 0, y: 24 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.5, delay: 0.08 * (i + 1), ease: EASE }}
            >
              {w}
            </motion.span>
          ))}
        </h1>
        <motion.p
          className="text-base leading-8 text-ink-secondary"
          initial={{ opacity: 0, y: 24 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, delay: 0.5, ease: EASE }}
        >
          韩文是表音文字——21 个元音 + 19 个辅音，像积木一样拼成音节。点击任意字母听发音，学会了就点亮它。
        </motion.p>
        {!ttsOk && (
          <p className="rounded-full bg-terracotta-soft px-4 py-1.5 text-xs text-terracotta-deep">
            当前浏览器不支持语音合成，发音功能不可用，建议使用 Chrome / Safari。
          </p>
        )}
        {/* 进度环 + 重置 */}
        <motion.div
          className="flex items-center gap-4"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.6, delay: 0.6 }}
        >
          <ProgressRing
            percent={percent}
            size={72}
            color="#7A8450"
            label={`${masteredCount}/${TOTAL_LETTERS}`}
          />
          <div className="text-left">
            <p className="text-sm font-medium text-ink">已点亮 {masteredCount}/{TOTAL_LETTERS}</p>
            <button
              type="button"
              onClick={resetProgress}
              className="mt-1 inline-flex items-center gap-1 text-xs text-ink-muted underline-offset-2 hover:text-terracotta hover:underline"
            >
              <RotateCcw size={11} />
              重置进度
            </button>
          </div>
        </motion.div>
      </header>

      {/* ================= Section 2 — 元音区 ================= */}
      <div
        className="relative mt-16 rounded-3xl bg-sand px-4 py-10 md:mt-24 md:px-10 md:py-14"
        style={{ backgroundImage: 'url(/daily-texture.svg)' }}
      >
        {/* 边缘装饰字母图案 */}
        <img
          src="/hangul-deco.svg"
          alt=""
          aria-hidden
          className="pointer-events-none absolute -right-4 -top-4 w-32 opacity-60 md:w-44"
        />
        <LetterSection
          title="元音"
          sub="모음 21"
          tabs={[
            { key: 'basic', label: '基础元音 10' },
            { key: 'compound', label: '复合元音 11' },
          ]}
          activeTab={vowelTab}
          onTabChange={setVowelTab}
          letters={vowelLetters}
          masteredSet={masteredSet}
          withTips
          onSpeak={handleSpeak}
          onToggle={handleToggle}
        />
      </div>

      {/* ================= Section 3 — 辅音区 ================= */}
      <div className="mt-16 md:mt-24">
        <LetterSection
          title="辅音"
          sub="자음 19"
          tabs={[
            { key: 'basic', label: '基本辅音 14' },
            { key: 'tense', label: '紧音·送气音 5' },
          ]}
          activeTab={consonantTab}
          onTabChange={setConsonantTab}
          letters={consonantLetters}
          masteredSet={masteredSet}
          withTips
          onSpeak={handleSpeak}
          onToggle={handleToggle}
        />
      </div>

      {/* 双击提示（首次点击后浮现一次） */}
      <AnimatePresence>
        {showHint && (
          <motion.div
            className="fixed bottom-24 left-1/2 z-40 -translate-x-1/2 rounded-full bg-ink px-5 py-2.5 text-sm text-paper shadow-lift lg:bottom-10"
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 12 }}
            transition={{ duration: 0.25, ease: EASE }}
          >
            双击字母卡片可标记「已会」
          </motion.div>
        )}
      </AnimatePresence>

      {/* ================= Section 4 — 音节拼合体验 ================= */}
      <div className="mt-16 md:mt-24">
        <SyllableMixer />
      </div>

      {/* ================= Section 5 — 书写笔顺小贴士 ================= */}
      <div className="mt-16 md:mt-24">
        <SectionHeading title="书写笔顺小贴士" sub="쓰기 순서" />
        <motion.div
          className="mt-10 grid gap-4 md:grid-cols-3"
          initial="hidden"
          whileInView="show"
          viewport={{ once: true, amount: 0.2 }}
          variants={{ show: { transition: { staggerChildren: 0.1 } } }}
        >
          {[
            { title: '从左到右，从上到下', desc: '韩文按顺序拼写：先辅音、再元音、最后收音，像搭积木一样组合成方块字。', demo: true },
            { title: '元音为主轴', desc: '辅音依元音方向排布：纵向元音（ㅏㅓㅣ…）辅音在左，横向元音（ㅗㅜㅡ…）辅音在上。' },
            { title: '收音在最后', desc: '音节底部的辅音叫「收音(받침)」，写在最下面，如 한 的 ㄴ、밥 的 ㅂ。' },
          ].map((card) => (
            <motion.div
              key={card.title}
              className="rounded-2xl border border-warm bg-paper p-6 shadow-card"
              variants={{ hidden: { opacity: 0, y: 24 }, show: { opacity: 1, y: 0 } }}
              transition={{ duration: 0.4, ease: EASE }}
            >
              <h3 className="font-serif text-lg font-bold text-ink">{card.title}</h3>
              <p className="mt-2 text-sm leading-7 text-ink-secondary">{card.desc}</p>
              {card.demo && <ComposeDemo />}
            </motion.div>
          ))}
        </motion.div>
      </div>

      {/* ================= Section 6 — 底部引导 ================= */}
      <div className="mt-16 flex justify-center rounded-3xl bg-sand px-6 py-12 md:mt-24">
        <Link
          to="/vocabulary"
          className="group inline-flex items-center gap-2 rounded-full bg-terracotta px-8 py-3 font-medium text-paper shadow-card transition-all hover:bg-terracotta-deep hover:shadow-lift"
        >
          {percent >= 100 ? '40 音都点亮了？' : '学完 40 音后，'}去积累第一批单词
          <ArrowRight size={18} className="transition-transform duration-200 group-hover:translate-x-0.5" />
        </Link>
      </div>
    </div>
  );
}
