/**
 * vocab.ts — 生词本共享数据层
 * 用途：统一 `hjy:vocab-book` 条目结构与写入逻辑（去重 + 云端静默同步），
 * 供语料中心、句子工作台、查词面板等多入口共用。
 */
import { readStorage, writeStorage, STORAGE_KEYS } from './storage';
import { syncVocabAdd } from './sync';

/** 生词本条目结构（Vocabulary 页 / 语料中心 / 工作台共用） */
export interface VocabEntry {
  id: string;
  ko: string;
  rom: string;
  zh: string;
  pos: string;
  /** 例句（韩语），可选 */
  exampleKo?: string;
  /** 例句（中文），可选 */
  exampleZh?: string;
  addedAt: number;
  mastered: boolean;
}

/** 读取生词本全量 */
export function readVocabBook(): VocabEntry[] {
  return readStorage<VocabEntry[]>(STORAGE_KEYS.VOCAB_BOOK, []);
}

/**
 * 将词条加入生词本（按 ko 去重）。
 * @returns true=新增成功；false=已存在（若传入例句而原条目没有，则补写例句）
 */
export function addToVocabBook(entry: Omit<VocabEntry, 'id' | 'addedAt' | 'mastered'>): boolean {
  const list = readVocabBook();
  const existing = list.find((v) => v.ko === entry.ko);
  if (existing) {
    // 已存在但有新例句 → 补写例句（视为更新而非新增）
    if (entry.exampleKo && !existing.exampleKo) {
      writeStorage(
        STORAGE_KEYS.VOCAB_BOOK,
        list.map((v) => (v.ko === entry.ko ? { ...v, exampleKo: entry.exampleKo, exampleZh: entry.exampleZh ?? v.exampleZh } : v)),
      );
      syncVocabAdd({ ko: entry.ko, rom: entry.rom, zh: entry.zh, pos: entry.pos, source: 'corpus', exampleKo: entry.exampleKo, exampleZh: entry.exampleZh });
    }
    return false;
  }
  writeStorage(STORAGE_KEYS.VOCAB_BOOK, [...list, { ...entry, id: `v-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`, addedAt: Date.now(), mastered: false }]);
  syncVocabAdd({ ko: entry.ko, rom: entry.rom, zh: entry.zh, pos: entry.pos, source: 'corpus', exampleKo: entry.exampleKo, exampleZh: entry.exampleZh });
  return true;
}
