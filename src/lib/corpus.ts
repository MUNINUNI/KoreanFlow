/**
 * corpus.ts — 语料中心数据层：IndexedDB（idb）封装 + 上传元信息提取
 * 用途：文件 Blob 存 store `corpus-files`，元信息存 store `corpus-meta`；
 * 另提供音频 peaks 预计算、媒体时长/页数/字数提取、存储用量统计、数据导出。
 */
import { openDB, type IDBPDatabase } from 'idb';

/** 语料类型 */
export type CorpusKind = 'audio' | 'video' | 'pdf' | 'text';

/** 语料元信息（存 IndexedDB `corpus-meta`，并镜像 localStorage 便于快速统计） */
export interface CorpusMeta {
  id: string;
  /** 文件名 */
  name: string;
  kind: CorpusKind;
  /** MIME 类型 */
  mime: string;
  /** 字节大小 */
  size: number;
  /** 添加时间戳 */
  createdAt: number;
  /** 媒体时长（秒，音视频） */
  duration?: number;
  /** PDF 页数 */
  pageCount?: number;
  /** 文本字数 */
  wordCount?: number;
  /** 上传时预计算的波形 peaks（0-1 归一化，仅音频/小文件） */
  peaks?: number[];
}

const DB_NAME = 'hjy-corpus';
const DB_VERSION = 1;
const STORE_FILES = 'corpus-files';
const STORE_META = 'corpus-meta';

/** 打开（并按需创建）语料数据库 */
function getDB(): Promise<IDBPDatabase> {
  return openDB(DB_NAME, DB_VERSION, {
    upgrade(db) {
      if (!db.objectStoreNames.contains(STORE_FILES)) db.createObjectStore(STORE_FILES);
      if (!db.objectStoreNames.contains(STORE_META)) db.createObjectStore(STORE_META);
    },
  });
}

/** 生成唯一 ID */
export function genId(): string {
  return `c-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

/** 根据文件名/MIME 判断语料类型；不支持时返回 null */
export function detectKind(file: File): CorpusKind | null {
  const ext = (file.name.split('.').pop() || '').toLowerCase();
  if (file.type.startsWith('audio/') || ['mp3', 'm4a', 'wav', 'aac', 'ogg', 'flac'].includes(ext)) return 'audio';
  if (file.type.startsWith('video/') || ['mp4', 'webm', 'mov', 'mkv'].includes(ext)) return 'video';
  if (file.type === 'application/pdf' || ext === 'pdf') return 'pdf';
  if (file.type.startsWith('text/') || ['txt', 'md', 'srt'].includes(ext)) return 'text';
  return null;
}

/** 保存语料：Blob 与元信息写入 IndexedDB */
export async function saveCorpusFile(id: string, blob: Blob, meta: CorpusMeta): Promise<void> {
  const db = await getDB();
  const tx = db.transaction([STORE_FILES, STORE_META], 'readwrite');
  await tx.objectStore(STORE_FILES).put(blob, id);
  await tx.objectStore(STORE_META).put(meta, id);
  await tx.done;
}

/** 读取语料 Blob */
export async function getCorpusBlob(id: string): Promise<Blob | undefined> {
  const db = await getDB();
  return (await db.get(STORE_FILES, id)) as Blob | undefined;
}

/** 读取全部元信息（按添加时间倒序） */
export async function listCorpusMeta(): Promise<CorpusMeta[]> {
  const db = await getDB();
  const all = (await db.getAll(STORE_META)) as CorpusMeta[];
  return all.sort((a, b) => b.createdAt - a.createdAt);
}

/** 更新元信息（如重命名） */
export async function updateCorpusMeta(meta: CorpusMeta): Promise<void> {
  const db = await getDB();
  await db.put(STORE_META, meta, meta.id);
}

/** 删除语料（Blob + 元信息） */
export async function deleteCorpus(id: string): Promise<void> {
  const db = await getDB();
  const tx = db.transaction([STORE_FILES, STORE_META], 'readwrite');
  await tx.objectStore(STORE_FILES).delete(id);
  await tx.objectStore(STORE_META).delete(id);
  await tx.done;
}

/** 清空全部语料 */
export async function clearCorpus(): Promise<void> {
  const db = await getDB();
  const tx = db.transaction([STORE_FILES, STORE_META], 'readwrite');
  await tx.objectStore(STORE_FILES).clear();
  await tx.objectStore(STORE_META).clear();
  await tx.done;
}

/** 估算 IndexedDB 已用字节：优先 navigator.storage.estimate，失败则累加元信息 size */
export async function estimateUsage(items: CorpusMeta[]): Promise<number> {
  try {
    if (navigator.storage?.estimate) {
      const est = await navigator.storage.estimate();
      if (typeof est.usage === 'number' && est.usage > 0) return est.usage;
    }
  } catch {
    /* 部分浏览器不支持，走降级 */
  }
  return items.reduce((sum, m) => sum + (m.size || 0), 0);
}

/** 字节数 → 人类可读字符串 */
export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
  return `${(bytes / 1024 / 1024 / 1024).toFixed(2)} GB`;
}

/** 秒 → mm:ss.s 格式 */
export function formatTime(sec: number): string {
  if (!Number.isFinite(sec)) return '00:00';
  const m = Math.floor(sec / 60);
  const s = sec - m * 60;
  return `${String(m).padStart(2, '0')}:${s.toFixed(1).padStart(4, '0')}`;
}

/**
 * 从音频/视频 Blob 提取时长（秒）。
 * 通过临时 <audio>/<video> 元素加载元数据获取。
 */
export function probeDuration(blob: Blob, kind: 'audio' | 'video'): Promise<number | undefined> {
  return new Promise((resolve) => {
    const url = URL.createObjectURL(blob);
    const el = document.createElement(kind === 'audio' ? 'audio' : 'video');
    el.preload = 'metadata';
    el.onloadedmetadata = () => {
      URL.revokeObjectURL(url);
      resolve(Number.isFinite(el.duration) ? el.duration : undefined);
    };
    el.onerror = () => {
      URL.revokeObjectURL(url);
      resolve(undefined);
    };
    el.src = url;
  });
}

/**
 * 预计算波形 peaks（0-1 归一化）。解码失败或超大文件时返回 undefined（降级实时解码）。
 * @param blob 音频 Blob
 * @param bars 目标柱数
 */
export async function computePeaks(blob: Blob, bars = 200): Promise<number[] | undefined> {
  // 大文件（>50MB）降级：不做上传时解码
  if (blob.size > 50 * 1024 * 1024) return undefined;
  try {
    const Ctx = window.AudioContext || (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Ctx) return undefined;
    const ctx = new Ctx();
    const buf = await ctx.decodeAudioData(await blob.arrayBuffer());
    const data = buf.getChannelData(0);
    const block = Math.max(1, Math.floor(data.length / bars));
    const peaks: number[] = [];
    for (let i = 0; i < bars; i++) {
      let max = 0;
      const start = i * block;
      for (let j = start; j < Math.min(start + block, data.length); j += 16) {
        const v = Math.abs(data[j]);
        if (v > max) max = v;
      }
      peaks.push(max);
    }
    await ctx.close();
    const peakMax = Math.max(...peaks, 0.001);
    return peaks.map((p) => p / peakMax);
  } catch {
    return undefined;
  }
}

/** 导出我的数据（JSON）：生词本、统计、进度、语料元信息（不含文件本体） */
export async function exportMyData(): Promise<void> {
  const meta = await listCorpusMeta();
  const payload: Record<string, unknown> = {
    exportedAt: new Date().toISOString(),
    app: '韩之语 HanJiYu',
    // peaks 体积大，导出时剔除
    corpusMeta: meta.map((m) => {
      const { peaks, ...rest } = m;
      void peaks;
      return rest;
    }),
    note: '语料文件本体（音频/视频/PDF）未包含在导出中，迁移后需重新上传。',
  };
  // 附带所有 hjy: 前缀的 localStorage 键（生词本/统计/设置等）
  const local: Record<string, unknown> = {};
  for (let i = 0; i < window.localStorage.length; i++) {
    const key = window.localStorage.key(i);
    if (key?.startsWith('hjy:')) {
      try {
        local[key] = JSON.parse(window.localStorage.getItem(key) || 'null');
      } catch {
        local[key] = window.localStorage.getItem(key);
      }
    }
  }
  payload.localStorage = local;

  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `hanjiyu-backup-${new Date().toISOString().slice(0, 10)}.json`;
  a.click();
  URL.revokeObjectURL(url);
}
