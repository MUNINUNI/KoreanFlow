/**
 * 导出预生成语音清单（构建期脚本，npx tsx 运行）
 * 遍历词库/每日一句/发音练习句/40音字母，输出 {key, text} JSON 到 /tmp/audio-manifest.json
 * key 即音频文件名：public/audio/{female|male}/{key}.mp3
 */
import { WORDS } from '../src/data/words';
import { DAILY_SENTENCES, PRACTICE_SENTENCES } from '../src/data/sentences';
import { VOWELS, CONSONANTS } from '../src/data/hangul';
import { writeFileSync } from 'node:fs';

interface Item { key: string; text: string }
const items: Item[] = [];
const seen = new Set<string>();
const push = (key: string, text: string) => {
  const t = text.trim();
  if (!t || seen.has(t)) return;   // 同文本只生成一次（按键去重以文本为准）
  seen.add(t);
  items.push({ key, text: t });
};

// 词库：单词 + 例句
for (const w of WORDS) {
  push(`word-${w.id}`, w.ko);
  if (w.exampleKo) push(`ex-${w.id}`, w.exampleKo);
}
// 每日一句（含拆解词）
DAILY_SENTENCES.forEach((s, i) => {
  push(`daily-${i + 1}`, s.korean);
  s.words.forEach((w, j) => push(`daily-${i + 1}-w${j}`, w.word));
});
// 发音练习句
for (const s of PRACTICE_SENTENCES) push(`pron-${s.id}`, s.ko);
// 40 音字母
VOWELS.forEach((l, i) => push(`hg-v${i}`, l.speak));
CONSONANTS.forEach((l, i) => push(`hg-c${i}`, l.speak));

writeFileSync('/tmp/audio-manifest.json', JSON.stringify(items, null, 2));
console.log(`共 ${items.length} 条待生成`);
