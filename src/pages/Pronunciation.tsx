/**
 * Pronunciation — 发音练习页（跟读练习）
 * 功能：三级难度句子库 / TTS 常速·慢速范读 / getUserMedia+MediaRecorder 录音回放 /
 *      范读→我 对比播放 / 已练缎带标记(localStorage) / 发音规则知识卡。
 * 录音 Blob 仅存内存（objectURL），刷新即清，不落盘。
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Check,
  Mic,
  MicOff,
  Play,
  Repeat2,
  Square,
  Trash2,
  Turtle,
  Volume2,
} from 'lucide-react';
import SpeakButton from '@/components/SpeakButton';
import StatChip from '@/components/StatChip';
import SectionHeading from '@/components/SectionHeading';
import { showToast } from '@/components/Toast';
import { speakKorean, isTtsSupported } from '@/lib/tts';
import { readStorage, writeStorage } from '@/lib/storage';
import { LEVEL_META, getSentencesByLevel } from '@/data/sentences';
import type { PracticeLevel, PracticeSentence } from '@/data/sentences';
import { cn } from '@/lib/utils';

/** localStorage 键：已练句子 id 列表 / 今日已练计数 */
const KEY_DONE = 'pron-done';
const KEY_DAILY = 'pron-daily';
/** localStorage 键：语料中心「加入发音练习 / 提取到学习库」写入的自定义材料 */
const KEY_CUSTOM = 'hjy:pron-custom';

/** 自定义发音材料条目（与语料中心共用 `hjy:pron-custom`） */
interface PronCustomItem {
  id: string;
  ko: string;
  rom: string;
  zh: string;
  tip?: string;
}

/** 今日日期串（用于每日计数重置） */
function todayStr(): string {
  return new Date().toISOString().slice(0, 10);
}

/** 读取今日已练句数（跨天自动归零） */
function readDailyCount(): number {
  const d = readStorage<{ date: string; count: number }>(KEY_DAILY, { date: todayStr(), count: 0 });
  return d.date === todayStr() ? d.count : 0;
}

/** 今日已练 +1 并持久化 */
function bumpDailyCount(): number {
  const next = { date: todayStr(), count: readDailyCount() + 1 };
  writeStorage(KEY_DAILY, next);
  return next.count;
}

/** 挑选当前环境可用的录音 MIME 类型（iOS Safari 用 audio/mp4） */
function pickMimeType(): string | undefined {
  if (typeof MediaRecorder === 'undefined' || !MediaRecorder.isTypeSupported) return undefined;
  const candidates = ['audio/mp4', 'audio/webm;codecs=opus', 'audio/webm', 'audio/ogg'];
  return candidates.find((t) => MediaRecorder.isTypeSupported(t));
}

/** 播放中的等距 3 条声波柱动画（CSS keyframes 0.8s） */
function SoundBars({ className = '' }: { className?: string }) {
  return (
    <span className={cn('inline-flex h-4 items-end gap-[3px]', className)} aria-hidden>
      {[0, 1, 2].map((i) => (
        <span
          key={i}
          className="pron-soundbar w-[3px] rounded-full bg-current"
          style={{ animationDelay: `${i * 0.15}s` }}
        />
      ))}
    </span>
  );
}

/** 麦克风权限状态 */
type MicState = 'idle' | 'granted' | 'denied' | 'unsupported';

interface PracticeCardProps {
  sentence: PracticeSentence;
  index: number;
  done: boolean;
  micState: MicState;
  onRequestMic: () => Promise<boolean>;
  onToggleDone: (id: string) => void;
  /** 自定义材料（「我的材料」）单条移除回调；内置句子不传 */
  onRemove?: (id: string) => void;
}

/** 练习卡片：每句一张，含范读/慢速/录音/回放/对比/标记已练 */
function PracticeCard({ sentence, index, done, micState, onRequestMic, onToggleDone, onRemove }: PracticeCardProps) {
  const [recording, setRecording] = useState(false);
  const [playing, setPlaying] = useState<'slow' | 'mine' | 'compare' | null>(null);
  const [audioUrl, setAudioUrl] = useState<string | null>(null);

  const recorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);

  // 组件卸载时释放音频对象 URL 与麦克风流
  useEffect(() => {
    return () => {
      if (audioRef.current) {
        audioRef.current.pause();
        audioRef.current = null;
      }
      if (audioUrl) URL.revokeObjectURL(audioUrl);
      streamRef.current?.getTracks().forEach((t) => t.stop());
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /** 慢速 0.6× 范读 */
  const playSlow = () => {
    const ok = speakKorean(sentence.ko, {
      rate: 0.6,
      onStart: () => setPlaying('slow'),
      onEnd: () => setPlaying(null),
    });
    if (!ok) showToast('当前浏览器不支持语音合成');
  };

  /** 开始 / 停止跟读录音 */
  const toggleRecord = async () => {
    if (recording) {
      // 停止录音，onstop 回调中生成回放 URL
      recorderRef.current?.stop();
      return;
    }
    const granted = await onRequestMic();
    if (!granted) return;
    try {
      // 重新申请一条流（保证 iOS 上每次状态新鲜）
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
        // 录音结束：生成 Blob 内存 URL，释放麦克风
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

  /** 对比播放：先放范读，间隔 0.5s 再放用户录音 */
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
    const ok = speakKorean(sentence.ko, { rate: 1, onEnd: playUser });
    if (!ok) {
      showToast('当前浏览器不支持语音合成');
      setPlaying(null);
    }
  };

  const micDisabled = micState === 'denied' || micState === 'unsupported';

  return (
    <motion.li
      variants={{
        hidden: { opacity: 0, y: 24 },
        show: { opacity: 1, y: 0, transition: { duration: 0.5, ease: [0.22, 1, 0.36, 1] } },
      }}
      className="relative overflow-hidden rounded-[20px] border border-warm bg-paper shadow-card"
    >
      {/* 已练缎带角标（橄榄绿，从右上 rotate 45° 滑入） */}
      <AnimatePresence>
        {done && (
          <motion.div
            initial={{ opacity: 0, x: 24, rotate: 45 }}
            animate={{ opacity: 1, x: 0, rotate: 0 }}
            exit={{ opacity: 0, x: 24 }}
            transition={{ type: 'spring', stiffness: 400, damping: 28 }}
            className="pointer-events-none absolute left-0 top-0 z-10"
          >
            <span className="inline-block rounded-br-xl bg-olive px-3 py-1 text-xs font-medium text-paper shadow-card">
              已练
            </span>
          </motion.div>
        )}
      </AnimatePresence>

      {/* 自定义材料单条移除（右上角） */}
      {onRemove && (
        <button
          type="button"
          onClick={() => onRemove(sentence.id)}
          aria-label="从我的材料中移除"
          title="从我的材料中移除"
          className="absolute right-3 top-3 z-10 rounded-full p-1.5 text-ink-muted transition-colors hover:bg-sand hover:text-terracotta-deep"
        >
          <Trash2 size={15} />
        </button>
      )}

      {/* 句子区 */}
      <div className="flex gap-4 px-5 pb-4 pt-5 md:px-6">
        {/* 序号圆点（蜂蜜金描边） */}
        <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full border-2 border-honey font-serif text-sm font-bold text-honey">
          {index + 1}
        </span>
        <div className="min-w-0 flex-1">
          {/* 自定义材料来源标签（蜂蜜金描边胶囊） */}
          {onRemove && (
            <span className="mb-1.5 inline-block rounded-full border border-honey/50 px-2 py-0.5 text-[10px] font-medium text-honey">
              语料
            </span>
          )}
          <p className="font-kr text-xl leading-relaxed text-ink md:text-2xl">{sentence.ko}</p>
          {sentence.rom && <p className="mt-1 text-[13px] text-ink-muted">{sentence.rom}</p>}
          {sentence.zh && <p className="mt-1.5 text-base text-ink-secondary">{sentence.zh}</p>}
          {sentence.tip && (
            <p className="mt-2 rounded-lg bg-sand px-3 py-1.5 text-xs leading-relaxed text-ink-secondary">
              {sentence.tip}
            </p>
          )}
        </div>
      </div>

      {/* 控制区：移动端换行两行 */}
      <div className="flex flex-wrap items-center gap-x-3 gap-y-3 border-t border-warm bg-base/60 px-5 py-4 md:px-6">
        {/* 常速范读 */}
        <div className="flex items-center gap-1.5">
          <SpeakButton text={sentence.ko} rate={1} size="md" onUnsupported={() => showToast('当前浏览器不支持语音合成')} />
          <span className="hidden text-xs text-ink-muted sm:inline">范读</span>
        </div>

        {/* 慢速 0.6× */}
        <button
          type="button"
          onClick={playSlow}
          disabled={!isTtsSupported()}
          className="flex h-11 items-center gap-1.5 rounded-full border border-warm bg-paper px-4 text-sm text-ink-secondary transition-colors hover:border-terracotta hover:text-terracotta disabled:opacity-40"
        >
          {playing === 'slow' ? <SoundBars /> : <Turtle size={16} />}
          慢速 0.6×
        </button>

        {/* 跟读录音：56px 大圆钮，录音中陶红脉冲 + 外圈波纹 */}
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

        {/* 回放我的录音 */}
        <button
          type="button"
          onClick={playMine}
          disabled={!audioUrl}
          className="flex h-11 items-center gap-1.5 rounded-full border border-warm bg-paper px-4 text-sm text-ink-secondary transition-colors enabled:hover:border-terracotta enabled:hover:text-terracotta disabled:opacity-40"
        >
          {playing === 'mine' ? <SoundBars /> : <Play size={15} />}
          回放
        </button>

        {/* 对比播放：范读→我 */}
        <button
          type="button"
          onClick={playCompare}
          disabled={!audioUrl}
          className="flex h-11 items-center gap-1.5 rounded-full border border-warm bg-paper px-4 text-sm text-ink-secondary transition-colors enabled:hover:border-terracotta enabled:hover:text-terracotta disabled:opacity-40"
        >
          {playing === 'compare' ? <SoundBars /> : <Repeat2 size={15} />}
          范读→我
        </button>

        {/* 标记已练（橄榄绿描边 toggle） */}
        <button
          type="button"
          onClick={() => onToggleDone(sentence.id)}
          aria-pressed={done}
          className={cn(
            'ml-auto flex h-11 items-center gap-1.5 rounded-full border px-4 text-sm transition-colors',
            done
              ? 'border-olive bg-olive text-paper'
              : 'border-olive text-olive hover:bg-olive/10',
          )}
        >
          <Check size={15} />
          {done ? '已练' : '标记已练'}
        </button>
      </div>
    </motion.li>
  );
}

/** 4 条发音规则知识卡 */
const PRON_RULES = [
  {
    name: '连音化',
    example: '사랑해요',
    actual: '사랑해요',
    desc: '收音遇到元音时会「搬家」：밥을 读作 [바블]，韩文이 读作 [하누기]。',
  },
  {
    name: '紧音化',
    example: '학교',
    actual: '학꾜',
    desc: '收音 ㄱ/ㄷ/ㅂ 后面的松音变紧音：학교→[학꾜]，먹고→[먹꼬]。',
  },
  {
    name: '同化',
    example: '입니다',
    actual: '임니다',
    desc: '收音 ㅂ/ㄱ 遇到 ㄴ/ㅁ 会鼻音化：입니다→[임니다]，한국말→[한궁말]。',
  },
  {
    name: 'ㅎ 弱化',
    example: '좋아요',
    actual: '조아요',
    desc: 'ㅎ 夹在元音之间常常消失：좋아요→[조아요]，전화→[저놔/저화]。',
  },
] as const;

export default function Pronunciation() {
  const [level, setLevel] = useState<PracticeLevel>('beginner');
  const [doneIds, setDoneIds] = useState<string[]>(() => readStorage<string[]>(KEY_DONE, []));
  const [dailyCount, setDailyCount] = useState<number>(() => readDailyCount());
  /** 语料中心同步过来的自定义练习材料 */
  const [customItems, setCustomItems] = useState<PronCustomItem[]>(() =>
    readStorage<PronCustomItem[]>(KEY_CUSTOM, []),
  );
  const [micState, setMicState] = useState<MicState>(() =>
    typeof navigator !== 'undefined' && 'mediaDevices' in navigator && 'getUserMedia' in navigator.mediaDevices
      ? 'idle'
      : 'unsupported',
  );
  const micGrantedRef = useRef(false);

  const sentences = useMemo(() => getSentencesByLevel(level), [level]);

  /**
   * 申请麦克风权限（预热）。
   * @returns 是否可用；拒绝或不支持时 Toast 提示并降级。
   */
  const requestMic = useCallback(async (): Promise<boolean> => {
    if (micGrantedRef.current) return true;
    if (
      typeof navigator === 'undefined' ||
      !('mediaDevices' in navigator) ||
      !('getUserMedia' in navigator.mediaDevices)
    ) {
      setMicState('unsupported');
      showToast('当前浏览器不支持录音功能');
      return false;
    }
    if (typeof MediaRecorder === 'undefined') {
      setMicState('unsupported');
      showToast('当前浏览器不支持 MediaRecorder，无法录音');
      return false;
    }
    try {
      // 试探性申请一次权限，拿到后立即释放
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

  /** 移除一条自定义材料并持久化 */
  const removeCustom = useCallback((id: string) => {
    setCustomItems((prev) => {
      const next = prev.filter((s) => s.id !== id);
      writeStorage(KEY_CUSTOM, next);
      return next;
    });
    showToast('已从我的材料中移除');
  }, []);

  /** 切换已练标记并持久化到 localStorage（取消已练不计数） */
  const toggleDone = useCallback((id: string) => {
    setDoneIds((prev) => {
      const has = prev.includes(id);
      const next = has ? prev.filter((x) => x !== id) : [...prev, id];
      writeStorage(KEY_DONE, next);
      if (!has) setDailyCount(bumpDailyCount());
      return next;
    });
  }, []);

  return (
    <div className="mx-auto max-w-content px-4 pb-24 pt-10 md:px-6 md:pt-14">
      {/* 页面内联样式：声波柱 keyframes + 横向滚动条 */}
      <style>{`
        @keyframes pron-soundbar {
          0%, 100% { height: 5px; }
          50% { height: 16px; }
        }
        .pron-soundbar { animation: pron-soundbar 0.8s ease-in-out infinite; }
        .pron-rule-scroll { scrollbar-width: thin; scrollbar-color: #A79C90 transparent; }
        .pron-rule-scroll::-webkit-scrollbar { height: 4px; }
        .pron-rule-scroll::-webkit-scrollbar-thumb { background: #A79C90; border-radius: 999px; }
        .pron-rule-scroll::-webkit-scrollbar-track { background: transparent; }
      `}</style>

      {/* Section 1 — 页头 */}
      <section className="flex flex-wrap items-end justify-between gap-6">
        <div>
          <motion.p
            initial={{ opacity: 0, y: 24 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
            className="font-kr text-sm tracking-wider text-honey"
          >
            발음 연습
          </motion.p>
          <motion.h1
            initial={{ opacity: 0, y: 24 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, delay: 0.08, ease: [0.22, 1, 0.36, 1] }}
            className="mt-2 font-serif text-3xl font-bold text-ink"
          >
            发音练习
          </motion.h1>
          <motion.p
            initial={{ opacity: 0, y: 24 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, delay: 0.16, ease: [0.22, 1, 0.36, 1] }}
            className="mt-3 max-w-xl text-base text-ink-secondary"
          >
            先听范读，再按下录音跟读，回放对比找差距。录音只存在本机，用完即焚。
          </motion.p>
        </div>
        <motion.div
          initial={{ opacity: 0, y: 24 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, delay: 0.24, ease: [0.22, 1, 0.36, 1] }}
        >
          <StatChip icon={<Volume2 size={20} />} label="今日已练" value={String(dailyCount)} unit="句" tone="terracotta" />
        </motion.div>
      </section>

      {/* Section 2 — 难度分级 Tab */}
      <section className="mt-12">
        <div className="inline-flex rounded-full border border-warm bg-paper p-1 shadow-card" role="tablist" aria-label="难度分级">
          {LEVEL_META.map((meta) => {
            const active = level === meta.key;
            return (
              <button
                key={meta.key}
                role="tab"
                aria-selected={active}
                onClick={() => setLevel(meta.key)}
                className={cn(
                  'relative rounded-full px-4 py-2 text-sm transition-colors md:px-6',
                  active ? 'text-paper' : 'text-ink-secondary hover:text-ink',
                )}
              >
                {active && (
                  <motion.span
                    layoutId="pron-tab-slider"
                    className="absolute inset-0 rounded-full bg-terracotta"
                    transition={{ type: 'spring', stiffness: 500, damping: 40 }}
                  />
                )}
                <span className="relative z-10 font-medium">{meta.label}</span>
                <span className={cn('relative z-10 ml-1.5 hidden text-xs sm:inline', active ? 'text-paper/80' : 'text-ink-muted')}>
                  {meta.desc}
                </span>
              </button>
            );
          })}
        </div>

        {/* Section 3 — 练习卡片列表（切换时 stagger 上入） */}
        <motion.ul
          key={level}
          initial="hidden"
          animate="show"
          variants={{ show: { transition: { staggerChildren: 0.05 } } }}
          className="mt-8 flex flex-col gap-6"
        >
          {sentences.map((s, i) => (
            <PracticeCard
              key={s.id}
              sentence={s}
              index={i}
              done={doneIds.includes(s.id)}
              micState={micState}
              onRequestMic={requestMic}
              onToggleDone={toggleDone}
            />
          ))}
        </motion.ul>

        {/* 麦克风降级提示条 */}
        {(micState === 'denied' || micState === 'unsupported') && (
          <motion.div
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            className="mt-6 flex items-start gap-3 rounded-2xl border border-honey/40 bg-honey/10 px-5 py-4 text-sm text-ink-secondary"
          >
            <MicOff size={18} className="mt-0.5 shrink-0 text-honey" />
            <p>
              {micState === 'denied'
                ? '麦克风权限被拒绝了。可以在浏览器地址栏的站点设置里重新允许麦克风，刷新后再试试；范读、慢速和规则卡不受影响。'
                : '当前浏览器不支持录音（iOS 请使用 Safari 并升级到较新版本）。范读、慢速和规则卡仍可正常使用。'}
            </p>
          </motion.div>
        )}
      </section>

      {/* Section 3.5 — 我的材料（语料中心「加入发音练习 / 提取到学习库」的句子；为空不显示） */}
      {customItems.length > 0 && (
        <section className="mt-16">
          <SectionHeading title="我的材料" sub="나의 자료" />
          <p className="mt-3 text-sm text-ink-secondary">
            来自语料中心的自定义句子，共 {customItems.length} 句。练熟了可以点右上角移除。
          </p>
          <motion.ul
            initial="hidden"
            animate="show"
            variants={{ show: { transition: { staggerChildren: 0.05 } } }}
            className="mt-6 flex flex-col gap-6"
          >
            {customItems.map((s, i) => (
              <PracticeCard
                key={s.id}
                sentence={{ id: s.id, level: 'beginner', ko: s.ko, rom: s.rom, zh: s.zh, tip: s.tip }}
                index={i}
                done={doneIds.includes(s.id)}
                micState={micState}
                onRequestMic={requestMic}
                onToggleDone={toggleDone}
                onRemove={removeCustom}
              />
            ))}
          </motion.ul>
        </section>
      )}

      {/* Section 4 — 发音规则小贴士（横向滚动） */}
      <section className="mt-24">
        <SectionHeading title="韩国人不会告诉你的 4 条发音规则" sub="발음 규칙" />
        <motion.div
          initial="hidden"
          whileInView="show"
          viewport={{ once: true, amount: 0.2 }}
          variants={{ show: { transition: { staggerChildren: 0.1 } } }}
          className="pron-rule-scroll mt-10 flex snap-x snap-mandatory gap-5 overflow-x-auto pb-4 lg:grid lg:grid-cols-4 lg:overflow-visible"
        >
          {PRON_RULES.map((rule) => (
            <motion.article
              key={rule.name}
              variants={{
                hidden: { opacity: 0, y: 24 },
                show: { opacity: 1, y: 0, transition: { duration: 0.5, ease: [0.22, 1, 0.36, 1] } },
              }}
              className="w-64 shrink-0 snap-start rounded-2xl border border-warm bg-paper p-5 shadow-card lg:w-auto"
            >
              <h3 className="text-lg font-bold text-ink">{rule.name}</h3>
              <p className="mt-3 font-kr text-xl text-ink">
                {rule.example} <span className="text-ink-muted">→</span>{' '}
                <span className="text-terracotta">[{rule.actual}]</span>
              </p>
              <p className="mt-2 text-sm leading-relaxed text-ink-secondary">{rule.desc}</p>
              <div className="mt-4">
                <SpeakButton
                  text={rule.example}
                  rate={0.8}
                  size="sm"
                  onUnsupported={() => showToast('当前浏览器不支持语音合成')}
                />
              </div>
            </motion.article>
          ))}
        </motion.div>
      </section>

      {/* Section 5 — 底部引导 */}
      <section className="mt-24">
        <motion.div
          initial={{ opacity: 0, y: 24 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, amount: 0.3 }}
          transition={{ duration: 0.6, ease: [0.22, 1, 0.36, 1] }}
          className="flex flex-col items-center gap-5 rounded-3xl bg-sand px-6 py-10 text-center md:flex-row md:justify-between md:text-left"
        >
          <p className="font-serif text-xl font-bold text-ink md:text-2xl">
            想用真实韩剧台词、播客练发音？
            <span className="mt-1 block text-base font-normal text-ink-secondary">
              去语料中心上传你的材料，逐句精听跟读。
            </span>
          </p>
          <Link
            to="/corpus"
            className="shrink-0 rounded-full bg-terracotta px-7 py-3 text-sm font-medium text-paper shadow-card transition-colors hover:bg-terracotta-deep"
          >
            前往语料中心 →
          </Link>
        </motion.div>
      </section>
    </div>
  );
}
