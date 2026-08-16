/**
 * Corpus.tsx — 语料中心页面
 * 功能：拖放上传（音频/视频/PDF/文本 → IndexedDB）、语料卡片管理（重命名/删除/打开练习）、
 * 练习工作台（音频波形 + A-B 循环 + 倍速；视频自定义控制条；PDF/文本书页阅读 + 划词翻译气泡）、
 * 存储管理（用量显示 / JSON 导出 / 清空）。
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  CloudUpload, Headphones, Clapperboard, FileText, AlignLeft, MoreHorizontal,
  Trash2, Pencil, ArrowLeft, Play, Pause, SkipBack, SkipForward, Volume2,
  Package, Download, Eraser, Star, X, ChevronLeft, ChevronRight,
  ALargeSmall, Rows3, BookOpenText, Repeat, Zap, BookPlus, Mic, Check, Loader2,
} from 'lucide-react';
import { Link } from 'react-router';
import WaveSurfer from 'wavesurfer.js';
import RegionsPlugin from 'wavesurfer.js/dist/plugins/regions.js';
import type { Region } from 'wavesurfer.js/dist/plugins/regions.js';
import * as pdfjsLib from 'pdfjs-dist';
import pdfWorkerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url';
import StatChip from '@/components/StatChip';
import EmptyState from '@/components/EmptyState';
import SpeakButton from '@/components/SpeakButton';
import { showToast } from '@/components/Toast';
import { cn } from '@/lib/utils';
import { speakKorean, isTtsSupported } from '@/lib/tts';
import { readStorage, writeStorage, STORAGE_KEYS } from '@/lib/storage';
import { lookupWord, containsHangul, normalizeQuery } from '@/lib/dictionary';
import { DICTIONARY } from '@/data/dictionary';
import type { DictEntry } from '@/data/dictionary';
import { syncVocabAdd, syncCorpusAdd, syncCorpusRemove } from '@/lib/sync';
import {
  type CorpusMeta, type CorpusKind, genId, detectKind, saveCorpusFile, getCorpusBlob,
  listCorpusMeta, updateCorpusMeta, deleteCorpus, clearCorpus, estimateUsage,
  formatBytes, formatTime, probeDuration, computePeaks, exportMyData,
} from '@/lib/corpus';

// pdf.js worker 配置（Vite ?url 方式打包 worker）
pdfjsLib.GlobalWorkerOptions.workerSrc = pdfWorkerUrl;

/** 单文件大小上限 200MB */
const MAX_FILE_SIZE = 200 * 1024 * 1024;
/** 语料类型展示配置 */
const KIND_META: Record<CorpusKind, { label: string; icon: typeof Headphones; badge: string }> = {
  audio: { label: '音频', icon: Headphones, badge: 'bg-terracotta-soft text-terracotta' },
  video: { label: '视频', icon: Clapperboard, badge: 'bg-honey/15 text-honey' },
  pdf: { label: 'PDF', icon: FileText, badge: 'bg-olive/15 text-olive' },
  text: { label: '文本', icon: AlignLeft, badge: 'bg-sand text-ink-secondary' },
};

/** 生词本条目结构（与 Vocabulary 页保持一致，共用 storage.ts 的生词本键） */
interface VocabEntry {
  id: string;
  ko: string;
  rom: string;
  zh: string;
  pos: string;
  addedAt: number;
  mastered: boolean;
}

/** 将词条加入生词本（去重），返回是否新增成功；新增时静默同步云端 */
function addToVocabBook(entry: Omit<VocabEntry, 'id' | 'addedAt' | 'mastered'>): boolean {
  const list = readStorage<VocabEntry[]>(STORAGE_KEYS.VOCAB_BOOK, []);
  if (list.some((v) => v.ko === entry.ko)) return false;
  writeStorage(STORAGE_KEYS.VOCAB_BOOK, [...list, { ...entry, id: genId(), addedAt: Date.now(), mastered: false }]);
  syncVocabAdd({ ko: entry.ko, rom: entry.rom, zh: entry.zh, pos: entry.pos, source: 'corpus' });
  return true;
}

/** 发音练习自定义材料（`hjy:pron-custom`，与 Pronunciation 页「我的材料」共用） */
interface PronCustomItem {
  id: string;
  ko: string;
  rom: string;
  zh: string;
  tip?: string;
}

const PRON_CUSTOM_KEY = 'hjy:pron-custom';

/** 读取发音练习自定义材料 */
function readPronCustom(): PronCustomItem[] {
  return readStorage<PronCustomItem[]>(PRON_CUSTOM_KEY, []);
}

/** 把整句加入发音练习自定义材料（按 ko 去重），返回是否新增成功 */
function addToPronCustom(ko: string, zh = ''): boolean {
  const text = ko.trim();
  if (!text) return false;
  const list = readPronCustom();
  if (list.some((s) => s.ko === text)) return false;
  writeStorage(PRON_CUSTOM_KEY, [...list, { id: crypto.randomUUID(), ko: text, rom: '', zh }]);
  return true;
}

/** 提取记录（`hjy:corpus-extract-log`）：语料卡展示「上次提取」标签 */
interface ExtractLog {
  corpusId: string;
  date: number;
  wordsAdded: number;
  sentencesAdded: number;
}

const EXTRACT_LOG_KEY = 'hjy:corpus-extract-log';

/** 读取全部提取记录 */
function readExtractLogs(): ExtractLog[] {
  return readStorage<ExtractLog[]>(EXTRACT_LOG_KEY, []);
}

/** 从全文中定位选区所在的整句（按句读标点 / 换行取边界），找不到时退化为选区本身 */
function extractSentenceAround(fullText: string, selected: string): string {
  const cleaned = selected.trim();
  if (!cleaned) return cleaned;
  const idx = fullText.indexOf(cleaned);
  if (idx < 0) return cleaned;
  const isBoundary = (ch: string) => /[。．.!！?？…\n\r;；]/.test(ch);
  let start = idx;
  while (start > 0 && !isBoundary(fullText[start - 1])) start--;
  let end = idx + cleaned.length;
  while (end < fullText.length && !isBoundary(fullText[end])) end++;
  const sentence = fullText.slice(start, end).trim();
  return sentence || cleaned;
}

/** 按句号/问号/感叹号/换行切分句子，过滤无韩语、过短（<4 字）或超长（>40 字）句并去重 */
function splitKoreanSentences(text: string): string[] {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const raw of text.split(/[。．.!！?？…\n\r]+/)) {
    const s = raw.trim();
    if (s.length < 4 || s.length > 40 || seen.has(s) || !containsHangul(s)) continue;
    seen.add(s);
    result.push(s);
  }
  return result;
}

/** 迷你波形（SVG 柱状，语料卡 / 视频辅助定位用） */
function MiniWaveform({ peaks, progress = 0, onSeek, className = '' }: {
  peaks: number[]; progress?: number; onSeek?: (ratio: number) => void; className?: string;
}) {
  return (
    <svg
      viewBox={`0 0 ${peaks.length * 3} 40`}
      preserveAspectRatio="none"
      className={cn('h-10 w-full', onSeek && 'cursor-pointer', className)}
      onClick={(e) => {
        if (!onSeek) return;
        const rect = e.currentTarget.getBoundingClientRect();
        onSeek(Math.min(1, Math.max(0, (e.clientX - rect.left) / rect.width)));
      }}
    >
      {peaks.map((p, i) => {
        const h = Math.max(2, p * 38);
        const played = i / peaks.length <= progress;
        return (
          <rect
            key={i}
            x={i * 3 + 0.5}
            y={(40 - h) / 2}
            width={2}
            height={h}
            rx={1}
            fill={played ? '#C96F4A' : '#A79C90'}
            opacity={played ? 1 : 0.55}
          />
        );
      })}
    </svg>
  );
}

/** 通用确认/输入模态框 */
function Modal({ title, children, onClose }: { title: string; children: React.ReactNode; onClose: () => void }) {
  return (
    <motion.div
      className="fixed inset-0 z-[70] flex items-center justify-center p-4"
      style={{ background: 'rgba(46,42,38,0.4)' }}
      initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
      onClick={onClose}
    >
      <motion.div
        className="w-full max-w-sm rounded-3xl border border-warm bg-paper p-6 shadow-lift"
        initial={{ scale: 0.9, y: 16 }} animate={{ scale: 1, y: 0 }} exit={{ scale: 0.95, opacity: 0 }}
        transition={{ duration: 0.25, ease: [0.22, 1, 0.36, 1] }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-4 flex items-center justify-between">
          <h3 className="font-serif text-lg font-bold text-ink">{title}</h3>
          <button onClick={onClose} aria-label="关闭" className="rounded-full p-1 text-ink-muted hover:bg-sand">
            <X size={18} />
          </button>
        </div>
        {children}
      </motion.div>
    </motion.div>
  );
}

/** 倍速档位 */
const RATES = [0.5, 0.75, 1, 1.25, 1.5];

// ═══════════════════════════ 提取到学习库 Modal ═══════════════════════════

/** 提取结果统计 */
interface ExtractResult {
  wordsAdded: number;
  sentencesAdded: number;
  wordsSkipped: number;
  sentencesSkipped: number;
}

type ExtractPhase = 'select' | 'running' | 'done';

/** 「提取到学习库」流程 Modal：勾选目标 → 本地词典匹配/切句（分片）→ 去重写入 → 结果统计 */
function ExtractModal({ meta, onClose, onDone }: {
  meta: CorpusMeta;
  onClose: () => void;
  onDone: (log: ExtractLog) => void;
}) {
  const [phase, setPhase] = useState<ExtractPhase>('select');
  const [wantWords, setWantWords] = useState(true);
  const [wantSentences, setWantSentences] = useState(true);
  const [progress, setProgress] = useState(0);
  const [statusText, setStatusText] = useState('');
  const [result, setResult] = useState<ExtractResult | null>(null);

  /** 执行提取：读取语料文本 → 词典匹配 + 切句（分片让出主线程）→ 去重写入本地库 */
  const run = useCallback(async () => {
    const tick = () => new Promise<void>((r) => setTimeout(r, 0));
    setPhase('running');
    setStatusText('正在读取语料文本…');
    setProgress(0.05);
    try {
      const blob = await getCorpusBlob(meta.id);
      if (!blob) {
        showToast('文件读取失败，可能已被清理');
        onClose();
        return;
      }
      // 1. 提取全文文本
      let text = '';
      if (meta.kind === 'pdf') {
        const doc = await pdfjsLib.getDocument({ data: await blob.arrayBuffer() }).promise;
        const parts: string[] = [];
        for (let i = 1; i <= doc.numPages; i++) {
          const page = await doc.getPage(i);
          const content = await page.getTextContent();
          let t = '';
          for (const item of content.items) {
            if ('str' in item) t += item.str + (item.hasEOL ? '\n' : ' ');
          }
          parts.push(t);
          setStatusText(`正在提取 PDF 文本（${i}/${doc.numPages} 页）…`);
          setProgress(0.05 + 0.25 * (i / doc.numPages));
          await tick();
        }
        await doc.destroy();
        text = parts.join('\n');
      } else {
        text = await blob.text();
        setProgress(0.3);
      }
      if (!text.trim() || !containsHangul(text)) {
        showToast(meta.kind === 'pdf' ? '这份 PDF 没有可提取的文字层' : '语料中没有可提取的韩语文本');
        onClose();
        return;
      }

      // 2. 本地词典匹配（分片处理，大文本不卡 UI，进度真实）
      const wordEntries: DictEntry[] = [];
      if (wantWords) {
        setStatusText('正在分词…');
        await tick();
        const CHUNK = 30;
        for (let i = 0; i < DICTIONARY.length; i += CHUNK) {
          for (const e of DICTIONARY.slice(i, i + CHUNK)) {
            if (text.includes(e.ko)) wordEntries.push(e);
          }
          const done = Math.min(DICTIONARY.length, i + CHUNK);
          setStatusText(`词典匹配中 (${done}/${DICTIONARY.length})…`);
          setProgress(0.3 + 0.45 * (done / DICTIONARY.length));
          await tick();
        }
      }

      // 3. 按句切分（过滤超长/无韩语句）
      let sentences: string[] = [];
      if (wantSentences) {
        setStatusText('正在切分句子…');
        sentences = splitKoreanSentences(text);
        setProgress(wantWords ? 0.8 : 0.6);
        await tick();
      }

      // 4. 去重并写入学习库
      setStatusText('去重并写入学习库…');
      const vocabList = readStorage<VocabEntry[]>(STORAGE_KEYS.VOCAB_BOOK, []);
      const vocabKeys = new Set(vocabList.map((v) => v.ko));
      const newVocab = [...vocabList];
      let wordsAdded = 0;
      let wordsSkipped = 0;
      const addedEntries: DictEntry[] = [];
      for (const e of wordEntries) {
        if (vocabKeys.has(e.ko)) { wordsSkipped++; continue; }
        vocabKeys.add(e.ko);
        newVocab.push({ id: genId(), ko: e.ko, rom: e.rom, zh: e.zh, pos: e.pos, addedAt: Date.now(), mastered: false });
        addedEntries.push(e);
        wordsAdded++;
      }
      if (wordsAdded > 0) {
        writeStorage(STORAGE_KEYS.VOCAB_BOOK, newVocab);
        // 逐条静默同步云端（httpBatchLink 会合批）
        for (const e of addedEntries) {
          syncVocabAdd({ ko: e.ko, rom: e.rom, zh: e.zh, pos: e.pos, source: 'corpus' });
        }
      }

      const pronList = readPronCustom();
      const pronKeys = new Set(pronList.map((s) => s.ko));
      const newPron = [...pronList];
      let sentencesAdded = 0;
      let sentencesSkipped = 0;
      for (const s of sentences) {
        if (pronKeys.has(s)) { sentencesSkipped++; continue; }
        pronKeys.add(s);
        newPron.push({ id: crypto.randomUUID(), ko: s, rom: '', zh: '' });
        sentencesAdded++;
      }
      if (sentencesAdded > 0) writeStorage(PRON_CUSTOM_KEY, newPron);

      // 5. 记录提取日志并进入完成态
      const log: ExtractLog = { corpusId: meta.id, date: Date.now(), wordsAdded, sentencesAdded };
      writeStorage(EXTRACT_LOG_KEY, [...readExtractLogs().filter((l) => l.corpusId !== meta.id), log]);
      onDone(log);
      setProgress(1);
      setResult({ wordsAdded, sentencesAdded, wordsSkipped, sentencesSkipped });
      setPhase('done');
    } catch {
      showToast('提取失败，请重试');
      onClose();
    }
  }, [meta, onClose, onDone, wantWords, wantSentences]);

  const nothingNew = result !== null && result.wordsAdded === 0 && result.sentencesAdded === 0;

  return (
    <Modal title={`提取到学习库 · 《${meta.name}》`} onClose={onClose}>
      {phase === 'select' && (
        <div>
          <label className="flex cursor-pointer items-start gap-3 rounded-xl border border-warm bg-base/60 p-3">
            <input
              type="checkbox"
              checked={wantWords}
              onChange={(e) => setWantWords(e.target.checked)}
              className="mt-0.5 h-4 w-4 accent-olive"
            />
            <span>
              <span className="block text-sm font-medium text-ink">提取词汇到单词学习库</span>
              <span className="mt-0.5 block text-xs text-ink-muted">用本地词典匹配文中韩语词，去重后加入</span>
            </span>
          </label>
          <label className="mt-2 flex cursor-pointer items-start gap-3 rounded-xl border border-warm bg-base/60 p-3">
            <input
              type="checkbox"
              checked={wantSentences}
              onChange={(e) => setWantSentences(e.target.checked)}
              className="mt-0.5 h-4 w-4 accent-olive"
            />
            <span>
              <span className="block text-sm font-medium text-ink">提取句子到发音练习库</span>
              <span className="mt-0.5 block text-xs text-ink-muted">按句号/问号/换行切分，过滤超长句（&gt;40 字）</span>
            </span>
          </label>
          <button
            onClick={() => void run()}
            disabled={!wantWords && !wantSentences}
            className="mt-5 flex w-full items-center justify-center gap-1.5 rounded-full bg-terracotta px-4 py-2.5 text-sm font-medium text-paper transition-colors hover:bg-terracotta-deep disabled:cursor-not-allowed disabled:opacity-40"
          >
            <Zap size={15} /> 开始提取
          </button>
        </div>
      )}

      {phase === 'running' && (
        <div className="py-2">
          <div className="flex items-center gap-2 text-sm text-ink">
            <Loader2 size={16} className="animate-spin text-terracotta" />
            提取中…
          </div>
          {/* 3px 赤陶橘进度条（宽度动画） */}
          <div className="mt-4 h-[3px] w-full overflow-hidden rounded-full bg-sand">
            <motion.div
              className="h-full rounded-full bg-terracotta"
              animate={{ width: `${Math.round(progress * 100)}%` }}
              transition={{ duration: 0.2, ease: 'easeOut' }}
            />
          </div>
          <AnimatePresence mode="wait">
            <motion.p
              key={statusText}
              initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -6 }}
              transition={{ duration: 0.2 }}
              className="mt-3 text-xs text-ink-muted"
            >
              {statusText}
            </motion.p>
          </AnimatePresence>
        </div>
      )}

      {phase === 'done' && result && (
        <div className="flex flex-col items-center py-2 text-center">
          {nothingNew ? (
            <>
              <p className="rounded-full bg-honey/10 px-4 py-2 text-sm text-honey">
                没有新内容——这份语料的词你都收过了
              </p>
              <button
                onClick={onClose}
                className="mt-5 rounded-full border border-warm bg-paper px-6 py-2.5 text-sm text-ink-secondary transition-colors hover:bg-sand"
              >
                完成
              </button>
            </>
          ) : (
            <>
              <motion.span
                initial={{ scale: 0 }} animate={{ scale: [0, 1.1, 1] }}
                transition={{ duration: 0.4, ease: [0.22, 1, 0.36, 1] }}
                className="flex h-14 w-14 items-center justify-center rounded-full bg-olive/15 text-olive"
              >
                <Check size={28} />
              </motion.span>
              <p className="mt-3 font-serif text-lg font-bold text-ink">提取完成！</p>
              <motion.div
                initial="hidden" animate="show"
                variants={{ show: { transition: { staggerChildren: 0.08 } } }}
                className="mt-3 flex w-full flex-col gap-2 text-left"
              >
                <motion.p
                  variants={{ hidden: { opacity: 0, y: 12 }, show: { opacity: 1, y: 0 } }}
                  className="flex items-center gap-2 rounded-xl bg-base/60 px-3 py-2 text-sm text-ink-secondary"
                >
                  <BookPlus size={15} className="shrink-0 text-terracotta" />
                  新增 {result.wordsAdded} 个词到单词学习
                  {result.wordsSkipped > 0 && `（跳过已在库 ${result.wordsSkipped} 个）`}
                </motion.p>
                <motion.p
                  variants={{ hidden: { opacity: 0, y: 12 }, show: { opacity: 1, y: 0 } }}
                  className="flex items-center gap-2 rounded-xl bg-base/60 px-3 py-2 text-sm text-ink-secondary"
                >
                  <Mic size={15} className="shrink-0 text-terracotta" />
                  新增 {result.sentencesAdded} 个句子到发音练习
                  {result.sentencesSkipped > 0 && `（跳过重复 ${result.sentencesSkipped} 个）`}
                </motion.p>
              </motion.div>
              <div className="mt-5 flex w-full justify-center gap-2">
                <Link
                  to="/vocabulary"
                  className="rounded-full bg-terracotta px-6 py-2.5 text-sm font-medium text-paper transition-colors hover:bg-terracotta-deep"
                >
                  去学习 →
                </Link>
                <button
                  onClick={onClose}
                  className="rounded-full border border-warm bg-paper px-6 py-2.5 text-sm text-ink-secondary transition-colors hover:bg-sand"
                >
                  完成
                </button>
              </div>
            </>
          )}
        </div>
      )}
    </Modal>
  );
}

// ═══════════════════════════ 主页面 ═══════════════════════════

export default function Corpus() {
  const [items, setItems] = useState<CorpusMeta[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [active, setActive] = useState<CorpusMeta | null>(null); // 打开练习的语料
  const [dragOver, setDragOver] = useState(false);
  const [uploading, setUploading] = useState<{ name: string } | null>(null);
  const [menuId, setMenuId] = useState<string | null>(null); // ⋯ 菜单展开项
  const [deleteTarget, setDeleteTarget] = useState<CorpusMeta | null>(null);
  const [renameTarget, setRenameTarget] = useState<CorpusMeta | null>(null);
  const [renameValue, setRenameValue] = useState('');
  const [confirmClear, setConfirmClear] = useState(false);
  const [usage, setUsage] = useState(0);
  const [extractTarget, setExtractTarget] = useState<CorpusMeta | null>(null); // 「提取到学习库」目标语料
  const [extractLogs, setExtractLogs] = useState<Record<string, ExtractLog>>({}); // corpusId → 上次提取记录
  const [pulseKey, setPulseKey] = useState(0); // 空状态 CTA 触发拖放区高亮脉冲
  const fileInputRef = useRef<HTMLInputElement>(null);
  const dropRef = useRef<HTMLDivElement>(null);

  /** 刷新列表与用量 */
  const refresh = useCallback(async () => {
    const list = await listCorpusMeta();
    setItems(list);
    setUsage(await estimateUsage(list));
    setLoaded(true);
  }, []);

  // 挂载时加载语料列表与用量（异步读取 IndexedDB）
  useEffect(() => {
    const t = setTimeout(() => void refresh(), 0);
    return () => clearTimeout(t);
  }, [refresh]);

  /** 处理上传文件列表：校验 → 提取元信息 → 存 IndexedDB */
  const handleFiles = useCallback(async (files: FileList | File[]) => {
    const arr = Array.from(files);
    if (!arr.length) return;
    for (const file of arr) {
      const kind = detectKind(file);
      if (!kind) {
        showToast(`不支持的格式：${file.name}`);
        continue;
      }
      if (file.size > MAX_FILE_SIZE) {
        showToast(`「${file.name}」超过 200MB 限制`);
        continue;
      }
      setUploading({ name: file.name });
      try {
        const id = genId();
        const meta: CorpusMeta = {
          id, name: file.name, kind,
          mime: file.type || 'application/octet-stream',
          size: file.size, createdAt: Date.now(),
        };
        // 按类型提取元信息
        if (kind === 'audio' || kind === 'video') {
          meta.duration = await probeDuration(file, kind);
          meta.peaks = await computePeaks(file); // 预计算波形 peaks
        } else if (kind === 'pdf') {
          try {
            const doc = await pdfjsLib.getDocument({ data: await file.arrayBuffer() }).promise;
            meta.pageCount = doc.numPages;
            await doc.destroy();
          } catch { /* 损坏的 PDF 仍允许保存 */ }
        } else if (kind === 'text') {
          const text = await file.text();
          meta.wordCount = text.replace(/\s/g, '').length;
        }
        await saveCorpusFile(id, file, meta);
        // 语料元数据静默同步云端（fire-and-forget，离线时静默失败）
        syncCorpusAdd({
          title: meta.name, kind,
          sizeBytes: file.size,
          durationSeconds: meta.duration,
          localKey: id,
        });
        showToast('已加入语料库');
      } catch {
        showToast(`「${file.name}」保存失败`);
      }
    }
    setUploading(null);
    await refresh();
  }, [refresh]);

  /** 确认删除 */
  const doDelete = useCallback(async () => {
    if (!deleteTarget) return;
    await deleteCorpus(deleteTarget.id);
    // 云端删除需要数字 ID；本地键为字符串时无法对应，尽力而为（fire-and-forget）
    const cloudId = Number(deleteTarget.id);
    if (Number.isFinite(cloudId)) syncCorpusRemove(cloudId);
    setDeleteTarget(null);
    showToast('已删除');
    await refresh();
  }, [deleteTarget, refresh]);

  /** 确认重命名 */
  const doRename = useCallback(async () => {
    if (!renameTarget || !renameValue.trim()) return;
    await updateCorpusMeta({ ...renameTarget, name: renameValue.trim() });
    setRenameTarget(null);
    showToast('已重命名');
    await refresh();
  }, [renameTarget, renameValue, refresh]);

  const totalBytes = items.reduce((s, m) => s + m.size, 0);

  // 打开练习 → 整页工作台
  if (active) {
    return <Workbench meta={active} onBack={() => { setActive(null); void refresh(); }} />;
  }

  return (
    <div className="mx-auto max-w-content px-4 py-10 md:px-6 md:py-14">
      {/* ── Section 1 页头 ── */}
      <motion.div
        initial={{ opacity: 0, y: 24 }} animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
        className="flex flex-wrap items-end justify-between gap-6"
      >
        <div>
          <h1 className="font-serif text-3xl font-bold text-ink">语料中心</h1>
          <p className="mt-1 font-kr text-sm text-terracotta">나만의 코퍼스 · 我的语料库</p>
          <p className="mt-3 max-w-lg text-sm leading-relaxed text-ink-secondary">
            上传韩剧片段、播客、课文 PDF……把喜欢的材料变成练习场。文件只保存在你的浏览器里。
          </p>
        </div>
        <StatChip icon={<Package size={20} />} label="已存语料" value={`${items.length} 份`} unit={`共 ${formatBytes(totalBytes)}`} tone="terracotta" />
      </motion.div>

      {/* ── 上传拖放区 ── */}
      <motion.div
        ref={dropRef}
        key={pulseKey}
        initial={{ opacity: 0, y: 24 }} animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5, delay: 0.1, ease: [0.22, 1, 0.36, 1] }}
        className="mt-8"
      >
        <motion.div
          role="button"
          tabIndex={0}
          aria-label="上传语料文件"
          onClick={() => fileInputRef.current?.click()}
          onKeyDown={(e) => e.key === 'Enter' && fileInputRef.current?.click()}
          onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
          onDragLeave={() => setDragOver(false)}
          onDrop={(e) => { e.preventDefault(); setDragOver(false); void handleFiles(e.dataTransfer.files); }}
          animate={dragOver ? { scale: 1.01 } : pulseKey > 0 ? { scale: [1, 1.02, 1, 1.02, 1] } : { scale: 1 }}
          transition={{ duration: dragOver ? 0.2 : 1.2 }}
          className={cn(
            'flex cursor-pointer flex-col items-center gap-3 rounded-3xl border-2 border-dashed bg-paper px-6 py-12 text-center transition-colors duration-200',
            dragOver || pulseKey > 0 ? 'border-terracotta bg-terracotta-soft/50' : 'border-warm hover:border-terracotta hover:bg-terracotta-soft/30',
          )}
        >
          {/* 虚线框 8s 缓慢呼吸 */}
          <motion.div animate={{ opacity: [0.7, 1, 0.7] }} transition={{ duration: 8, repeat: Infinity }}>
            <CloudUpload size={48} className="text-ink-muted" />
          </motion.div>
          <p className="text-base font-medium text-ink">拖文件到这里，或 <span className="text-terracotta underline underline-offset-4">点击选择</span></p>
          <p className="text-xs text-ink-muted">音频 mp3/wav/m4a · 视频 mp4/webm · 文档 pdf/txt/md · 单文件 ≤ 200MB</p>
          <input
            ref={fileInputRef} type="file" multiple className="hidden"
            accept="audio/*,video/*,.mp3,.m4a,.wav,.mp4,.webm,.pdf,.txt,.md"
            onChange={(e) => { if (e.target.files) void handleFiles(e.target.files); e.target.value = ''; }}
          />
        </motion.div>

        {/* 上传处理条 */}
        <AnimatePresence>
          {uploading && (
            <motion.div
              initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}
              className="mt-3 rounded-2xl border border-warm bg-paper p-4 shadow-card"
            >
              <p className="truncate text-sm text-ink">正在处理：{uploading.name}</p>
              <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-sand">
                <motion.div
                  className="h-full w-1/3 rounded-full bg-terracotta"
                  animate={{ x: ['0%', '200%'] }}
                  transition={{ duration: 1.2, repeat: Infinity, ease: 'easeInOut' }}
                />
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </motion.div>

      {/* ── Section 2 语料库列表 ── */}
      <div className="mt-12">
        {loaded && items.length === 0 ? (
          <div className="rounded-3xl border border-warm bg-paper shadow-card">
            <EmptyState
              image="/empty-corpus.svg"
              title="语料库还是空的"
              description="上传第一段材料，开始精听精练。"
            />
            <div className="flex justify-center pb-10">
              <button
                onClick={() => {
                  dropRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' });
                  setPulseKey((k) => k + 1); // 高亮脉冲两次
                }}
                className="rounded-full bg-terracotta px-6 py-2.5 text-sm font-medium text-paper shadow-card transition-colors hover:bg-terracotta-deep"
              >
                立即上传
              </button>
            </div>
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-5 md:grid-cols-2 lg:grid-cols-3">
            <AnimatePresence mode="popLayout">
              {items.map((item, idx) => {
                const km = KIND_META[item.kind];
                return (
                  <motion.article
                    key={item.id}
                    layout
                    initial={{ opacity: 0, y: 24 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, scale: 0.95 }}
                    transition={{ duration: 0.4, delay: idx * 0.08, ease: [0.22, 1, 0.36, 1] }}
                    whileHover={{ y: -4 }}
                    className="group relative flex flex-col gap-3 rounded-2xl border border-warm bg-paper p-5 shadow-card transition-shadow duration-200 hover:shadow-lift"
                  >
                    {/* 类型徽章 + ⋯ 菜单 */}
                    <div className="flex items-start justify-between">
                      <span className={cn('flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-medium', km.badge)}>
                        <km.icon size={13} />
                        {km.label}
                      </span>
                      <div className="relative">
                        <button
                          aria-label="更多操作"
                          onClick={() => setMenuId(menuId === item.id ? null : item.id)}
                          className="rounded-full p-1.5 text-ink-muted transition-colors hover:bg-sand hover:text-ink"
                        >
                          <MoreHorizontal size={18} />
                        </button>
                        <AnimatePresence>
                          {menuId === item.id && (
                            <motion.div
                              initial={{ opacity: 0, scale: 0.9, y: -4 }} animate={{ opacity: 1, scale: 1, y: 0 }} exit={{ opacity: 0, scale: 0.95 }}
                              transition={{ duration: 0.15 }}
                              className="absolute right-0 top-9 z-20 w-44 overflow-hidden rounded-xl border border-warm bg-paper py-1 shadow-lift"
                            >
                              <button
                                className="flex w-full items-center gap-2 px-4 py-2 text-sm text-ink-secondary hover:bg-sand"
                                onClick={() => { setMenuId(null); setRenameTarget(item); setRenameValue(item.name); }}
                              >
                                <Pencil size={14} /> 重命名
                              </button>
                              <button
                                disabled={item.kind === 'audio' || item.kind === 'video'}
                                title={item.kind === 'audio' || item.kind === 'video' ? '音视频语料暂不支持文本提取' : undefined}
                                className="flex w-full items-center gap-2 px-4 py-2 text-sm text-ink-secondary enabled:hover:bg-sand disabled:cursor-not-allowed disabled:opacity-40"
                                onClick={() => { setMenuId(null); setExtractTarget(item); }}
                              >
                                <Zap size={14} className="text-terracotta" /> 提取到学习库
                              </button>
                              <button
                                className="flex w-full items-center gap-2 px-4 py-2 text-sm text-terracotta-deep hover:bg-sand"
                                onClick={() => { setMenuId(null); setDeleteTarget(item); }}
                              >
                                <Trash2 size={14} /> 删除
                              </button>
                            </motion.div>
                          )}
                        </AnimatePresence>
                      </div>
                    </div>

                    {/* 文件名 + 元信息 */}
                    <div className="min-w-0">
                      <h3 className="truncate text-base font-medium text-ink" title={item.name}>{item.name}</h3>
                      <p className="mt-1 text-xs text-ink-muted">
                        {item.kind === 'audio' || item.kind === 'video'
                          ? `${item.duration ? formatTime(item.duration) : '时长未知'} · `
                          : item.kind === 'pdf'
                            ? `${item.pageCount ? `${item.pageCount} 页` : '页数未知'} · `
                            : `${item.wordCount ? `${item.wordCount} 字` : '字数未知'} · `}
                        {formatBytes(item.size)} · {new Date(item.createdAt).toLocaleDateString('zh-CN')}
                      </p>
                    </div>

                    {/* 音频卡内嵌迷你波形 */}
                    {item.kind === 'audio' && item.peaks && (
                      <MiniWaveform peaks={item.peaks.slice(0, 120)} />
                    )}

                    {/* 上次提取标签（提取过的语料卡显示增量统计） */}
                    {extractLogs[item.id] && (
                      <motion.p
                        initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.2 }}
                        className="text-xs text-ink-muted"
                      >
                        上次提取：+{extractLogs[item.id].wordsAdded} 词 +{extractLogs[item.id].sentencesAdded} 句
                      </motion.p>
                    )}

                    {/* 底部操作行：提取到学习库 + 打开练习 */}
                    <div className="mt-auto flex flex-wrap items-center gap-x-4 gap-y-2">
                      {item.kind === 'audio' || item.kind === 'video' ? (
                        <span
                          title="音视频语料暂不支持文本提取"
                          className="flex cursor-not-allowed items-center gap-1.5 rounded-full border border-warm px-3.5 py-1.5 text-xs font-medium text-ink-muted opacity-50"
                        >
                          <Zap size={13} /> 提取到学习库
                        </span>
                      ) : (
                        <button
                          onClick={() => setExtractTarget(item)}
                          className="flex items-center gap-1.5 rounded-full border border-terracotta/50 px-3.5 py-1.5 text-xs font-medium text-terracotta transition-colors hover:bg-terracotta-soft"
                        >
                          <Zap size={13} /> 提取到学习库
                        </button>
                      )}
                      <button
                        onClick={() => setActive(item)}
                        className="ml-auto flex items-center gap-1 text-sm font-medium text-terracotta transition-transform duration-200 group-hover:translate-x-1"
                      >
                        打开练习 <ArrowLeft size={15} className="rotate-180" />
                      </button>
                    </div>
                  </motion.article>
                );
              })}
            </AnimatePresence>
          </div>
        )}
      </div>

      {/* ── Section 4 存储管理 ── */}
      {items.length > 0 && (
        <motion.div
          initial={{ opacity: 0, y: 24 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true, amount: 0.2 }}
          transition={{ duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
          className="mt-14 flex flex-wrap items-center gap-x-6 gap-y-3 rounded-2xl bg-sand px-6 py-4"
        >
          <p className="flex items-center gap-2 text-sm text-ink-secondary">
            <Package size={16} className="text-ink-muted" />
            本地存储已用 <strong className="text-ink">{formatBytes(usage)}</strong>（IndexedDB）
          </p>
          <div className="ml-auto flex flex-wrap gap-2">
            <button
              onClick={() => { void exportMyData(); showToast('已导出 JSON 备份'); }}
              className="flex items-center gap-1.5 rounded-full border border-warm bg-paper px-4 py-2 text-sm text-ink-secondary transition-colors hover:border-terracotta hover:text-terracotta"
            >
              <Download size={14} /> 导出我的数据（JSON）
            </button>
            <button
              onClick={() => setConfirmClear(true)}
              className="flex items-center gap-1.5 rounded-full border border-warm bg-paper px-4 py-2 text-sm text-terracotta-deep transition-colors hover:border-terracotta-deep"
            >
              <Eraser size={14} /> 清空全部语料
            </button>
          </div>
        </motion.div>
      )}

      {/* ── 模态：删除确认 ── */}
      <AnimatePresence>
        {deleteTarget && (
          <Modal title="删除语料" onClose={() => setDeleteTarget(null)}>
            <p className="text-sm text-ink-secondary">
              将从本机删除「{deleteTarget.name}」及其文件，此操作不可恢复。
            </p>
            <div className="mt-5 flex justify-end gap-2">
              <button onClick={() => setDeleteTarget(null)} className="rounded-full px-4 py-2 text-sm text-ink-secondary hover:bg-sand">取消</button>
              <button onClick={() => void doDelete()} className="rounded-full bg-terracotta-deep px-4 py-2 text-sm font-medium text-paper hover:opacity-90">确认删除</button>
            </div>
          </Modal>
        )}
      </AnimatePresence>

      {/* ── 模态：重命名 ── */}
      <AnimatePresence>
        {renameTarget && (
          <Modal title="重命名" onClose={() => setRenameTarget(null)}>
            <input
              autoFocus
              value={renameValue}
              onChange={(e) => setRenameValue(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && void doRename()}
              className="w-full rounded-xl border border-warm bg-base px-4 py-2.5 text-sm text-ink outline-none focus:border-terracotta"
            />
            <div className="mt-5 flex justify-end gap-2">
              <button onClick={() => setRenameTarget(null)} className="rounded-full px-4 py-2 text-sm text-ink-secondary hover:bg-sand">取消</button>
              <button onClick={() => void doRename()} className="rounded-full bg-terracotta px-4 py-2 text-sm font-medium text-paper hover:bg-terracotta-deep">保存</button>
            </div>
          </Modal>
        )}
      </AnimatePresence>

      {/* ── 模态：清空全部确认 ── */}
      <AnimatePresence>
        {confirmClear && (
          <Modal title="清空全部语料" onClose={() => setConfirmClear(false)}>
            <p className="text-sm text-ink-secondary">将从本机删除全部 {items.length} 份语料及文件，此操作不可恢复。</p>
            <div className="mt-5 flex justify-end gap-2">
              <button onClick={() => setConfirmClear(false)} className="rounded-full px-4 py-2 text-sm text-ink-secondary hover:bg-sand">取消</button>
              <button
                onClick={() => { void clearCorpus().then(() => { setConfirmClear(false); showToast('已清空语料库'); void refresh(); }); }}
                className="rounded-full bg-terracotta-deep px-4 py-2 text-sm font-medium text-paper hover:opacity-90"
              >
                全部删除
              </button>
            </div>
          </Modal>
        )}
      </AnimatePresence>

      {/* ── 模态：提取到学习库 ── */}
      <AnimatePresence>
        {extractTarget && (
          <ExtractModal
            meta={extractTarget}
            onClose={() => setExtractTarget(null)}
            onDone={(log) => setExtractLogs((prev) => ({ ...prev, [log.corpusId]: log }))}
          />
        )}
      </AnimatePresence>
    </div>
  );
}

// ═══════════════════════════ 练习工作台 ═══════════════════════════

/** 练习工作台：根据语料类型分发到 音频 / 视频 / 阅读 三种模式 */
function Workbench({ meta, onBack }: { meta: CorpusMeta; onBack: () => void }) {
  const [url, setUrl] = useState<string | null>(null);
  const [error, setError] = useState(false);
  const km = KIND_META[meta.kind];

  // 加载 Blob → ObjectURL
  useEffect(() => {
    let objectUrl: string | null = null;
    let cancelled = false;
    getCorpusBlob(meta.id).then((blob) => {
      if (cancelled) return;
      if (!blob) { setError(true); return; }
      objectUrl = URL.createObjectURL(blob);
      setUrl(objectUrl);
    });
    return () => { cancelled = true; if (objectUrl) URL.revokeObjectURL(objectUrl); };
  }, [meta.id]);

  return (
    <div className="mx-auto max-w-content px-4 py-8 md:px-6">
      {/* 顶部返回栏 */}
      <motion.div
        initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3 }}
        className="mb-6 flex flex-wrap items-center gap-3"
      >
        <button
          onClick={onBack}
          className="flex items-center gap-1.5 rounded-full border border-warm bg-paper px-4 py-2 text-sm text-ink-secondary transition-colors hover:border-terracotta hover:text-terracotta"
        >
          <ArrowLeft size={15} /> 返回语料库
        </button>
        <h2 className="min-w-0 flex-1 truncate text-lg font-medium text-ink">{meta.name}</h2>
        <span className={cn('flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-medium', km.badge)}>
          <km.icon size={13} /> {km.label}
        </span>
      </motion.div>

      {error && (
        <div className="rounded-3xl border border-warm bg-paper p-10 text-center text-sm text-ink-secondary shadow-card">
          文件读取失败（可能已被清理）。请返回语料库重新上传。
        </div>
      )}
      {!url && !error && (
        <div className="rounded-3xl border border-warm bg-paper p-10 text-center text-sm text-ink-muted shadow-card">正在载入…</div>
      )}
      {url && meta.kind === 'audio' && <AudioPlayer meta={meta} url={url} />}
      {url && meta.kind === 'video' && <VideoPlayer meta={meta} url={url} />}
      {url && (meta.kind === 'pdf' || meta.kind === 'text') && <Reader meta={meta} url={url} />}
    </div>
  );
}

/** A-B 循环区间 */
interface ABRange { a: number; b: number }

/** 播放控制行（音频/视频共用） */
function ControlRow({ playing, onToggle, onSkip, rate, onRate, volume, onVolume }: {
  playing: boolean;
  onToggle: () => void;
  onSkip: (delta: number) => void;
  rate: number;
  onRate: (r: number) => void;
  volume: number;
  onVolume: (v: number) => void;
}) {
  return (
    <div className="flex flex-wrap items-center justify-center gap-x-5 gap-y-3">
      {/* ±5s 快退快进 */}
      <button onClick={() => onSkip(-5)} aria-label="后退 5 秒" className="rounded-full p-2.5 text-ink-secondary transition-colors hover:bg-sand hover:text-ink">
        <SkipBack size={20} />
      </button>
      <motion.button
        onClick={onToggle}
        whileTap={{ scale: 0.9 }}
        aria-label={playing ? '暂停' : '播放'}
        className="flex h-14 w-14 items-center justify-center rounded-full bg-terracotta text-paper shadow-lift transition-colors hover:bg-terracotta-deep"
      >
        {playing ? <Pause size={24} /> : <Play size={24} className="ml-0.5" />}
      </motion.button>
      <button onClick={() => onSkip(5)} aria-label="前进 5 秒" className="rounded-full p-2.5 text-ink-secondary transition-colors hover:bg-sand hover:text-ink">
        <SkipForward size={20} />
      </button>

      {/* 倍速档位 */}
      <div className="flex items-center gap-1 rounded-full bg-sand p-1">
        {RATES.map((r) => (
          <button
            key={r}
            onClick={() => onRate(r)}
            className={cn(
              'rounded-full px-2.5 py-1 text-xs font-medium transition-colors',
              rate === r ? 'bg-terracotta text-paper' : 'text-ink-secondary hover:text-ink',
            )}
          >
            {r}×
          </button>
        ))}
      </div>

      {/* 音量滑条（4px 暖褐轨道） */}
      <div className="flex items-center gap-2">
        <Volume2 size={16} className="text-ink-muted" />
        <input
          type="range" min={0} max={1} step={0.05} value={volume}
          onChange={(e) => onVolume(Number(e.target.value))}
          aria-label="音量"
          className="h-1 w-24 cursor-pointer appearance-none rounded-full bg-ink-muted/40 accent-terracotta"
        />
      </div>
    </div>
  );
}

/** A-B 控制条（音频/视频共用） */
function ABControls({ ab, onSetA, onSetB, onClear, loopCount, onLoopCount }: {
  ab: ABRange | null;
  onSetA: () => void; onSetB: () => void; onClear: () => void;
  loopCount: number; onLoopCount: (n: number) => void;
}) {
  return (
    <div className="flex flex-wrap items-center justify-center gap-2 text-sm">
      <span className="rounded-full bg-terracotta-soft px-4 py-1.5 font-mono text-xs font-medium text-terracotta-deep">
        {ab ? `A ${formatTime(ab.a)} — B ${formatTime(ab.b)}` : '未设置循环区间（可在波形上拖拽划定）'}
      </span>
      <button onClick={onSetA} className="rounded-full border border-warm bg-paper px-3 py-1.5 text-xs text-ink-secondary transition-colors hover:border-terracotta hover:text-terracotta">设置 A</button>
      <button onClick={onSetB} className="rounded-full border border-warm bg-paper px-3 py-1.5 text-xs text-ink-secondary transition-colors hover:border-terracotta hover:text-terracotta">设置 B</button>
      <button onClick={onClear} className="rounded-full border border-warm bg-paper px-3 py-1.5 text-xs text-ink-secondary transition-colors hover:border-terracotta hover:text-terracotta">清除循环</button>
      <label className="flex items-center gap-1.5 rounded-full border border-warm bg-paper px-3 py-1.5 text-xs text-ink-secondary">
        <Repeat size={12} />
        循环
        <select
          value={loopCount}
          onChange={(e) => onLoopCount(Number(e.target.value))}
          className="bg-transparent text-ink outline-none"
          aria-label="循环次数"
        >
          <option value={0}>∞</option>
          <option value={3}>3 次</option>
          <option value={5}>5 次</option>
        </select>
      </label>
    </div>
  );
}

/** 3a. 音频模式：WaveSurfer 波形 + 拖拽 A-B 循环 + 倍速 */
function AudioPlayer({ meta, url }: { meta: CorpusMeta; url: string }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const wsRef = useRef<WaveSurfer | null>(null);
  const regionsRef = useRef<RegionsPlugin | null>(null);
  const regionRef = useRef<Region | null>(null);
  const [ready, setReady] = useState(false);
  const [playing, setPlaying] = useState(false);
  const [rate, setRate] = useState(1);
  const [volume, setVolume] = useState(1);
  const [ab, setAb] = useState<ABRange | null>(null);
  const [loopCount, setLoopCount] = useState(0); // 0 = 无限
  const loopsLeftRef = useRef(0); // 剩余循环次数（0 表示无限）
  const abRef = useRef<ABRange | null>(null);
  // 同步最新 A-B 区间到 ref，供 timeupdate 回调读取（避免闭包过期）
  useEffect(() => { abRef.current = ab; }, [ab]);

  // 初始化 WaveSurfer
  useEffect(() => {
    if (!containerRef.current) return;
    const isMobile = window.innerWidth < 768;
    const ws = WaveSurfer.create({
      container: containerRef.current,
      url,
      // 上传时预算的 peaks 秒渲染；没有则实时解码
      peaks: meta.peaks ? [meta.peaks] : undefined,
      duration: meta.duration,
      height: isMobile ? 64 : 96,
      waveColor: '#A79C90',       // 未播放部分暖灰褐
      progressColor: '#C96F4A',   // 已播放部分赤陶橘
      cursorColor: '#2E2A26',     // 游标竖线墨褐
      cursorWidth: 2,
      barWidth: 2,
      barGap: 1.5,
      barRadius: 2,
      normalize: true,
    });
    wsRef.current = ws;

    // A-B 拖拽选区插件
    const regions = ws.registerPlugin(RegionsPlugin.create());
    regionsRef.current = regions;
    regions.enableDragSelection({ color: 'rgba(244, 221, 208, 0.55)' });
    regions.on('region-created', (region) => {
      // 只保留一个选区
      if (regionRef.current && regionRef.current !== region) regionRef.current.remove();
      regionRef.current = region;
      setAb({ a: region.start, b: region.end });
    });
    regions.on('region-updated', (region) => {
      setAb({ a: region.start, b: region.end });
    });
    regions.on('region-removed', () => { regionRef.current = null; });

    ws.on('ready', () => setReady(true));
    ws.on('play', () => setPlaying(true));
    ws.on('pause', () => setPlaying(false));
    ws.on('finish', () => setPlaying(false));
    // A-B 循环判定：播放到 B 点自动跳回 A
    ws.on('timeupdate', (t) => {
      const range = abRef.current;
      if (!range || !ws.isPlaying()) return;
      if (t >= range.b || t < range.a - 1) {
        if (loopsLeftRef.current > 0) loopsLeftRef.current -= 1;
        if (loopsLeftRef.current === -1) {
          // 有限循环已用完：停在 B 点
          ws.pause();
          return;
        }
        ws.setTime(range.a);
      }
    });

    return () => { ws.destroy(); wsRef.current = null; };
  }, [url, meta.peaks, meta.duration]);

  /** 同步选区到波形上的 Region 显示 */
  const syncRegion = useCallback((range: ABRange) => {
    const regions = regionsRef.current;
    if (!regions) return;
    if (regionRef.current) regionRef.current.remove();
    regionRef.current = regions.addRegion({
      start: range.a, end: range.b,
      color: 'rgba(244, 221, 208, 0.55)',
      drag: true, resize: true,
    });
  }, []);

  const setPoint = useCallback((which: 'a' | 'b') => {
    const ws = wsRef.current;
    if (!ws) return;
    const cur = ws.getCurrentTime();
    const dur = ws.getDuration();
    const prev = abRef.current;
    let next: ABRange;
    if (which === 'a') {
      next = { a: cur, b: prev && prev.b > cur ? prev.b : Math.min(dur, cur + 5) };
    } else {
      next = { a: prev && prev.a < cur ? prev.a : Math.max(0, cur - 5), b: cur };
    }
    setAb(next);
    loopsLeftRef.current = loopCount === 0 ? -1 : loopCount; // -1 表示无限循环
    syncRegion(next);
  }, [loopCount, syncRegion]);

  const clearLoop = useCallback(() => {
    setAb(null);
    loopsLeftRef.current = 0;
    regionRef.current?.remove();
    regionRef.current = null;
  }, []);

  const changeLoopCount = useCallback((n: number) => {
    setLoopCount(n);
    loopsLeftRef.current = n;
  }, []);

  return (
    <motion.div
      initial={{ opacity: 0, y: 32 }} animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, ease: [0.22, 1, 0.36, 1] }}
      className="rounded-3xl border border-warm bg-paper p-5 shadow-card md:p-8"
    >
      {/* 波形可视化区（点击跳转） */}
      <div ref={containerRef} className="w-full cursor-pointer" />
      {!ready && <p className="py-4 text-center text-xs text-ink-muted">波形加载中…</p>}

      {/* A-B 循环控制 */}
      <div className="mt-5">
        <ABControls
          ab={ab}
          onSetA={() => setPoint('a')}
          onSetB={() => setPoint('b')}
          onClear={clearLoop}
          loopCount={loopCount}
          onLoopCount={changeLoopCount}
        />
      </div>

      {/* 播放控制行 */}
      <div className="mt-6 border-t border-warm pt-6">
        <ControlRow
          playing={playing}
          onToggle={() => void wsRef.current?.playPause()}
          onSkip={(d) => wsRef.current?.skip(d)}
          rate={rate}
          onRate={(r) => { setRate(r); wsRef.current?.setPlaybackRate(r); }}
          volume={volume}
          onVolume={(v) => { setVolume(v); void wsRef.current?.setVolume(v); }}
        />
      </div>
    </motion.div>
  );
}

/** 3b. 视频模式：16:9 播放器 + 自定义控制条 + A-B 循环 + 迷你波形辅助定位 */
function VideoPlayer({ meta, url }: { meta: CorpusMeta; url: string }) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [playing, setPlaying] = useState(false);
  const [rate, setRate] = useState(1);
  const [volume, setVolume] = useState(1);
  const [progress, setProgress] = useState(0);
  const [ab, setAb] = useState<ABRange | null>(null);
  const [loopCount, setLoopCount] = useState(0);
  const loopsLeftRef = useRef(0);
  const abRef = useRef<ABRange | null>(null);
  // 同步最新 A-B 区间到 ref，供 timeupdate 回调读取（避免闭包过期）
  useEffect(() => { abRef.current = ab; }, [ab]);

  // timeupdate：进度 + A-B 循环判定
  const handleTimeUpdate = useCallback(() => {
    const v = videoRef.current;
    if (!v) return;
    setProgress(v.duration ? v.currentTime / v.duration : 0);
    const range = abRef.current;
    if (range && !v.paused && v.currentTime >= range.b) {
      if (loopsLeftRef.current > 0) {
        loopsLeftRef.current -= 1;
        if (loopsLeftRef.current === 0) { v.pause(); v.currentTime = range.a; return; }
      }
      v.currentTime = range.a;
    }
  }, []);

  const setPoint = useCallback((which: 'a' | 'b') => {
    const v = videoRef.current;
    if (!v) return;
    const cur = v.currentTime;
    const dur = v.duration || 0;
    const prev = abRef.current;
    const next: ABRange = which === 'a'
      ? { a: cur, b: prev && prev.b > cur ? prev.b : Math.min(dur, cur + 5) }
      : { a: prev && prev.a < cur ? prev.a : Math.max(0, cur - 5), b: cur };
    setAb(next);
    loopsLeftRef.current = loopCount === 0 ? -1 : loopCount; // -1 表示无限循环
  }, [loopCount]);

  return (
    <motion.div
      initial={{ opacity: 0, y: 32 }} animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, ease: [0.22, 1, 0.36, 1] }}
      className="rounded-3xl border border-warm bg-paper p-5 shadow-card md:p-8"
    >
      {/* 16:9 播放器 */}
      <div className="overflow-hidden rounded-2xl bg-ink">
        <video
          ref={videoRef}
          src={url}
          playsInline
          className="aspect-video w-full"
          onPlay={() => setPlaying(true)}
          onPause={() => setPlaying(false)}
          onEnded={() => setPlaying(false)}
          onTimeUpdate={handleTimeUpdate}
        />
      </div>

      {/* 迷你波形（音频轨）辅助定位 */}
      {meta.peaks && (
        <div className="mt-4">
          <MiniWaveform
            peaks={meta.peaks.slice(0, 160)}
            progress={progress}
            onSeek={(ratio) => {
              const v = videoRef.current;
              if (v && v.duration) v.currentTime = ratio * v.duration;
            }}
          />
        </div>
      )}

      <div className="mt-5">
        <ABControls
          ab={ab}
          onSetA={() => setPoint('a')}
          onSetB={() => setPoint('b')}
          onClear={() => setAb(null)}
          loopCount={loopCount}
          onLoopCount={(n) => { setLoopCount(n); loopsLeftRef.current = n === 0 ? -1 : n; }}
        />
      </div>

      <div className="mt-6 border-t border-warm pt-6">
        <ControlRow
          playing={playing}
          onToggle={() => {
            const v = videoRef.current;
            if (!v) return;
            if (v.paused) void v.play(); else v.pause();
          }}
          onSkip={(d) => { const v = videoRef.current; if (v) v.currentTime = Math.max(0, v.currentTime + d); }}
          rate={rate}
          onRate={(r) => { setRate(r); if (videoRef.current) videoRef.current.playbackRate = r; }}
          volume={volume}
          onVolume={(vol) => { setVolume(vol); if (videoRef.current) videoRef.current.volume = vol; }}
        />
      </div>
    </motion.div>
  );
}

// ═══════════════════════════ 3c. 阅读模式（划词翻译核心场景） ═══════════════════════════

/** 翻译气泡状态 */
interface BubbleState {
  /** 视口坐标（默认选区上方居中，below 时在下方） */
  x: number;
  y: number;
  /** 是否显示在选区下方（靠近视口顶部时翻转） */
  below?: boolean;
  /** 选中的原文 */
  text: string;
  /** 词典命中结果 */
  entry: DictEntry | null;
  /** 选区所在的整句（用于「加入发音练习」） */
  sentence: string;
  /** 该词是否已在生词本/单词学习库（置灰防重复） */
  inVocab: boolean;
  /** 该句是否已在发音练习库（置灰防重复） */
  inPron: boolean;
}

/** 气泡操作行的小号描边 pill 按钮（移动端显示缩写文案；已加入则橄榄绿置灰） */
function BubbleAction({ icon, label, shortLabel, doneLabel, done, onClick }: {
  icon: React.ReactNode;
  label: string;
  shortLabel: string;
  doneLabel: string;
  done: boolean;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      disabled={done}
      title={done ? doneLabel : label}
      className={cn(
        'flex flex-col items-center justify-center gap-1 rounded-lg border px-1 py-2 text-[11px] font-medium transition-colors duration-100',
        done
          ? 'cursor-default border-olive/40 bg-olive/10 text-olive'
          : 'border-warm bg-paper text-ink-secondary hover:border-terracotta hover:text-terracotta',
      )}
    >
      {done ? <Check size={13} /> : icon}
      <span className="hidden sm:inline">{done ? doneLabel : label}</span>
      <span className="sm:hidden">{done ? doneLabel : shortLabel}</span>
    </button>
  );
}

/** 文本分页大小（约 1200 字/页，按段落边界切分） */
function paginateText(text: string, pageSize = 1200): string[] {
  const paragraphs = text.split(/\n+/).filter((p) => p.trim());
  const pages: string[] = [];
  let current = '';
  for (const p of paragraphs) {
    if (current.length + p.length > pageSize && current) {
      pages.push(current);
      current = '';
    }
    current += (current ? '\n\n' : '') + p;
  }
  if (current) pages.push(current);
  return pages.length ? pages : ['（文件为空）'];
}

/** PDF / 文本「书页」阅读器 + 划词翻译气泡 + 阅读工具条 */
function Reader({ meta, url }: { meta: CorpusMeta; url: string }) {
  const [pages, setPages] = useState<string[] | null>(null);
  const [pageIdx, setPageIdx] = useState(0);
  const [bubble, setBubble] = useState<BubbleState | null>(null);
  const [fontSize, setFontSize] = useState(18);
  const [loose, setLoose] = useState(true); // 行距：true=2.0 false=1.8
  const [reading, setReading] = useState(false);
  const pageRef = useRef<HTMLDivElement>(null);

  // 加载并提取文本（PDF 用 pdf.js 逐页提取；文本文件直接读取分页）
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        if (meta.kind === 'pdf') {
          const doc = await pdfjsLib.getDocument({ url }).promise;
          const result: string[] = [];
          for (let i = 1; i <= doc.numPages; i++) {
            const page = await doc.getPage(i);
            const content = await page.getTextContent();
            // 拼接文本层：hasEOL 处换行，其余空格连接
            let text = '';
            for (const item of content.items) {
              if ('str' in item) text += item.str + (item.hasEOL ? '\n' : ' ');
            }
            result.push(text.trim() || '（本页无可提取文本，可能为扫描图片）');
          }
          await doc.destroy();
          if (!cancelled) setPages(result);
        } else {
          const res = await fetch(url);
          const text = await res.text();
          if (!cancelled) setPages(paginateText(text));
        }
      } catch {
        if (!cancelled) setPages(['文本提取失败：文件可能已损坏或受加密保护。']);
      }
    })();
    return () => { cancelled = true; };
  }, [meta.kind, url]);

  /** 划词处理：读取当前选区 → 查词 → 定位气泡（同时判定是否已入学习库） */
  const handleSelection = useCallback(() => {
    // 延迟一拍，等待浏览器完成选区更新（iOS 长按）
    setTimeout(() => {
      const sel = window.getSelection();
      if (!sel || sel.isCollapsed || !pageRef.current || !pages) return;
      const raw = normalizeQuery(sel.toString());
      // 只在书页内、含韩文、长度合理时弹气泡
      if (!raw || raw.length > 40 || !containsHangul(raw)) return;
      const anchor = sel.anchorNode;
      if (!anchor || !pageRef.current.contains(anchor)) return;
      const rect = sel.getRangeAt(0).getBoundingClientRect();
      if (!rect.width) return;
      // 气泡宽度弹性：不超过视口宽度减 16px 安全边距
      const bubbleWidth = Math.min(280, window.innerWidth - 16);
      // 左右钳制 8px 防溢出
      const x = Math.min(
        window.innerWidth - bubbleWidth / 2 - 8,
        Math.max(bubbleWidth / 2 + 8, rect.left + rect.width / 2),
      );
      // 靠近视口顶部时翻到选区下方，避免被裁切
      const flipBelow = rect.top < 170;
      const entry = lookupWord(raw);
      const wordKo = entry?.ko ?? raw;
      // 取选区所在整句（用于「加入发音练习」）
      const sentence = extractSentenceAround(pages[pageIdx] ?? '', raw);
      const inVocab = readStorage<VocabEntry[]>(STORAGE_KEYS.VOCAB_BOOK, []).some((v) => v.ko === wordKo);
      const inPron = readPronCustom().some((s) => s.ko === sentence);
      setBubble({ x, y: flipBelow ? rect.bottom : rect.top, below: flipBelow, text: raw, entry, sentence, inVocab, inPron });
    }, 10);
  }, [pages, pageIdx]);

  // 点击空白处 / Esc 关闭气泡
  useEffect(() => {
    if (!bubble) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setBubble(null); };
    const onDown = (e: MouseEvent) => {
      if (!(e.target as HTMLElement).closest('[data-dict-bubble]')) setBubble(null);
    };
    window.addEventListener('keydown', onKey);
    window.addEventListener('mousedown', onDown);
    return () => {
      window.removeEventListener('keydown', onKey);
      window.removeEventListener('mousedown', onDown);
    };
  }, [bubble]);

  /** 全文（当前页）朗读 */
  const readPage = useCallback(() => {
    if (!pages) return;
    if (reading) {
      window.speechSynthesis.cancel();
      setReading(false);
      return;
    }
    const ok = speakKorean(pages[pageIdx], {
      rate: 1,
      onEnd: () => setReading(false),
    });
    if (ok) setReading(true);
    else showToast('当前浏览器不支持语音合成');
  }, [pages, pageIdx, reading]);

  // 停止朗读当翻页/卸载
  useEffect(() => () => { if (isTtsSupported()) window.speechSynthesis.cancel(); }, []);

  if (!pages) {
    return <div className="rounded-3xl border border-warm bg-paper p-10 text-center text-sm text-ink-muted shadow-card">正在提取文本…</div>;
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 32 }} animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, ease: [0.22, 1, 0.36, 1] }}
    >
      {/* 书页卡片（760px 居中，可划词） */}
      <div className="mx-auto max-w-[760px]">
        <div
          ref={pageRef}
          onMouseUp={handleSelection}
          onTouchEnd={handleSelection}
          className="rounded-3xl border border-warm bg-paper p-8 shadow-card md:p-12"
        >
          <p
            className="font-kr whitespace-pre-wrap text-ink"
            style={{ fontSize, lineHeight: loose ? 2.0 : 1.8 }}
          >
            {pages[pageIdx]}
          </p>
        </div>

        {/* 分页导航 */}
        <div className="mt-4 flex items-center justify-center gap-4">
          <button
            disabled={pageIdx === 0}
            onClick={() => { setPageIdx((i) => Math.max(0, i - 1)); setBubble(null); if (reading) readPage(); }}
            aria-label="上一页"
            className="rounded-full border border-warm bg-paper p-2 text-ink-secondary transition-colors enabled:hover:border-terracotta enabled:hover:text-terracotta disabled:opacity-40"
          >
            <ChevronLeft size={18} />
          </button>
          <span className="font-mono text-sm text-ink-secondary">‹ {pageIdx + 1} / {pages.length} ›</span>
          <button
            disabled={pageIdx >= pages.length - 1}
            onClick={() => { setPageIdx((i) => Math.min(pages.length - 1, i + 1)); setBubble(null); if (reading) readPage(); }}
            aria-label="下一页"
            className="rounded-full border border-warm bg-paper p-2 text-ink-secondary transition-colors enabled:hover:border-terracotta enabled:hover:text-terracotta disabled:opacity-40"
          >
            <ChevronRight size={18} />
          </button>
        </div>
      </div>

      {/* 阅读工具条（粘性底部） */}
      <div className="sticky bottom-20 z-30 mx-auto mt-6 flex w-fit flex-wrap items-center gap-2 rounded-full border border-warm bg-paper/95 px-4 py-2 shadow-lift backdrop-blur lg:bottom-6">
        <button
          onClick={() => setFontSize((s) => Math.max(14, s - 2))}
          aria-label="减小字号"
          className="flex items-center gap-1 rounded-full px-3 py-1.5 text-sm text-ink-secondary hover:bg-sand"
        >
          <ALargeSmall size={14} /> A-
        </button>
        <button
          onClick={() => setFontSize((s) => Math.min(26, s + 2))}
          aria-label="增大字号"
          className="flex items-center gap-1 rounded-full px-3 py-1.5 text-sm text-ink-secondary hover:bg-sand"
        >
          <ALargeSmall size={16} /> A+
        </button>
        <button
          onClick={() => setLoose((v) => !v)}
          aria-label="切换行距"
          className="flex items-center gap-1 rounded-full px-3 py-1.5 text-sm text-ink-secondary hover:bg-sand"
        >
          <Rows3 size={14} /> {loose ? '宽松' : '紧凑'}
        </button>
        <button
          onClick={readPage}
          className={cn(
            'flex items-center gap-1.5 rounded-full px-4 py-1.5 text-sm font-medium transition-colors',
            reading ? 'bg-terracotta text-paper' : 'bg-sand text-ink-secondary hover:text-ink',
          )}
        >
          <BookOpenText size={14} /> {reading ? '停止朗读' : '全文朗读'}
        </button>
      </div>

      {/* 划词翻译气泡 */}
      <AnimatePresence>
        {bubble && (
          <motion.div
            data-dict-bubble
            initial={{ opacity: 0, scale: 0.85, y: 6 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.9 }}
            transition={{ duration: 0.18, ease: [0.22, 1, 0.36, 1] }}
            className={cn(
              'fixed z-[80] w-[min(280px,calc(100vw-16px))] -translate-x-1/2 rounded-xl border border-warm bg-paper p-4 shadow-lift',
              bubble.below ? 'translate-y-0' : '-translate-y-full',
            )}
            style={{ left: bubble.x, top: bubble.below ? bubble.y + 10 : bubble.y - 10 }}
          >
            {/* 小三角指向选区（下方显示时翻转到上边缘） */}
            <span
              className={cn(
                'absolute left-1/2 h-3 w-3 -translate-x-1/2 rotate-45 border-warm bg-paper',
                bubble.below ? '-top-1.5 border-l border-t' : '-bottom-1.5 border-b border-r',
              )}
            />
            {bubble.entry ? (
              <div className="flex items-start gap-3">
                <div className="min-w-0 flex-1">
                  <p className="font-kr text-xl font-semibold text-ink">{bubble.entry.ko}</p>
                  <p className="mt-0.5 text-xs text-ink-muted">{bubble.entry.rom} · {bubble.entry.pos}</p>
                  <p className="mt-1.5 text-sm text-ink-secondary">{bubble.entry.zh}</p>
                </div>
                <SpeakButton text={bubble.entry.ko} size="sm" />
              </div>
            ) : (
              <div>
                <p className="font-kr text-base text-ink">{bubble.text}</p>
                <p className="mt-1 text-xs text-ink-muted">本地词典未收录</p>
                <button
                  onClick={() => speakKorean(bubble.text) || showToast('当前浏览器不支持语音合成')}
                  className="mt-2 text-xs font-medium text-terracotta hover:underline"
                >
                  试试整句 TTS 朗读
                </button>
              </div>
            )}
            {/* 操作行：加入生词本 / 加入单词学习 / 加入发音练习（点击不关闭气泡） */}
            <div className="mt-3 grid grid-cols-3 gap-1.5 border-t border-warm pt-3">
              <BubbleAction
                icon={<Star size={13} />}
                label="加入生词本"
                shortLabel="生词本"
                doneLabel="已在库"
                done={bubble.inVocab}
                onClick={() => {
                  const added = addToVocabBook({
                    ko: bubble.entry?.ko ?? bubble.text,
                    rom: bubble.entry?.rom ?? '',
                    zh: bubble.entry?.zh ?? '（本地词典未收录）',
                    pos: bubble.entry?.pos ?? `语料·${meta.name}`,
                  });
                  showToast(added ? '已加入生词本' : '生词本中已有该词');
                  setBubble((b) => (b ? { ...b, inVocab: true } : b));
                }}
              />
              <BubbleAction
                icon={<BookPlus size={13} />}
                label="加入单词学习"
                shortLabel="学单词"
                doneLabel="已在库"
                done={bubble.inVocab}
                onClick={() => {
                  const added = addToVocabBook({
                    ko: bubble.entry?.ko ?? bubble.text,
                    rom: bubble.entry?.rom ?? '',
                    // 词典未收录时释义留空，待用户在学习页补全
                    zh: bubble.entry?.zh ?? '',
                    pos: bubble.entry?.pos ?? `语料·${meta.name}`,
                  });
                  showToast(added ? '已加入单词学习' : '单词学习库中已有该词');
                  setBubble((b) => (b ? { ...b, inVocab: true } : b));
                }}
              />
              <BubbleAction
                icon={<Mic size={13} />}
                label="加入发音练习"
                shortLabel="练发音"
                doneLabel="已在练习库"
                done={bubble.inPron}
                onClick={() => {
                  const added = addToPronCustom(bubble.sentence);
                  showToast(added ? '已加入发音练习' : '练习库中已有该句');
                  setBubble((b) => (b ? { ...b, inPron: true } : b));
                }}
              />
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}
