/**
 * 种子脚本：将前端内置语料（src/data/words.ts、sentences.ts）灌入系统语料库。
 * 运行：npx tsx db/seed.ts
 * 幂等：word_key / sentence_key 唯一，重复执行自动跳过（onDuplicateKeyUpdate 保持原值）。
 */
import { getDb } from "../api/queries/connection";
import { systemWords, systemSentences } from "./schema";
import { WORDS } from "../src/data/words";
import { DAILY_SENTENCES, PRACTICE_SENTENCES } from "../src/data/sentences";

async function seed() {
  const db = getDb();
  console.log("Seeding KoreanFlow database...");

  // 系统词库（84 词）
  for (const w of WORDS) {
    await db
      .insert(systemWords)
      .values({
        wordKey: w.id,
        ko: w.ko,
        rom: w.rom,
        zh: w.zh,
        pos: w.pos,
        exampleKo: w.exampleKo,
        exampleZh: w.exampleZh,
        category: w.category,
        source: "builtin",
      })
      .onDuplicateKeyUpdate({ set: { zh: w.zh } });
  }
  console.log(`  system_words: ${WORDS.length} 条`);

  // 每日一句
  for (let i = 0; i < DAILY_SENTENCES.length; i++) {
    const s = DAILY_SENTENCES[i];
    await db
      .insert(systemSentences)
      .values({
        sentenceKey: `daily-${i + 1}`,
        korean: s.korean,
        romanization: s.romanization,
        chinese: s.chinese,
        level: "daily",
        wordsJson: JSON.stringify(s.words),
      })
      .onDuplicateKeyUpdate({ set: { korean: s.korean } });
  }
  console.log(`  system_sentences(daily): ${DAILY_SENTENCES.length} 条`);

  // 发音练习句（3 级 × 10 句）
  for (const s of PRACTICE_SENTENCES) {
    await db
      .insert(systemSentences)
      .values({
        sentenceKey: `pron-${s.id}`,
        korean: s.ko,
        romanization: s.rom,
        chinese: s.zh,
        level: s.level,
        wordsJson: null,
      })
      .onDuplicateKeyUpdate({ set: { korean: s.ko } });
  }
  console.log(`  system_sentences(pron): ${PRACTICE_SENTENCES.length} 条`);

  console.log("Done.");
  process.exit(0);
}

seed().catch((e) => {
  console.error(e);
  process.exit(1);
});
