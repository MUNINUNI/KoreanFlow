/**
 * studyTime.ts — 学习时长统计
 * 页面可见时计时（visibilitychange 暂停）；每累计 60 秒或页面隐藏时，
 * 把秒数累加进 localStorage `hjy:study-time`，并调用 syncSession 静默上报云端。
 * 本地优先，离线 / 后端不可达时仅落本地。
 */
import { readStorage, writeStorage } from './storage';
import { syncSession } from './sync';

/** localStorage 键名：学习时长（按天聚合 + 累计） */
export const STUDY_TIME_KEY = 'hjy:study-time';

/** 学习时长数据结构 */
export interface StudyTimeData {
  /** 按天聚合：{ '2026-08-17': 秒数 } */
  byDay: Record<string, number>;
  /** 累计总秒数 */
  total: number;
}

/** 读取学习时长（无数据时返回空结构） */
export function getStudyTime(): StudyTimeData {
  const data = readStorage<StudyTimeData>(STUDY_TIME_KEY, { byDay: {}, total: 0 });
  return {
    byDay: data.byDay && typeof data.byDay === 'object' ? data.byDay : {},
    total: typeof data.total === 'number' ? data.total : 0,
  };
}

/** 本地日期键 YYYY-MM-DD */
function dayKey(d = new Date()): string {
  const m = `${d.getMonth() + 1}`.padStart(2, '0');
  const day = `${d.getDate()}`.padStart(2, '0');
  return `${d.getFullYear()}-${m}-${day}`;
}

/** 把秒数累加进本地存储并上报云端 */
function flush(seconds: number, page: string): void {
  if (seconds < 1) return;
  const data = getStudyTime();
  const key = dayKey();
  data.byDay[key] = (data.byDay[key] ?? 0) + seconds;
  data.total += seconds;
  writeStorage(STUDY_TIME_KEY, data);
  syncSession(seconds, page);
}

/**
 * 启动学习计时器（Layout 按 pathname 调用，路由变化时重启）。
 * @param page 当前页面路径（上报云端时作为会话来源）
 * @returns 停止函数：停止计时并把未落库的零头秒数一并落库 + 上报。
 */
export function startStudyTimer(page: string): () => void {
  let pending = 0; // 尚未落库的秒数
  let lastTick = Date.now();
  let visible = typeof document === 'undefined' || document.visibilityState === 'visible';

  /** 结算自上次心跳以来经过的秒数（仅在页面可见时累计） */
  const accrue = () => {
    const now = Date.now();
    if (visible) pending += (now - lastTick) / 1000;
    lastTick = now;
  };

  // 页面隐藏时暂停并落库，可见时恢复计时
  const onVisibility = () => {
    if (document.visibilityState === 'hidden') {
      accrue();
      visible = false;
      flush(Math.floor(pending), page);
      pending = 0;
    } else {
      visible = true;
      lastTick = Date.now();
    }
  };

  // 每秒心跳：可见时累计，满 60 秒落库 + 上报
  const timer = window.setInterval(() => {
    accrue();
    if (pending >= 60) {
      flush(Math.floor(pending), page);
      pending -= Math.floor(pending);
    }
  }, 1000);

  document.addEventListener('visibilitychange', onVisibility);

  return () => {
    window.clearInterval(timer);
    document.removeEventListener('visibilitychange', onVisibility);
    accrue();
    flush(Math.floor(pending), page);
  };
}
