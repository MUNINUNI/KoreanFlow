/**
 * 启动时自动建表 + 自动灌库
 * -------------------------
 * 背景：开发沙箱无法访问 VPC 内网数据库（privatelink），db:push 只能在部署运行时生效。
 * 因此服务器启动时执行：
 *   1. 内嵌迁移 SQL（CREATE TABLE IF NOT EXISTS，幂等）
 *   2. 若系统语料库为空，自动灌入内置词库/句库（幂等）
 * 失败只记录日志、不阻断静态站点服务（前端自动降级为 localStorage 离线模式）。
 */
import mysql from "mysql2/promise";
import { MIGRATION_SQL, COLUMN_PATCHES } from "@db/migrations-embedded";
import { env } from "./lib/env";

export async function autoMigrateAndSeed(): Promise<void> {
  if (!env.databaseUrl) return;
  const pool = mysql.createPool({ uri: env.databaseUrl, connectionLimit: 2 });
  try {
    // 1. 建表（幂等）
    for (const stmt of MIGRATION_SQL) {
      try {
        await pool.execute(stmt);
      } catch (e) {
        // 索引已存在（1061）属重复启动的正常情况，跳过即可；其余错误照样抛出
        if ((e as { errno?: number })?.errno === 1061) continue;
        throw e;
      }
    }
    console.log("[autoboot] 数据库表结构就绪");

    // 1.5 增量列补丁（旧部署补列，幂等）
    for (const [table, column, sql] of COLUMN_PATCHES) {
      const [cols] = await pool.execute(
        "SELECT COUNT(*) AS cnt FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND COLUMN_NAME = ?",
        [table, column],
      );
      if (Number((cols as { cnt: number }[])[0]?.cnt ?? 0) === 0) {
        await pool.execute(sql);
        console.log(`[autoboot] 已补列 ${table}.${column}`);
      }
    }

    // 2. 系统语料库为空时灌入内置数据
    const [rows] = await pool.execute("SELECT COUNT(*) AS cnt FROM system_words");
    const count = Number((rows as { cnt: number }[])[0]?.cnt ?? 0);
    if (count === 0) {
      const { WORDS } = await import("../src/data/words");
      const { DAILY_SENTENCES, PRACTICE_SENTENCES } = await import("../src/data/sentences");

      for (const w of WORDS) {
        await pool.execute(
          "INSERT IGNORE INTO system_words (word_key, ko, rom, zh, pos, example_ko, example_zh, category, source) VALUES (?,?,?,?,?,?,?,?,?)",
          [w.id, w.ko, w.rom, w.zh, w.pos, w.exampleKo, w.exampleZh, w.category, "builtin"],
        );
      }
      for (let i = 0; i < DAILY_SENTENCES.length; i++) {
        const s = DAILY_SENTENCES[i];
        await pool.execute(
          "INSERT IGNORE INTO system_sentences (sentence_key, korean, romanization, chinese, level, words_json) VALUES (?,?,?,?,?,?)",
          [`daily-${i + 1}`, s.korean, s.romanization, s.chinese, "daily", JSON.stringify(s.words)],
        );
      }
      for (const s of PRACTICE_SENTENCES) {
        await pool.execute(
          "INSERT IGNORE INTO system_sentences (sentence_key, korean, romanization, chinese, level, words_json) VALUES (?,?,?,?,?,NULL)",
          [`pron-${s.id}`, s.ko, s.rom, s.zh, s.level],
        );
      }
      console.log(`[autoboot] 系统语料灌入完成：${WORDS.length} 词 / ${DAILY_SENTENCES.length + PRACTICE_SENTENCES.length} 句`);
    }
  } catch (e) {
    console.error("[autoboot] 数据库初始化失败（不影响静态页面，前端将离线运行）:", e);
  } finally {
    await pool.end().catch(() => {});
  }
}
