/**
 * segment.ts — 转写片段智能分段
 * 用途：把 Whisper 输出的碎块按「句末标点 + 停顿间隔 + 最大长度」合并成
 * 适合逐句学习的句子卡片，并估算每句的音频时间区间。
 */
import type { AsrChunk } from './asr';

/** 分段后的句子 */
export interface TranscriptSentence {
  id: number;
  text: string;
  /** 音频开始秒 */
  start: number;
  /** 音频结束秒 */
  end: number;
  /** 中文翻译（用户手填或导入） */
  zh?: string;
}

/** 句末标点（韩/英） */
const SENT_END = /[.!?…。！？]["'”’）)]?\s*$/;
/** 单句目标最大长度（字符）：超过则即使无标点也强制切段 */
const MAX_LEN = 60;
/** 相邻块间隔超过该秒数视为停顿分段点 */
const PAUSE_GAP = 1.0;

/**
 * 智能分段：把 ASR 碎块合并为学习用句子。
 * 规则：块以句末标点结尾 → 切；块间停顿 > 1s 且累计 ≥12 字 → 切；累计 >60 字 → 强制切。
 */
export function segmentChunks(chunks: AsrChunk[]): TranscriptSentence[] {
  const sentences: TranscriptSentence[] = [];
  let buf = '';
  let segStart = -1;
  let segEnd = 0;

  const flush = () => {
    if (!buf.trim()) return;
    sentences.push({ id: sentences.length + 1, text: buf.trim(), start: Math.max(0, segStart), end: segEnd });
    buf = '';
    segStart = -1;
  };

  for (let i = 0; i < chunks.length; i++) {
    const c = chunks[i];
    const [cs, ce] = c.timestamp;
    if (segStart < 0) segStart = cs;
    segEnd = ce ?? cs + Math.max(1, c.text.length * 0.15); // 缺时间戳时按字数估算
    buf += (buf && !/^[,.!?…]/.test(c.text) ? ' ' : '') + c.text;

    const endsWithPunct = SENT_END.test(c.text);
    const nextGap = i + 1 < chunks.length ? chunks[i + 1].timestamp[0] - segEnd : 0;
    const longEnough = buf.trim().length >= 12;
    if (endsWithPunct || (nextGap > PAUSE_GAP && longEnough) || buf.length > MAX_LEN) {
      flush();
    }
  }
  flush();

  // 末句缺结束时间的兜底：结束 = 开始 + 字数 * 0.15s
  return sentences.map((s) => (s.end <= s.start ? { ...s, end: s.start + Math.max(1, s.text.length * 0.15) } : s));
}

/**
 * 纯文本快速分段（文本/PDF/DOCX 朗读用）：按标点与换行切句。
 */
export function splitToSentences(text: string): string[] {
  const parts = text
    .split(/(?<=[.!?…。！？])|\n+/)
    .map((s) => s.trim())
    .filter(Boolean);
  // 过长的段落按逗号/分号二次拆分
  const out: string[] = [];
  for (const p of parts) {
    if (p.length <= MAX_LEN) { out.push(p); continue; }
    const sub = p.split(/(?<=[,，、;；:：])/);
    let buf = '';
    for (const s of sub) {
      if ((buf + s).length > MAX_LEN && buf) { out.push(buf.trim()); buf = s; }
      else buf += s;
    }
    if (buf.trim()) out.push(buf.trim());
  }
  return out;
}
