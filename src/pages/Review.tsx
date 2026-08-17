/**
 * Review — 复习中心页：闪卡复习 / 拼写练习 / 发音复习 三模式
 * 内容源：生词本（hjy:vocab-book，未掌握优先）+ 系统词库补足 + 每日一句/发音句库 + 语料中心自定义材料（hjy:pron-custom）。
 * 按 hjy:review-prefs.reviewGroupSize（默认 10）分组推进，组末小结庆祝；「忘记了」的词本轮末尾重现一次。
 * 每题结果追加到 hjy:review-history 并静默 syncReview；完成一组后 updateStats 反映进度。
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { motion, AnimatePresence, useMotionValue, useTransform } from 'framer-motion';
import {
  BookOpenText,
  Check,
  Flame,
  Layers,
  Mic,
  MicOff,
  PenLine,
  Play,
  Plus,
  Repeat2,
  RotateCcw,
  Sparkles,
  Square,
  Turtle,
  Volume2,
  X,
} from 'lucide-react';
import SpeakButton from '@/components/SpeakButton';
import StatChip from '@/components/StatChip';
import EmptyState from '@/components/EmptyState';
import { showToast } from '@/components/Toast';
import { speakKorean, isTtsSupported } from '@/lib/tts';
import { STORAGE_KEYS, readStorage, writeStorage, getStats, updateStats } from '@/lib/storage';
import { syncReview, syncVocabAdd, syncVocabMastered } from '@/lib/sync';
import { WORDS, CATEGORIES } from '@/data/words';
import { DAILY_SENTENCES, PRACTICE_SENTENCES } from '@/data/sentences';
import { cn } from '@/lib/utils';

// ==================== 存储键与类型 ====================

const KEY_PREFS = 'hjy:review-prefs';
const KEY_HISTORY = 'hjy:review-history';
const KEY_DAILY = 'hjy:review-daily';
const KEY_PRON_CUSTOM = 'hjy:pron-custom';
const KEY_PRON_DONE = 'pron-done';

type ReviewMode = 'flashcard' | 'spelling' | 'pronunciation';
type ReviewResult = 'remembered' | 'forgotten' | 'correct' | 'wrong' | 'practiced';

/** 生词本条目（与单词学习页共用，读取时归一化字段） */
interface VocabEntry {
  id: string;
  ko: string;
  rom: string;
  zh: string;
  pos?: string;
  exampleKo?: string;
  exampleZh?: string;
  addedAt: number;
  mastered: boolean;
}

/** 统一的复习题目结构（闪卡 / 拼写 / 发音共用） */
interface ReviewItem {
  key: string;
  ko: string;
  rom: string;
  zh: string;
  pos?: string;
  exampleKo?: string;
  exampleZh?: string;
  itemType: 'word' | 'sentence';
  /** 来源小标签：生词本 / 词库 · 食物 / 每日一句 / 发音练习 / 我的材料 */
  sourceLabel: string;
  /** 来自生词本时的条目 id（用于回写 mastered） */
  vocabId?: string;
}

/** 复习历史记录 */
interface ReviewHistoryRecord {
  itemType: 'word' | 'sentence';
  itemKey: string;
  result: ReviewResult;
  mode: ReviewMode;
  at: number;
  pending?: boolean;
}

/** 复习偏好（与用户中心「复习节奏」设置互通，同一 key） */
interface ReviewPrefs {
  reviewGroupSize?: number;
  groupSize?: number;
  mode?: ReviewMode;
  voiceGender?: 'female' | 'male';
  voiceName?: string;
  dailyGoal?: number;
}

const EASE = [0.22, 1, 0.36, 1] as [number, number, number, number];

// ==================== 工具函数 ====================

function todayStr(): string {
  return new Date().toISOString().slice(0, 10);
}

/** 洗牌（不修改原数组） */
function shuffle<T>(arr: T[]): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

/** 读取复习偏好 */
function readPrefs(): ReviewPrefs {
  return readStorage<ReviewPrefs>(KEY_PREFS, {});
}

/** 读取复习组大小（默认 10，合法区间 3–50） */
function getGroupSize(): number {
  const p = readPrefs();
  const n = p.reviewGroupSize ?? p.groupSize ?? 10;
  return Math.min(50, Math.max(3, Math.round(n) || 10));
}

/** 记住上次选择的模式 */
function saveModePref(mode: ReviewMode): void {
  writeStorage(KEY_PREFS, { ...readPrefs(), mode });
}

/** 读取生词本（字段归一化，容错旧数据） */
function readVocabBook(): VocabEntry[] {
  const raw = readStorage<Partial<VocabEntry>[]>(STORAGE_KEYS.VOCAB_BOOK, []);
  return raw
    .filter((e) => e && typeof e.ko === 'string' && e.ko.trim().length > 0)
    .map((e, i) => ({
      id: e.id ?? `vocab-${i}`,
      ko: e.ko as string,
      rom: e.rom ?? '',
      zh: e.zh ?? '',
      pos: e.pos,
      exampleKo: e.exampleKo,
      exampleZh: e.exampleZh,
      addedAt: e.addedAt ?? Date.now(),
      mastered: e.mastered ?? false,
    }));
}

/** 写复习历史（追加，最多保留最近 500 条）并静默同步云端 */
function recordReview(mode: ReviewMode, itemType: 'word' | 'sentence', itemKey: string, result: ReviewResult): void {
  const history = readStorage<ReviewHistoryRecord[]>(KEY_HISTORY, []);
  history.push({ itemType, itemKey, result, mode, at: Date.now(), pending: true });
  writeStorage(KEY_HISTORY, history.slice(-500));
  syncReview({ itemType, itemKey, result, mode });
}

/** 今日已复习计数（按日期重置） */
function readDailyCount(): number {
  const d = readStorage<{ date: string; count: number }>(KEY_DAILY, { date: todayStr(), count: 0 });
  return d.date === todayStr() ? d.count : 0;
}

/** 今日已复习 +n 并持久化，返回新值 */
function bumpDailyCount(n = 1): number {
  const next = { date: todayStr(), count: readDailyCount() + n };
  writeStorage(KEY_DAILY, next);
  return next.count;
}

/** 「忘记了」：把生词本中该词 mastered 置 false 并同步 */
function markVocabForgotten(item: ReviewItem): void {
  if (!item.vocabId) return;
  const book = readVocabBook();
  const next = book.map((e) => (e.id === item.vocabId ? { ...e, mastered: false } : e));
  writeStorage(STORAGE_KEYS.VOCAB_BOOK, next);
  syncVocabMastered(item.ko, false);
}

/**
 * 构建复习词队列：优先生词本未掌握的词；不足一组时用系统词库随机补足。
 */
function buildWordItems(groupSize: number): ReviewItem[] {
  const book = readVocabBook();
  const unmastered = shuffle(book.filter((e) => !e.mastered));
  const items: ReviewItem[] = unmastered.map((e) => ({
    key: `vocab:${e.id}`,
    ko: e.ko,
    rom: e.rom,
    zh: e.zh,
    pos: e.pos,
    exampleKo: e.exampleKo,
    exampleZh: e.exampleZh,
    itemType: 'word' as const,
    sourceLabel: '生词本',
    vocabId: e.id,
  }));
  // 不足一组：系统词库随机补足（跳过已在队列中的词）
  if (items.length < groupSize) {
    const used = new Set(items.map((i) => i.ko));
    const pool = shuffle(WORDS.filter((w) => !used.has(w.ko)));
    for (const w of pool) {
      if (items.length >= groupSize) break;
      const cat = CATEGORIES.find((c) => c.id === w.category);
      items.push({
        key: `bank:${w.id}`,
        ko: w.ko,
        rom: w.rom,
        zh: w.zh,
        pos: w.pos,
        exampleKo: w.exampleKo,
        exampleZh: w.exampleZh,
        itemType: 'word' as const,
        sourceLabel: `词库 · ${cat?.label ?? '常用'}`,
      });
    }
  }
  return items;
}

/** 句子题库：每日一句 + 发音练习句库（拼写句子题取材） */
function buildSentenceItems(): ReviewItem[] {
  const daily = DAILY_SENTENCES.map((s, i) => ({
    key: `daily:${i}`,
    ko: s.korean,
    rom: s.romanization,
    zh: s.chinese,
    itemType: 'sentence' as const,
    sourceLabel: '每日一句',
  }));
  const practice = PRACTICE_SENTENCES.map((s) => ({
    key: `practice:${s.id}`,
    ko: s.ko,
    rom: s.rom,
    zh: s.zh,
    itemType: 'sentence' as const,
    sourceLabel: '发音练习',
  }));
  return [...daily, ...practice];
}

/** 按组大小切分 */
function chunk<T>(arr: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}

// ==================== 共享小组件 ====================

/** 播放中的等距 3 条声波柱动画 */
function SoundBars({ className = '' }: { className?: string }) {
  return (
    <span className={cn('inline-flex h-4 items-end gap-[3px]', className)} aria-hidden>
      {[0, 1, 2].map((i) => (
        <span
          key={i}
          className="review-soundbar w-[3px] rounded-full bg-current"
          style={{ animationDelay: `${i * 0.15}s` }}
        />
      ))}
    </span>
  );
}

/** 确定性伪随机（渲染期保持纯函数，满足 react-hooks/purity） */
function seededRand(seed: number): number {
  const x = Math.sin(seed * 127.1 + 311.7) * 43758.5453;
  return x - Math.floor(x);
}

/** 庆祝纸屑：12 个蜂蜜金/赤陶橘/橄榄绿粒子从中心扩散一次（非循环） */
function ConfettiBurst() {
  const particles = useMemo(
    () =>
      Array.from({ length: 12 }, (_, i) => {
        const angle = (i / 12) * Math.PI * 2 + seededRand(i * 3 + 1) * 0.5;
        const dist = 60 + seededRand(i * 3 + 2) * 60;
        return {
          x: Math.cos(angle) * dist,
          y: Math.sin(angle) * dist,
          delay: seededRand(i * 3 + 3) * 0.1,
          color: ['#D9A441', '#C96F4A', '#7A8450'][i % 3],
        };
      }),
    [],
  );
  return (
    <div className="pointer-events-none absolute left-1/2 top-16 z-10" aria-hidden>
      {particles.map((p, i) => (
        <motion.span
          key={i}
          className="absolute h-2 w-2 rounded-full"
          style={{ backgroundColor: p.color }}
          initial={{ x: 0, y: 0, opacity: 1, scale: 1 }}
          animate={{ x: p.x, y: p.y, opacity: 0, scale: 0.4 }}
          transition={{ duration: 0.8, delay: p.delay, ease: 'easeOut' }}
        />
      ))}
    </div>
  );
}

/** 组末 / 本轮小结卡（带庆祝粒子 + 双色比例条） */
function SummaryCard({
  title,
  good,
  bad,
  goodLabel,
  badLabel,
  message,
  primaryLabel,
  onPrimary,
  secondaryLabel,
  onSecondary,
  extra,
}: {
  title: string;
  good: number;
  bad: number;
  goodLabel: string;
  badLabel: string;
  message: string;
  primaryLabel: string;
  onPrimary: () => void;
  secondaryLabel?: string;
  onSecondary?: () => void;
  extra?: ReactNode;
}) {
  const total = Math.max(1, good + bad);
  return (
    <motion.div
      initial={{ opacity: 0, y: 24, scale: 0.96 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      transition={{ duration: 0.5, ease: EASE }}
      className="relative mx-auto w-full max-w-[480px] overflow-hidden rounded-3xl border border-warm bg-paper p-8 text-center shadow-card"
    >
      <ConfettiBurst />
      <span className="inline-flex h-12 w-12 items-center justify-center rounded-full bg-honey/15 text-honey">
        <Sparkles size={22} />
      </span>
      <h3 className="mt-4 font-serif text-2xl font-bold text-ink">{title}</h3>
      <p className="mt-2 text-lg text-ink-secondary">
        <span className="font-bold text-olive">
          {goodLabel} {good}
        </span>
        <span className="mx-2 text-ink-muted">·</span>
        <span className="font-bold text-terracotta-deep">
          {badLabel} {bad}
        </span>
      </p>
      {/* 双色迷你比例条 */}
      <div className="mx-auto mt-4 flex h-2 w-full max-w-[280px] overflow-hidden rounded-full bg-sand">
        <motion.div
          className="h-full bg-olive"
          initial={{ width: 0 }}
          animate={{ width: `${(good / total) * 100}%` }}
          transition={{ duration: 0.5, delay: 0.2, ease: EASE }}
        />
        <motion.div
          className="h-full bg-terracotta-deep"
          initial={{ width: 0 }}
          animate={{ width: `${(bad / total) * 100}%` }}
          transition={{ duration: 0.5, delay: 0.3, ease: EASE }}
        />
      </div>
      <p className="mt-4 text-sm text-ink-secondary">{message}</p>
      {extra}
      <div className="mt-6 flex flex-wrap items-center justify-center gap-3">
        <button
          type="button"
          onClick={onPrimary}
          className="rounded-full bg-terracotta px-6 py-2.5 text-sm font-medium text-paper shadow-card transition-colors hover:bg-terracotta-deep"
        >
          {primaryLabel}
        </button>
        {secondaryLabel && onSecondary && (
          <button
            type="button"
            onClick={onSecondary}
            className="rounded-full border border-warm px-6 py-2.5 text-sm text-ink-secondary transition-colors hover:bg-sand"
          >
            {secondaryLabel}
          </button>
        )}
      </div>
    </motion.div>
  );
}

// ============================================================
// Section 2 — 闪卡复习模式
// ============================================================

interface FlashcardProps {
  groupSize: number;
  onReviewed: (n: number) => void;
}

function FlashcardMode({ groupSize, onReviewed }: FlashcardProps) {
  const [round, setRound] = useState(0); // 「再来一轮」时 +1 重新组卷
  // 生词本是否为空（空 → 引导卡；非空时不足一组才用词库补足）
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const vocabEmpty = useMemo(() => readVocabBook().length === 0, [round]);
  // 本轮基础队列（mount / round 变化时组卷一次）
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const baseItems = useMemo(() => (vocabEmpty ? [] : buildWordItems(groupSize)), [groupSize, round, vocabEmpty]);
  const [retryPass, setRetryPass] = useState<ReviewItem[] | null>(null); // 非 null = 末尾重现队列
  const queue = retryPass ?? baseItems;

  const [idx, setIdx] = useState(0);
  const [flipped, setFlipped] = useState(false);
  const [answers, setAnswers] = useState<{ key: string; result: 'remembered' | 'forgotten' }[]>([]);
  const [retryQueue, setRetryQueue] = useState<ReviewItem[]>([]);
  const [phase, setPhase] = useState<'card' | 'summary' | 'done'>('card');
  const [totals, setTotals] = useState({ remembered: 0, forgotten: 0 });
  const [groupStat, setGroupStat] = useState({ remembered: 0, forgotten: 0 });
  const [shakeKey, setShakeKey] = useState(0); // 「忘记了」轻震动画 key
  const [plusOne, setPlusOne] = useState(0);   // 「记住了 +1」飘分 key
  const advanceTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const advancingRef = useRef(false); // 轻震动画期间禁止重复判定

  // 手势拖拽：拖动时卡片随动旋转 ±4°，浮现绿/红印章
  const dragX = useMotionValue(0);
  const dragRotate = useTransform(dragX, [-150, 150], [-4, 4]);
  const okStampOpacity = useTransform(dragX, [20, 80], [0, 1]);
  const noStampOpacity = useTransform(dragX, [-20, -80], [0, 1]);

  useEffect(() => () => clearTimeout(advanceTimer.current), []);

  const groupIndex = Math.floor(idx / groupSize);
  const groupStart = groupIndex * groupSize;
  const groupEnd = Math.min(groupStart + groupSize, queue.length);
  const item = queue[Math.min(idx, queue.length - 1)];

  /** 判定后推进到下一张 / 组末小结 */
  const advance = useCallback(
    (nextAnswers: { key: string; result: 'remembered' | 'forgotten' }[]) => {
      advancingRef.current = false;
      const next = idx + 1;
      if (next >= groupEnd) {
        // 本组完成：统计并把「记住的词数」计入学习统计增量
        const g = nextAnswers.slice(groupStart, next);
        const gR = g.filter((a) => a.result === 'remembered').length;
        const gF = g.length - gR;
        setGroupStat({ remembered: gR, forgotten: gF });
        if (gR > 0) updateStats({ wordsLearned: getStats().wordsLearned + gR });
        setPhase('summary');
      }
      setIdx(next);
      setFlipped(false);
    },
    [idx, groupEnd, groupStart],
  );

  /** 判定：记住了 / 忘记了 */
  const answer = useCallback(
    (result: 'remembered' | 'forgotten') => {
      if (phase !== 'card' || !flipped || advancingRef.current) return;
      advancingRef.current = true;
      const cur = queue[idx];
      recordReview('flashcard', cur.itemType, cur.ko, result);
      onReviewed(1);
      setTotals((t) => ({
        remembered: t.remembered + (result === 'remembered' ? 1 : 0),
        forgotten: t.forgotten + (result === 'forgotten' ? 1 : 0),
      }));
      const nextAnswers = [...answers, { key: cur.key, result }];
      setAnswers(nextAnswers);

      if (result === 'remembered') {
        setPlusOne((k) => k + 1);
        advance(nextAnswers);
      } else {
        // 忘记了：生词本 mastered 置 false；基础轮中入末尾重现队列（仅一次）
        markVocabForgotten(cur);
        if (retryPass === null) {
          setRetryQueue((q) => (q.some((x) => x.key === cur.key) ? q : [...q, cur]));
        }
        // 卡片轻震 300ms 后滑出
        setShakeKey((k) => k + 1);
        clearTimeout(advanceTimer.current);
        advanceTimer.current = setTimeout(() => advance(nextAnswers), 300);
      }
    },
    [phase, flipped, queue, idx, answers, retryPass, onReviewed, advance],
  );

  // 键盘快捷键：← 忘记了 / → 记住了 / 空格翻面
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (phase !== 'card') return;
      if (e.key === 'ArrowRight') answer('remembered');
      else if (e.key === 'ArrowLeft') answer('forgotten');
      else if (e.key === ' ' || e.key === 'Enter') {
        e.preventDefault();
        setFlipped((f) => !f);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [phase, answer]);

  /** 小结卡主按钮：下一组 / 末尾重现 / 完成 */
  const handleSummaryNext = () => {
    if (idx < queue.length) {
      setPhase('card');
      return;
    }
    // 已是最后一组
    if (retryPass === null && retryQueue.length > 0) {
      // 忘记的词排到末尾重现一次
      setRetryPass(retryQueue);
      setRetryQueue([]);
      setIdx(0);
      setAnswers([]);
      setFlipped(false);
      setPhase('card');
      return;
    }
    setPhase('done');
    showToast('复习记录已保存');
  };

  /** 重新开始一轮 */
  const restart = () => {
    setRound((r) => r + 1);
    setRetryPass(null);
    setRetryQueue([]);
    setIdx(0);
    setAnswers([]);
    setTotals({ remembered: 0, forgotten: 0 });
    setFlipped(false);
    setPhase('card');
  };

  // 生词本为空 → 引导卡
  if (baseItems.length === 0) {
    return (
      <EmptyState
        image="/empty-vocab.svg"
        title="生词本还是空的，先去学几个词吧。"
        description="学习词卡时点 ☆ 收藏，生词就会自动进入复习队列。"
        action={{ label: '去单词学习 →', to: '/vocabulary' }}
      />
    );
  }

  // 本轮总结
  if (phase === 'done') {
    const total = totals.remembered + totals.forgotten;
    const pct = total > 0 ? Math.round((totals.remembered / total) * 100) : 0;
    return (
      <SummaryCard
        title="本轮复习完成！"
        good={totals.remembered}
        bad={totals.forgotten}
        goodLabel="记住"
        badLabel="忘记"
        message={`本轮共复习 ${baseItems.length} 词，记住率 ${pct}%。忘记的词已在生词本中标记为未掌握，明天再见它们一面吧。`}
        primaryLabel="再来一轮"
        onPrimary={restart}
        secondaryLabel="回到顶部"
        onSecondary={() => window.scrollTo({ top: 0, behavior: 'smooth' })}
      />
    );
  }

  // 组末小结
  if (phase === 'summary') {
    const isLastGroup = idx >= queue.length;
    const hasRetry = retryPass === null && retryQueue.length > 0;
    const finishedGroupNo = Math.floor((idx - 1) / groupSize) + 1;
    return (
      <SummaryCard
        title={retryPass ? '重现卡完成！' : `第 ${finishedGroupNo} 组完成`}
        good={groupStat.remembered}
        bad={groupStat.forgotten}
        goodLabel="记住"
        badLabel="忘记"
        message={
          groupStat.forgotten === 0
            ? '太棒了，全组通关！🎉'
            : isLastGroup && hasRetry
              ? '忘记的几张已排到队尾，再见面一次吧。'
              : '忘记的词已标记为未掌握，抽空再多看它们一眼。'
        }
        primaryLabel={
          !isLastGroup ? '进入下一组 →' : hasRetry ? '再战忘记的词 →' : '查看本轮总结 →'
        }
        onPrimary={handleSummaryNext}
        secondaryLabel="结束本轮"
        onSecondary={() => {
          setPhase('done');
          showToast('复习记录已保存');
        }}
      />
    );
  }

  const isRetryCard = retryPass !== null;

  return (
    <section className="flex flex-col items-center gap-6">
      {/* 2.1 组进度条 */}
      <div className="w-full max-w-[480px]">
        <div className="mb-1.5 flex justify-between text-xs text-ink-muted">
          <span>
            {isRetryCard ? '队尾重现' : `第 ${groupIndex + 1} 组`} · 本组 {Math.min(idx - groupStart + 1, groupEnd - groupStart)}/{groupEnd - groupStart}
          </span>
          <span>本轮共 {baseItems.length} 词</span>
        </div>
        <div className="h-[3px] overflow-hidden rounded-full bg-sand">
          <motion.div
            className="h-full rounded-full bg-terracotta"
            animate={{ width: `${(idx / queue.length) * 100}%` }}
            transition={{ duration: 0.3 }}
          />
        </div>
      </div>

      {/* 2.2 卡片舞台（3D 翻面 + 滑入滑出 + 拖拽判词） */}
      <div className="relative w-full max-w-[480px]">
        <AnimatePresence>
          {plusOne > 0 && (
            <motion.span
              key={plusOne}
              className="absolute -top-2 right-6 z-20 text-lg font-bold text-olive"
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
            key={`${isRetryCard ? 'retry' : 'base'}-${item.key}`}
            initial={{ opacity: 0, x: 40 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -40 }}
            transition={{ duration: 0.28, ease: EASE }}
            drag="x"
            dragConstraints={{ left: 0, right: 0 }}
            dragElastic={0.4}
            style={{ x: dragX, rotate: dragRotate }}
            onDragEnd={(_, info) => {
              if (!flipped) return;
              if (info.offset.x >= 80) answer('remembered');
              else if (info.offset.x <= -80) answer('forgotten');
            }}
          >
            {/* 拖拽印章：记住了 / 忘记了 */}
            <motion.span
              style={{ opacity: okStampOpacity }}
              className="pointer-events-none absolute right-4 top-4 z-20 rounded-lg border-2 border-olive px-2 py-1 text-sm font-bold text-olive"
            >
              记住了
            </motion.span>
            <motion.span
              style={{ opacity: noStampOpacity }}
              className="pointer-events-none absolute left-4 top-4 z-20 rounded-lg border-2 border-terracotta-deep px-2 py-1 text-sm font-bold text-terracotta-deep"
            >
              忘记了
            </motion.span>

            {/* 翻面容器：轻震动画叠加在最外层 */}
            <motion.div animate={shakeKey ? { x: [0, -6, 6, -4, 4, 0] } : undefined} transition={{ duration: 0.3 }}>
              <div style={{ perspective: 1200 }}>
                <motion.div
                  role="button"
                  tabIndex={0}
                  aria-label={flipped ? '翻到卡片正面' : '点击卡片查看释义'}
                  onClick={() => setFlipped((f) => !f)}
                  className="relative h-[300px] w-full cursor-pointer md:h-[320px]"
                  style={{ transformStyle: 'preserve-3d' }}
                  animate={{ rotateY: flipped ? 180 : 0 }}
                  transition={{ duration: 0.6, ease: EASE }}
                >
                  {/* 正面：只显示韩语 */}
                  <div
                    className="absolute inset-0 flex flex-col items-center justify-center gap-3 rounded-3xl border border-warm bg-paper p-6 shadow-card"
                    style={{ backfaceVisibility: 'hidden' }}
                  >
                    <span className="absolute left-5 top-5 rounded-full bg-honey/15 px-3 py-1 text-xs font-medium text-honey">
                      {item.sourceLabel}
                    </span>
                    {isRetryCard && (
                      <span className="absolute right-5 top-5 rounded-full bg-terracotta-deep px-3 py-1 text-xs font-medium text-paper">
                        再来一次
                      </span>
                    )}
                    <p className="font-kr text-4xl font-bold text-ink md:text-[40px]">{item.ko}</p>
                    <div onClick={(e) => e.stopPropagation()}>
                      <SpeakButton
                        text={item.ko}
                        size="lg"
                        onUnsupported={() => showToast('当前浏览器不支持语音合成')}
                      />
                    </div>
                    <p className="absolute bottom-4 text-xs text-ink-muted">点击卡片查看释义</p>
                  </div>

                  {/* 背面：罗马音 + 中文释义 + 词性 + 例句 */}
                  <div
                    className="absolute inset-0 flex flex-col items-center justify-center gap-2.5 overflow-hidden rounded-3xl border border-warm bg-paper p-6 shadow-card"
                    style={{ backfaceVisibility: 'hidden', transform: 'rotateY(180deg)' }}
                  >
                    {item.rom && <p className="text-base text-ink-muted">{item.rom}</p>}
                    <p className="font-serif text-2xl font-bold text-ink">{item.zh}</p>
                    {item.pos && (
                      <span className="rounded-full bg-terracotta-soft px-3 py-1 text-xs font-medium text-terracotta">
                        {item.pos}
                      </span>
                    )}
                    {item.exampleKo && (
                      <div className="mt-1 flex flex-col items-center gap-1.5 text-center">
                        <div className="flex items-center gap-2">
                          <p className="font-kr text-base text-ink">{item.exampleKo}</p>
                          <div onClick={(e) => e.stopPropagation()}>
                            <SpeakButton text={item.exampleKo} size="sm" />
                          </div>
                        </div>
                        {item.exampleZh && <p className="text-sm text-ink-secondary">{item.exampleZh}</p>}
                      </div>
                    )}
                  </div>
                </motion.div>
              </div>
            </motion.div>
          </motion.div>
        </AnimatePresence>
      </div>

      {/* 2.3 判定按钮（翻面后启用，移动端左右各半宽，避让底部 Tab Bar 安全区） */}
      <div
        className="flex w-full max-w-[480px] gap-3"
        style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}
      >
        <motion.button
          type="button"
          onClick={() => answer('forgotten')}
          disabled={!flipped}
          animate={{ scale: flipped ? 1 : 0.9, opacity: flipped ? 1 : 0.4 }}
          transition={{ duration: 0.2 }}
          className="flex flex-1 items-center justify-center gap-2 rounded-full border-2 border-terracotta-deep px-6 py-3 text-base font-medium text-terracotta-deep transition-colors enabled:hover:bg-terracotta-soft"
        >
          <X size={18} /> 忘记了
        </motion.button>
        <motion.button
          type="button"
          onClick={() => answer('remembered')}
          disabled={!flipped}
          animate={{ scale: flipped ? 1 : 0.9, opacity: flipped ? 1 : 0.4 }}
          transition={{ duration: 0.2 }}
          className="flex flex-1 items-center justify-center gap-2 rounded-full bg-olive px-6 py-3 text-base font-medium text-paper shadow-card transition-colors enabled:hover:opacity-90"
        >
          <Check size={18} /> 记住了
        </motion.button>
      </div>
      <p className="hidden text-xs text-ink-muted md:block">快捷键：空格翻面 · ← 忘记了 · → 记住了；也可以直接左右拖动卡片判词</p>
    </section>
  );
}

// ============================================================
// Section 3 — 拼写练习模式
// ============================================================

/** 去除全部空白（逐字符对比时忽略空格差异） */
const stripSpaces = (s: string) => s.replace(/\s+/g, '');

/** 构建拼写题队列：单词题与句子题约 7:3 混合 */
function buildSpellingItems(groupSize: number): ReviewItem[] {
  const words = buildWordItems(groupSize);
  const sentenceCount = Math.max(2, Math.round((words.length * 3) / 7));
  const sentences = shuffle(buildSentenceItems()).slice(0, sentenceCount);
  return shuffle([...words, ...sentences]);
}

interface SpellingProps {
  groupSize: number;
  onReviewed: (n: number) => void;
}

function SpellingMode({ groupSize, onReviewed }: SpellingProps) {
  const [round, setRound] = useState(0);
  // 生词本是否为空（空 → 引导卡）
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const vocabEmpty = useMemo(() => readVocabBook().length === 0, [round]);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const baseItems = useMemo(() => (vocabEmpty ? [] : buildSpellingItems(groupSize)), [groupSize, round, vocabEmpty]);
  const [retryPass, setRetryPass] = useState<ReviewItem[] | null>(null); // 跳过题末尾重现
  const queue = retryPass ?? baseItems;

  const [idx, setIdx] = useState(0);
  const [input, setInput] = useState('');
  const [submitted, setSubmitted] = useState<boolean | null>(null); // null=作答中 true=全对 false=有误
  const [answers, setAnswers] = useState<{ key: string; correct: boolean }[]>([]);
  const [skipQueue, setSkipQueue] = useState<ReviewItem[]>([]);
  const [wrongItems, setWrongItems] = useState<ReviewItem[]>([]); // 本轮答错/跳过，供小结「待巩固」
  const [phase, setPhase] = useState<'card' | 'summary' | 'done'>('card');
  const [totals, setTotals] = useState({ correct: 0, wrong: 0 });
  const [groupStat, setGroupStat] = useState({ correct: 0, total: 0 });
  const [shakeKey, setShakeKey] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  const groupIndex = Math.floor(idx / groupSize);
  const groupStart = groupIndex * groupSize;
  const groupEnd = Math.min(groupStart + groupSize, queue.length);
  const item = queue[Math.min(idx, queue.length - 1)];
  const target = stripSpaces(item.ko); // 标准答案（去空格逐音节对比）
  const typed = stripSpaces(input);

  // 切题时清空输入并自动聚焦；移动端聚焦时滚动避免键盘遮挡
  useEffect(() => {
    setInput('');
    setSubmitted(null);
    const el = inputRef.current;
    if (el && phase === 'card') {
      el.focus({ preventScroll: true });
      el.scrollIntoView({ block: 'center', behavior: 'smooth' });
    }
  }, [idx, phase, retryPass]);

  /** 推进到下一题 / 组末小结 */
  const advance = useCallback(
    (nextAnswers: { key: string; correct: boolean }[]) => {
      const next = idx + 1;
      if (next >= groupEnd) {
        const g = nextAnswers.slice(groupStart, next);
        const gC = g.filter((a) => a.correct).length;
        setGroupStat({ correct: gC, total: g.length });
        // 拼对的词计入学习统计增量
        if (gC > 0) updateStats({ wordsLearned: getStats().wordsLearned + gC });
        setPhase('summary');
      }
      setIdx(next);
    },
    [idx, groupEnd, groupStart],
  );

  /** 提交答案：全对 → 绿色闪卡 + 自动播放 TTS；有误 → 显示正确答案 */
  const submit = () => {
    if (submitted !== null || !input.trim()) return;
    const correct = typed === target;
    recordReview('spelling', item.itemType, item.ko, correct ? 'correct' : 'wrong');
    onReviewed(1);
    setSubmitted(correct);
    setTotals((t) => ({ correct: t.correct + (correct ? 1 : 0), wrong: t.wrong + (correct ? 0 : 1) }));
    setAnswers((a) => [...a, { key: item.key, correct }]);
    if (correct) {
      const ok = speakKorean(item.ko);
      if (!ok) showToast('当前浏览器不支持语音合成');
    } else {
      setShakeKey((k) => k + 1);
      setWrongItems((w) => (w.some((x) => x.key === item.key) ? w : [...w, item]));
      if (item.vocabId) markVocabForgotten(item);
    }
  };

  /** 跳过：计入「忘记了」，末位重现一次 */
  const skip = () => {
    if (submitted !== null) return;
    recordReview('spelling', item.itemType, item.ko, 'forgotten');
    onReviewed(1);
    setTotals((t) => ({ ...t, wrong: t.wrong + 1 }));
    setWrongItems((w) => (w.some((x) => x.key === item.key) ? w : [...w, item]));
    if (item.vocabId) markVocabForgotten(item);
    if (retryPass === null) {
      setSkipQueue((q) => (q.some((x) => x.key === item.key) ? q : [...q, item]));
    }
    advance([...answers, { key: item.key, correct: false }]);
    setAnswers((a) => [...a, { key: item.key, correct: false }]);
  };

  /** 听音提示：慢速播放答案 */
  const playHint = () => {
    const ok = speakKorean(item.ko, { rate: 0.7 });
    if (!ok) showToast('当前浏览器不支持语音合成');
  };

  /** 小结卡主按钮 */
  const handleSummaryNext = () => {
    if (idx < queue.length) {
      setPhase('card');
      return;
    }
    if (retryPass === null && skipQueue.length > 0) {
      setRetryPass(skipQueue);
      setSkipQueue([]);
      setIdx(0);
      setAnswers([]);
      setPhase('card');
      return;
    }
    setPhase('done');
    showToast('复习记录已保存');
  };

  /** 把答错的词一键加入生词本 */
  const addToVocabBook = (it: ReviewItem) => {
    const book = readVocabBook();
    if (book.some((e) => e.ko === it.ko)) {
      showToast('生词本里已经有这个词啦');
      return;
    }
    const entry: VocabEntry = {
      id: `review-${Date.now()}`,
      ko: it.ko,
      rom: it.rom,
      zh: it.zh,
      pos: it.pos ?? '',
      addedAt: Date.now(),
      mastered: false,
    };
    writeStorage(STORAGE_KEYS.VOCAB_BOOK, [entry, ...book]);
    syncVocabAdd({ ko: it.ko, rom: it.rom, zh: it.zh, pos: it.pos, source: 'review' });
    showToast('已加入生词本');
  };

  const restart = () => {
    setRound((r) => r + 1);
    setRetryPass(null);
    setSkipQueue([]);
    setWrongItems([]);
    setIdx(0);
    setAnswers([]);
    setTotals({ correct: 0, wrong: 0 });
    setPhase('card');
  };

  // 生词本为空 → 引导卡
  if (baseItems.length === 0) {
    return (
      <EmptyState
        image="/empty-vocab.svg"
        title="生词本还是空的，先去学几个词吧。"
        description="收藏一些生词后，这里会出拼写题帮你巩固。"
        action={{ label: '去单词学习 →', to: '/vocabulary' }}
      />
    );
  }

  // 本轮总结
  if (phase === 'done') {
    const total = totals.correct + totals.wrong;
    const pct = total > 0 ? Math.round((totals.correct / total) * 100) : 0;
    return (
      <SummaryCard
        title="本轮拼写完成！"
        good={totals.correct}
        bad={totals.wrong}
        goodLabel="拼对"
        badLabel="拼错"
        message={`本轮共 ${baseItems.length} 题，正确率 ${pct}%。`}
        primaryLabel="再来一轮"
        onPrimary={restart}
        secondaryLabel="回到顶部"
        onSecondary={() => window.scrollTo({ top: 0, behavior: 'smooth' })}
        extra={
          wrongItems.length > 0 ? (
            <div className="mt-5 rounded-2xl bg-sand/70 p-4 text-left">
              <p className="text-sm font-medium text-ink">待巩固（{Math.min(3, wrongItems.length)} 条）</p>
              <ul className="mt-2 space-y-2">
                {wrongItems.slice(0, 3).map((w) => (
                  <li key={w.key} className="flex items-center gap-2 text-sm">
                    <span className="font-kr text-ink">{w.ko}</span>
                    <span className="min-w-0 flex-1 truncate text-ink-secondary">{w.zh}</span>
                    <SpeakButton text={w.ko} size="sm" />
                    <button
                      type="button"
                      onClick={() => addToVocabBook(w)}
                      className="flex shrink-0 items-center gap-1 rounded-full border border-honey px-2.5 py-1 text-xs text-honey transition-colors hover:bg-honey hover:text-paper"
                    >
                      <Plus size={12} /> 生词本
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          ) : undefined
        }
      />
    );
  }

  // 组末小结
  if (phase === 'summary') {
    const isLastGroup = idx >= queue.length;
    const hasRetry = retryPass === null && skipQueue.length > 0;
    return (
      <SummaryCard
        title={retryPass ? '重现题完成！' : `第 ${Math.floor((idx - 1) / groupSize) + 1} 组完成`}
        good={groupStat.correct}
        bad={groupStat.total - groupStat.correct}
        goodLabel="拼对"
        badLabel="拼错"
        message={
          groupStat.correct === groupStat.total
            ? '太棒了，全组通关！🎉'
            : isLastGroup && hasRetry
              ? '跳过的题已排到队尾，再挑战一次吧。'
              : '拼错的题已收进「待巩固」，结束时可以一键加入生词本。'
        }
        primaryLabel={!isLastGroup ? '进入下一组 →' : hasRetry ? '挑战跳过的题 →' : '查看本轮总结 →'}
        onPrimary={handleSummaryNext}
        secondaryLabel="结束本轮"
        onSecondary={() => {
          setPhase('done');
          showToast('复习记录已保存');
        }}
      />
    );
  }

  const isSentence = item.itemType === 'sentence';

  return (
    <section className="flex flex-col items-center gap-6">
      {/* 组进度条 */}
      <div className="w-full max-w-[640px]">
        <div className="mb-1.5 flex justify-between text-xs text-ink-muted">
          <span>
            {retryPass ? '队尾重现' : `第 ${groupIndex + 1} 组`} · 本组 {Math.min(idx - groupStart + 1, groupEnd - groupStart)}/{groupEnd - groupStart}
          </span>
          <span>本轮共 {baseItems.length} 题</span>
        </div>
        <div className="h-[3px] overflow-hidden rounded-full bg-sand">
          <motion.div
            className="h-full rounded-full bg-terracotta"
            animate={{ width: `${(idx / queue.length) * 100}%` }}
            transition={{ duration: 0.3 }}
          />
        </div>
      </div>

      {/* 答题卡（切题时下移淡入） */}
      <AnimatePresence mode="wait">
        <motion.div
          key={`${retryPass ? 'retry' : 'base'}-${item.key}`}
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -12 }}
          transition={{ duration: 0.25, ease: EASE }}
          className={cn(
            'w-full max-w-[640px] rounded-3xl border bg-paper p-6 shadow-card transition-colors md:p-8',
            submitted === true ? 'border-olive' : 'border-warm',
          )}
        >
          {/* 顶部：题型标签 + 进度 */}
          <div className="flex items-center justify-between">
            <span
              className={cn(
                'rounded-full px-3 py-1 text-xs font-medium',
                isSentence ? 'bg-olive/15 text-olive' : 'bg-honey/15 text-honey',
              )}
            >
              {isSentence ? '句子拼写' : '单词拼写'}
            </span>
            <span className="text-xs text-ink-muted">
              {idx + 1}/{queue.length}
            </span>
          </div>

          {/* 题干：中文释义 */}
          <p className="mt-6 text-center font-serif text-2xl font-bold leading-relaxed text-ink">{item.zh}</p>
          {!isSentence && item.pos && (
            <p className="mt-1 text-center text-sm text-ink-muted">{item.pos}</p>
          )}
          {isSentence && (
            <p className="mt-2 text-center text-sm text-ink-muted">
              首字母：{target[0]} · 共 {target.length} 字
            </p>
          )}

          {/* 逐格实时判定区（自动换行） */}
          <div className="mt-6 flex flex-wrap justify-center gap-1.5">
            {target.split('').map((ch, i) => {
              const userCh = typed[i];
              const state = userCh === undefined ? 'empty' : userCh === ch ? 'match' : 'mismatch';
              return (
                <div key={i} className="flex flex-col items-center">
                  {/* 提交后在错误格上方提示正确字符 */}
                  <span className="h-4 text-[10px] leading-4 text-terracotta-deep">
                    {submitted === false && state !== 'match' ? ch : ''}
                  </span>
                  <motion.span
                    animate={
                      submitted === true
                        ? { y: [0, -4, 0], transition: { delay: i * 0.04, type: 'spring', stiffness: 500, damping: 20 } }
                        : { y: 0 }
                    }
                    className={cn(
                      'flex h-10 w-8 items-center justify-center rounded-lg border font-kr text-lg transition-colors duration-100',
                      state === 'match' && 'border-olive text-olive',
                      state === 'mismatch' && 'border-terracotta-deep text-terracotta-deep',
                      state === 'empty' && 'border border-dashed border-warm text-ink',
                    )}
                  >
                    {userCh ?? ''}
                  </motion.span>
                </div>
              );
            })}
          </div>

          {/* 输入框：底部赤陶橘下划线，focus 加粗 */}
          <motion.div
            animate={shakeKey ? { x: [0, -6, 6, -4, 4, 0] } : undefined}
            transition={{ duration: 0.3 }}
            className="group mx-auto mt-6 max-w-[420px] border-b-2 border-terracotta transition-all focus-within:border-b-[3px]"
          >
            <input
              ref={inputRef}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key !== 'Enter') return;
                if (submitted === null) submit();
                else advance(answers);
              }}
              disabled={submitted !== null}
              placeholder="输入韩语…"
              enterKeyHint="done"
              autoComplete="off"
              autoCorrect="off"
              autoCapitalize="off"
              className="w-full bg-transparent py-2 text-center font-kr text-[28px] text-ink outline-none placeholder:text-ink-muted disabled:opacity-70"
            />
          </motion.div>

          {/* 提交后反馈 */}
          <AnimatePresence>
            {submitted === true && (
              <motion.p
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                className="mt-4 text-center font-medium text-olive"
              >
                完全正确！🎉
              </motion.p>
            )}
            {submitted === false && (
              <motion.div
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                className="mt-4 flex flex-col items-center gap-1.5"
              >
                <p className="text-xs text-ink-muted">正确答案</p>
                <div className="flex items-center gap-2">
                  <p className="font-kr text-[28px] font-bold text-terracotta">{item.ko}</p>
                  <SpeakButton text={item.ko} size="sm" />
                </div>
                {item.rom && <p className="text-sm text-ink-muted">{item.rom}</p>}
              </motion.div>
            )}
          </AnimatePresence>

          {/* 底部辅助行：听音提示 / 跳过 / 提交·继续 */}
          <div className="mt-6 flex flex-wrap items-center justify-center gap-3">
            <button
              type="button"
              onClick={playHint}
              className="flex h-10 items-center gap-1.5 rounded-full border border-warm bg-paper px-4 text-sm text-ink-secondary transition-colors hover:border-terracotta hover:text-terracotta"
            >
              <Volume2 size={15} /> 听音提示
            </button>
            {submitted === null ? (
              <>
                <button
                  type="button"
                  onClick={skip}
                  className="h-10 rounded-full border border-warm px-4 text-sm text-ink-muted transition-colors hover:bg-sand"
                >
                  跳过
                </button>
                <button
                  type="button"
                  onClick={submit}
                  disabled={!input.trim()}
                  className="h-10 rounded-full bg-terracotta px-6 text-sm font-medium text-paper shadow-card transition-colors hover:bg-terracotta-deep disabled:opacity-40"
                >
                  提交
                </button>
              </>
            ) : (
              <button
                type="button"
                onClick={() => advance(answers)}
                className="h-10 rounded-full bg-terracotta px-6 text-sm font-medium text-paper shadow-card transition-colors hover:bg-terracotta-deep"
              >
                继续 →
              </button>
            )}
          </div>
        </motion.div>
      </AnimatePresence>
    </section>
  );
}

// ============================================================
// Section 4 — 发音复习模式
// ============================================================

/** 挑选当前环境可用的录音 MIME 类型（iOS Safari 优先 audio/mp4） */
function pickMimeType(): string | undefined {
  if (typeof MediaRecorder === 'undefined' || !MediaRecorder.isTypeSupported) return undefined;
  const candidates = ['audio/mp4', 'audio/webm;codecs=opus', 'audio/webm', 'audio/ogg'];
  return candidates.find((t) => MediaRecorder.isTypeSupported(t));
}

/** 发音复习取材：已练句子 + 生词本 + 每日一句收藏 + 语料中心自定义材料 */
function buildPronItems(): ReviewItem[] {
  const out: ReviewItem[] = [];
  const seen = new Set<string>();
  const push = (it: ReviewItem) => {
    const k = it.ko.trim();
    if (!k || seen.has(k)) return;
    seen.add(k);
    out.push(it);
  };
  // 发音练习页已标记「已练」的句子
  const doneIds = readStorage<string[]>(KEY_PRON_DONE, []);
  PRACTICE_SENTENCES.filter((s) => doneIds.includes(s.id)).forEach((s) =>
    push({ key: `practice:${s.id}`, ko: s.ko, rom: s.rom, zh: s.zh, itemType: 'sentence', sourceLabel: '发音练习' }),
  );
  // 语料中心自定义发音材料
  readStorage<{ id: string; ko: string; rom?: string; zh?: string }[]>(KEY_PRON_CUSTOM, []).forEach((c) =>
    push({ key: `custom:${c.id}`, ko: c.ko, rom: c.rom ?? '', zh: c.zh ?? '', itemType: 'sentence', sourceLabel: '我的材料' }),
  );
  // 首页每日一句收藏（korean 文本反查句子库拿罗马音/中文）
  readStorage<string[]>(STORAGE_KEYS.FAVORITE_SENTENCES, []).forEach((k) => {
    const hit = DAILY_SENTENCES.find((s) => s.korean === k);
    push({
      key: `daily-fav:${k}`,
      ko: k,
      rom: hit?.romanization ?? '',
      zh: hit?.chinese ?? '',
      itemType: 'sentence',
      sourceLabel: '每日一句',
    });
  });
  // 生词本单词（生成单词练习卡）
  readVocabBook().forEach((e) =>
    push({ key: `vocab:${e.id}`, ko: e.ko, rom: e.rom, zh: e.zh, itemType: 'word', sourceLabel: '生词本', vocabId: e.id }),
  );
  return out;
}

type MicState = 'idle' | 'granted' | 'denied' | 'unsupported';

interface PronCardProps {
  item: ReviewItem;
  index: number;
  passed: boolean;
  highlighted: boolean;
  micState: MicState;
  onRequestMic: () => Promise<boolean>;
  onTogglePass: (item: ReviewItem) => void;
  /** 卡片根元素 ref（「再练一次」滚动定位用） */
  cardRef?: (el: HTMLLIElement | null) => void;
}

/** 发音复习练习卡：范读 / 慢速 0.7× / 录音 / 回放 / 范读→我 对比 / 本轮通过 */
function PronReviewCard({ item, index, passed, highlighted, micState, onRequestMic, onTogglePass, cardRef }: PronCardProps) {
  const [recording, setRecording] = useState(false);
  const [playing, setPlaying] = useState<'slow' | 'mine' | 'compare' | null>(null);
  const [audioUrl, setAudioUrl] = useState<string | null>(null);

  const recorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);

  // 卸载时释放音频对象 URL 与麦克风流
  useEffect(() => {
    return () => {
      audioRef.current?.pause();
      if (audioUrl) URL.revokeObjectURL(audioUrl);
      streamRef.current?.getTracks().forEach((t) => t.stop());
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /** 慢速 0.7× 范读 */
  const playSlow = () => {
    const ok = speakKorean(item.ko, {
      rate: 0.7,
      onStart: () => setPlaying('slow'),
      onEnd: () => setPlaying(null),
    });
    if (!ok) showToast('当前浏览器不支持语音合成');
  };

  /** 开始 / 停止跟读录音 */
  const toggleRecord = async () => {
    if (recording) {
      recorderRef.current?.stop();
      return;
    }
    const granted = await onRequestMic();
    if (!granted) return;
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;
      const mimeType = pickMimeType();
      const recorder = new MediaRecorder(stream, mimeType ? { mimeType } : undefined);
      recorderRef.current = recorder;
      chunksRef.current = [];
      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) chunksRef.current.push(e.data);
      };
      recorder.onstop = () => {
        const blob = new Blob(chunksRef.current, { type: recorder.mimeType || 'audio/mp4' });
        setAudioUrl((prev) => {
          if (prev) URL.revokeObjectURL(prev);
          return URL.createObjectURL(blob);
        });
        stream.getTracks().forEach((t) => t.stop());
        streamRef.current = null;
        setRecording(false);
      };
      recorder.start();
      setRecording(true);
    } catch {
      showToast('需要麦克风权限才能跟读哦');
    }
  };

  /** 回放我的录音 */
  const playMine = () => {
    if (!audioUrl) return;
    audioRef.current?.pause();
    const audio = new Audio(audioUrl);
    audioRef.current = audio;
    setPlaying('mine');
    audio.onended = () => setPlaying(null);
    audio.onerror = () => setPlaying(null);
    void audio.play().catch(() => {
      setPlaying(null);
      showToast('回放失败，请重新录一次');
    });
  };

  /** 对比播放：范读 → 间隔 0.5s → 我的录音 */
  const playCompare = () => {
    if (!audioUrl) return;
    setPlaying('compare');
    const playUser = () => {
      window.setTimeout(() => {
        audioRef.current?.pause();
        const audio = new Audio(audioUrl);
        audioRef.current = audio;
        audio.onended = () => setPlaying(null);
        audio.onerror = () => setPlaying(null);
        void audio.play().catch(() => setPlaying(null));
      }, 500);
    };
    const ok = speakKorean(item.ko, { rate: 1, onEnd: playUser });
    if (!ok) {
      showToast('当前浏览器不支持语音合成');
      setPlaying(null);
    }
  };

  const micDisabled = micState === 'denied' || micState === 'unsupported';

  return (
    <motion.li
      ref={cardRef}
      variants={{
        hidden: { opacity: 0, y: 24 },
        show: { opacity: 1, y: 0, transition: { duration: 0.5, ease: EASE } },
      }}
      animate={highlighted ? { scale: [1, 1.02, 1, 1.02, 1] } : { scale: 1 }}
      transition={highlighted ? { duration: 1.2 } : { duration: 0.3 }}
      className={cn(
        'relative overflow-hidden rounded-[20px] border bg-paper shadow-card transition-colors',
        highlighted ? 'border-honey' : 'border-warm',
      )}
    >
      {/* 本轮通过缎带（橄榄绿，rotate 45° 滑入） */}
      <AnimatePresence>
        {passed && (
          <motion.div
            initial={{ opacity: 0, x: 24, rotate: 45 }}
            animate={{ opacity: 1, x: 0, rotate: 0 }}
            exit={{ opacity: 0, x: 24 }}
            transition={{ type: 'spring', stiffness: 400, damping: 28 }}
            className="pointer-events-none absolute left-0 top-0 z-10"
          >
            <span className="inline-block rounded-br-xl bg-olive px-3 py-1 text-xs font-medium text-paper shadow-card">
              已通过
            </span>
          </motion.div>
        )}
      </AnimatePresence>

      {/* 句子区：句子卡有序号；单词卡仅 词+罗马音+中文（无序号） */}
      <div className="flex gap-4 px-5 pb-4 pt-5 md:px-6">
        {item.itemType === 'sentence' ? (
          <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full border-2 border-honey font-serif text-sm font-bold text-honey">
            {index + 1}
          </span>
        ) : (
          <span className="flex h-8 shrink-0 items-center rounded-full bg-honey/15 px-3 text-xs font-medium text-honey">
            {item.sourceLabel}
          </span>
        )}
        <div className="min-w-0 flex-1">
          <p className="font-kr text-xl leading-relaxed text-ink md:text-2xl">{item.ko}</p>
          {item.rom && <p className="mt-1 text-[13px] text-ink-muted">{item.rom}</p>}
          {item.zh && <p className="mt-1.5 text-base text-ink-secondary">{item.zh}</p>}
          {item.itemType === 'sentence' && (
            <span className="mt-2 inline-block rounded-full bg-sand px-2.5 py-0.5 text-xs text-ink-muted">
              {item.sourceLabel}
            </span>
          )}
        </div>
      </div>

      {/* 控制区 */}
      <div className="flex flex-wrap items-center gap-x-3 gap-y-3 border-t border-warm bg-base/60 px-5 py-4 md:px-6">
        {/* 常速范读 */}
        <div className="flex items-center gap-1.5">
          <SpeakButton
            text={item.ko}
            rate={1}
            size="md"
            onUnsupported={() => showToast('当前浏览器不支持语音合成')}
          />
          <span className="hidden text-xs text-ink-muted sm:inline">范读</span>
        </div>

        {/* 慢速 0.7× */}
        <button
          type="button"
          onClick={playSlow}
          disabled={!isTtsSupported()}
          className="flex h-11 items-center gap-1.5 rounded-full border border-warm bg-paper px-4 text-sm text-ink-secondary transition-colors hover:border-terracotta hover:text-terracotta disabled:opacity-40"
        >
          {playing === 'slow' ? <SoundBars /> : <Turtle size={16} />}
          慢速 0.7×
        </button>

        {/* 跟读录音大圆钮：录音中陶红脉冲 + 外圈波纹 */}
        <div className="relative mx-auto flex items-center justify-center sm:mx-0">
          {recording && (
            <motion.span
              className="absolute h-14 w-14 rounded-full border-2 border-terracotta-deep"
              initial={{ scale: 1, opacity: 0.6 }}
              animate={{ scale: 1.8, opacity: 0 }}
              transition={{ duration: 1.2, repeat: Infinity, ease: 'easeOut' }}
              aria-hidden
            />
          )}
          <motion.button
            type="button"
            onClick={toggleRecord}
            disabled={micDisabled}
            whileTap={{ scale: 0.9 }}
            aria-label={recording ? '停止录音' : '开始跟读录音'}
            title={micDisabled ? '麦克风不可用' : recording ? '停止录音' : '跟读录音'}
            className={cn(
              'relative flex h-14 w-14 items-center justify-center rounded-full text-paper shadow-card transition-colors',
              recording ? 'animate-pulse bg-terracotta-deep' : 'bg-terracotta hover:bg-terracotta-deep',
              micDisabled && 'cursor-not-allowed bg-ink-muted hover:bg-ink-muted',
            )}
          >
            {micDisabled ? <MicOff size={22} /> : recording ? <Square size={20} /> : <Mic size={22} />}
          </motion.button>
        </div>

        {/* 回放 */}
        <button
          type="button"
          onClick={playMine}
          disabled={!audioUrl}
          className="flex h-11 items-center gap-1.5 rounded-full border border-warm bg-paper px-4 text-sm text-ink-secondary transition-colors enabled:hover:border-terracotta enabled:hover:text-terracotta disabled:opacity-40"
        >
          {playing === 'mine' ? <SoundBars /> : <Play size={15} />}
          回放
        </button>

        {/* 范读→我 对比播放 */}
        <button
          type="button"
          onClick={playCompare}
          disabled={!audioUrl}
          className="flex h-11 items-center gap-1.5 rounded-full border border-warm bg-paper px-4 text-sm text-ink-secondary transition-colors enabled:hover:border-terracotta enabled:hover:text-terracotta disabled:opacity-40"
        >
          {playing === 'compare' ? <SoundBars /> : <Repeat2 size={15} />}
          范读→我
        </button>

        {/* 本轮通过 toggle */}
        <button
          type="button"
          onClick={() => onTogglePass(item)}
          aria-pressed={passed}
          className={cn(
            'ml-auto flex h-11 items-center gap-1.5 rounded-full border px-4 text-sm transition-colors',
            passed ? 'border-olive bg-olive text-paper' : 'border-olive text-olive hover:bg-olive/10',
          )}
        >
          <Check size={15} />
          {passed ? '本轮通过 ✓' : '标记通过'}
        </button>
      </div>
    </motion.li>
  );
}

interface PronReviewProps {
  groupSize: number;
  onReviewed: (n: number) => void;
}

function PronReviewMode({ groupSize, onReviewed }: PronReviewProps) {
  const allItems = useMemo(() => buildPronItems(), []);
  const groups = useMemo(() => chunk(allItems, groupSize), [allItems, groupSize]);
  const [groupIdx, setGroupIdx] = useState(0);
  const [passedKeys, setPassedKeys] = useState<Set<string>>(new Set());
  const [phase, setPhase] = useState<'list' | 'summary' | 'done'>('list');
  const [highlightKey, setHighlightKey] = useState<string | null>(null);
  const [micState, setMicState] = useState<MicState>(() =>
    typeof navigator !== 'undefined' && 'mediaDevices' in navigator && 'getUserMedia' in navigator.mediaDevices
      ? 'idle'
      : 'unsupported',
  );
  const micGrantedRef = useRef(false);
  const cardRefs = useRef<Map<string, HTMLLIElement>>(new Map());

  const group = groups[Math.min(groupIdx, groups.length - 1)] ?? [];
  const groupPassed = group.filter((it) => passedKeys.has(it.key)).length;

  /** 申请麦克风权限（预热，拿到后立即释放） */
  const requestMic = useCallback(async (): Promise<boolean> => {
    if (micGrantedRef.current) return true;
    if (
      typeof navigator === 'undefined' ||
      !('mediaDevices' in navigator) ||
      !('getUserMedia' in navigator.mediaDevices) ||
      typeof MediaRecorder === 'undefined'
    ) {
      setMicState('unsupported');
      showToast('当前浏览器不支持录音功能');
      return false;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      stream.getTracks().forEach((t) => t.stop());
      micGrantedRef.current = true;
      setMicState('granted');
      return true;
    } catch {
      setMicState('denied');
      showToast('需要麦克风权限才能跟读哦');
      return false;
    }
  }, []);

  /** 切换「本轮通过」：通过时写复习记录（result: practiced）并计数 */
  const togglePass = useCallback(
    (item: ReviewItem) => {
      setPassedKeys((prev) => {
        const next = new Set(prev);
        if (next.has(item.key)) {
          next.delete(item.key);
        } else {
          next.add(item.key);
          recordReview('pronunciation', item.itemType, item.ko, 'practiced');
          onReviewed(1);
        }
        return next;
      });
    },
    [onReviewed],
  );

  /** 完成本组：通过的句子计入统计增量 */
  const finishGroup = () => {
    if (groupPassed > 0) updateStats({ todayDone: getStats().todayDone + groupPassed });
    setPhase('summary');
  };

  /** 再练一次：回到列表，滚动到对应卡片并高亮脉冲 */
  const practiceAgain = (key: string) => {
    setPhase('list');
    setHighlightKey(key);
    window.setTimeout(() => {
      cardRefs.current.get(key)?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }, 100);
    window.setTimeout(() => setHighlightKey(null), 1500);
  };

  // 空状态：无任何已练句子 / 生词 / 自定义材料
  if (allItems.length === 0) {
    return (
      <EmptyState
        image="/empty-corpus.svg"
        title="还没有练过的句子。"
        description="去发音练习完成几句跟读，或在语料中心添加自定义材料，它们会出现在这里。"
        action={{ label: '去发音练习 →', to: '/pronunciation' }}
      />
    );
  }

  // 本轮总结
  if (phase === 'done') {
    const total = allItems.length;
    const passed = allItems.filter((it) => passedKeys.has(it.key)).length;
    return (
      <SummaryCard
        title="本轮发音复习完成！"
        good={passed}
        bad={total - passed}
        goodLabel="通过"
        badLabel="未通过"
        message={`本轮共 ${total} 条材料，通过 ${passed} 条。未通过的句子记得回发音练习再多跟读几遍。`}
        primaryLabel="再练一轮"
        onPrimary={() => {
          setPassedKeys(new Set());
          setGroupIdx(0);
          setPhase('list');
        }}
        secondaryLabel="回到顶部"
        onSecondary={() => window.scrollTo({ top: 0, behavior: 'smooth' })}
      />
    );
  }

  // 组末小结
  if (phase === 'summary') {
    const failed = group.filter((it) => !passedKeys.has(it.key));
    const isLastGroup = groupIdx >= groups.length - 1;
    return (
      <SummaryCard
        title={`第 ${groupIdx + 1} 组完成`}
        good={groupPassed}
        bad={group.length - groupPassed}
        goodLabel="通过"
        badLabel="未通过"
        message={
          failed.length === 0
            ? '太棒了，全组通关！🎉'
            : `本组跟读 ${group.length} 条 · 通过 ${groupPassed}，还有 ${failed.length} 条可以再练练。`
        }
        primaryLabel={isLastGroup ? '查看本轮总结 →' : '进入下一组 →'}
        onPrimary={() => {
          if (isLastGroup) {
            setPhase('done');
            showToast('复习记录已保存');
          } else {
            setGroupIdx((g) => g + 1);
            setPhase('list');
            window.scrollTo({ top: 0, behavior: 'smooth' });
          }
        }}
        secondaryLabel="结束本轮"
        onSecondary={() => {
          setPhase('done');
          showToast('复习记录已保存');
        }}
        extra={
          failed.length > 0 ? (
            <div className="mt-5 rounded-2xl bg-sand/70 p-4 text-left">
              <p className="text-sm font-medium text-ink">未通过（{failed.length} 条）</p>
              <ul className="mt-2 space-y-2">
                {failed.slice(0, 5).map((f) => (
                  <li key={f.key} className="flex items-center gap-2 text-sm">
                    <span className="min-w-0 flex-1 truncate font-kr text-ink">{f.ko}</span>
                    <SpeakButton text={f.ko} size="sm" />
                    <button
                      type="button"
                      onClick={() => practiceAgain(f.key)}
                      className="shrink-0 rounded-full border border-terracotta px-2.5 py-1 text-xs text-terracotta transition-colors hover:bg-terracotta hover:text-paper"
                    >
                      再练一次
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          ) : undefined
        }
      />
    );
  }

  return (
    <section className="flex flex-col gap-6">
      {/* 组进度条 */}
      <div className="mx-auto w-full max-w-[640px]">
        <div className="mb-1.5 flex justify-between text-xs text-ink-muted">
          <span>
            第 {groupIdx + 1}/{groups.length} 组 · 本组通过 {groupPassed}/{group.length}
          </span>
          <span>本轮共 {allItems.length} 条</span>
        </div>
        <div className="h-[3px] overflow-hidden rounded-full bg-sand">
          <motion.div
            className="h-full rounded-full bg-terracotta"
            animate={{ width: `${group.length ? (groupPassed / group.length) * 100 : 0}%` }}
            transition={{ duration: 0.3 }}
          />
        </div>
      </div>

      {/* 练习卡列表（进入视口 stagger 上移） */}
      <motion.ul
        key={groupIdx}
        initial="hidden"
        animate="show"
        variants={{ show: { transition: { staggerChildren: 0.07 } } }}
        className="mx-auto flex w-full max-w-[760px] flex-col gap-6"
      >
        {group.map((it, i) => (
          <PronReviewCard
            key={it.key}
            item={it}
            index={i}
            passed={passedKeys.has(it.key)}
            highlighted={highlightKey === it.key}
            micState={micState}
            onRequestMic={requestMic}
            onTogglePass={togglePass}
            cardRef={(el) => {
              if (el) cardRefs.current.set(it.key, el);
            }}
          />
        ))}
      </motion.ul>

      {/* 麦克风降级提示条 */}
      {(micState === 'denied' || micState === 'unsupported') && (
        <div className="mx-auto flex w-full max-w-[760px] items-start gap-3 rounded-2xl border border-honey/40 bg-honey/10 px-5 py-4 text-sm text-ink-secondary">
          <MicOff size={18} className="mt-0.5 shrink-0 text-honey" />
          <p>
            {micState === 'denied'
              ? '麦克风权限被拒绝了，可在浏览器站点设置中重新允许；范读、慢速不受影响。'
              : '当前浏览器不支持录音（iOS 请使用较新版本 Safari）；范读、慢速仍可正常使用。'}
          </p>
        </div>
      )}

      {/* 完成本组 */}
      <div className="mt-2 flex justify-center" style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}>
        <button
          type="button"
          onClick={finishGroup}
          className="rounded-full bg-terracotta px-8 py-3 text-sm font-medium text-paper shadow-card transition-colors hover:bg-terracotta-deep"
        >
          完成本组（已通过 {groupPassed}/{group.length}）
        </button>
      </div>
    </section>
  );
}

// ============================================================
// Section 1 — 页面主体：页头 + 模式切换
// ============================================================

const MODE_TABS: { id: ReviewMode; label: string; short: string; icon: ReactNode }[] = [
  { id: 'flashcard', label: '闪卡复习', short: '闪卡', icon: <Layers size={16} /> },
  { id: 'spelling', label: '拼写练习', short: '拼写', icon: <PenLine size={16} /> },
  { id: 'pronunciation', label: '发音复习', short: '发音', icon: <Mic size={16} /> },
];

export default function Review() {
  const [mode, setMode] = useState<ReviewMode>(() => readPrefs().mode ?? 'flashcard');
  const [dailyCount, setDailyCount] = useState<number>(() => readDailyCount());
  const groupSize = useMemo(() => getGroupSize(), []);
  const streak = getStats().streakDays;

  // TTS 不支持时一次性提示
  const ttsWarned = useRef(false);
  useEffect(() => {
    if (!isTtsSupported() && !ttsWarned.current) {
      ttsWarned.current = true;
      showToast('当前浏览器不支持韩语语音朗读');
    }
  }, []);

  /** 切换模式并记住选择 */
  const selectMode = (m: ReviewMode) => {
    setMode(m);
    saveModePref(m);
  };

  /** 每完成一题：今日已复习计数 +n */
  const handleReviewed = useCallback((n: number) => {
    setDailyCount(bumpDailyCount(n));
  }, []);

  return (
    <div className="mx-auto max-w-content px-4 pb-24 pt-10 md:px-6 md:pt-14">
      {/* 页面内联样式：声波柱 keyframes */}
      <style>{`
        @keyframes review-soundbar {
          0%, 100% { height: 5px; }
          50% { height: 16px; }
        }
        .review-soundbar { animation: review-soundbar 0.8s ease-in-out infinite; }
      `}</style>

      {/* 页头：主标 + 韩语副标 + 说明 + 统计徽章 */}
      <header className="flex flex-wrap items-end justify-between gap-6">
        <div>
          <motion.p
            initial={{ opacity: 0, y: 24 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, ease: EASE }}
            className="font-kr text-sm tracking-wider text-honey"
          >
            복습하기
          </motion.p>
          <motion.h1
            initial={{ opacity: 0, y: 24 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, delay: 0.08, ease: EASE }}
            className="mt-2 font-serif text-2xl font-bold text-ink md:text-3xl"
          >
            复习中心
          </motion.h1>
          <motion.p
            initial={{ opacity: 0, y: 24 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, delay: 0.16, ease: EASE }}
            className="mt-3 hidden max-w-xl text-base text-ink-secondary lg:block"
          >
            把收藏的词和句子再过一遍——记不住的，我们再来一次。
          </motion.p>
        </div>
        <motion.div
          initial={{ opacity: 0, y: 24 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, delay: 0.24, ease: EASE }}
          className="flex gap-3 overflow-x-auto pb-1"
        >
          <StatChip
            icon={<BookOpenText size={20} />}
            label="今日已复习"
            value={String(dailyCount)}
            unit="项"
            tone="terracotta"
            className="p-3"
          />
          <StatChip
            icon={<Flame size={20} />}
            label="连续学习"
            value={String(streak)}
            unit="天"
            tone="honey"
            className="p-3"
          />
        </motion.div>
      </header>

      {/* 分段控制器：pill 三段切换 + layoutId 滑块 */}
      <div className="mt-8 flex justify-center">
        <div
          className="flex w-full max-w-[480px] rounded-full bg-sand p-1 shadow-card"
          role="tablist"
          aria-label="复习模式"
        >
          {MODE_TABS.map((t) => {
            const active = mode === t.id;
            return (
              <button
                key={t.id}
                role="tab"
                aria-selected={active}
                type="button"
                onClick={() => selectMode(t.id)}
                className={cn(
                  'relative flex flex-1 items-center justify-center gap-1.5 rounded-full px-3 py-2 text-sm transition-colors',
                  active ? 'text-terracotta' : 'text-ink-secondary hover:text-ink',
                )}
              >
                {active && (
                  <motion.span
                    layoutId="review-mode-slider"
                    className="absolute inset-0 rounded-full bg-paper shadow-card"
                    transition={{ duration: 0.25, ease: EASE }}
                  />
                )}
                <motion.span
                  className="relative z-10 flex items-center gap-1.5 font-medium"
                  animate={active ? { y: [0, -2, 0] } : { y: 0 }}
                  transition={{ type: 'spring', stiffness: 500, damping: 25 }}
                >
                  {t.icon}
                  <span className="hidden sm:inline">{t.label}</span>
                  <span className="sm:hidden">{t.short}</span>
                </motion.span>
              </button>
            );
          })}
        </div>
      </div>

      {/* 三模式内容区：切换时交叉淡入 + 上移 12px */}
      <AnimatePresence mode="wait">
        <motion.div
          key={mode}
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -12 }}
          transition={{ duration: 0.25, ease: EASE }}
          className="mt-10"
        >
          {mode === 'flashcard' && <FlashcardMode groupSize={groupSize} onReviewed={handleReviewed} />}
          {mode === 'spelling' && <SpellingMode groupSize={groupSize} onReviewed={handleReviewed} />}
          {mode === 'pronunciation' && <PronReviewMode groupSize={groupSize} onReviewed={handleReviewed} />}
        </motion.div>
      </AnimatePresence>

      {/* 底部提示 */}
      <motion.aside
        initial={{ opacity: 0, y: 20 }}
        whileInView={{ opacity: 1, y: 0 }}
        viewport={{ once: true, amount: 0.5 }}
        transition={{ duration: 0.5, ease: EASE }}
        className="mt-14 flex items-start gap-3 rounded-2xl bg-sand p-5 text-sm text-ink-secondary"
      >
        <RotateCcw size={18} className="mt-0.5 shrink-0 text-honey" />
        <p>复习按「组」推进，每组大小可在用户中心的「复习节奏」里调整（当前每组 {groupSize}）。所有记录仅保存在本机浏览器。</p>
      </motion.aside>
    </div>
  );
}
