import { z } from "zod";
import { createRouter, publicQuery } from "./middleware";
import { TRPCError } from "@trpc/server";
import {
  ensureUser, getPreferences, updatePreferences, getStats, addStats,
  addStudySession, addReviewRecord, getReviewSummary,
  listSystemWords, listSystemSentences,
  listUserVocab, addUserVocab, setVocabMastered, removeUserVocab,
  listUserCorpus, addUserCorpus, removeUserCorpus,
} from "./queries/koreanflow";
import {
  createCode, consumeCode, findUserByEmail, findUserByPhone,
  createAccountUser, createSession, deleteSession,
  verifyPassword, hashPassword, setPassword, bindChannel,
  anonymousDataSummary, mergeAnonymousInto,
  addNotification, listNotifications, unreadNotificationCount,
  markAllNotificationsRead, updateNotifyPrefs, queueEmail,
} from "./queries/auth";

/** deviceId 是未登录阶段的身份键（未来登录后改用 session） */
const deviceInput = z.object({ deviceId: z.string().min(8).max(64) });

const emailSchema = z.string().email().max(191);
const phoneSchema = z.string().regex(/^1[3-9]\d{9}$/, "手机号格式不正确");
const codeSchema = z.string().regex(/^\d{6}$/, "验证码为 6 位数字");

/** 从 ctx 取登录用户 ID，未登录抛 401 */
function requireUser(ctx: { userId: number | null }): number {
  if (!ctx.userId) throw new TRPCError({ code: "UNAUTHORIZED", message: "请先登录" });
  return ctx.userId;
}

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
        exampleKo: z.string().max(512).optional(),
        exampleZh: z.string().max(512).optional(),
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

  /* ---------------- 账号系统（v2.3.0） ---------------- */
  auth: createRouter({
    /**
     * 发送验证码（开发模式）：生成 6 位码入库并直接回显 devCode。
     * 接入真实 SMTP/短信后，把 devCode 改为通过真实通道下发即可。
     */
    sendCode: publicQuery
      .input(z.object({
        channel: z.enum(["email", "phone"]),
        target: z.string().min(3).max(191),
        purpose: z.enum(["register", "login", "bind", "reset"]),
      }))
      .mutation(async ({ input }) => {
        // 格式校验
        if (input.channel === "email" && !emailSchema.safeParse(input.target).success) {
          throw new TRPCError({ code: "BAD_REQUEST", message: "邮箱格式不正确" });
        }
        if (input.channel === "phone" && !phoneSchema.safeParse(input.target).success) {
          throw new TRPCError({ code: "BAD_REQUEST", message: "手机号格式不正确" });
        }
        // 注册/绑定前检查占用
        if (input.purpose === "register" || input.purpose === "bind") {
          const existing = input.channel === "email"
            ? await findUserByEmail(input.target)
            : await findUserByPhone(input.target);
          if (existing) {
            throw new TRPCError({ code: "CONFLICT", message: input.channel === "email" ? "该邮箱已被注册" : "该手机号已被注册" });
          }
        }
        const code = await createCode(input.channel, input.target, input.purpose);
        if (!code) {
          throw new TRPCError({ code: "TOO_MANY_REQUESTS", message: "发送太频繁，请 1 分钟后再试" });
        }
        // 开发模式：邮件内容写入发件箱（status=pending），验证码随响应回显
        if (input.channel === "email") {
          await queueEmail(null, input.target, "韩之语验证码", `你的验证码是 ${code}，10 分钟内有效。`);
        }
        return { ok: true, devMode: true, devCode: code, ttlMinutes: 10 };
      }),

    /** 注册：邮箱+密码 / 邮箱+验证码 / 手机+验证码 */
    register: publicQuery
      .input(z.discriminatedUnion("mode", [
        z.object({ mode: z.literal("email-password"), email: emailSchema, password: z.string().min(6).max(64), nickname: z.string().max(64).optional() }),
        z.object({ mode: z.literal("email-code"), email: emailSchema, code: codeSchema, nickname: z.string().max(64).optional() }),
        z.object({ mode: z.literal("phone-code"), phone: phoneSchema, code: codeSchema, nickname: z.string().max(64).optional() }),
      ]))
      .mutation(async ({ input }) => {
        if (input.mode === "email-password") {
          if (await findUserByEmail(input.email)) {
            throw new TRPCError({ code: "CONFLICT", message: "该邮箱已被注册" });
          }
          const user = await createAccountUser({ email: input.email, passwordHash: hashPassword(input.password), nickname: input.nickname });
          const token = await createSession(user.id);
          return { token, user };
        }
        if (input.mode === "email-code") {
          if (await findUserByEmail(input.email)) {
            throw new TRPCError({ code: "CONFLICT", message: "该邮箱已被注册" });
          }
          if (!(await consumeCode("email", input.email, "register", input.code))) {
            throw new TRPCError({ code: "BAD_REQUEST", message: "验证码错误或已过期" });
          }
          const user = await createAccountUser({ email: input.email, nickname: input.nickname });
          const token = await createSession(user.id);
          return { token, user };
        }
        // phone-code
        if (await findUserByPhone(input.phone)) {
          throw new TRPCError({ code: "CONFLICT", message: "该手机号已被注册" });
        }
        if (!(await consumeCode("phone", input.phone, "register", input.code))) {
          throw new TRPCError({ code: "BAD_REQUEST", message: "验证码错误或已过期" });
        }
        const user = await createAccountUser({ phone: input.phone, nickname: input.nickname });
        const token = await createSession(user.id);
        return { token, user };
      }),

    /** 登录：邮箱+密码 / 邮箱+验证码 / 手机+验证码 */
    login: publicQuery
      .input(z.discriminatedUnion("mode", [
        z.object({ mode: z.literal("email-password"), email: emailSchema, password: z.string().min(1).max(64) }),
        z.object({ mode: z.literal("email-code"), email: emailSchema, code: codeSchema }),
        z.object({ mode: z.literal("phone-code"), phone: phoneSchema, code: codeSchema }),
      ]))
      .mutation(async ({ input }) => {
        if (input.mode === "email-password") {
          const user = await findUserByEmail(input.email);
          if (!user || !user.passwordHash || !verifyPassword(input.password, user.passwordHash)) {
            throw new TRPCError({ code: "UNAUTHORIZED", message: "邮箱或密码不正确" });
          }
          const token = await createSession(user.id);
          return { token, user };
        }
        if (input.mode === "email-code") {
          const user = await findUserByEmail(input.email);
          if (!user) throw new TRPCError({ code: "NOT_FOUND", message: "该邮箱尚未注册" });
          if (!(await consumeCode("email", input.email, "login", input.code))) {
            throw new TRPCError({ code: "BAD_REQUEST", message: "验证码错误或已过期" });
          }
          const token = await createSession(user.id);
          return { token, user };
        }
        const user = await findUserByPhone(input.phone);
        if (!user) throw new TRPCError({ code: "NOT_FOUND", message: "该手机号尚未注册" });
        if (!(await consumeCode("phone", input.phone, "login", input.code))) {
          throw new TRPCError({ code: "BAD_REQUEST", message: "验证码错误或已过期" });
        }
        const token = await createSession(user.id);
        return { token, user };
      }),

    /** 当前登录用户信息（未登录返回 { user: null }） */
    me: publicQuery.query(async ({ ctx }) => {
      if (!ctx.userId) return { user: null };
      const { getUserById } = await import("./queries/auth");
      return { user: await getUserById(ctx.userId) };
    }),

    logout: publicQuery.mutation(async ({ ctx }) => {
      if (ctx.token) await deleteSession(ctx.token);
      return { ok: true };
    }),

    /** 绑定/换绑邮箱（需登录 + 验证码） */
    bindEmail: publicQuery
      .input(z.object({ email: emailSchema, code: codeSchema }))
      .mutation(async ({ ctx, input }) => {
        const userId = requireUser(ctx);
        if (await findUserByEmail(input.email)) {
          throw new TRPCError({ code: "CONFLICT", message: "该邮箱已被其他账号使用" });
        }
        if (!(await consumeCode("email", input.email, "bind", input.code))) {
          throw new TRPCError({ code: "BAD_REQUEST", message: "验证码错误或已过期" });
        }
        return { user: await bindChannel(userId, "email", input.email) };
      }),

    /** 绑定/换绑手机号（需登录 + 验证码） */
    bindPhone: publicQuery
      .input(z.object({ phone: phoneSchema, code: codeSchema }))
      .mutation(async ({ ctx, input }) => {
        const userId = requireUser(ctx);
        if (await findUserByPhone(input.phone)) {
          throw new TRPCError({ code: "CONFLICT", message: "该手机号已被其他账号使用" });
        }
        if (!(await consumeCode("phone", input.phone, "bind", input.code))) {
          throw new TRPCError({ code: "BAD_REQUEST", message: "验证码错误或已过期" });
        }
        return { user: await bindChannel(userId, "phone", input.phone) };
      }),

    /** 修改/设置密码：已设密码需验证旧密码；未设密码（验证码注册）可直接设置 */
    changePassword: publicQuery
      .input(z.object({ oldPassword: z.string().max(64).optional(), newPassword: z.string().min(6).max(64) }))
      .mutation(async ({ ctx, input }) => {
        const userId = requireUser(ctx);
        const { getUserById } = await import("./queries/auth");
        const user = await getUserById(userId);
        if (user?.passwordHash) {
          if (!input.oldPassword || !verifyPassword(input.oldPassword, user.passwordHash)) {
            throw new TRPCError({ code: "UNAUTHORIZED", message: "原密码不正确" });
          }
        }
        await setPassword(userId, input.newPassword);
        return { ok: true };
      }),

    /** 匿名设备数据概况（登录后决定是否弹「合并/重新开始」） */
    anonStatus: publicQuery
      .input(deviceInput)
      .query(async ({ input }) => anonymousDataSummary(input.deviceId)),

    /** 登录后处理匿名数据：merge=合并到账号 / fresh=保留不动，账号全新开始 */
    mergeAnonymous: publicQuery
      .input(deviceInput.extend({ choice: z.enum(["merge", "fresh"]) }))
      .mutation(async ({ ctx, input }) => {
        const userId = requireUser(ctx);
        if (input.choice === "fresh") return { merged: false };
        const result = await mergeAnonymousInto(input.deviceId, userId);
        if (result.merged) {
          await addNotification(userId, { title: "数据合并完成", body: "本机历史学习数据已合并到你的账号。", type: "system" });
        }
        return result;
      }),
  }),

  /* ---------------- 通知中心（v2.3.0） ---------------- */
  notify: createRouter({
    list: publicQuery.query(async ({ ctx }) => {
      const userId = requireUser(ctx);
      return listNotifications(userId);
    }),
    unreadCount: publicQuery.query(async ({ ctx }) => {
      const userId = requireUser(ctx);
      return { count: await unreadNotificationCount(userId) };
    }),
    markAllRead: publicQuery.mutation(async ({ ctx }) => {
      const userId = requireUser(ctx);
      await markAllNotificationsRead(userId);
      return { ok: true };
    }),
    /** 通知偏好：邮件开关 / 站内开关 / 每日提醒时间 HH:mm / 昵称 */
    updatePrefs: publicQuery
      .input(z.object({
        notifyEmail: z.boolean().optional(),
        notifyBrowser: z.boolean().optional(),
        remindTime: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/).optional(),
        nickname: z.string().min(1).max(64).optional(),
      }))
      .mutation(async ({ ctx, input }) => {
        const userId = requireUser(ctx);
        const user = await updateNotifyPrefs(userId, input);
        return { user };
      }),
  }),
});

export type AppRouter = typeof appRouter;
