/**
 * Vocabulary — 单词学习页：词卡翻转学习 / 生词本 / 全部词库 三模式
 * 数据全部存 localStorage：
 *  - hjy:vocab-progress  认识/模糊标记（词id → 'known' | 'fuzzy'）
 *  - hjy:vocab-book      生词本数组（含添加时间戳与掌握标记，与首页收藏共用）
 *  - hjy:vocab-daily     今日已学计数（按日期重置）
 */
import { useEffect, useMemo, useRef, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Star, Trash2, Search, ChevronLeft, ChevronRight, Check, HelpCircle, BookMarked,
  RotateCw, BookOpenText, Flame, Lightbulb,
} from 'lucide-react';
import WordCard from '@/components/WordCard';
import SpeakButton from '@/components/SpeakButton';
import EmptyState from '@/components/EmptyState';
import StatChip from '@/components/StatChip';
import { showToast } from '@/components/Toast';
import WordLookupModal from '@/components/WordLookupModal';
import { speakKorean } from '@/lib/tts';
import { STORAGE_KEYS, readStorage, writeStorage, removeStorage, getStats, updateStats } from '@/lib/storage';
import { WORDS, CATEGORIES, type Word } from '@/data/words';
import { cn } from '@/lib/utils';

// ---------- 存储类型与键 ----------

/** 生词本条目 */
interface VocabEntry {
  id: string;        // 词条 id（内置词库）或自定义文本 id
  ko: string;
  rom: string;
  zh: string;
  pos: string;
  exampleKo?: string; // 例句（韩语），语料/查词添加时带上出处句
  exampleZh?: string; // 例句（中文）
  addedAt: number;   // 添加时间戳
  mastered: boolean; // 已掌握标记
}

/** 学习进度：词 id → 认识/模糊 */
type ProgressMap = Record<string, 'known' | 'fuzzy'>;

/** 今日学习计数（按日期重置） */
interface DailyCount {
  date: string; // YYYY-MM-DD
  count: number;
}

const KEY_PROGRESS = 'hjy:vocab-progress';
const KEY_DAILY = 'hjy:vocab-daily';

const DAILY_GOAL = 20;

/** 读取今日已学计数，跨天自动清零 */
function getDailyCount(): DailyCount {
  const today = new Date().toISOString().slice(0, 10);
  const saved = readStorage<DailyCount>(KEY_DAILY, { date: today, count: 0 });
  return saved.date === today ? saved : { date: today, count: 0 };
}

// ---------- 分段控制器 ----------

const MODES = [
  { id: 'learn', label: '学习模式' },
  { id: 'notebook', label: '生词本' },
  { id: 'library', label: '全部词库' },
] as const;
type Mode = (typeof MODES)[number]['id'];

export default function Vocabulary() {
  const [mode, setMode] = useState<Mode>('learn');
  const [progress, setProgress] = useState<ProgressMap>(() => readStorage(KEY_PROGRESS, {}));
  const [book, setBook] = useState<VocabEntry[]>(() => readStorage(STORAGE_KEYS.VOCAB_BOOK, []));
  const [daily, setDaily] = useState<DailyCount>(getDailyCount);

  // 进度 / 生词本 / 今日计数持久化
  useEffect(() => writeStorage(KEY_PROGRESS, progress), [progress]);
  useEffect(() => writeStorage(STORAGE_KEYS.VOCAB_BOOK, book), [book]);
  useEffect(() => writeStorage(KEY_DAILY, daily), [daily]);

  /** 切换生词本收藏状态（词卡星标 / 全部词库长按共用） */
  const toggleFavorite = (word: Word) => {
    setBook((prev) => {
      const exists = prev.some((e) => e.id === word.id);
      if (exists) {
        showToast(`已从生词本移除「${word.ko}」`);
        return prev.filter((e) => e.id !== word.id);
      }
      showToast('已加入生词本');
      return [
        { id: word.id, ko: word.ko, rom: word.rom, zh: word.zh, pos: word.pos, addedAt: Date.now(), mastered: false },
        ...prev,
      ];
    });
  };

  return (
    <div className="mx-auto max-w-content px-4 py-10 md:px-6 md:py-14">
      {/* ===== Section 1 — 页头 + 模式切换 ===== */}
      <header className="flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <h1 className="font-serif text-3xl font-bold text-ink">单词学习</h1>
          <p className="mt-1 font-kr text-sm text-ink-muted">단어 공부</p>
          {/* 分段控制器：激活段赤陶橘实底白字 + layoutId 滑块 */}
          <div className="mt-5 inline-flex rounded-full border border-warm bg-paper p-1 shadow-card">
            {MODES.map((m) => (
              <button
                key={m.id}
                type="button"
                onClick={() => setMode(m.id)}
                className={cn(
                  'relative rounded-full px-4 py-1.5 text-sm transition-colors duration-200 md:px-6',
                  mode === m.id ? 'text-paper' : 'text-ink-secondary hover:text-ink',
                )}
              >
                {mode === m.id && (
                  <motion.span
                    layoutId="vocab-mode-pill"
                    className="absolute inset-0 rounded-full bg-terracotta"
                    transition={{ type: 'spring', stiffness: 500, damping: 40 }}
                  />
                )}
                <span className="relative">{m.label}</span>
              </button>
            ))}
          </div>
        </div>
        {/* 右侧统计徽章 */}
        <div className="flex gap-3">
          <StatChip icon={<Flame size={18} />} label="今日已学" value={`${daily.count}/${DAILY_GOAL}`} tone="terracotta" className="p-3" />
          <StatChip icon={<BookOpenText size={18} />} label="生词" value={String(book.length)} unit="个" tone="clay" className="p-3" />
        </div>
      </header>

      {/* ===== 三模式内容区（交叉淡入 200ms） ===== */}
      <AnimatePresence mode="wait">
        <motion.div
          key={mode}
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -12 }}
          transition={{ duration: 0.2, ease: [0.22, 1, 0.36, 1] }}
          className="mt-8"
        >
          {mode === 'learn' && (
            <LearnMode
              progress={progress}
              setProgress={setProgress}
              book={book}
              toggleFavorite={toggleFavorite}
              onLearned={() => {
                setDaily((d) => ({ ...d, count: d.count + 1 }));
                updateStats({ wordsLearned: getStats().wordsLearned + 1 });
              }}
            />
          )}
          {mode === 'notebook' && <NotebookMode book={book} setBook={setBook} goLearn={() => setMode('learn')} />}
          {mode === 'library' && (
            <LibraryMode progress={progress} book={book} toggleFavorite={toggleFavorite} />
          )}
        </motion.div>
      </AnimatePresence>

      {/* ===== Section 5 — 底部学习建议 ===== */}
      <motion.aside
        initial={{ opacity: 0, y: 20 }}
        whileInView={{ opacity: 1, y: 0 }}
        viewport={{ once: true, amount: 0.5 }}
        transition={{ duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
        className="mt-14 flex items-start gap-3 rounded-2xl bg-sand p-5 text-sm text-ink-secondary"
      >
        <Lightbulb size={18} className="mt-0.5 shrink-0 text-honey" />
        <p>艾宾浩斯建议：收藏的生词在第 1、3、7 天复习效果最好。</p>
      </motion.aside>
    </div>
  );
}

// ============================================================
// Section 2 — 学习模式（词卡翻转）
// ============================================================

interface LearnModeProps {
  progress: ProgressMap;
  setProgress: React.Dispatch<React.SetStateAction<ProgressMap>>;
  book: VocabEntry[];
  toggleFavorite: (w: Word) => void;
  /** 完成一词（认识/模糊）时回调，用于今日计数 */
  onLearned: () => void;
}

function LearnMode({ progress, setProgress, book, toggleFavorite, onLearned }: LearnModeProps) {
  const [categoryId, setCategoryId] = useState(CATEGORIES[0].id);
  const [index, setIndex] = useState(0);
  const [flipped, setFlipped] = useState(false);
  const [slideKey, setSlideKey] = useState(0); // 切词滑入动画 key
  const [plusOne, setPlusOne] = useState(0);   // 「认识 +1」飘分 key

  const words = useMemo(() => WORDS.filter((w) => w.category === categoryId), [categoryId]);
  const word = words[index];
  const doneCount = words.filter((w) => progress[w.id]).length;

  /** 切换分类时回到第一张并复位翻面 */
  const selectCategory = (id: string) => {
    setCategoryId(id);
    setIndex(0);
    setFlipped(false);
    setSlideKey((k) => k + 1);
  };

  /** 前往指定位置（处理越界回绕），同时复位翻面并触发滑入动画 */
  const goTo = (i: number) => {
    setIndex(((i % words.length) + words.length) % words.length);
    setFlipped(false);
    setSlideKey((k) => k + 1);
  };

  /** 标记认识/模糊：写入进度、今日计数 +1，自动切下一词 */
  const mark = (kind: 'known' | 'fuzzy') => {
    setProgress((p) => ({ ...p, [word.id]: kind }));
    onLearned();
    if (kind === 'known') setPlusOne((k) => k + 1);
    goTo(index + 1);
  };

  return (
    <section className="flex flex-col items-center gap-6">
      {/* 分类胶囊：横向滚动，选中实心 */}
      <div className="flex w-full gap-2 overflow-x-auto pb-1">
        {CATEGORIES.map((c) => (
          <button
            key={c.id}
            type="button"
            onClick={() => selectCategory(c.id)}
            className={cn(
              'shrink-0 rounded-full px-4 py-1.5 text-sm transition-all duration-200',
              categoryId === c.id
                ? 'bg-terracotta font-medium text-paper shadow-card'
                : 'border border-warm bg-paper text-ink-secondary hover:bg-sand',
            )}
          >
            {c.label}
          </button>
        ))}
      </div>

      {/* 顶部细进度条：本组已完成度 */}
      <div className="w-full max-w-[480px]">
        <div className="mb-1.5 flex justify-between text-xs text-ink-muted">
          <span>{doneCount}/{words.length} 已学习</span>
          <span>{Math.round((doneCount / words.length) * 100)}%</span>
        </div>
        <div className="h-1.5 overflow-hidden rounded-full bg-warm">
          <motion.div
            className="h-full rounded-full bg-terracotta"
            animate={{ width: `${(doneCount / words.length) * 100}%` }}
            transition={{ duration: 0.3 }}
          />
        </div>
      </div>

      {/* 词卡舞台：切词横向滑出滑入；认识时 +1 飘分；支持左右滑动切词 */}
      <div className="relative w-full max-w-[480px]">
        <AnimatePresence>
          {plusOne > 0 && (
            <motion.span
              key={plusOne}
              className="absolute -top-2 right-6 z-10 text-lg font-bold text-olive"
              initial={{ opacity: 0, y: 8, scale: 0.8 }}
              animate={{ opacity: 1, y: -18, scale: 1.1 }}
              exit={{ opacity: 0, y: -32 }}
              transition={{ duration: 0.8, ease: 'easeOut' }}
            >
              +1
            </motion.span>
          )}
        </AnimatePresence>
        <AnimatePresence mode="wait">
          <motion.div
            key={`${slideKey}-${word.id}`}
            initial={{ opacity: 0, x: 40 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -40 }}
            transition={{ duration: 0.28, ease: [0.22, 1, 0.36, 1] }}
            drag="x"
            dragConstraints={{ left: 0, right: 0 }}
            dragElastic={0.4}
            onDragEnd={(_, info) => {
              // 左右滑动切词（阈值 80px）
              if (info.offset.x <= -80) goTo(index + 1);
              else if (info.offset.x >= 80) goTo(index - 1);
            }}
          >
            <WordCard
              word={word}
              flipped={flipped}
              onFlip={() => setFlipped((f) => !f)}
              isFavorite={book.some((e) => e.id === word.id)}
              onToggleFavorite={() => toggleFavorite(word)}
            />
          </motion.div>
        </AnimatePresence>
      </div>

      {/* 控制条 */}
      <div className="flex flex-wrap items-center justify-center gap-2 md:gap-3">
        <ControlButton onClick={() => goTo(index - 1)} label="上一个" icon={<ChevronLeft size={16} />} />
        <ControlButton onClick={() => setFlipped((f) => !f)} label="翻面" icon={<RotateCw size={16} />} />
        <button
          type="button"
          onClick={() => mark('known')}
          className="flex items-center gap-1.5 rounded-full border-2 border-olive px-5 py-2 text-sm font-medium text-olive transition-all duration-200 hover:bg-olive hover:text-paper active:scale-95"
        >
          <Check size={16} /> 认识
        </button>
        <button
          type="button"
          onClick={() => mark('fuzzy')}
          className="flex items-center gap-1.5 rounded-full border-2 border-terracotta-deep px-5 py-2 text-sm font-medium text-terracotta-deep transition-all duration-200 hover:bg-terracotta-deep hover:text-paper active:scale-95"
        >
          <HelpCircle size={16} /> 模糊
        </button>
        <ControlButton onClick={() => goTo(index + 1)} label="下一个" icon={<ChevronRight size={16} />} />
      </div>
    </section>
  );
}

/** 学习模式控制条中的中性按钮（上一个/翻面/下一个） */
function ControlButton({ onClick, label, icon }: { onClick: () => void; label: string; icon: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex items-center gap-1.5 rounded-full border border-warm bg-paper px-4 py-2 text-sm text-ink-secondary shadow-card transition-all duration-200 hover:bg-sand active:scale-95"
    >
      {icon} {label}
    </button>
  );
}

// ============================================================
// Section 3 — 生词本
// ============================================================

interface NotebookModeProps {
  book: VocabEntry[];
  setBook: React.Dispatch<React.SetStateAction<VocabEntry[]>>;
  goLearn: () => void;
}

type SortKey = 'date' | 'mastered';

function NotebookMode({ book, setBook, goLearn }: NotebookModeProps) {
  const [query, setQuery] = useState('');       // 输入框即时值
  const [debounced, setDebounced] = useState(''); // 300ms 防抖后的过滤词
  const [sortKey, setSortKey] = useState<SortKey>('date');
  const [confirmClear, setConfirmClear] = useState(false);
  const [lookupOpen, setLookupOpen] = useState(false); // 查词面板
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);

  /** 搜索防抖：输入 300ms 后再过滤 */
  useEffect(() => {
    timer.current = setTimeout(() => setDebounced(query.trim().toLowerCase()), 300);
    return () => clearTimeout(timer.current);
  }, [query]);

  /** 过滤 + 排序后的生词列表 */
  const list = useMemo(() => {
    const filtered = debounced
      ? book.filter((e) => e.ko.toLowerCase().includes(debounced) || e.zh.toLowerCase().includes(debounced))
      : [...book];
    if (sortKey === 'date') filtered.sort((a, b) => b.addedAt - a.addedAt);
    else filtered.sort((a, b) => Number(a.mastered) - Number(b.mastered) || b.addedAt - a.addedAt);
    return filtered;
  }, [book, debounced, sortKey]);

  /** 删除单条 */
  const removeEntry = (id: string) => setBook((prev) => prev.filter((e) => e.id !== id));
  /** 切换掌握标记 */
  const toggleMastered = (id: string) =>
    setBook((prev) => prev.map((e) => (e.id === id ? { ...e, mastered: !e.mastered } : e)));

  if (book.length === 0) {
    return (
      <div>
        <EmptyState
          image="/empty-vocab.svg"
          title="还没有生词"
          description="学习词卡时点 ☆ 收藏，或在每日一句里点收藏。"
        />
        <div className="flex justify-center gap-3">
          <button
            type="button"
            onClick={goLearn}
            className="rounded-full bg-terracotta px-6 py-2.5 text-sm font-medium text-paper shadow-card transition-colors duration-200 hover:bg-terracotta-deep"
          >
            去学习 →
          </button>
          <button
            type="button"
            onClick={() => setLookupOpen(true)}
            className="flex items-center gap-1.5 rounded-full border border-warm bg-paper px-5 py-2.5 text-sm text-ink-secondary shadow-card transition-colors hover:border-terracotta hover:text-terracotta"
          >
            <BookMarked size={15} /> 查词
          </button>
        </div>
        {/* 查词面板（空态也可用） */}
        <AnimatePresence>
          {lookupOpen && <WordLookupModal onClose={() => setLookupOpen(false)} />}
        </AnimatePresence>
      </div>
    );
  }

  return (
    <section>
      {/* 工具行：搜索 + 排序 + 批量操作 */}
      <div className="flex flex-wrap items-center gap-3">
        <label className="flex min-w-[220px] flex-1 items-center gap-2 rounded-full border border-warm bg-paper px-4 py-2 shadow-card">
          <Search size={16} className="shrink-0 text-ink-muted" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="搜索韩语或中文…"
            className="w-full bg-transparent text-sm outline-none placeholder:text-ink-muted"
          />
        </label>
        <select
          value={sortKey}
          onChange={(e) => setSortKey(e.target.value as SortKey)}
          aria-label="排序方式"
          className="rounded-full border border-warm bg-paper px-4 py-2 text-sm text-ink-secondary shadow-card outline-none"
        >
          <option value="date">按日期</option>
          <option value="mastered">按掌握度</option>
        </select>
        <button
          type="button"
          onClick={() => setLookupOpen(true)}
          className="flex items-center gap-1.5 rounded-full border border-warm bg-paper px-4 py-2 text-sm text-ink-secondary shadow-card transition-colors hover:border-terracotta hover:text-terracotta"
        >
          <BookMarked size={15} /> 查词
        </button>
        <button
          type="button"
          onClick={() => {
            setBook((prev) => prev.map((e) => ({ ...e, mastered: true })));
            showToast('已全部标记为已掌握');
          }}
          className="rounded-full border border-olive px-4 py-2 text-sm text-olive transition-colors hover:bg-olive hover:text-paper"
        >
          全部标记已掌握
        </button>
        <button
          type="button"
          onClick={() => setConfirmClear(true)}
          className="rounded-full border border-terracotta-deep px-4 py-2 text-sm text-terracotta-deep transition-colors hover:bg-terracotta-deep hover:text-paper"
        >
          清空生词本
        </button>
      </div>

      {/* 列表 */}
      <AnimatePresence initial={false}>
        <ul className="mt-6 space-y-2">
          {list.length === 0 && (
            <li className="py-10 text-center text-sm text-ink-muted">没有找到匹配的生词</li>
          )}
          {list.map((e, i) => (
            <motion.li
              key={e.id}
              layout="position"
              initial={{ opacity: 0, y: 16 }}
              animate={{ opacity: e.mastered ? 0.55 : 1, y: 0 }}
              exit={{ opacity: 0, x: -60, height: 0, marginBottom: 0, overflow: 'hidden' }}
              transition={{ duration: 0.25, delay: Math.min(i * 0.05, 0.4), ease: [0.22, 1, 0.36, 1] }}
              // 移动端：左滑露出删除（拖拽超过 80px 即删除）
              drag="x"
              dragConstraints={{ left: 0, right: 0 }}
              dragElastic={0.3}
              onDragEnd={(_, info) => {
                if (info.offset.x <= -80) {
                  removeEntry(e.id);
                  showToast(`已删除「${e.ko}」`);
                }
              }}
              className="flex flex-wrap items-center gap-x-4 gap-y-2 rounded-2xl border border-warm bg-paper px-5 py-3 shadow-card"
            >
              {/* 已掌握绿点 */}
              <span className="flex w-3 justify-center">
                {e.mastered && (
                  <motion.span
                    layoutId={undefined}
                    initial={{ scale: 0 }}
                    animate={{ scale: 1 }}
                    className="h-2.5 w-2.5 rounded-full bg-olive"
                  />
                )}
              </span>
              <span className="font-kr text-xl text-ink">{e.ko}</span>
              <span className="min-w-0 text-sm text-ink-secondary">
                {e.zh}
                {e.exampleKo && (
                  <span className="mt-0.5 block truncate text-xs text-ink-muted" title={e.exampleKo}>
                    例句：{e.exampleKo}
                  </span>
                )}
              </span>
              <span className="ml-auto text-xs text-ink-muted">
                {new Date(e.addedAt).toLocaleDateString('zh-CN')}
              </span>
              <SpeakButton text={e.ko} size="sm" />
              {/* 已掌握 toggle */}
              <button
                type="button"
                onClick={() => toggleMastered(e.id)}
                aria-pressed={e.mastered}
                className={cn(
                  'rounded-full px-3 py-1 text-xs transition-colors duration-200',
                  e.mastered ? 'bg-olive text-paper' : 'border border-warm text-ink-muted hover:border-olive hover:text-olive',
                )}
              >
                {e.mastered ? '已掌握' : '未掌握'}
              </button>
              {/* 删除（hover 变陶红） */}
              <button
                type="button"
                aria-label={`删除 ${e.ko}`}
                onClick={() => {
                  removeEntry(e.id);
                  showToast(`已删除「${e.ko}」`);
                }}
                className="rounded-full p-1.5 text-ink-muted transition-colors duration-200 hover:bg-terracotta-soft hover:text-terracotta-deep"
              >
                <Trash2 size={16} />
              </button>
            </motion.li>
          ))}
        </ul>
      </AnimatePresence>

      {/* 清空二次确认 Modal */}
      <AnimatePresence>
        {confirmClear && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[60] flex items-center justify-center bg-[rgba(46,42,38,0.4)] p-4"
            onClick={() => setConfirmClear(false)}
          >
            <motion.div
              role="alertdialog"
              aria-label="确认清空生词本"
              initial={{ scale: 0.92, y: 16 }}
              animate={{ scale: 1, y: 0 }}
              exit={{ scale: 0.95, opacity: 0 }}
              transition={{ duration: 0.2, ease: [0.22, 1, 0.36, 1] }}
              onClick={(e) => e.stopPropagation()}
              className="w-full max-w-sm rounded-3xl bg-paper p-6 shadow-lift"
            >
              <h3 className="font-serif text-lg font-bold text-ink">清空生词本？</h3>
              <p className="mt-2 text-sm text-ink-secondary">
                将删除全部 {book.length} 个生词，此操作无法撤销。
              </p>
              <div className="mt-6 flex justify-end gap-3">
                <button
                  type="button"
                  onClick={() => setConfirmClear(false)}
                  className="rounded-full border border-warm px-5 py-2 text-sm text-ink-secondary hover:bg-sand"
                >
                  取消
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setBook([]);
                    removeStorage(STORAGE_KEYS.VOCAB_BOOK);
                    setConfirmClear(false);
                    showToast('生词本已清空');
                  }}
                  className="rounded-full bg-terracotta-deep px-5 py-2 text-sm font-medium text-paper hover:opacity-90"
                >
                  确认清空
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* 查词面板（本地释义 + 在线三词典 + 拼读 + 加入生词本） */}
      <AnimatePresence>
        {lookupOpen && <WordLookupModal onClose={() => setLookupOpen(false)} />}
      </AnimatePresence>
    </section>
  );
}

// ============================================================
// Section 4 — 全部词库
// ============================================================

interface LibraryModeProps {
  progress: ProgressMap;
  book: VocabEntry[];
  toggleFavorite: (w: Word) => void;
}

function LibraryMode({ progress, book, toggleFavorite }: LibraryModeProps) {
  const [showMeaning, setShowMeaning] = useState(false);
  // 长按计时器
  const pressTimer = useRef<ReturnType<typeof setTimeout>>(undefined);

  /** 长按（600ms）加入生词本 */
  const startPress = (w: Word) => {
    pressTimer.current = setTimeout(() => toggleFavorite(w), 600);
  };
  const cancelPress = () => clearTimeout(pressTimer.current);

  return (
    <section>
      {/* 顶部：释义总开关 */}
      <div className="flex items-center justify-between">
        <p className="text-sm text-ink-secondary">共 {WORDS.length} 词 · 点击播放发音 · 长按/右键加入生词本</p>
        <label className="flex cursor-pointer items-center gap-2 text-sm text-ink-secondary">
          显示释义
          <button
            type="button"
            role="switch"
            aria-checked={showMeaning}
            onClick={() => setShowMeaning((v) => !v)}
            className={cn(
              'relative h-6 w-11 rounded-full transition-colors duration-200',
              showMeaning ? 'bg-terracotta' : 'bg-warm',
            )}
          >
            <span
              className={cn(
                'absolute top-0.5 h-5 w-5 rounded-full bg-paper shadow transition-transform duration-200',
                showMeaning ? 'translate-x-[22px]' : 'translate-x-0.5',
              )}
            />
          </button>
        </label>
      </div>

      {/* 分组卡片网格 */}
      {CATEGORIES.map((cat, gi) => {
        const words = WORDS.filter((w) => w.category === cat.id);
        const done = words.filter((w) => progress[w.id]).length;
        const pct = Math.round((done / words.length) * 100);
        return (
          <motion.div
            key={cat.id}
            initial={{ opacity: 0, y: 24 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, amount: 0.2 }}
            transition={{ duration: 0.5, delay: gi * 0.05, ease: [0.22, 1, 0.36, 1] }}
            className="mt-8"
          >
            {/* 组标题 + 迷你掌握度进度条 */}
            <div className="flex items-center gap-3">
              <h2 className="font-serif text-lg font-bold text-ink">{cat.label}</h2>
              <span className="font-kr text-xs text-ink-muted">{cat.ko}</span>
              <div className="flex flex-1 items-center gap-2">
                <div className="h-1 max-w-[120px] flex-1 overflow-hidden rounded-full bg-warm">
                  <div className="h-full rounded-full bg-olive transition-all duration-300" style={{ width: `${pct}%` }} />
                </div>
                <span className="text-xs text-ink-muted">{done}/{words.length}</span>
              </div>
            </div>

            <div className="mt-3 grid grid-cols-2 gap-3 md:grid-cols-4">
              {words.map((w) => {
                const fav = book.some((e) => e.id === w.id);
                return (
                  <motion.button
                    key={w.id}
                    type="button"
                    whileHover={{ y: -3 }}
                    onClick={() => {
                      if (!speakKorean(w.ko)) showToast('当前浏览器不支持发音');
                    }}
                    onContextMenu={(e) => {
                      e.preventDefault();
                      toggleFavorite(w);
                    }}
                    onPointerDown={() => startPress(w)}
                    onPointerUp={cancelPress}
                    onPointerLeave={cancelPress}
                    className="relative flex flex-col items-center gap-1 rounded-2xl border border-warm bg-paper p-4 text-center shadow-card transition-shadow duration-200 hover:shadow-lift"
                  >
                    {/* 学习状态小点：认识=橄榄绿 / 模糊=陶红 */}
                    {progress[w.id] && (
                      <span
                        className={cn(
                          'absolute left-3 top-3 h-2 w-2 rounded-full',
                          progress[w.id] === 'known' ? 'bg-olive' : 'bg-terracotta-deep',
                        )}
                      />
                    )}
                    {fav && <Star size={14} className="absolute right-3 top-3 fill-honey text-honey" />}
                    <span className="font-kr text-lg font-bold text-ink">{w.ko}</span>
                    <span className="text-xs text-ink-muted">{w.rom}</span>
                    {/* 释义展开动画 */}
                    <AnimatePresence initial={false}>
                      {showMeaning && (
                        <motion.span
                          initial={{ height: 0, opacity: 0 }}
                          animate={{ height: 'auto', opacity: 1 }}
                          exit={{ height: 0, opacity: 0 }}
                          transition={{ duration: 0.2 }}
                          className="overflow-hidden text-sm text-ink-secondary"
                        >
                          {w.zh}
                        </motion.span>
                      )}
                    </AnimatePresence>
                  </motion.button>
                );
              })}
            </div>
          </motion.div>
        );
      })}
    </section>
  );
}
