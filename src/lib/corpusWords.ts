/**
 * corpusWords.ts — 「我的语料」单词提取
 * 用途：扫描用户上传的全部语料（文本/DOCX/PDF 正文 + 音视频转写文稿），
 * 与内置词典匹配，产出「来自语料的单词列表」——供单词学习页的语料模式
 * 与学习模式的「我的语料」分类使用。
 */
import * as pdfjsLib from 'pdfjs-dist';
import pdfWorkerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url';
import { DICTIONARY, type DictEntry } from '@/data/dictionary';
import type { Word } from '@/data/words';
import {
  getCorpusBlob, getTranscript, isDocxMeta, listCorpusMeta, type CorpusMeta,
} from '@/lib/corpus';

pdfjsLib.GlobalWorkerOptions.workerSrc = pdfWorkerUrl;

/** 语料单词：词典词条 + 出现统计 */
export interface CorpusWord {
  /** 词典词条 */
  entry: DictEntry;
  /** 在全部语料中出现的次数 */
  count: number;
  /** 出现过该词的语料文件名（去重） */
  sources: string[];
}

/** 语料单词所属的学习模式分类 id */
export const CORPUS_CATEGORY = 'corpus';

/** 语料单词 → 学习模式词卡（Word）结构 */
export function corpusWordToWord(cw: CorpusWord): Word {
  return {
    id: `${CORPUS_CATEGORY}-${cw.entry.ko}`,
    ko: cw.entry.ko,
    rom: cw.entry.rom,
    zh: cw.entry.zh,
    pos: cw.entry.pos,
    exampleKo: '',
    exampleZh: '',
    category: CORPUS_CATEGORY,
  };
}

/** 提取单个语料的全文文本（失败返回空串，绝不抛出） */
async function extractCorpusText(meta: CorpusMeta): Promise<string> {
  try {
    const blob = await getCorpusBlob(meta.id);
    if (!blob) return '';
    if (meta.kind === 'pdf') {
      const url = URL.createObjectURL(blob);
      try {
        const doc = await pdfjsLib.getDocument({ url }).promise;
        const parts: string[] = [];
        for (let i = 1; i <= doc.numPages; i++) {
          const page = await doc.getPage(i);
          const content = await page.getTextContent();
          let text = '';
          for (const item of content.items) {
            if ('str' in item) text += item.str + (item.hasEOL ? '\n' : ' ');
          }
          parts.push(text);
        }
        await doc.destroy();
        return parts.join('\n');
      } finally {
        URL.revokeObjectURL(url);
      }
    }
    if (isDocxMeta(meta)) {
      const mammoth = await import('mammoth');
      const result = await mammoth.extractRawText({ arrayBuffer: await blob.arrayBuffer() });
      return result.value || '';
    }
    if (meta.kind === 'text') {
      return await blob.text();
    }
    return '';
  } catch {
    return '';
  }
}

/**
 * 扫描全部语料，产出语料单词列表（按出现次数降序）。
 * 文本来源：文本/PDF/DOCX 语料正文 + 音视频转写文稿句子。
 */
export async function getCorpusWords(): Promise<CorpusWord[]> {
  const metas = await listCorpusMeta();
  /** 每份语料的文本（语料名 → 正文） */
  const texts: Array<{ name: string; text: string }> = [];

  for (const meta of metas) {
    if (meta.kind === 'text' || meta.kind === 'pdf') {
      const text = await extractCorpusText(meta);
      if (text.trim()) texts.push({ name: meta.name, text });
    } else {
      // 音视频：使用转写文稿（若已转写）
      try {
        const t = await getTranscript(meta.id);
        if (t?.sentences?.length) {
          texts.push({ name: `${meta.name}（转写文稿）`, text: t.sentences.map((s) => s.text).join('\n') });
        }
      } catch {
        /* 无文稿则跳过 */
      }
    }
  }

  if (texts.length === 0) return [];

  // 词典逐词统计出现次数（indexOf 循环计数，词典 ~330 词，性能可接受）
  const result: CorpusWord[] = [];
  for (const entry of DICTIONARY) {
    let count = 0;
    const sources: string[] = [];
    for (const { name, text } of texts) {
      let idx = 0;
      let found = false;
      while ((idx = text.indexOf(entry.ko, idx)) !== -1) {
        count++;
        found = true;
        idx += entry.ko.length;
      }
      if (found) sources.push(name);
    }
    if (count > 0) result.push({ entry, count, sources });
  }
  return result.sort((a, b) => b.count - a.count);
}
