/**
 * SentenceWorkbench.tsx — 逐句学习工作台（音频 + 转写文稿）
 * 参考句读类工具设计：句子卡片流 + 每句播放/时间标定 + 语速/重复/停顿/自动连续
 * + 点词翻译气泡（朗读/拼读/加入生词本含例句/在线词典）+ 备份导出导入。
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import {
  Play, Pause, Volume2, SpellCheck, BookPlus, Check, BookOpen,
  Download, Upload, Languages, Highlighter, Loader2, AudioLines,
} from 'lucide-react';
import type { CorpusMeta, WorkbenchSentence } from '@/lib/corpus';
import { getTranscript, saveTranscript, formatTime } from '@/lib/corpus';
import type { AsrProgress } from '@/lib/asr';
import { segmentChunks } from '@/lib/segment';
import { lookupWord, normalizeQuery, containsHangul } from '@/lib/dictionary';
import { speakKorean, canSpeak } from '@/lib/tts';
import { spellSpeechText, decomposeWord } from '@/lib/spell';
import { addToVocabBook, readVocabBook } from '@/lib/vocab';
import { showToast } from '@/components/Toast';
import WordLookupModal from '@/components/WordLookupModal';
import { cn } from '@/lib/utils';

/* ─────────────────────────── 类型 ─────────────────────────── */

interface Props {
  meta: CorpusMeta;
  /** 音频 Object URL */
  url: string;
}

/** 点词气泡状态 */
interface TokenBubble {
  /** 句子 id */
  sid: number;
  /** 词原文 */
  token: string;
  /** 视口定位 */
  x: number;
  y: number;
}

/** ASR 识别状态 */
type AsrState =
  | { phase: 'idle' }
  | { phase: 'running'; label: string; percent: number }
  | { phase: 'error'; message: string };

/* ─────────────────────────── 主组件 ─────────────────────────── */

export default function SentenceWorkbench({ meta, url }: Props) {
  const audioRef = useRef<HTMLAudioElement>(null);
  const [sentences, setSentences] = useState<WorkbenchSentence[] | null>(null);
  const [asr, setAsr] = useState<AsrState>({ phase: 'idle' });

  // 播放控制
  const [currentId, setCurrentId] = useState<number | null>(null); // 正在播放的句子
  const [playing, setPlaying] = useState(false);
  const [rate, setRate] = useState(1);
  const [repeat, setRepeat] = useState(1);        // 每句重复次数（0=无限）
  const [pauseSec, setPauseSec] = useState(1);    // 句间停顿秒
  const [autoChain, setAutoChain] = useState(true); // 自动连续播放
  const [showZh, setShowZh] = useState(true);
  const [highlight, setHighlight] = useState(true);

  // 点词气泡 / 查词面板
  const [bubble, setBubble] = useState<TokenBubble | null>(null);
  const [lookup, setLookup] = useState<{ word: string; exampleKo?: string } | null>(null);

  // 播放编排 ref（避免闭包过期）
  const playCtl = useRef({ sid: 0, round: 0, timer: 0 as unknown as ReturnType<typeof setTimeout> });
  const importRef = useRef<HTMLInputElement>(null);

  /* ── 载入已存文稿 ── */
  useEffect(() => {
    let alive = true;
    void getTranscript(meta.id).then((t) => {
      if (alive && t) setSentences(t.sentences);
    });
    return () => { alive = false; };
  }, [meta.id]);

  /* ── 持久化（防抖） ── */
  const persistTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const persist = useCallback((list: WorkbenchSentence[]) => {
    if (persistTimer.current) clearTimeout(persistTimer.current);
    persistTimer.current = setTimeout(() => {
      void saveTranscript({ corpusId: meta.id, sentences: list, updatedAt: Date.now() });
    }, 600);
  }, [meta.id]);

  const updateSentences = useCallback((updater: (prev: WorkbenchSentence[]) => WorkbenchSentence[]) => {
    setSentences((prev) => {
      if (!prev) return prev;
      const next = updater(prev);
      persist(next);
      return next;
    });
  }, [persist]);

  /* ── ASR 识别 ── */
  const runAsr = useCallback(async () => {
    try {
      setAsr({ phase: 'running', label: '加载音频…', percent: 0 });
      const blob = await (await fetch(url)).blob();
      // 动态加载 ASR 模块（transformers.js 体积大，仅在首次识别时加载）
      const { transcribeKorean } = await import('@/lib/asr');
      const chunks = await transcribeKorean(blob, (p: AsrProgress) => {
        if (p.stage === 'download') setAsr({ phase: 'running', label: `首次使用需下载识别模型（约 80MB）`, percent: p.percent });
        else if (p.stage === 'decode') setAsr({ phase: 'running', label: '解码音频…', percent: 0 });
        else setAsr({ phase: 'running', label: '识别中（保持页面打开）', percent: p.percent });
      });
      if (!chunks.length) {
        setAsr({ phase: 'error', message: '未识别到语音内容' });
        return;
      }
      const segs = segmentChunks(chunks);
      const list: WorkbenchSentence[] = segs.map((s) => ({ ...s }));
      setSentences(list);
      persist(list);
      setAsr({ phase: 'idle' });
      showToast(`识别完成，共 ${list.length} 句`);
    } catch (e) {
      setAsr({ phase: 'error', message: e instanceof Error ? e.message : '识别失败' });
    }
  }, [url, persist]);

  /* ── 播放编排 ── */
  const stopChain = useCallback(() => {
    clearTimeout(playCtl.current.timer);
    playCtl.current.round = 0;
    const el = audioRef.current;
    if (el) el.pause();
    setPlaying(false);
    setCurrentId(null);
  }, []);

  const playSentence = useCallback((sid: number, chain: boolean) => {
    const el = audioRef.current;
    if (!el || !sentences) return;
    const s = sentences.find((x) => x.id === sid);
    if (!s) return;
    clearTimeout(playCtl.current.timer);
    playCtl.current.sid = sid;
    playCtl.current.round = 1;
    el.currentTime = s.start;
    el.playbackRate = rate;
    void el.play().catch(() => showToast('播放失败'));
    setCurrentId(sid);
    setPlaying(true);
    // 自动连续：本轮播完后由 timeupdate/ended 逻辑接管（见 onTimeUpdate）
    if (!chain) playCtl.current.round = repeat === 0 ? -1 : repeat; // 单曲循环模式
  }, [sentences, rate, repeat]);

  // timeupdate：到达句末 → 停顿 → 重复或跳下一句
  const onTimeUpdate = useCallback(() => {
    const el = audioRef.current;
    if (!el || !sentences || currentId === null) return;
    const s = sentences.find((x) => x.id === currentId);
    if (!s) return;
    if (el.currentTime >= s.end - 0.03) {
      el.pause();
      const ctl = playCtl.current;
      const roundsTotal = repeat === 0 ? Infinity : repeat;
      if (ctl.round < roundsTotal) {
        // 同句重复
        ctl.round += 1;
        ctl.timer = setTimeout(() => {
          el.currentTime = s.start;
          void el.play().catch(() => {});
        }, pauseSec * 1000);
      } else if (autoChain) {
        // 下一句
        const next = sentences[sentences.findIndex((x) => x.id === s.id) + 1];
        if (next) {
          ctl.timer = setTimeout(() => playSentence(next.id, true), pauseSec * 1000);
        } else {
          stopChain();
        }
      } else {
        setPlaying(false);
        setCurrentId(null);
      }
    }
  }, [sentences, currentId, repeat, pauseSec, autoChain, playSentence, stopChain]);

  // 卸载/切换语料时停止
  useEffect(() => () => stopChain(), [stopChain]);

  /* ── 时间标定 ── */
  const nudgeStart = useCallback((sid: number, delta: number | 'here') => {
    const el = audioRef.current;
    updateSentences((prev) => prev.map((s) => {
      if (s.id !== sid) return s;
      const start = delta === 'here' ? (el?.currentTime ?? s.start) : Math.max(0, +(s.start + delta).toFixed(1));
      // 顺带收紧上一句结尾，避免重叠
      return { ...s, start, marked: true };
    }));
    // 上一句 end 不超过本句 start
    updateSentences((prev) => {
      const idx = prev.findIndex((x) => x.id === sid);
      if (idx <= 0) return prev;
      const cur = prev[idx];
      return prev.map((s, i) => (i === idx - 1 && s.end > cur.start ? { ...s, end: cur.start } : s));
    });
  }, [updateSentences]);

  /* ── 点词气泡 ── */
  const onTokenClick = useCallback((sid: number, token: string, e: React.MouseEvent) => {
    e.stopPropagation();
    const clean = token.trim();
    if (!clean) return;
    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
    setBubble({ sid, token: clean, x: rect.left + rect.width / 2, y: rect.top });
  }, []);

  // 全局点击关闭气泡
  useEffect(() => {
    if (!bubble) return;
    const close = () => setBubble(null);
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') close(); };
    window.addEventListener('mousedown', close);
    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('mousedown', close);
      window.removeEventListener('keydown', onKey);
    };
  }, [bubble]);

  /* ── 备份导出 / 导入 ── */
  const exportBackup = useCallback(() => {
    if (!sentences) return;
    const payload = { app: '韩之语', type: 'transcript', name: meta.name, exportedAt: new Date().toISOString(), sentences };
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `${meta.name.replace(/\.[^.]+$/, '')}-文稿备份.json`;
    a.click();
    URL.revokeObjectURL(a.href);
  }, [sentences, meta.name]);

  const importBackup = useCallback((file: File) => {
    void file.text().then((raw) => {
      try {
        const data = JSON.parse(raw) as { sentences?: WorkbenchSentence[] };
        if (!Array.isArray(data.sentences) || !data.sentences.length) throw new Error('bad');
        const list = data.sentences
          .filter((s) => typeof s.text === 'string' && typeof s.start === 'number')
          .map((s, i) => ({ id: i + 1, text: s.text, start: s.start, end: typeof s.end === 'number' ? s.end : s.start + 2, zh: s.zh, marked: s.marked }));
        setSentences(list);
        persist(list);
        showToast(`已导入 ${list.length} 句`);
      } catch {
        showToast('备份文件格式不正确');
      }
    });
  }, [persist]);

  /* ── 标定进度 ── */
  const markedCount = useMemo(() => sentences?.filter((s) => s.marked).length ?? 0, [sentences]);

  /* ══════════ 渲染 ══════════ */

  // 尚无文稿：识别引导
  if (sentences === null) {
    return (
      <div className="rounded-3xl border border-warm bg-paper p-8 text-center">
        <AudioLines size={36} className="mx-auto text-terracotta" />
        <h3 className="mt-3 font-serif text-lg font-bold text-ink">逐句学习</h3>
        <p className="mx-auto mt-1 max-w-sm text-sm text-ink-secondary">
          将音频识别为文稿并智能分段，即可逐句精听、点词翻译、拼读与收藏生词。识别在本地浏览器完成，不上传服务器。
        </p>

        {asr.phase === 'running' && (
          <div className="mx-auto mt-5 max-w-xs">
            <div className="mb-1 flex items-center justify-between text-xs text-ink-muted">
              <span>{asr.label}</span>
              {asr.percent > 0 && <span>{asr.percent}%</span>}
            </div>
            <div className="h-2 overflow-hidden rounded-full bg-sand">
              <div className="h-full rounded-full bg-terracotta transition-all" style={{ width: `${Math.max(asr.percent, 4)}%` }} />
            </div>
          </div>
        )}
        {asr.phase === 'error' && <p className="mt-4 text-sm text-red-700">{asr.message}</p>}

        <div className="mt-5 flex flex-wrap items-center justify-center gap-2">
          <button
            onClick={() => void runAsr()}
            disabled={asr.phase === 'running'}
            className="flex items-center gap-1.5 rounded-full bg-terracotta px-5 py-2.5 text-sm font-medium text-white transition-colors hover:bg-terracotta-deep disabled:opacity-50"
          >
            {asr.phase === 'running' ? <Loader2 size={15} className="animate-spin" /> : <AudioLines size={15} />}
            {asr.phase === 'running' ? '识别中…' : '开始识别文稿'}
          </button>
          <button
            onClick={() => importRef.current?.click()}
            className="flex items-center gap-1.5 rounded-full border border-warm bg-paper px-4 py-2.5 text-sm text-ink-secondary transition-colors hover:border-terracotta hover:text-terracotta"
          >
            <Upload size={15} /> 导入备份
          </button>
          <input ref={importRef} type="file" accept="application/json" className="hidden"
            onChange={(e) => { const f = e.target.files?.[0]; if (f) importBackup(f); e.target.value = ''; }} />
        </div>
      </div>
    );
  }

  const currentIdx = sentences.findIndex((s) => s.id === currentId);

  return (
    <div className="space-y-4">
      {/* 隐藏 audio 元素（整页共用） */}
      <audio ref={audioRef} src={url} onTimeUpdate={onTimeUpdate} onEnded={() => { /* 句末由 timeupdate 处理 */ }} preload="auto" />

      {/* ── 顶部控制条 ── */}
      <div className="rounded-2xl border border-warm bg-paper p-4">
        <div className="flex flex-wrap items-center gap-x-5 gap-y-3">
          {/* 标定进度 */}
          <div className="flex items-center gap-2 text-xs text-ink-muted">
            <span>标定 {markedCount}/{sentences.length}</span>
            <div className="h-1.5 w-20 overflow-hidden rounded-full bg-sand">
              <div className="h-full rounded-full bg-olive transition-all" style={{ width: `${(markedCount / sentences.length) * 100}%` }} />
            </div>
          </div>

          {/* 语速 */}
          <label className="flex items-center gap-2 text-xs text-ink-secondary">
            语速
            <input
              type="range" min={0.5} max={1.5} step={0.05} value={rate}
              onChange={(e) => { const v = Number(e.target.value); setRate(v); if (audioRef.current) audioRef.current.playbackRate = v; }}
              className="h-1.5 w-24 accent-terracotta"
            />
            <span className="w-9 tabular-nums text-ink">{rate.toFixed(2)}×</span>
          </label>

          {/* 重复 */}
          <div className="flex items-center gap-1 text-xs">
            <span className="text-ink-secondary">重复</span>
            {[1, 2, 3, 0].map((n) => (
              <button key={n} onClick={() => setRepeat(n)}
                className={cn('rounded-full px-2 py-1 transition-colors', repeat === n ? 'bg-terracotta text-white' : 'bg-sand text-ink-secondary hover:text-terracotta')}>
                {n === 0 ? '∞' : `${n}遍`}
              </button>
            ))}
          </div>

          {/* 停顿 */}
          <div className="flex items-center gap-1 text-xs">
            <span className="text-ink-secondary">停顿</span>
            {[0, 1, 2, 3].map((n) => (
              <button key={n} onClick={() => setPauseSec(n)}
                className={cn('rounded-full px-2 py-1 transition-colors', pauseSec === n ? 'bg-terracotta text-white' : 'bg-sand text-ink-secondary hover:text-terracotta')}>
                {n}s
              </button>
            ))}
          </div>

          {/* 自动连续 */}
          <button
            onClick={() => setAutoChain((v) => !v)}
            className={cn('rounded-full px-3 py-1 text-xs transition-colors', autoChain ? 'bg-olive text-white' : 'bg-sand text-ink-secondary')}
          >
            自动连续 {autoChain ? '开' : '关'}
          </button>

          <div className="ml-auto flex items-center gap-1.5">
            {/* 显示中文 */}
            <button onClick={() => setShowZh((v) => !v)} title="显示中文"
              className={cn('rounded-full border p-2 transition-colors', showZh ? 'border-olive bg-olive/10 text-olive' : 'border-warm text-ink-muted')}>
              <Languages size={14} />
            </button>
            {/* 高亮词汇 */}
            <button onClick={() => setHighlight((v) => !v)} title="高亮可查询词汇"
              className={cn('rounded-full border p-2 transition-colors', highlight ? 'border-honey bg-honey/10 text-honey' : 'border-warm text-ink-muted')}>
              <Highlighter size={14} />
            </button>
            {/* 导出备份 */}
            <button onClick={exportBackup} title="导出备份"
              className="rounded-full border border-warm p-2 text-ink-secondary transition-colors hover:border-terracotta hover:text-terracotta">
              <Download size={14} />
            </button>
            {/* 导入备份 */}
            <button onClick={() => importRef.current?.click()} title="导入备份"
              className="rounded-full border border-warm p-2 text-ink-secondary transition-colors hover:border-terracotta hover:text-terracotta">
              <Upload size={14} />
            </button>
            <input ref={importRef} type="file" accept="application/json" className="hidden"
              onChange={(e) => { const f = e.target.files?.[0]; if (f) importBackup(f); e.target.value = ''; }} />
          </div>
        </div>
      </div>

      {/* ── 全局播放条 ── */}
      <div className="flex items-center gap-3 rounded-2xl border border-warm bg-paper p-3">
        <button
          onClick={() => {
            if (playing) stopChain();
            else playSentence(currentIdx >= 0 ? sentences[currentIdx].id : sentences[0].id, true);
          }}
          className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-terracotta text-white transition-colors hover:bg-terracotta-deep"
        >
          {playing ? <Pause size={18} /> : <Play size={18} className="ml-0.5" />}
        </button>
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-medium text-ink">
            {currentIdx >= 0 ? `第 ${currentIdx + 1} 句 / 共 ${sentences.length} 句` : `共 ${sentences.length} 句，点击卡片或播放键开始`}
          </p>
          <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-sand">
            <div className="h-full rounded-full bg-terracotta transition-all" style={{ width: `${((currentIdx + (playing ? 1 : 0)) / sentences.length) * 100}%` }} />
          </div>
        </div>
        <button
          onClick={() => void runAsr()}
          disabled={asr.phase === 'running'}
          className="shrink-0 rounded-full border border-warm px-3 py-1.5 text-xs text-ink-secondary transition-colors hover:border-terracotta hover:text-terracotta disabled:opacity-50"
        >
          {asr.phase === 'running' ? '识别中…' : '重新识别'}
        </button>
      </div>

      {/* ── 句子卡片流 ── */}
      <div className="space-y-2.5">
        {sentences.map((s) => (
          <SentenceCard
            key={s.id}
            s={s}
            active={s.id === currentId}
            showZh={showZh}
            highlight={highlight}
            onPlay={() => (s.id === currentId && playing ? stopChain() : playSentence(s.id, autoChain))}
            onNudge={(d) => nudgeStart(s.id, d)}
            onTokenClick={(token, e) => onTokenClick(s.id, token, e)}
            onZhChange={(zh) => updateSentences((prev) => prev.map((x) => (x.id === s.id ? { ...x, zh } : x)))}
          />
        ))}
      </div>

      {/* ── 点词气泡 ── */}
      <AnimatePresence>
        {bubble && (
          <WordBubble
            bubble={bubble}
            sentence={sentences.find((x) => x.id === bubble.sid)?.text ?? ''}
            onLookup={(word, exampleKo) => { setBubble(null); setLookup({ word, exampleKo }); }}
          />
        )}
      </AnimatePresence>

      {/* ── 查词面板 ── */}
      <AnimatePresence>
        {lookup && <WordLookupModal initialWord={lookup.word} exampleKo={lookup.exampleKo} onClose={() => setLookup(null)} />}
      </AnimatePresence>
    </div>
  );
}

/* ─────────────────────────── 句子卡片 ─────────────────────────── */

function SentenceCard({ s, active, showZh, highlight, onPlay, onNudge, onTokenClick, onZhChange }: {
  s: WorkbenchSentence;
  active: boolean;
  showZh: boolean;
  highlight: boolean;
  onPlay: () => void;
  onNudge: (d: number | 'here') => void;
  onTokenClick: (token: string, e: React.MouseEvent) => void;
  onZhChange: (zh: string) => void;
}) {
  // 分词：按空白切，保留可点击词元
  const tokens = s.text.split(/(\s+)/);
  return (
    <motion.div
      layout="position"
      className={cn(
        'flex gap-3 rounded-2xl border p-3.5 transition-colors duration-200',
        active ? 'border-terracotta bg-terracotta-soft/40 shadow-lift' : 'border-warm bg-paper',
      )}
    >
      {/* 左侧：序号 + 播放 */}
      <div className="flex shrink-0 flex-col items-center gap-1.5">
        <span className={cn('text-[11px] tabular-nums', active ? 'text-terracotta font-bold' : 'text-ink-muted')}>
          {String(s.id).padStart(2, '0')}
        </span>
        <button
          onClick={onPlay}
          aria-label={active ? '停止' : '播放本句'}
          className={cn(
            'flex h-9 w-9 items-center justify-center rounded-full transition-colors',
            active ? 'bg-terracotta text-white' : 'bg-sand text-ink-secondary hover:bg-terracotta hover:text-white',
          )}
        >
          {active ? <Pause size={14} /> : <Play size={14} className="ml-0.5" />}
        </button>
      </div>

      {/* 右侧：文本 + 中文 + 时间标定 */}
      <div className="min-w-0 flex-1">
        <p className="font-serif text-[15px] leading-relaxed text-ink">
          {tokens.map((tok, i) => {
            if (/^\s+$/.test(tok) || !containsHangul(tok)) return <span key={i}>{tok}</span>;
            const known = highlight && lookupWord(tok) !== null;
            return (
              <button
                key={i}
                onClick={(e) => onTokenClick(tok, e)}
                className={cn(
                  'rounded px-0.5 transition-colors hover:bg-terracotta-soft hover:text-terracotta-deep',
                  known && 'bg-honey/15 text-ink underline decoration-honey/60 decoration-dotted underline-offset-4',
                )}
              >
                {tok}
              </button>
            );
          })}
        </p>

        {showZh && (
          <input
            value={s.zh ?? ''}
            onChange={(e) => onZhChange(e.target.value)}
            placeholder="点击填写中文翻译…"
            className="mt-1.5 w-full rounded-lg border border-transparent bg-sand/60 px-2 py-1 text-xs text-ink-secondary outline-none placeholder:text-ink-muted focus:border-terracotta"
          />
        )}

        {/* 时间标定行 */}
        <div className="mt-2 flex flex-wrap items-center gap-1 text-[11px]">
          <span className={cn('tabular-nums', s.marked ? 'text-olive font-medium' : 'text-ink-muted')}>
            {formatTime(s.start)} → {formatTime(s.end)}{s.marked ? ' ✓' : ''}
          </span>
          <span className="mx-1 text-warm">|</span>
          {([-5, -1] as const).map((d) => (
            <button key={d} onClick={() => onNudge(d)} className="rounded-md bg-sand px-1.5 py-0.5 text-ink-secondary transition-colors hover:bg-terracotta-soft hover:text-terracotta">{d}s</button>
          ))}
          <button onClick={() => onNudge('here')} className="rounded-md bg-terracotta-soft px-1.5 py-0.5 font-medium text-terracotta transition-colors hover:bg-terracotta hover:text-white">此处</button>
          {([1, 5] as const).map((d) => (
            <button key={d} onClick={() => onNudge(d)} className="rounded-md bg-sand px-1.5 py-0.5 text-ink-secondary transition-colors hover:bg-terracotta-soft hover:text-terracotta">+{d}s</button>
          ))}
        </div>
      </div>
    </motion.div>
  );
}

/* ─────────────────────────── 点词气泡 ─────────────────────────── */

function WordBubble({ bubble, sentence, onLookup }: {
  bubble: TokenBubble;
  sentence: string;
  onLookup: (word: string, exampleKo?: string) => void;
}) {
  const word = normalizeQuery(bubble.token);
  const entry = lookupWord(bubble.token);
  const inVocab = readVocabBook().some((v) => v.ko === word);
  const [spelled, setSpelled] = useState(false);

  // 定位：上方展示，超出顶部时翻到下方
  const top = bubble.y < 220 ? bubble.y + 28 : undefined;
  const bottom = top === undefined ? window.innerHeight - bubble.y + 10 : undefined;

  const doAdd = () => {
    const added = addToVocabBook({
      ko: word,
      rom: entry?.rom ?? '',
      zh: entry?.zh ?? '',
      pos: entry?.pos ?? '',
      exampleKo: sentence || undefined,
    });
    showToast(added ? '已加入生词本（含例句）' : '生词本中已有该词');
  };

  const doSpell = () => {
    setSpelled(true);
    const speech = spellSpeechText(word);
    if (speech && !speakKorean(speech, { rate: 0.7 })) showToast('当前浏览器不支持语音合成');
  };

  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.92, y: 6 }}
      animate={{ opacity: 1, scale: 1, y: 0 }}
      exit={{ opacity: 0, scale: 0.95 }}
      transition={{ duration: 0.15 }}
      className="fixed z-[75] w-64 -translate-x-1/2 rounded-2xl border border-warm bg-paper p-3 shadow-lift"
      style={{
        left: Math.min(Math.max(bubble.x, 140), window.innerWidth - 140),
        top, bottom,
      }}
      onMouseDown={(e) => e.stopPropagation()}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="truncate font-serif text-lg font-bold text-ink">{word}</p>
          {entry?.rom && <p className="text-xs text-ink-muted">{entry.rom}</p>}
        </div>
      </div>
      {entry ? (
        <p className="mt-1 text-sm text-ink-secondary">{entry.pos && <span className="mr-1 text-[11px] text-ink-muted">{entry.pos}</span>}{entry.zh}</p>
      ) : (
        <p className="mt-1 text-xs text-ink-muted">本地词典未收录</p>
      )}

      {spelled && (
        <p className="mt-1.5 rounded-lg bg-sand/70 px-2 py-1 font-serif text-sm text-ink">
          {decomposeWord(word).map((g) => g.join('')).join(' · ')}
        </p>
      )}

      <div className="mt-2 grid grid-cols-4 gap-1">
        <BubbleBtn title="朗读" onClick={() => { if (!speakKorean(word)) showToast('当前浏览器不支持语音合成'); }} disabled={!canSpeak(word)}>
          <Volume2 size={14} />
        </BubbleBtn>
        <BubbleBtn title="拼读" onClick={doSpell} active={spelled}>
          <SpellCheck size={14} />
        </BubbleBtn>
        <BubbleBtn title={inVocab ? '已在生词本' : '加入生词本（含例句）'} onClick={doAdd} active={inVocab}>
          {inVocab ? <Check size={14} /> : <BookPlus size={14} />}
        </BubbleBtn>
        <BubbleBtn title="查词典" onClick={() => onLookup(word, sentence || undefined)}>
          <BookOpen size={14} />
        </BubbleBtn>
      </div>
    </motion.div>
  );
}

function BubbleBtn({ children, title, onClick, active, disabled }: {
  children: React.ReactNode;
  title: string;
  onClick: () => void;
  active?: boolean;
  disabled?: boolean;
}) {
  return (
    <button
      title={title}
      onClick={onClick}
      disabled={disabled}
      className={cn(
        'flex items-center justify-center rounded-lg border py-1.5 transition-colors disabled:opacity-40',
        active ? 'border-olive/40 bg-olive/10 text-olive' : 'border-warm text-ink-secondary hover:border-terracotta hover:text-terracotta',
      )}
    >
      {children}
    </button>
  );
}
