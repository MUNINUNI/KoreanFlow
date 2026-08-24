/**
 * translate.ts — 网络翻译（韩中互译）
 * 用途：语料划词气泡 / 查词面板在本地词典未命中时的在线兜底翻译。
 * 来源：MyMemory 免费翻译 API（无需密钥，支持 CORS，每日每 IP 有免费额度）。
 * 所有调用带超时与失败降级（返回 null），绝不阻塞 UI。
 */

/** 翻译方向 */
export type TranslateDirection = 'ko-zh' | 'zh-ko';

/** 翻译结果 */
export interface TranslateResult {
  /** 译文 */
  text: string;
  /** 来源标识（用于 UI 展示「翻译来源」） */
  source: string;
}

/** 是否包含韩文（决定默认翻译方向） */
export function hasHangul(text: string): boolean {
  return /[가-힯ㄱ-ㅎㅏ-ㅣ]/.test(text);
}

/** 根据内容自动判断方向：含韩文 → 韩译中；否则 → 中译韩 */
export function detectDirection(text: string): TranslateDirection {
  return hasHangul(text) ? 'ko-zh' : 'zh-ko';
}

const API_BASE = 'https://api.mymemory.translated.net/get';
const TIMEOUT_MS = 8000;

/** 简易内存缓存：同一句子本次会话内不重复请求 */
const cache = new Map<string, TranslateResult | null>();

/**
 * 在线翻译一段文本（韩中互译）。
 * @returns 成功返回译文；网络失败 / 超时 / 无结果返回 null
 */
export async function translateText(text: string, direction?: TranslateDirection): Promise<TranslateResult | null> {
  const q = text.trim();
  if (!q || q.length > 200) return null;
  const dir = direction ?? detectDirection(q);
  const langpair = dir === 'ko-zh' ? 'ko|zh-CN' : 'zh-CN|ko';
  const cacheKey = `${langpair}:${q}`;
  if (cache.has(cacheKey)) return cache.get(cacheKey) ?? null;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const url = `${API_BASE}?q=${encodeURIComponent(q)}&langpair=${encodeURIComponent(langpair)}`;
    const res = await fetch(url, { signal: controller.signal });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = (await res.json()) as {
      responseStatus?: number | string;
      responseData?: { translatedText?: string };
    };
    const translated = data.responseData?.translatedText?.trim();
    // MyMemory 偶发返回原文或 MYMEMORY WARNING，视为失败
    if (!translated || translated === q || /MYMEMORY WARNING|QUERY LENGTH LIMIT/i.test(translated)) {
      throw new Error('no result');
    }
    const result: TranslateResult = { text: translated, source: '网络翻译 · MyMemory' };
    cache.set(cacheKey, result);
    return result;
  } catch {
    cache.set(cacheKey, null);
    return null;
  } finally {
    clearTimeout(timer);
  }
}
