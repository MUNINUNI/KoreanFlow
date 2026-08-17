import { z } from "zod";
import { createRouter, publicQuery } from "./middleware";
import {
  ensureUser, getPreferences, updatePreferences, getStats, addStats,
  addStudySession, addReviewRecord, getReviewSummary,
  listSystemWords, listSystemSentences,
  listUserVocab, addUserVocab, setVocabMastered, removeUserVocab,
  listUserCorpus, addUserCorpus, removeUserCorpus,
} from "./queries/koreanflow";

/** deviceId 是未登录阶段的身份键（未来登录后改用 session） */
const deviceInput = z.object({ deviceId: z.string().min(8).max(64) });

export const appRouter = createRouter({
  ping: publicQuery.query(() => ({ ok: true, ts: Date.now() })),

  /* 用户建档 + 偏好 + 统计总览 */
  user: createRouter({
    /** 首次访问/每次启动调用：建档并返回 用户+偏好+统计 */
    ensure: publicQuery
      .input(deviceInput.extend({ nickname: z.string().max(64).optional() }))
      .mutation(async ({ input }) => {
        const user = await ensureUser(input.deviceId, input.nickname);
        const [prefs, userStats] = await Promise.all([getPreferences(user.id), getStats(user.id)]);
        return { user, preferences: prefs, stats: userStats };
      }),

    updatePreferences: publicQuery
      .input(deviceInput.extend({
        reviewGroupSize: z.number().int().min(3).max(50).optional(),
        voiceGender: z.enum(["female", "male"]).optional(),
        voiceName: z.string().max(128).nullable().optional(),
        dailyGoal: z.number().int().min(1).max(50).optional(),
      }))
      .mutation(async ({ input }) => {
        const user = await ensureUser(input.deviceId);
        const { deviceId: _d, ...patch } = input;
        return updatePreferences(user.id, patch);
      }),

    overview: publicQuery
      .input(deviceInput)
      .query(async ({ input }) => {
        const user = await ensureUser(input.deviceId);
        const [prefs, userStats] = await Promise.all([getPreferences(user.id), getStats(user.id)]);
        return { user, preferences: prefs, stats: userStats };
      }),
  }),

  /* 学习统计上报 */
  stats: createRouter({
    /** 累计增量（单词/句子/秒数） */
    add: publicQuery
      .input(deviceInput.extend({
        words: z.number().int().min(0).max(500).optional(),
        sentences: z.number().int().min(0).max(100).optional(),
        seconds: z.number().int().min(0).max(36000).optional(),
        streakDays: z.number().int().min(0).max(3650).optional(),
      }))
      .mutation(async ({ input }) => {
        const user = await ensureUser(input.deviceId);
        return addStats(user.id, input);
      }),

    /** 学习时长会话 */
    session: publicQuery
      .input(deviceInput.extend({
        durationSeconds: z.number().int().min(1).max(36000),
        page: z.string().max(32).default("unknown"),
      }))
      .mutation(async ({ input }) => {
        const user = await ensureUser(input.deviceId);
        await addStudySession(user.id, input.durationSeconds, input.page);
        await addStats(user.id, { seconds: input.durationSeconds });
        return { ok: true };
      }),
  }),

  /* 复习 */
  review: createRouter({
    record: publicQuery
      .input(deviceInput.extend({
        itemType: z.enum(["word", "sentence"]),
        itemKey: z.string().min(1).max(191),
        result: z.enum(["remembered", "forgotten", "correct", "wrong", "practiced"]),
        mode: z.enum(["flashcard", "spelling", "pronunciation"]),
      }))
      .mutation(async ({ input }) => {
        const user = await ensureUser(input.deviceId);
        await addReviewRecord(user.id, input);
        return { ok: true };
      }),

    summary: publicQuery
      .input(deviceInput.extend({ itemType: z.enum(["word", "sentence"]) }))
      .query(async ({ input }) => {
        const user = await ensureUser(input.deviceId);
        return getReviewSummary(user.id, input.itemType);
      }),
  }),

  /* 系统语料库（词库/句库） */
  library: createRouter({
    words: publicQuery.query(() => listSystemWords()),
    sentences: publicQuery.query(() => listSystemSentences()),
  }),

  /* 生词本云端同步 */
  vocab: createRouter({
    list: publicQuery.input(deviceInput).query(async ({ input }) => {
      const user = await ensureUser(input.deviceId);
      return listUserVocab(user.id);
    }),
    add: publicQuery
      .input(deviceInput.extend({
        ko: z.string().min(1).max(128),
        rom: z.string().max(255).optional(),
        zh: z.string().max(255).optional(),
        pos: z.string().max(32).optional(),
        source: z.string().max(32).optional(),
      }))
      .mutation(async ({ input }) => {
        const user = await ensureUser(input.deviceId);
        const { deviceId: _d, ...entry } = input;
        await addUserVocab(user.id, entry);
        return { ok: true };
      }),
    setMastered: publicQuery
      .input(deviceInput.extend({ ko: z.string().min(1).max(128), mastered: z.boolean() }))
      .mutation(async ({ input }) => {
        const user = await ensureUser(input.deviceId);
        await setVocabMastered(user.id, input.ko, input.mastered);
        return { ok: true };
      }),
    remove: publicQuery
      .input(deviceInput.extend({ ko: z.string().min(1).max(128) }))
      .mutation(async ({ input }) => {
        const user = await ensureUser(input.deviceId);
        await removeUserVocab(user.id, input.ko);
        return { ok: true };
      }),
  }),

  /* 用户语料元数据 */
  corpus: createRouter({
    list: publicQuery.input(deviceInput).query(async ({ input }) => {
      const user = await ensureUser(input.deviceId);
      return listUserCorpus(user.id);
    }),
    add: publicQuery
      .input(deviceInput.extend({
        title: z.string().min(1).max(255),
        kind: z.enum(["audio", "video", "pdf", "text"]),
        sizeBytes: z.number().int().min(0).optional(),
        durationSeconds: z.number().int().min(0).optional(),
        localKey: z.string().max(128).optional(),
      }))
      .mutation(async ({ input }) => {
        const user = await ensureUser(input.deviceId);
        const { deviceId: _d, ...item } = input;
        const id = await addUserCorpus(user.id, item);
        return { ok: true, id };
      }),
    remove: publicQuery
      .input(deviceInput.extend({ id: z.number().int() }))
      .mutation(async ({ input }) => {
        const user = await ensureUser(input.deviceId);
        await removeUserCorpus(user.id, input.id);
        return { ok: true };
      }),
  }),
});

export type AppRouter = typeof appRouter;
