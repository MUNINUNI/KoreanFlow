/**
 * storage.ts — localStorage 读写封装
 * 用途：统一键名、JSON 序列化、异常容错。本地优先，写库后顺带静默同步云端。
 */
import { syncStatsDelta } from './sync';

/** localStorage 键名常量（集中定义，避免散落硬编码） */
export const STORAGE_KEYS = {
  /** 生词本（收藏的词/句） */
  VOCAB_BOOK: 'hjy:vocab-book',
  /** 学习统计（连续天数 / 已学单词数 / 今日进度） */
  STATS: 'hjy:stats',
  /** 40音掌握度：字母 → 是否已掌握 */
  HANGUL_PROGRESS: 'hjy:hangul-progress',
  /** 用户设置（深色模式、语速偏好等） */
  SETTINGS: 'hjy:settings',
  /** 每日一句收藏 */
  FAVORITE_SENTENCES: 'hjy:favorite-sentences',
} as const;

/** 读取 JSON 数据；不存在或解析失败时返回 fallback */
export function readStorage<T>(key: string, fallback: T): T {
  try {
    const raw = window.localStorage.getItem(key);
    if (raw === null) return fallback;
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

/** 写入 JSON 数据；写入失败（如隐私模式）静默忽略 */
export function writeStorage<T>(key: string, value: T): void {
  try {
    window.localStorage.setItem(key, JSON.stringify(value));
  } catch {
    /* 存储不可用时静默降级 */
  }
}

/** 删除指定键 */
export function removeStorage(key: string): void {
  try {
    window.localStorage.removeItem(key);
  } catch {
    /* ignore */
  }
}

/** 学习统计数据结构（首页 StatChip 使用） */
export interface StudyStats {
  /** 连续学习天数 */
  streakDays: number;
  /** 已学单词总数 */
  wordsLearned: number;
  /** 今日已学句数 */
  todayDone: number;
  /** 今日目标句数 */
  todayGoal: number;
  /** 40音掌握百分比 0-100 */
  hangulPercent: number;
}

export const DEFAULT_STATS: StudyStats = {
  streakDays: 0,
  wordsLearned: 0,
  todayDone: 0,
  todayGoal: 5,
  hangulPercent: 0,
};

/** 读取学习统计（带默认值） */
export function getStats(): StudyStats {
  return readStorage<StudyStats>(STORAGE_KEYS.STATS, DEFAULT_STATS);
}

/** 更新学习统计（部分更新）；成功后把增量静默同步到云端 */
export function updateStats(patch: Partial<StudyStats>): StudyStats {
  const prev = getStats();
  const next = { ...prev, ...patch };
  writeStorage(STORAGE_KEYS.STATS, next);

  // 计算增量并同步：wordsLearned→words、sentencesLearned→sentences（字段存在于 patch 中才上报）、streakDays 直传当前值
  const delta: { words?: number; sentences?: number; streakDays?: number } = {};
  if (patch.wordsLearned !== undefined) {
    const d = next.wordsLearned - prev.wordsLearned;
    if (d > 0) delta.words = d;
  }
  if (patch.todayDone !== undefined) {
    const d = next.todayDone - prev.todayDone;
    if (d > 0) delta.sentences = d;
  }
  if (patch.streakDays !== undefined) delta.streakDays = next.streakDays;
  if (delta.words !== undefined || delta.sentences !== undefined || delta.streakDays !== undefined) {
    syncStatsDelta(delta);
  }
  return next;
}
