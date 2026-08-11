/**
 * hangul.ts — 韩语 40 音字母数据（21 元音 + 19 辅音）
 * 用途：40音入门页字母网格 / 音节拼合互动的数据源。
 * 每个字母包含：字符、罗马音、发音用音节（TTS 朗读）、发音要领中文注释、分组。
 */

/** 字母分组：基础 / 复合（元音）；基本 / 紧音·送气音（辅音） */
export type VowelGroup = 'basic' | 'compound';
export type ConsonantGroup = 'basic' | 'tense';

export interface HangulLetter {
  /** 韩文字符，如 ㅏ / ㄱ */
  char: string;
  /** 罗马音，如 a / g */
  roman: string;
  /** 发音用音节：元音前加 ㅇ（ㅏ→아），辅音加元音 ㅏ（ㄱ→가），供 TTS 朗读 */
  speak: string;
  /** 发音要领（中文注释，tooltip 展示） */
  tip: string;
  /** 分组：元音 basic/compound，辅音 basic/tense */
  group: VowelGroup | ConsonantGroup;
}

/** 元音 21 个（모음） */
export const VOWELS: HangulLetter[] = [
  // —— 基础元音 10 ——
  { char: 'ㅏ', roman: 'a', speak: '아', tip: '嘴自然张开，像中文「啊」', group: 'basic' },
  { char: 'ㅓ', roman: 'eo', speak: '어', tip: '嘴角微微向两边，像「哦」与「呃」之间', group: 'basic' },
  { char: 'ㅗ', roman: 'o', speak: '오', tip: '嘴唇收圆前突，像「喔」', group: 'basic' },
  { char: 'ㅜ', roman: 'u', speak: '우', tip: '嘴唇收圆最小，像「乌」', group: 'basic' },
  { char: 'ㅡ', roman: 'eu', speak: '으', tip: '嘴唇向两边咧开，舌面放平', group: 'basic' },
  { char: 'ㅣ', roman: 'i', speak: '이', tip: '像中文「衣」', group: 'basic' },
  { char: 'ㅐ', roman: 'ae', speak: '애', tip: '嘴张得比 ㅔ 稍大，像「爱」的前半', group: 'basic' },
  { char: 'ㅔ', roman: 'e', speak: '에', tip: '嘴角向两边，像「诶」', group: 'basic' },
  { char: 'ㅚ', roman: 'oe', speak: '외', tip: '嘴唇收圆发「we」，如 외국 外国', group: 'basic' },
  { char: 'ㅟ', roman: 'wi', speak: '위', tip: '「u」快速滑向「i」，像「微」', group: 'basic' },
  // —— 复合元音 11（y/w 起音） ——
  { char: 'ㅑ', roman: 'ya', speak: '야', tip: '「i」快速滑向「a」，像「呀」', group: 'compound' },
  { char: 'ㅕ', roman: 'yeo', speak: '여', tip: '「i」滑向「eo」，如 여자 女子', group: 'compound' },
  { char: 'ㅛ', roman: 'yo', speak: '요', tip: '「i」滑向「o」，像「哟」', group: 'compound' },
  { char: 'ㅠ', roman: 'yu', speak: '유', tip: '「i」滑向「u」，像「优」', group: 'compound' },
  { char: 'ㅒ', roman: 'yae', speak: '얘', tip: '「i」滑向「ae」，口型更大', group: 'compound' },
  { char: 'ㅖ', roman: 'ye', speak: '예', tip: '「i」滑向「e」，像「耶」', group: 'compound' },
  { char: 'ㅘ', roman: 'wa', speak: '와', tip: '「u」滑向「a」，像「哇」', group: 'compound' },
  { char: 'ㅝ', roman: 'wo', speak: '워', tip: '「u」滑向「eo」，如 원 圆', group: 'compound' },
  { char: 'ㅙ', roman: 'wae', speak: '왜', tip: '「u」滑向「ae」，如 왜 为什么', group: 'compound' },
  { char: 'ㅞ', roman: 'we', speak: '웨', tip: '「u」滑向「e」，如 웨이터 服务员', group: 'compound' },
  { char: 'ㅢ', roman: 'ui', speak: '의', tip: '「eu」滑向「i」，如 의사 医生', group: 'compound' },
];

/** 辅音 19 个（자음） */
export const CONSONANTS: HangulLetter[] = [
  // —— 基本辅音 14 ——
  { char: 'ㄱ', roman: 'g/k', speak: '가', tip: '舌根轻触软腭，介于 g/k 之间', group: 'basic' },
  { char: 'ㄴ', roman: 'n', speak: '나', tip: '舌尖抵上齿龈，像「n」', group: 'basic' },
  { char: 'ㄷ', roman: 'd/t', speak: '다', tip: '舌尖弹上齿龈，介于 d/t 之间', group: 'basic' },
  { char: 'ㄹ', roman: 'r/l', speak: '라', tip: '舌尖轻弹，介于 r/l 之间', group: 'basic' },
  { char: 'ㅁ', roman: 'm', speak: '마', tip: '双唇闭合，像「m」', group: 'basic' },
  { char: 'ㅂ', roman: 'b/p', speak: '바', tip: '双唇爆破，介于 b/p 之间', group: 'basic' },
  { char: 'ㅅ', roman: 's', speak: '사', tip: '轻擦音，介于 s/sh 之间', group: 'basic' },
  { char: 'ㅇ', roman: 'ng/·', speak: '아', tip: '作初声不发音；作收音发 ng（如 강）', group: 'basic' },
  { char: 'ㅈ', roman: 'j', speak: '자', tip: '舌尖抵上颚，介于 z/j 之间，像「兹」', group: 'basic' },
  { char: 'ㅊ', roman: 'ch', speak: '차', tip: '比 ㅈ 送气更强，像「次」', group: 'basic' },
  { char: 'ㅋ', roman: 'k', speak: '카', tip: '比 ㄱ 送气更强，像「卡」的声母', group: 'basic' },
  { char: 'ㅌ', roman: 't', speak: '타', tip: '比 ㄷ 送气更强，像「他」的声母', group: 'basic' },
  { char: 'ㅍ', roman: 'p', speak: '파', tip: '比 ㅂ 送气更强，像「怕」的声母', group: 'basic' },
  { char: 'ㅎ', roman: 'h', speak: '하', tip: '喉部轻送气，像「h」', group: 'basic' },
  // —— 紧音 5（双写，发音紧绷短促） ——
  { char: 'ㄲ', roman: 'kk', speak: '까', tip: '紧音：喉部肌肉紧绷，短促有力', group: 'tense' },
  { char: 'ㄸ', roman: 'tt', speak: '따', tip: '紧音：舌尖紧绷弹出，短促', group: 'tense' },
  { char: 'ㅃ', roman: 'pp', speak: '빠', tip: '紧音：双唇紧绷爆破，短促', group: 'tense' },
  { char: 'ㅆ', roman: 'ss', speak: '싸', tip: '紧音：摩擦短促紧绷，如 싸다 便宜', group: 'tense' },
  { char: 'ㅉ', roman: 'jj', speak: '짜', tip: '紧音：舌面紧绷，如 짜다 咸', group: 'tense' },
];

/** 初声（辅音）按韩文音节组合顺序排列，用于 Unicode 音节拼合 */
export const CHOSEONG = ['ㄱ','ㄲ','ㄴ','ㄷ','ㄸ','ㄹ','ㅁ','ㅂ','ㅃ','ㅅ','ㅆ','ㅇ','ㅈ','ㅊ','ㅋ','ㅌ','ㅍ','ㅎ'] as const;

/** 中声（元音）按韩文音节组合顺序排列 */
export const JUNGSEONG = ['ㅏ','ㅐ','ㅑ','ㅒ','ㅓ','ㅔ','ㅕ','ㅖ','ㅗ','ㅘ','ㅙ','ㅚ','ㅛ','ㅜ','ㅝ','ㅞ','ㅟ','ㅠ','ㅡ','ㅢ','ㅣ'] as const;

/**
 * 用 Unicode 组合公式把「辅音 + 元音」拼成完整音节。
 * 公式：0xAC00 + (初声序号 × 21 + 中声序号) × 28
 * 找不到对应字符时返回 null（调用方应兜底）。
 */
export function combineSyllable(consonant: string, vowel: string): string | null {
  const ci = CHOSEONG.indexOf(consonant as (typeof CHOSEONG)[number]);
  const vi = JUNGSEONG.indexOf(vowel as (typeof JUNGSEONG)[number]);
  if (ci < 0 || vi < 0) return null;
  return String.fromCharCode(0xac00 + (ci * 21 + vi) * 28);
}

/** 常见单词示例：以某音节开头的词（音节拼合区展示），key 为初声辅音 */
export const SYLLABLE_WORDS: Record<string, { word: string; meaning: string }[]> = {
  ㄱ: [{ word: '가족', meaning: '家人' }, { word: '고양이', meaning: '猫' }],
  ㄴ: [{ word: '나라', meaning: '国家' }, { word: '노래', meaning: '歌' }],
  ㄷ: [{ word: '다음', meaning: '下一个' }, { word: '도시', meaning: '城市' }],
  ㄹ: [{ word: '라디오', meaning: '收音机' }, { word: '러시아', meaning: '俄罗斯' }],
  ㅁ: [{ word: '마음', meaning: '心' }, { word: '물', meaning: '水' }],
  ㅂ: [{ word: '바다', meaning: '大海' }, { word: '밥', meaning: '饭' }],
  ㅅ: [{ word: '사랑', meaning: '爱' }, { word: '시간', meaning: '时间' }],
  ㅇ: [{ word: '아이', meaning: '孩子' }, { word: '오늘', meaning: '今天' }],
  ㅈ: [{ word: '자전거', meaning: '自行车' }, { word: '지금', meaning: '现在' }],
  ㅊ: [{ word: '친구', meaning: '朋友' }, { word: '책', meaning: '书' }],
  ㅋ: [{ word: '커피', meaning: '咖啡' }, { word: '카메라', meaning: '相机' }],
  ㅌ: [{ word: '태양', meaning: '太阳' }, { word: '토끼', meaning: '兔子' }],
  ㅍ: [{ word: '피아노', meaning: '钢琴' }, { word: '편지', meaning: '信' }],
  ㅎ: [{ word: '하늘', meaning: '天空' }, { word: '한국', meaning: '韩国' }],
  ㄲ: [{ word: '김치', meaning: '泡菜' }, { word: '꿈', meaning: '梦' }],
  ㄸ: [{ word: '딸기', meaning: '草莓' }, { word: '땅', meaning: '土地' }],
  ㅃ: [{ word: '빵', meaning: '面包' }, { word: '뿌리', meaning: '根' }],
  ㅆ: [{ word: '쌀', meaning: '米' }, { word: '쓰레기', meaning: '垃圾' }],
  ㅉ: [{ word: '짜장면', meaning: '炸酱面' }, { word: '쪽지', meaning: '便条' }],
};

/** 字母总数（用于进度环 x/40） */
export const TOTAL_LETTERS = VOWELS.length + CONSONANTS.length;
