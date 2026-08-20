/**
 * spell.ts — 韩语拼读（자모 拆解）
 * 用途：把韩语单词拆成「初声/中声/终声」字母序列，配合慢速 TTS 实现逐字母拼读练习。
 */

/** 初声（19） */
const INITIALS = ['ㄱ', 'ㄲ', 'ㄴ', 'ㄷ', 'ㄸ', 'ㄹ', 'ㅁ', 'ㅂ', 'ㅃ', 'ㅅ', 'ㅆ', 'ㅇ', 'ㅈ', 'ㅉ', 'ㅊ', 'ㅋ', 'ㅌ', 'ㅍ', 'ㅎ'] as const;
/** 中声（21） */
const MEDIALS = ['ㅏ', 'ㅐ', 'ㅑ', 'ㅒ', 'ㅓ', 'ㅔ', 'ㅕ', 'ㅖ', 'ㅗ', 'ㅘ', 'ㅙ', 'ㅚ', 'ㅛ', 'ㅜ', 'ㅝ', 'ㅞ', 'ㅟ', 'ㅠ', 'ㅡ', 'ㅢ', 'ㅣ'] as const;
/** 终声（28，第 0 个表示无收音） */
const FINALS = ['', 'ㄱ', 'ㄲ', 'ㄳ', 'ㄴ', 'ㄵ', 'ㄶ', 'ㄷ', 'ㄹ', 'ㄺ', 'ㄻ', 'ㄼ', 'ㄽ', 'ㄾ', 'ㄿ', 'ㅀ', 'ㅁ', 'ㅂ', 'ㅄ', 'ㅅ', 'ㅆ', 'ㅇ', 'ㅈ', 'ㅊ', 'ㅋ', 'ㅌ', 'ㅍ', 'ㅎ'] as const;

/** 单音节拆解结果 */
export interface JamoParts {
  initial: string;
  medial: string;
  final: string; // 无收音为空串
}

/**
 * 拆解一个韩语音节字符为初/中/终声；非组合音节（含独立字母）返回 null。
 */
export function decomposeSyllable(ch: string): JamoParts | null {
  const code = ch.codePointAt(0) ?? 0;
  // 组合音节区 AC00–D7A3
  if (code >= 0xac00 && code <= 0xd7a3) {
    const n = code - 0xac00;
    return {
      initial: INITIALS[Math.floor(n / 588)],
      medial: MEDIALS[Math.floor((n % 588) / 28)],
      final: FINALS[n % 28],
    };
  }
  return null;
}

/** 单词 → 逐音节字母序列，如 "한국어" → [["ㅎ","ㅏ","ㄴ"],["ㄱ","ㅜ","ㄱ"],["ㅇ","ㅓ"]] */
export function decomposeWord(word: string): string[][] {
  const out: string[][] = [];
  for (const ch of word.replace(/\s+/g, '')) {
    const parts = decomposeSyllable(ch);
    if (parts) {
      const jamo = [parts.initial, parts.medial];
      if (parts.final) jamo.push(parts.final);
      out.push(jamo);
    }
  }
  return out;
}

/** 拼读展示文本：한국어 → "ㅎㅏㄴ · ㄱㅜㄱ · ㅇㅓ" */
export function spellText(word: string): string {
  return decomposeWord(word).map((j) => j.join('')).join(' · ');
}

/** 拼读朗读文本（慢速 TTS 用）：逐字母以逗号停顿，如 "히읗, 아, 니은. 기역, 우, 기역." */
export function spellSpeechText(word: string): string {
  const NAME: Record<string, string> = {
    ㄱ: '기역', ㄲ: '쌍기역', ㄴ: '니은', ㄷ: '디귿', ㄸ: '쌍디귿', ㄹ: '리을', ㅁ: '미음',
    ㅂ: '비읍', ㅃ: '쌍비읍', ㅅ: '시옷', ㅆ: '쌍시옷', ㅇ: '이응', ㅈ: '지읒', ㅉ: '쌍지읒',
    ㅊ: '치읓', ㅋ: '키읔', ㅌ: '티읕', ㅍ: '피읖', ㅎ: '히읗',
    ㅏ: '아', ㅐ: '애', ㅑ: '야', ㅒ: '얘', ㅓ: '어', ㅔ: '에', ㅕ: '여', ㅖ: '예',
    ㅗ: '오', ㅘ: '와', ㅙ: '왜', ㅚ: '외', ㅛ: '요', ㅜ: '우', ㅝ: '워', ㅞ: '웨',
    ㅟ: '위', ㅠ: '유', ㅡ: '으', ㅢ: '의', ㅣ: '이',
    ㄳ: '기역시옷', ㄵ: '니은지읒', ㄶ: '니은히읗', ㄺ: '리을기역', ㄻ: '리을미음',
    ㄼ: '리을비읍', ㄽ: '리을시옷', ㄾ: '리을티읕', ㄿ: '리을피읖', ㅀ: '리을히읗', ㅄ: '비읍시옷',
  };
  return decomposeWord(word)
    .map((jamo) => jamo.map((j) => NAME[j] ?? j).join(', '))
    .join('. ');
}
