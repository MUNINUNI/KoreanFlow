/**
 * KoreanFlow 业务查询函数（被 api/ 下各 router 调用）
 * 所有查询走 Drizzle 类型安全 API，禁止原生 SQL。
 */
import { getDb } from "./connection";
import {
  users, preferences, stats, studySessions, reviewRecords,
  systemWords, systemSentences, userVocab, userCorpus,
} from "@db/schema";
import { eq, and, sql, desc } from "drizzle-orm";

/* ---------------- 用户建档 ---------------- */

/** 以 deviceId 确保用户存在（不存在则建档并初始化偏好/统计），返回用户行 */
export async function ensureUser(deviceId: string, nickname?: string) {
  const db = getDb();
  const existing = await db.query.users.findFirst({ where: eq(users.deviceId, deviceId) });
  if (existing) {
    await db.update(users).set({ lastActiveAt: new Date() }).where(eq(users.id, existing.id));
    return existing;
  }
  const [{ id }] = await db
    .insert(users)
    .values({ deviceId, nickname: nickname ?? "韩语学习者" })
    .$returningId();
  // 初始化 1:1 的偏好与统计行
  await db.insert(preferences).values({ userId: id });
  await db.insert(stats).values({ userId: id });
  const created = await db.query.users.findFirst({ where: eq(users.id, id) });
  return created!;
}

/* ---------------- 偏好 ---------------- */

export async function getPreferences(userId: number) {
  return getDb().query.preferences.findFirst({ where: eq(preferences.userId, userId) });
}

export async function updatePreferences(
  userId: number,
  patch: Partial<{ reviewGroupSize: number; voiceGender: "female" | "male"; voiceName: string | null; dailyGoal: number }>,
) {
  const db = getDb();
  await db.update(preferences).set({ ...patch, updatedAt: new Date() }).where(eq(preferences.userId, userId));
  return getPreferences(userId);
}

/* ---------------- 统计 ---------------- */

export async function getStats(userId: number) {
  return getDb().query.stats.findFirst({ where: eq(stats.userId, userId) });
}

/** 累加学习统计（单词/句子/时长/连续天数增量） */
export async function addStats(
  userId: number,
  delta: { words?: number; sentences?: number; seconds?: number; streakDays?: number },
) {
  const db = getDb();
  await db
    .update(stats)
    .set({
      wordsLearned: sql`words_learned + ${delta.words ?? 0}`,
      sentencesLearned: sql`sentences_learned + ${delta.sentences ?? 0}`,
      studySeconds: sql`study_seconds + ${delta.seconds ?? 0}`,
      streakDays: delta.streakDays != null ? delta.streakDays : sql`streak_days`,
      updatedAt: new Date(),
    })
    .where(eq(stats.userId, userId));
  return getStats(userId);
}

/** 记录一段学习时长 */
export async function addStudySession(userId: number, durationSeconds: number, page: string) {
  await getDb().insert(studySessions).values({ userId, durationSeconds, page });
}

/* ---------------- 复习记录 ---------------- */

export async function addReviewRecord(
  userId: number,
  rec: { itemType: "word" | "sentence"; itemKey: string; result: "remembered" | "forgotten" | "correct" | "wrong" | "practiced"; mode: "flashcard" | "spelling" | "pronunciation" },
) {
  await getDb().insert(reviewRecords).values({ userId, ...rec });
}

/** 某类条目最近一次复习结果（供前端算"待复习"列表） */
export async function getReviewSummary(userId: number, itemType: "word" | "sentence") {
  return getDb()
    .select()
    .from(reviewRecords)
    .where(and(eq(reviewRecords.userId, userId), eq(reviewRecords.itemType, itemType)))
    .orderBy(desc(reviewRecords.createdAt))
    .limit(500);
}

/* ---------------- 系统语料库 ---------------- */

export async function listSystemWords() {
  return getDb().select().from(systemWords);
}

export async function listSystemSentences() {
  return getDb().select().from(systemSentences);
}

/* ---------------- 用户生词本 ---------------- */

export async function listUserVocab(userId: number) {
  return getDb()
    .select()
    .from(userVocab)
    .where(eq(userVocab.userId, userId))
    .orderBy(desc(userVocab.createdAt));
}

/** 添加生词（重复则忽略） */
export async function addUserVocab(
  userId: number,
  entry: { ko: string; rom?: string; zh?: string; pos?: string; source?: string; exampleKo?: string; exampleZh?: string },
) {
  await getDb()
    .insert(userVocab)
    .values({ userId, ...entry })
    .onDuplicateKeyUpdate({
      set: {
        zh: entry.zh ?? "",
        rom: entry.rom ?? "",
        pos: entry.pos ?? "",
        exampleKo: entry.exampleKo ?? "",
        exampleZh: entry.exampleZh ?? "",
      },
    });
}

export async function setVocabMastered(userId: number, ko: string, mastered: boolean) {
  await getDb()
    .update(userVocab)
    .set({ mastered })
    .where(and(eq(userVocab.userId, userId), eq(userVocab.ko, ko)));
}

export async function removeUserVocab(userId: number, ko: string) {
  await getDb().delete(userVocab).where(and(eq(userVocab.userId, userId), eq(userVocab.ko, ko)));
}

/* ---------------- 用户语料元数据 ---------------- */

export async function listUserCorpus(userId: number) {
  return getDb()
    .select()
    .from(userCorpus)
    .where(eq(userCorpus.userId, userId))
    .orderBy(desc(userCorpus.createdAt));
}

export async function addUserCorpus(
  userId: number,
  item: { title: string; kind: "audio" | "video" | "pdf" | "text"; sizeBytes?: number; durationSeconds?: number; localKey?: string },
) {
  const [{ id }] = await getDb().insert(userCorpus).values({ userId, ...item }).$returningId();
  return id;
}

export async function removeUserCorpus(userId: number, id: number) {
  await getDb().delete(userCorpus).where(and(eq(userCorpus.id, id), eq(userCorpus.userId, userId)));
}
