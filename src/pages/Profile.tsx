/**
 * Profile — 用户中心（我的）
 * 区块：页头 + 用户卡 + 登录横幅 / 学习数据（4 张大数字卡 + 近 7 天柱状图）/ 学习偏好（即时保存 + 云端同步）/ 数据管理
 *
 * 数据口径说明：
 *  - 累计单词：以各学习页埋点写入的 hjy:stats.wordsLearned 为准（生词本 hjy:vocab-book 是收藏夹，
 *    不等同于已学；仅在 stats 缺字段时用云端统计校准，取本地/云端较大值）。
 *  - 累计句子：本地 hjy:stats 暂未埋点累计句子字段，优先读其扩展字段 sentencesLearned/totalSentences，
 *    否则用云端 stats.sentencesLearned 校准（syncEnsureUser 返回），失败静默为 0。
 *  - 累计时长 / 近 7 天柱状图：hjy:study-time（秒）换算分钟。
 *  - 连续天数：hjy:stats.streakDays；「最长连续」由本页派生并回写进 hjy:stats.longestStreak 扩展字段。
 * 偏好存储：hjy:review-prefs（reviewGroupSize/voiceGender/voiceName/dailyGoal），
 * 写入时附带旧别名 groupSize/voice 兼容；每次变更静默 syncPrefs 同步云端。
 */
import { memo, useEffect, useMemo, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { Link } from 'react-router';
import { AnimatePresence, animate, motion, useInView } from 'framer-motion';
import {
  BookOpen,
  Check,
  Flame,
  Link2,
  MessageSquare,
  Minus,
  Package,
  Play,
  Plus,
  Sprout,
  Timer,
  Trash2,
} from 'lucide-react';
import { STORAGE_KEYS, getStats, readStorage, updateStats, writeStorage } from '@/lib/storage';
import type { StudyStats } from '@/lib/storage';
import { getStudyTime } from '@/lib/studyTime';
import { isTtsSupported, previewVoice, stopSpeaking } from '@/lib/tts';
import type { VoiceGender } from '@/lib/tts';
import { syncEnsureUser, syncPrefs } from '@/lib/sync';
import { clearCorpus, listCorpusMeta } from '@/lib/corpus';
import { showToast } from '@/components/Toast';
import { cn } from '@/lib/utils';

/** 全局动画曲线（design.md easeOutQuint） */
const EASE = [0.22, 1, 0.36, 1] as [number, number, number, number];

/** 偏好存储键（与复习页 / tts.ts 共用） */
const PREFS_KEY = 'hjy:review-prefs';

/** 学习偏好（字段与后端 preferences 表对齐） */
interface ReviewPrefs {
  reviewGroupSize: number;
  voiceGender: VoiceGender;
  voiceName: string | null;
  dailyGoal: number;
}

const DEFAULT_PREFS: ReviewPrefs = { reviewGroupSize: 10, voiceGender: 'female', voiceName: null, dailyGoal: 5 };

/** 读取偏好（兼容旧别名 groupSize / voice） */
function loadPrefs(): ReviewPrefs {
  const raw = readStorage<Record<string, unknown>>(PREFS_KEY, {});
  const num = (v: unknown, fallback: number, min: number, max: number) =>
    typeof v === 'number' && Number.isFinite(v) ? Math.min(max, Math.max(min, Math.round(v))) : fallback;
  const gender = (v: unknown): VoiceGender => (v === 'male' ? 'male' : 'female');
  return {
    reviewGroupSize: num(raw.reviewGroupSize ?? raw.groupSize, DEFAULT_PREFS.reviewGroupSize, 3, 50),
    voiceGender: gender(raw.voiceGender ?? raw.voice),
    voiceName: typeof raw.voiceName === 'string' ? raw.voiceName : null,
    dailyGoal: num(raw.dailyGoal, DEFAULT_PREFS.dailyGoal, 1, 50),
  };
}

/** 写入偏好（附带旧别名，供未迁移页面读取） */
function persistPrefs(p: ReviewPrefs): void {
  writeStorage(PREFS_KEY, { ...p, groupSize: p.reviewGroupSize, voice: p.voiceGender });
}

/** hjy:stats 原始结构（含各页/本页可能写入的扩展字段） */
type RawStats = StudyStats & { sentencesLearned?: number; totalSentences?: number; longestStreak?: number };

/** 本地日期键 YYYY-MM-DD（与 studyTime.ts 一致） */
function dayKeyOf(d: Date): string {
  const m = `${d.getMonth() + 1}`.padStart(2, '0');
  const day = `${d.getDate()}`.padStart(2, '0');
  return `${d.getFullYear()}-${m}-${day}`;
}

/** 分钟数 → 「X 小时 Y 分」/「Y 分钟」 */
function fmtDuration(mins: number): string {
  const m = Math.round(mins);
  if (m >= 60) return `${Math.floor(m / 60)} 小时 ${m % 60} 分`;
  return `${m} 分钟`;
}

/* ---------------- CountUp：进入视口后从 0 滚动到目标值（800ms） ---------------- */
function CountUp({ value, format, className }: { value: number; format?: (n: number) => string; className?: string }) {
  const ref = useRef<HTMLSpanElement>(null);
  const inView = useInView(ref, { once: true, amount: 0.4 });
  const fmtRef = useRef(format ?? ((n: number) => `${Math.round(n)}`));
  useEffect(() => {
    if (format) fmtRef.current = format;
  }, [format]);
  useEffect(() => {
    if (!inView) return;
    const controls = animate(0, value, {
      duration: 0.8,
      ease: EASE,
      onUpdate: (v) => {
        if (ref.current) ref.current.textContent = fmtRef.current(v);
      },
    });
    return () => controls.stop();
  }, [inView, value]);
  return (
    <span ref={ref} className={className}>
      {(format ?? ((n: number) => `${Math.round(n)}`))(0)}
    </span>
  );
}

/* ---------------- Stepper：−/＋ 步进器（支持长按连续步进） ---------------- */
function Stepper({
  value,
  min,
  max,
  onChange,
  ariaLabel,
}: {
  value: number;
  min: number;
  max: number;
  onChange: (v: number) => void;
  ariaLabel: string;
}) {
  const valueRef = useRef(value);
  useEffect(() => {
    valueRef.current = value;
  }, [value]);
  const timers = useRef<{ delay?: number; repeat?: number }>({});
  const stop = () => {
    window.clearTimeout(timers.current.delay);
    window.clearInterval(timers.current.repeat);
  };
  useEffect(() => stop, []);

  const step = (delta: number) => {
    const next = Math.min(max, Math.max(min, valueRef.current + delta));
    if (next !== valueRef.current) onChange(next);
  };
  const pressStart = (delta: number) => (e: React.PointerEvent<HTMLButtonElement>) => {
    e.preventDefault();
    step(delta);
    stop();
    // 长按 400ms 后每 90ms 连续步进
    timers.current.delay = window.setTimeout(() => {
      timers.current.repeat = window.setInterval(() => step(delta), 90);
    }, 400);
  };

  const btnCls =
    'flex h-10 w-10 items-center justify-center rounded-xl text-ink-secondary transition-colors hover:bg-sand disabled:pointer-events-none disabled:opacity-40';
  return (
    <div className="inline-flex items-center gap-1 rounded-xl border border-warm bg-paper p-1" aria-label={ariaLabel}>
      <button
        type="button"
        className={btnCls}
        disabled={value <= min}
        aria-label="减少"
        onPointerDown={pressStart(-1)}
        onPointerUp={stop}
        onPointerLeave={stop}
        onPointerCancel={stop}
      >
        <Minus size={16} />
      </button>
      <span className="w-12 text-center font-serif text-lg font-semibold tabular-nums text-ink">{value}</span>
      <button
        type="button"
        className={btnCls}
        disabled={value >= max}
        aria-label="增加"
        onPointerDown={pressStart(1)}
        onPointerUp={stop}
        onPointerLeave={stop}
        onPointerCancel={stop}
      >
        <Plus size={16} />
      </button>
    </div>
  );
}

/* ---------------- WarmSlider：暖色自定义滑块（指针拖拽 + 键盘方向键） ---------------- */
function WarmSlider({
  value,
  min,
  max,
  onChange,
  ariaLabel,
}: {
  value: number;
  min: number;
  max: number;
  onChange: (v: number) => void;
  ariaLabel: string;
}) {
  const trackRef = useRef<HTMLDivElement>(null);
  const [dragging, setDragging] = useState(false);
  const ratio = (value - min) / (max - min);

  const updateFromPointer = (clientX: number) => {
    const el = trackRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const r = Math.min(1, Math.max(0, (clientX - rect.left) / rect.width));
    onChange(min + Math.round(r * (max - min)));
  };

  return (
    <div
      ref={trackRef}
      role="slider"
      tabIndex={0}
      aria-label={ariaLabel}
      aria-valuemin={min}
      aria-valuemax={max}
      aria-valuenow={value}
      className="relative flex h-6 w-full cursor-pointer touch-none items-center outline-none"
      onPointerDown={(e) => {
        e.currentTarget.setPointerCapture(e.pointerId);
        setDragging(true);
        updateFromPointer(e.clientX);
      }}
      onPointerMove={(e) => {
        if (dragging) updateFromPointer(e.clientX);
      }}
      onPointerUp={() => setDragging(false)}
      onPointerCancel={() => setDragging(false)}
      onKeyDown={(e) => {
        if (e.key === 'ArrowLeft' || e.key === 'ArrowDown') {
          e.preventDefault();
          onChange(Math.max(min, value - 1));
        } else if (e.key === 'ArrowRight' || e.key === 'ArrowUp') {
          e.preventDefault();
          onChange(Math.min(max, value + 1));
        }
      }}
    >
      {/* 轨道 */}
      <div className="h-1 w-full rounded-full bg-sand" />
      {/* 已选段 */}
      <div className="pointer-events-none absolute left-0 h-1 rounded-full bg-terracotta" style={{ width: `${ratio * 100}%` }} />
      {/* 手柄 */}
      <div
        className="pointer-events-none absolute h-5 w-5 rounded-full border border-warm bg-paper shadow-card transition-transform duration-150 ease-quint"
        style={{ left: `${ratio * 100}%`, transform: `translateX(-50%) scale(${dragging ? 1.15 : 1})` }}
      />
    </div>
  );
}

/* ---------------- SoundBars：试听中声波柱跳动（独立 memo 组件，避免父级重渲染打断循环动画） ---------------- */
const SoundBars = memo(function SoundBars() {
  return (
    <span className="flex h-3.5 items-end gap-[2px]" aria-hidden>
      {[0, 1, 2].map((i) => (
        <motion.span
          key={i}
          className="w-[3px] origin-bottom rounded-full bg-terracotta"
          style={{ height: 14 }}
          animate={{ scaleY: [1, 0.35, 0.85, 0.5, 1] }}
          transition={{ duration: 0.8, repeat: Infinity, delay: i * 0.12, ease: 'easeInOut' }}
        />
      ))}
    </span>
  );
});

/* ---------------- VoiceCard：音色单选卡（清亮女声 / 清亮男声） ---------------- */
function VoiceCard({
  emoji,
  title,
  desc,
  selected,
  previewing,
  ttsOk,
  onSelect,
  onPreview,
}: {
  emoji: string;
  title: string;
  desc: string;
  selected: boolean;
  previewing: boolean;
  ttsOk: boolean;
  onSelect: () => void;
  onPreview: () => void;
}) {
  return (
    <div
      role="radio"
      aria-checked={selected}
      tabIndex={0}
      onClick={onSelect}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          onSelect();
        }
      }}
      className={cn(
        'relative cursor-pointer rounded-2xl bg-paper p-4 transition-all duration-200 ease-quint',
        selected ? 'border-2 border-terracotta bg-terracotta-soft' : 'border border-warm hover:border-terracotta/50',
      )}
    >
      {/* 选中对勾（橄榄绿圆点 scale 弹入） */}
      <AnimatePresence>
        {selected && (
          <motion.span
            initial={{ scale: 0 }}
            animate={{ scale: 1 }}
            exit={{ scale: 0 }}
            transition={{ type: 'spring', stiffness: 500, damping: 24 }}
            className="absolute -left-1.5 -top-1.5 flex h-5 w-5 items-center justify-center rounded-full bg-olive text-paper"
          >
            <Check size={12} strokeWidth={3} />
          </motion.span>
        )}
      </AnimatePresence>
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0">
          <p className="font-medium text-ink">
            <span className="mr-1.5" aria-hidden>
              {emoji}
            </span>
            {title}
          </p>
          <p className="mt-1 text-xs text-ink-muted">{desc}</p>
        </div>
        <button
          type="button"
          disabled={!ttsOk}
          onClick={(e) => {
            e.stopPropagation();
            onPreview();
          }}
          className={cn(
            'flex h-8 shrink-0 items-center gap-1.5 rounded-full border border-warm px-3 text-xs text-ink-secondary transition-colors',
            ttsOk ? 'hover:border-terracotta hover:text-terracotta' : 'cursor-not-allowed opacity-40',
          )}
        >
          {previewing ? <SoundBars /> : <Play size={12} />}
          试听
        </button>
      </div>
    </div>
  );
}

/* ---------------- 大数字统计卡 ---------------- */
interface StatCardDef {
  icon: ReactNode;
  toneCls: string;
  label: string;
  value: number;
  unit?: string;
  format?: (n: number) => string;
  sub?: string;
}

function StatCard({ card, index }: { card: StatCardDef; index: number }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 24 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, amount: 0.2 }}
      transition={{ duration: 0.5, ease: EASE, delay: index * 0.08 }}
      className="flex flex-col items-center gap-2 rounded-2xl border border-warm bg-paper p-5 text-center shadow-card"
    >
      <span className={cn('flex h-10 w-10 items-center justify-center rounded-xl', card.toneCls)}>{card.icon}</span>
      <p className="font-serif text-[38px] font-semibold leading-none text-ink">
        <CountUp value={card.value} format={card.format} />
        {card.unit && <span className="ml-1 font-sans text-base font-normal text-ink-muted">{card.unit}</span>}
      </p>
      <p className="text-sm text-ink-secondary">{card.label}</p>
      {card.sub && <p className="-mt-1 text-xs text-ink-muted">{card.sub}</p>}
    </motion.div>
  );
}

/* ---------------- 主页面 ---------------- */
export default function Profile() {
  /* ---- 本地数据（本地优先，云端仅校准显示） ---- */
  const [stats] = useState(() => getStats());
  const [study] = useState(() => getStudyTime());
  const [rawStats, setRawStats] = useState<RawStats>(() => readStorage<RawStats>(STORAGE_KEYS.STATS, {} as RawStats));
  const [prefs, setPrefs] = useState<ReviewPrefs>(loadPrefs);
  const [cloud, setCloud] = useState<{ words: number; sentences: number; seconds: number; streak: number } | null>(null);
  const [activeTip, setActiveTip] = useState<number | null>(null);
  const [previewing, setPreviewing] = useState<VoiceGender | null>(null);
  const [savedVisible, setSavedVisible] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [clearing, setClearing] = useState(false);

  const ttsOk = isTtsSupported();
  const ttsToastShown = useRef(false);
  const savedTimer = useRef<number | undefined>(undefined);

  /* 云端总览校准：成功则取本地/云端较大值显示；失败静默用本地数据 */
  useEffect(() => {
    let cancelled = false;
    void syncEnsureUser().then((res) => {
      if (cancelled || !res?.stats) return;
      const s = res.stats;
      setCloud({
        words: s.wordsLearned ?? 0,
        sentences: s.sentencesLearned ?? 0,
        seconds: s.studySeconds ?? 0,
        streak: s.streakDays ?? 0,
      });
    });
    return () => {
      cancelled = true;
    };
  }, []);

  /* 派生「最长连续」并回写 stats 扩展字段（仅本地，不触发云端增量同步） */
  useEffect(() => {
    if (stats.streakDays > (rawStats.longestStreak ?? 0)) {
      const next: RawStats = { ...rawStats, longestStreak: stats.streakDays };
      writeStorage(STORAGE_KEYS.STATS, next);
      setRawStats(next);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stats.streakDays]);

  /* 组件卸载时停止试听朗读 */
  useEffect(() => () => stopSpeaking(), []);

  /* 试听播放状态轮询：speechSynthesis 结束后收起声波动画（8s 兜底） */
  useEffect(() => {
    if (!previewing) return;
    const iv = window.setInterval(() => {
      if (!window.speechSynthesis.speaking && !window.speechSynthesis.pending) setPreviewing(null);
    }, 150);
    const safety = window.setTimeout(() => setPreviewing(null), 8000);
    return () => {
      window.clearInterval(iv);
      window.clearTimeout(safety);
    };
  }, [previewing]);

  /* 「已保存」反馈：橄榄绿对勾 1.5s 后淡出 */
  const notifySaved = () => {
    setSavedVisible(true);
    window.clearTimeout(savedTimer.current);
    savedTimer.current = window.setTimeout(() => setSavedVisible(false), 1500);
  };

  /** 偏好变更：立即写本地 + 静默同步云端（失败不打扰用户） */
  const applyPrefs = (patch: Partial<ReviewPrefs>) => {
    setPrefs((prev) => {
      const next = { ...prev, ...patch };
      persistPrefs(next);
      return next;
    });
    notifySaved();
    const syncPatch: { reviewGroupSize?: number; voiceGender?: VoiceGender; voiceName?: string | null; dailyGoal?: number } = {};
    if (patch.reviewGroupSize !== undefined) syncPatch.reviewGroupSize = patch.reviewGroupSize;
    if (patch.voiceGender !== undefined) {
      syncPatch.voiceGender = patch.voiceGender;
      syncPatch.voiceName = null; // 切换性别时清除手动指定的具体语音
    }
    if (patch.dailyGoal !== undefined) syncPatch.dailyGoal = patch.dailyGoal;
    syncPrefs(syncPatch);
    // 每日目标与首页今日进度共用 todayGoal，保持口径一致
    if (patch.dailyGoal !== undefined) updateStats({ todayGoal: patch.dailyGoal });
  };

  const handlePreview = (gender: VoiceGender) => {
    if (!ttsOk || !previewVoice(gender)) {
      if (!ttsToastShown.current) {
        ttsToastShown.current = true;
        showToast('当前浏览器不支持韩语语音朗读');
      }
      return;
    }
    setPreviewing(gender);
  };

  /* ---- 统计口径：本地与云端取较大值（云端仅校准，不回写） ---- */
  const totalWords = Math.max(stats.wordsLearned, cloud?.words ?? 0);
  const totalSentences = Math.max(rawStats.sentencesLearned ?? rawStats.totalSentences ?? 0, cloud?.sentences ?? 0);
  const totalSeconds = Math.max(study.total, cloud?.seconds ?? 0);
  const totalMinutes = totalSeconds / 60;
  const streak = Math.max(stats.streakDays, cloud?.streak ?? 0);
  const longestStreak = Math.max(streak, rawStats.longestStreak ?? 0);
  const allZero = totalWords === 0 && totalSentences === 0 && totalSeconds === 0 && streak === 0;

  const statCards: StatCardDef[] = [
    { icon: <BookOpen size={20} />, toneCls: 'bg-honey/15 text-honey', label: '累计单词', value: totalWords, unit: '词' },
    { icon: <MessageSquare size={20} />, toneCls: 'bg-terracotta-soft text-terracotta', label: '累计句子', value: totalSentences, unit: '句' },
    { icon: <Timer size={20} />, toneCls: 'bg-olive/15 text-olive', label: '累计时长', value: totalMinutes, format: fmtDuration },
    { icon: <Flame size={20} />, toneCls: 'bg-terracotta-soft text-terracotta', label: '连续学习', value: streak, unit: '天', sub: `最长连续 ${longestStreak} 天` },
  ];

  /* ---- 近 7 天柱状图数据 ---- */
  const chartDays = useMemo(() => {
    const week = ['日', '一', '二', '三', '四', '五', '六'];
    const out: { key: string; label: string; dateLabel: string; minutes: number; isToday: boolean }[] = [];
    for (let i = 6; i >= 0; i--) {
      const d = new Date();
      d.setDate(d.getDate() - i);
      const key = dayKeyOf(d);
      out.push({
        key,
        label: i === 0 ? '今天' : week[d.getDay()],
        dateLabel: `${d.getMonth() + 1}月${d.getDate()}日`,
        minutes: Math.round((study.byDay[key] ?? 0) / 60),
        isToday: i === 0,
      });
    }
    return out;
  }, [study]);
  const weekTotal = chartDays.reduce((sum, d) => sum + d.minutes, 0);
  const weekMax = Math.max(...chartDays.map((d) => d.minutes), 0);

  /* ---- 数据管理 ---- */
  const handleExport = async () => {
    try {
      // 聚合本应用全部 localStorage 键（hjy:* 及历史 vocab-*/pron-* 前缀）
      const local: Record<string, unknown> = {};
      for (let i = 0; i < window.localStorage.length; i++) {
        const key = window.localStorage.key(i);
        if (key && (key.startsWith('hjy:') || key.startsWith('vocab-') || key.startsWith('pron-'))) {
          try {
            local[key] = JSON.parse(window.localStorage.getItem(key) ?? 'null');
          } catch {
            local[key] = window.localStorage.getItem(key);
          }
        }
      }
      // 语料元信息（peaks 体积大，导出时剔除；文件本体不含在内）
      const corpusMeta = (await listCorpusMeta()).map((m) => {
        const rest = { ...m };
        delete rest.peaks;
        return rest;
      });
      const payload = {
        app: '韩之语 KoreanFlow',
        version: 1,
        exportedAt: new Date().toISOString(),
        localStorage: local,
        corpusMeta,
        note: '语料文件本体（音频/视频/PDF）未包含在导出中，迁移后需重新上传。',
      };
      const now = new Date();
      const stamp = `${now.getFullYear()}${`${now.getMonth() + 1}`.padStart(2, '0')}${`${now.getDate()}`.padStart(2, '0')}`;
      const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `koreanflow-backup-${stamp}.json`;
      a.click();
      URL.revokeObjectURL(url);
      showToast('数据已导出');
    } catch {
      showToast('导出失败，请重试');
    }
  };

  const handleClear = async () => {
    if (clearing) return;
    setClearing(true);
    try {
      // 仅清除本应用键：hjy:* 及历史 vocab-*/pron-* 前缀
      const keys: string[] = [];
      for (let i = 0; i < window.localStorage.length; i++) {
        const key = window.localStorage.key(i);
        if (key && (key.startsWith('hjy:') || key.startsWith('vocab-') || key.startsWith('pron-'))) keys.push(key);
      }
      keys.forEach((k) => window.localStorage.removeItem(k));
      await clearCorpus(); // 清空 IndexedDB 语料
      showToast('已清除');
      window.setTimeout(() => {
        window.location.href = '/';
      }, 1000);
    } catch {
      setClearing(false);
      showToast('清除失败，请重试');
    }
  };

  return (
    <div className="mx-auto w-full max-w-content px-4 py-8 md:px-6 md:py-12">
      {/* ========== 页头 ========== */}
      <header className="mb-8">
        <span className="font-kr text-sm tracking-wider text-honey">마이 페이지</span>
        <h1 className="mt-1 font-serif text-3xl font-bold text-ink">我的</h1>
      </header>

      {/* ========== Section 1：用户卡 + 登录横幅 ========== */}
      <motion.section
        initial={{ opacity: 0, y: 24 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5, ease: EASE }}
        className="rounded-3xl border border-warm bg-paper p-6 shadow-card md:p-8"
      >
        <div className="flex flex-col items-center gap-4 text-center md:flex-row md:gap-6 md:text-left">
          {/* 头像占位（蜂蜜金小圆点为将来头像编辑入口预留，当前纯装饰） */}
          <div className="relative shrink-0">
            <motion.div
              initial={{ scale: 0.8, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              transition={{ type: 'spring', stiffness: 320, damping: 20, delay: 0.15 }}
              className="flex h-16 w-16 items-center justify-center rounded-full bg-terracotta-soft md:h-[72px] md:w-[72px]"
            >
              <span className="font-serif text-[28px] font-semibold text-terracotta">韩</span>
            </motion.div>
            <span className="absolute -bottom-0.5 -right-0.5 h-5 w-5 rounded-full border-2 border-paper bg-honey" aria-hidden />
          </div>
          <div className="min-w-0">
            <div className="flex flex-wrap items-center justify-center gap-2 md:justify-start">
              <h2 className="text-xl font-semibold text-ink">韩语学习者</h2>
              {/* 会员徽章：视觉位为将来 Pro 付费等级预留 */}
              <span className="inline-flex items-center gap-1 rounded-full border border-honey px-2.5 py-0.5 text-xs font-medium text-honey">
                <Sprout size={12} />
                免费版
              </span>
            </div>
            <p className="mt-1 text-sm text-ink-muted">离线优先 · 数据保存在本机浏览器</p>
          </div>
          {/* 学习时长摘要（全新用户隐藏） */}
          {!allZero && (
            <p className="text-sm text-ink-secondary md:ml-auto md:text-right">
              累计学习 {fmtDuration(totalMinutes)} · 连续 {streak} 天
            </p>
          )}
        </div>
      </motion.section>

      {/* 登录提示横幅 */}
      <motion.div
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5, ease: EASE, delay: 0.2 }}
        className="mt-4 flex items-center gap-3 rounded-2xl bg-sand px-4 py-3 md:px-5"
      >
        <Link2 size={18} className="shrink-0 text-ink-secondary" aria-hidden />
        <p className="min-w-0 flex-1 text-sm text-ink-secondary">登录后可同步多设备数据，学习记录不丢失</p>
        <button
          type="button"
          onClick={() => showToast('账号系统正在筹备中，敬请期待')}
          className="shrink-0 cursor-not-allowed rounded-full border border-warm px-4 py-1.5 text-sm text-ink-muted"
        >
          即将上线
        </button>
      </motion.div>

      {/* ========== Section 2：学习数据 ========== */}
      <section className="mt-12 md:mt-16">
        <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
          {statCards.map((card, i) => (
            <StatCard key={card.label} card={card} index={i} />
          ))}
        </div>
        {allZero && <p className="mt-4 text-center text-xs text-ink-muted">今天就开始第一课吧</p>}

        {/* 近 7 天学习时长柱状图 */}
        <motion.div
          initial={{ opacity: 0, y: 24 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, amount: 0.2 }}
          transition={{ duration: 0.5, ease: EASE }}
          className="mt-6 rounded-3xl border border-warm bg-paper p-6 shadow-card md:p-8"
        >
          <div className="flex items-baseline justify-between gap-3">
            <h3 className="font-serif text-lg font-semibold text-ink">近 7 天学习时长</h3>
            <span className="shrink-0 text-sm text-ink-muted">共 {weekTotal} 分钟</span>
          </div>
          {weekTotal === 0 ? (
            <div className="flex h-[160px] flex-col items-center justify-center gap-2">
              <p className="text-sm text-ink-muted">最近还没有学习记录</p>
              <Link to="/vocabulary" className="text-sm text-terracotta transition-opacity hover:opacity-80">
                去学习 →
              </Link>
            </div>
          ) : (
            <div className="mt-6 flex items-end justify-between gap-1 sm:gap-3">
              {chartDays.map((d, i) => (
                <div
                  key={d.key}
                  className="group relative flex min-w-0 flex-1 cursor-pointer flex-col items-center"
                  onClick={() => setActiveTip(activeTip === i ? null : i)}
                >
                  {/* tooltip：桌面 hover / 移动点按切换 */}
                  <div
                    className={cn(
                      'pointer-events-none absolute -top-9 z-10 whitespace-nowrap rounded-lg border border-warm bg-paper px-2 py-1 text-xs text-ink-secondary shadow-card transition-all duration-150',
                      activeTip === i ? 'scale-100 opacity-100' : 'scale-90 opacity-0 group-hover:scale-100 group-hover:opacity-100',
                    )}
                  >
                    {d.dateLabel} · {d.minutes} 分钟
                  </div>
                  <div className="flex h-[160px] w-full items-end justify-center">
                    <motion.div
                      initial={{ scaleY: 0 }}
                      whileInView={{ scaleY: 1 }}
                      viewport={{ once: true, amount: 0.2 }}
                      transition={{ duration: 0.5, ease: EASE, delay: i * 0.06 }}
                      className={cn(
                        'w-6 origin-bottom rounded-t-md md:w-8',
                        d.minutes > 0 ? (d.isToday ? 'bg-olive' : 'bg-terracotta') : 'bg-sand',
                      )}
                      style={{ height: Math.max(4, weekMax > 0 ? (d.minutes / weekMax) * 160 : 4) }}
                    />
                  </div>
                  <span className={cn('mt-2 text-xs', d.isToday ? 'font-medium text-ink-secondary' : 'text-ink-muted')}>{d.label}</span>
                </div>
              ))}
            </div>
          )}
        </motion.div>
      </section>

      {/* ========== Section 3：学习偏好 ========== */}
      <motion.section
        initial={{ opacity: 0, y: 24 }}
        whileInView={{ opacity: 1, y: 0 }}
        viewport={{ once: true, amount: 0.15 }}
        transition={{ duration: 0.5, ease: EASE }}
        className="mt-12 rounded-3xl border border-warm bg-paper p-6 shadow-card md:mt-16 md:p-8"
      >
        <div className="flex items-center gap-3">
          <div>
            <h3 className="font-serif text-xl font-semibold text-ink">学习偏好</h3>
            <p className="mt-1 text-sm text-ink-muted">修改即时保存，并自动同步</p>
          </div>
          {/* 保存反馈对勾 */}
          <AnimatePresence>
            {savedVisible && (
              <motion.span
                initial={{ opacity: 0, y: 4 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.2 }}
                className="ml-auto inline-flex items-center gap-1 text-sm text-olive"
              >
                <Check size={14} strokeWidth={3} />
                已保存
              </motion.span>
            )}
          </AnimatePresence>
        </div>

        {/* 3.1 复习节奏 */}
        <div className="mt-6 flex flex-col gap-4 border-t border-warm pt-6 md:flex-row md:items-center md:justify-between">
          <div className="md:w-52 md:shrink-0">
            <p className="font-medium text-ink">复习节奏</p>
            <p className="mt-1 text-[13px] text-ink-muted">每次复习一组的词条数量</p>
          </div>
          <div className="min-w-0 flex-1 md:max-w-md">
            <div className="flex items-center gap-4">
              <WarmSlider
                value={prefs.reviewGroupSize}
                min={3}
                max={50}
                ariaLabel="每组单词数"
                onChange={(v) => applyPrefs({ reviewGroupSize: v })}
              />
              <Stepper
                value={prefs.reviewGroupSize}
                min={3}
                max={50}
                ariaLabel="每组单词数步进器"
                onChange={(v) => applyPrefs({ reviewGroupSize: v })}
              />
            </div>
            {/* 当前值预览（数值变化交叉淡入） */}
            <AnimatePresence mode="wait">
              <motion.p
                key={prefs.reviewGroupSize}
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.15 }}
                className="mt-2 text-xs text-ink-muted"
              >
                每组 {prefs.reviewGroupSize} 词 · 大约 {Math.max(1, Math.round(prefs.reviewGroupSize * 0.3))} 分钟一组
              </motion.p>
            </AnimatePresence>
          </div>
        </div>

        {/* 3.2 语音音色 */}
        <div className="mt-6 flex flex-col gap-4 border-t border-warm pt-6 md:flex-row md:items-start md:justify-between">
          <div className="md:w-52 md:shrink-0">
            <p className="font-medium text-ink">语音音色</p>
            <p className="mt-1 text-[13px] text-ink-muted">全局韩语朗读的声音</p>
          </div>
          <div className="grid min-w-0 flex-1 gap-3 sm:grid-cols-2 md:max-w-md">
            <VoiceCard
              emoji="🎀"
              title="清亮女声"
              desc="柔和清晰，适合跟读"
              selected={prefs.voiceGender === 'female'}
              previewing={previewing === 'female'}
              ttsOk={ttsOk}
              onSelect={() => applyPrefs({ voiceGender: 'female', voiceName: null })}
              onPreview={() => handlePreview('female')}
            />
            <VoiceCard
              emoji="🎩"
              title="清亮男声"
              desc="低沉稳重，适合精听"
              selected={prefs.voiceGender === 'male'}
              previewing={previewing === 'male'}
              ttsOk={ttsOk}
              onSelect={() => applyPrefs({ voiceGender: 'male', voiceName: null })}
              onPreview={() => handlePreview('male')}
            />
          </div>
        </div>

        {/* 3.3 每日目标 */}
        <div className="mt-6 flex flex-col gap-4 border-t border-warm pt-6 md:flex-row md:items-center md:justify-between">
          <div className="md:w-52 md:shrink-0">
            <p className="font-medium text-ink">每日目标</p>
            <p className="mt-1 text-[13px] text-ink-muted">每天想学习的句子数量，首页会显示进度</p>
          </div>
          <div className="flex min-w-0 flex-1 flex-wrap items-center gap-4 md:max-w-md">
            <Stepper value={prefs.dailyGoal} min={1} max={50} ariaLabel="每日目标步进器" onChange={(v) => applyPrefs({ dailyGoal: v })} />
            <AnimatePresence mode="wait">
              <motion.span
                key={prefs.dailyGoal}
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.15 }}
                className="rounded-full bg-sand px-3 py-1.5 text-xs text-ink-secondary"
              >
                每天 {prefs.dailyGoal} 句 · 一年 {prefs.dailyGoal * 365} 句
              </motion.span>
            </AnimatePresence>
          </div>
        </div>
      </motion.section>

      {/* ========== Section 4：数据管理 ========== */}
      <motion.section
        initial={{ opacity: 0, y: 24 }}
        whileInView={{ opacity: 1, y: 0 }}
        viewport={{ once: true, amount: 0.15 }}
        transition={{ duration: 0.5, ease: EASE }}
        className="mt-12 rounded-3xl border border-warm bg-paper p-6 shadow-card md:mt-16 md:p-8"
      >
        <h3 className="font-serif text-xl font-semibold text-ink">数据管理</h3>
        <p className="mt-1 text-sm text-ink-muted">所有数据默认只保存在本机浏览器</p>

        <div className="mt-6 flex flex-col gap-3 border-t border-warm pt-6 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-3">
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-terracotta-soft text-terracotta">
              <Package size={18} />
            </span>
            <div>
              <p className="font-medium text-ink">导出我的数据</p>
              <p className="mt-0.5 text-xs text-ink-muted">生词本 / 复习记录 / 统计 / 偏好 / 语料元信息</p>
            </div>
          </div>
          <button
            type="button"
            onClick={() => void handleExport()}
            className="shrink-0 rounded-full border border-terracotta px-5 py-2 text-sm font-medium text-terracotta transition-all duration-200 ease-quint hover:-translate-y-0.5 hover:shadow-lift"
          >
            导出 JSON
          </button>
        </div>

        <div className="mt-6 flex flex-col gap-3 border-t border-warm pt-6 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-3">
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-terracotta-deep/10 text-terracotta-deep">
              <Trash2 size={18} />
            </span>
            <div>
              <p className="font-medium text-ink">清除本地数据</p>
              <p className="mt-0.5 text-xs text-ink-muted">删除本机全部学习数据与语料文件，不可恢复</p>
            </div>
          </div>
          <button
            type="button"
            onClick={() => setConfirmOpen(true)}
            className="shrink-0 rounded-full border border-terracotta-deep px-5 py-2 text-sm font-medium text-terracotta-deep transition-all duration-200 ease-quint hover:-translate-y-0.5 hover:bg-terracotta-deep/10 hover:shadow-lift"
          >
            清除全部数据
          </button>
        </div>
      </motion.section>

      {/* ========== 二次确认 Modal ========== */}
      <AnimatePresence>
        {confirmOpen && (
          <div className="fixed inset-0 z-[70] flex items-end justify-center p-4 sm:items-center">
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.25 }}
              className="absolute inset-0 bg-[rgba(46,42,38,0.4)]"
              onClick={() => !clearing && setConfirmOpen(false)}
            />
            <motion.div
              initial={{ opacity: 0, y: 24 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 24 }}
              transition={{ duration: 0.25, ease: EASE }}
              role="alertdialog"
              aria-modal="true"
              aria-label="确认清除本地数据"
              className="relative w-full max-w-md rounded-3xl bg-paper p-6 shadow-lift"
            >
              <h4 className="font-serif text-lg font-semibold text-ink">确定要清除所有本地数据吗？</h4>
              <p className="mt-2 text-sm leading-relaxed text-ink-secondary">
                将删除生词本、学习记录、统计与语料文件，此操作不可恢复。建议先导出备份。
              </p>
              <div className="mt-6 flex justify-end gap-3">
                <button
                  type="button"
                  disabled={clearing}
                  onClick={() => setConfirmOpen(false)}
                  className="rounded-full border border-warm px-5 py-2 text-sm text-ink-secondary transition-colors hover:bg-sand disabled:opacity-50"
                >
                  取消
                </button>
                <button
                  type="button"
                  disabled={clearing}
                  onClick={() => void handleClear()}
                  className="rounded-full bg-terracotta-deep px-5 py-2 text-sm font-medium text-paper transition-opacity hover:opacity-90 disabled:opacity-50"
                >
                  {clearing ? '清除中…' : '确认清除'}
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}
