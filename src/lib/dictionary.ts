/**
 * dictionary.ts — 本地韩语词典查词逻辑
 * 用途：语料中心「划词翻译」气泡的离线查词入口。
 * 支持：精确匹配 → 剥离常见助词/词尾后重查 → 空白/标点清洗；中文反查（韩中互查）。
 */
import type { DictEntry } from '@/data/dictionary';
import { DICTIONARY } from '@/data/dictionary';

/** 词条索引：ko → DictEntry（模块加载时构建一次，O(1) 查询） */
const INDEX: Map<string, DictEntry> = new Map(DICTIONARY.map((e) => [e.ko, e]));

/** 常见助词/词尾（从长到短匹配，用于将 활용형 还原到词典原型） */
const PARTICLES = [
  '습니다', '입니다', '어요', '아요', '여요', '했어요', '세요',
  '에서', '에게', '으로', '부터', '까지', '처럼', '보다',
  '는데', '지만', '하고',
  '은', '는', '이', '가', '을', '를', '의', '에', '도', '만', '로', '와', '과',
] as const;

/** 清洗选中字符串：去除首尾空白与常见标点 */
export function normalizeQuery(raw: string): string {
  return raw
    .trim()
    .replace(/^[.,!?…·"'“”‘’()（）<>《》\-—~\s]+/, '')
    .replace(/[.,!?…·"'“”‘’()（）<>《》\-—~\s]+$/, '');
}

/**
 * 查词：返回命中的词条或 null。
 * 1) 精确匹配；2) 逐步剥离助词/词尾后重查（最多剥 2 层）。
 */
export function lookupWord(raw: string): DictEntry | null {
  let word = normalizeQuery(raw);
  if (!word) return null;
  const exact = INDEX.get(word);
  if (exact) return exact;

  // 剥离助词/词尾后重查（如 친구를 → 친구）
  for (let depth = 0; depth < 2 && word.length > 1; depth++) {
    const p = PARTICLES.find((p) => word.length > p.length && word.endsWith(p));
    if (!p) break;
    word = word.slice(0, word.length - p.length);
    const hit = INDEX.get(word);
    if (hit) return hit;
  }
  return null;
}

/** 是否包含韩文字符（用于判断是否值得弹气泡） */
export function containsHangul(text: string): boolean {
  return /[가-힯ㄱ-ㅎㅏ-ㅣ]/.test(text);
}

/**
 * 中文反向查词（中 → 韩）：在词典中文释义中做包含匹配。
 * 用于查词面板的「韩中互查」——输入中文时返回可能的韩语词条候选。
 * @returns 按相关度（释义短者优先）排序的候选列表，最多 8 条
 */
export function lookupChinese(raw: string): DictEntry[] {
  const q = normalizeQuery(raw);
  if (!q || containsHangul(q)) return [];
  const hits = DICTIONARY.filter((e) => e.zh.includes(q));
  return hits
    .sort((a, b) => {
      // 完全等于释义某个义项（按 / 分隔）的优先
      const aExact = a.zh.split(/[\/，、]/).some((p) => p.trim() === q) ? 0 : 1;
      const bExact = b.zh.split(/[\/，、]/).some((p) => p.trim() === q) ? 0 : 1;
      return aExact - bExact || a.zh.length - b.zh.length;
    })
    .slice(0, 8);
}
