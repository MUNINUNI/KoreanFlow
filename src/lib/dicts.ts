/**
 * dicts.ts — 外部韩中词典来源
 * 用途：查词面板 / 划词气泡提供 3 个常用韩中词典的直达链接。
 */

export interface DictSource {
  id: 'naver' | 'daum' | 'krdict';
  name: string;
  short: string;
  buildUrl: (word: string) => string;
}

export const DICT_SOURCES: DictSource[] = [
  {
    id: 'naver',
    name: 'Naver 韩中词典',
    short: 'Naver',
    buildUrl: (w) => `https://zh.dict.naver.com/#/search?range=all&query=${encodeURIComponent(w)}`,
  },
  {
    id: 'daum',
    name: 'Daum 词典',
    short: 'Daum',
    buildUrl: (w) => `https://dic.daum.net/search.do?q=${encodeURIComponent(w)}&dic=ch`,
  },
  {
    id: 'krdict',
    name: '国立国语院韩中词典',
    short: '국립국어원',
    buildUrl: (w) => `https://krdict.korean.go.kr/m/chinese/searchAction?nationCode=6&searchWord=${encodeURIComponent(w)}`,
  },
];

/** 在新标签页打开指定词典查词 */
export function openDict(id: DictSource['id'], word: string): void {
  const src = DICT_SOURCES.find((s) => s.id === id);
  if (src) window.open(src.buildUrl(word), '_blank', 'noopener,noreferrer');
}
