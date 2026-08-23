/**
 * sync.ts — 云端同步层（fire-and-forget）
 * 用途：在 localStorage 本地优先的前提下，把用户行为静默同步到后端 tRPC。
 * 所有函数内部 try/catch，离线 / 后端不可达时静默失败，前端照常工作。
 */
import { createTRPCClient, httpBatchLink } from '@trpc/client';
import superjson from 'superjson';
import type { AppRouter } from '../../api/router';

/** localStorage 设备 ID 键名 */
const DEVICE_ID_KEY = 'hjy:device-id';
/** localStorage 登录令牌键名（v2.3.0 账号系统） */
export const AUTH_TOKEN_KEY = 'hjy:auth-token';

/** 读取登录令牌（未登录返回 null） */
export function getAuthToken(): string | null {
  try {
    return window.localStorage.getItem(AUTH_TOKEN_KEY);
  } catch {
    return null;
  }
}

/** tRPC 请求头：已登录时携带 Bearer 令牌 */
function authHeaders(): Record<string, string> {
  const token = getAuthToken();
  return token ? { Authorization: `Bearer ${token}` } : {};
}

/** 获取（或首次生成）设备 ID：未登录阶段的身份键 */
export function getDeviceId(): string {
  try {
    let id = window.localStorage.getItem(DEVICE_ID_KEY);
    if (!id) {
      id = crypto.randomUUID();
      window.localStorage.setItem(DEVICE_ID_KEY, id);
    }
    return id;
  } catch {
    // localStorage 不可用（隐私模式等）时退化为临时 ID，仅本次会话有效
    return 'anonymous-device';
  }
}

/** 非 React 环境的 vanilla tRPC client（与 providers/trpc.tsx 同一后端地址） */
export const client = createTRPCClient<AppRouter>({
  links: [
    httpBatchLink({
      url: '/api/trpc',
      transformer: superjson,
      headers() {
        return authHeaders();
      },
      fetch(input, init) {
        return globalThis.fetch(input, { ...(init ?? {}), credentials: 'include' });
      },
    }),
  ],
});

/** 首次访问 / 每次启动调用：云端建档并返回 用户+偏好+统计（页面代理可用返回值回填本地） */
export async function syncEnsureUser(nickname?: string) {
  try {
    return await client.user.ensure.mutate({ deviceId: getDeviceId(), nickname });
  } catch {
    return null;
  }
}

/** 同步学习偏好（复习节奏 / 音色 / 每日目标），patch 只传需要更新的字段 */
export function syncPrefs(patch: {
  reviewGroupSize?: number;
  voiceGender?: 'female' | 'male';
  voiceName?: string | null;
  dailyGoal?: number;
}): void {
  try {
    void client.user.updatePreferences.mutate({ deviceId: getDeviceId(), ...patch }).catch(() => {});
  } catch {
    /* 静默失败 */
  }
}

/** 同步学习统计增量（words=新增单词数，sentences=新增句子数，streakDays 直传当前值） */
export function syncStatsDelta(delta: {
  words?: number;
  sentences?: number;
  seconds?: number;
  streakDays?: number;
}): void {
  try {
    void client.stats.add.mutate({ deviceId: getDeviceId(), ...delta }).catch(() => {});
  } catch {
    /* 静默失败 */
  }
}

/** 上报一段学习时长会话（页面路径 + 秒数），由 studyTime.ts 定时/隐藏页面时调用 */
export function syncSession(seconds: number, page: string): void {
  if (seconds < 1) return;
  try {
    void client.stats.session
      .mutate({ deviceId: getDeviceId(), durationSeconds: Math.round(seconds), page: page.slice(0, 32) })
      .catch(() => {});
  } catch {
    /* 静默失败 */
  }
}

/** 上报一条复习记录（记住/遗忘/拼写对错/发音练习） */
export function syncReview(record: {
  itemType: 'word' | 'sentence';
  itemKey: string;
  result: 'remembered' | 'forgotten' | 'correct' | 'wrong' | 'practiced';
  mode: 'flashcard' | 'spelling' | 'pronunciation';
}): void {
  try {
    void client.review.record.mutate({ deviceId: getDeviceId(), ...record }).catch(() => {});
  } catch {
    /* 静默失败 */
  }
}

/** 同步新增生词本条目 */
export function syncVocabAdd(entry: {
  ko: string;
  rom?: string;
  zh?: string;
  pos?: string;
  source?: string;
  exampleKo?: string;
  exampleZh?: string;
}): void {
  try {
    void client.vocab.add.mutate({ deviceId: getDeviceId(), ...entry }).catch(() => {});
  } catch {
    /* 静默失败 */
  }
}

/** 同步生词「已掌握」标记 */
export function syncVocabMastered(ko: string, mastered: boolean): void {
  try {
    void client.vocab.setMastered.mutate({ deviceId: getDeviceId(), ko, mastered }).catch(() => {});
  } catch {
    /* 静默失败 */
  }
}

/** 同步删除生词本条目 */
export function syncVocabRemove(ko: string): void {
  try {
    void client.vocab.remove.mutate({ deviceId: getDeviceId(), ko }).catch(() => {});
  } catch {
    /* 静默失败 */
  }
}

/** 同步新增用户语料元数据 */
export function syncCorpusAdd(item: {
  title: string;
  kind: 'audio' | 'video' | 'pdf' | 'text';
  sizeBytes?: number;
  durationSeconds?: number;
  localKey?: string;
}): void {
  try {
    void client.corpus.add.mutate({ deviceId: getDeviceId(), ...item }).catch(() => {});
  } catch {
    /* 静默失败 */
  }
}

/** 同步删除用户语料（id 为云端返回的数字 ID） */
export function syncCorpusRemove(id: number): void {
  try {
    void client.corpus.remove.mutate({ deviceId: getDeviceId(), id }).catch(() => {});
  } catch {
    /* 静默失败 */
  }
}
