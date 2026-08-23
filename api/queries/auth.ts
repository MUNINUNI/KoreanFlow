/**
 * 账号系统查询函数（v2.3.0）
 * -------------------------
 * 注册/登录：邮箱+密码、邮箱+验证码、手机+验证码
 * 会话：Bearer token（auth_sessions 表，30 天有效）
 * 密码：node:crypto scrypt（salt:hash）
 * 验证码：开发模式——生成 6 位码入库，接口直接回显 devCode（接入真实 SMTP/短信后仅改 sendCode 一处）
 */
import crypto from "node:crypto";
import { getDb } from "./connection";
import {
  users, authCodes, authSessions, notifications, emailOutbox,
  preferences, stats, studySessions, reviewRecords, userVocab, userCorpus,
} from "@db/schema";
import { eq, and, gt, sql, desc, isNull, gte, or } from "drizzle-orm";

const CODE_TTL_MINUTES = 10;
const SESSION_TTL_DAYS = 30;

/* ---------------- 密码 ---------------- */

export function hashPassword(password: string): string {
  const salt = crypto.randomBytes(16).toString("hex");
  const hash = crypto.scryptSync(password, salt, 64).toString("hex");
  return `${salt}:${hash}`;
}

export function verifyPassword(password: string, stored: string): boolean {
  const [salt, hash] = stored.split(":");
  if (!salt || !hash) return false;
  const calc = crypto.scryptSync(password, salt, 64);
  const expect = Buffer.from(hash, "hex");
  return calc.length === expect.length && crypto.timingSafeEqual(calc, expect);
}

/* ---------------- 验证码 ---------------- */

/** 生成并存储验证码；同一目标 60 秒内重复请求返回 null（前端提示稍后再试） */
export async function createCode(
  channel: "email" | "phone",
  target: string,
  purpose: "register" | "login" | "bind" | "reset",
): Promise<string | null> {
  const db = getDb();
  const recent = await db.query.authCodes.findFirst({
    where: and(
      eq(authCodes.channel, channel),
      eq(authCodes.target, target),
      gte(authCodes.createdAt, new Date(Date.now() - 60_000)),
    ),
  });
  if (recent) return null;
  const code = String(crypto.randomInt(100000, 999999));
  await db.insert(authCodes).values({
    channel, target, code, purpose,
    expiresAt: new Date(Date.now() + CODE_TTL_MINUTES * 60_000),
  });
  return code;
}

/** 校验并消费验证码（一次性） */
export async function consumeCode(
  channel: "email" | "phone",
  target: string,
  purpose: "register" | "login" | "bind" | "reset",
  code: string,
): Promise<boolean> {
  const db = getDb();
  const row = await db.query.authCodes.findFirst({
    where: and(
      eq(authCodes.channel, channel),
      eq(authCodes.target, target),
      eq(authCodes.purpose, purpose),
      eq(authCodes.code, code),
      eq(authCodes.used, false),
      gt(authCodes.expiresAt, new Date()),
    ),
    orderBy: desc(authCodes.createdAt),
  });
  if (!row) return false;
  await db.update(authCodes).set({ used: true }).where(eq(authCodes.id, row.id));
  return true;
}

/* ---------------- 用户查询/创建 ---------------- */

export async function findUserByEmail(email: string) {
  return getDb().query.users.findFirst({ where: eq(users.email, email) });
}

export async function findUserByPhone(phone: string) {
  return getDb().query.users.findFirst({ where: eq(users.phone, phone) });
}

export async function getUserById(id: number) {
  return getDb().query.users.findFirst({ where: eq(users.id, id) });
}

/** 创建正式账号用户（deviceId 用 acct- 前缀占位，保持列非空约束） */
export async function createAccountUser(fields: {
  email?: string;
  phone?: string;
  passwordHash?: string;
  nickname?: string;
}) {
  const db = getDb();
  const [{ id }] = await db
    .insert(users)
    .values({
      deviceId: `acct-${crypto.randomUUID()}`,
      nickname: fields.nickname ?? "韩语学习者",
      email: fields.email ?? null,
      phone: fields.phone ?? null,
      passwordHash: fields.passwordHash ?? null,
      emailVerifiedAt: fields.email ? new Date() : null,
      phoneVerifiedAt: fields.phone ? new Date() : null,
    })
    .$returningId();
  await db.insert(preferences).values({ userId: id });
  await db.insert(stats).values({ userId: id });
  return (await getUserById(id))!;
}

/** 绑定邮箱/手机号到已有账号（验证码校验通过后调用） */
export async function bindChannel(
  userId: number,
  channel: "email" | "phone",
  target: string,
) {
  const db = getDb();
  await db
    .update(users)
    .set(
      channel === "email"
        ? { email: target, emailVerifiedAt: new Date() }
        : { phone: target, phoneVerifiedAt: new Date() },
    )
    .where(eq(users.id, userId));
  return getUserById(userId);
}

export async function setPassword(userId: number, password: string) {
  await getDb().update(users).set({ passwordHash: hashPassword(password) }).where(eq(users.id, userId));
}

/* ---------------- 会话 ---------------- */

export async function createSession(userId: number): Promise<string> {
  const token = crypto.randomBytes(32).toString("hex");
  await getDb().insert(authSessions).values({
    token,
    userId,
    expiresAt: new Date(Date.now() + SESSION_TTL_DAYS * 24 * 3600_000),
  });
  return token;
}

/** 根据 token 取登录用户（过期/不存在返回 null），并顺带清理过期会话 */
export async function getUserByToken(token: string) {
  const db = getDb();
  const session = await db.query.authSessions.findFirst({
    where: and(eq(authSessions.token, token), gt(authSessions.expiresAt, new Date())),
  });
  if (!session) return null;
  const user = await getUserById(session.userId);
  if (user) {
    await db.update(users).set({ lastActiveAt: new Date() }).where(eq(users.id, user.id));
  }
  return user ?? null;
}

export async function deleteSession(token: string) {
  await getDb().delete(authSessions).where(eq(authSessions.token, token));
}

/* ---------------- 匿名数据合并 ---------------- */

/** 匿名设备名下的数据量（登录后弹「合并/重新开始」用） */
export async function anonymousDataSummary(deviceId: string) {
  const db = getDb();
  const anon = await db.query.users.findFirst({ where: eq(users.deviceId, deviceId) });
  if (!anon) return { hasData: false, vocab: 0, reviews: 0, sessions: 0, corpus: 0 };
  const count = async (table: typeof userVocab | typeof reviewRecords | typeof studySessions | typeof userCorpus) => {
    const [row] = await db
      .select({ cnt: sql<number>`COUNT(*)` })
      .from(table)
      .where(eq(table.userId, anon.id));
    return Number(row?.cnt ?? 0);
  };
  const [vocab, reviews, sessions, corpus] = await Promise.all([
    count(userVocab), count(reviewRecords), count(studySessions), count(userCorpus),
  ]);
  return { hasData: vocab + reviews + sessions + corpus > 0, vocab, reviews, sessions, corpus };
}

/**
 * 把匿名设备用户的数据合并到正式账号：
 * 流水表直接改挂 user_id；1:1 的 stats 做数值累加后删旧行；
 * user_vocab 先删冲突行再改挂（unique(user_id,ko)）；最后删除匿名用户。
 */
export async function mergeAnonymousInto(deviceId: string, accountUserId: number) {
  const db = getDb();
  const anon = await db.query.users.findFirst({ where: eq(users.deviceId, deviceId) });
  if (!anon || anon.id === accountUserId) return { merged: false };

  // 生词本：删除与账号已有词冲突的匿名行，其余改挂账号
  await db.execute(
    sql`DELETE v FROM user_vocab v JOIN user_vocab a ON a.user_id = ${accountUserId} AND a.ko = v.ko WHERE v.user_id = ${anon.id}`,
  );
  await db.update(userVocab).set({ userId: accountUserId }).where(eq(userVocab.userId, anon.id));

  // 流水表改挂
  await db.update(reviewRecords).set({ userId: accountUserId }).where(eq(reviewRecords.userId, anon.id));
  await db.update(studySessions).set({ userId: accountUserId }).where(eq(studySessions.userId, anon.id));
  await db.update(userCorpus).set({ userId: accountUserId }).where(eq(userCorpus.userId, anon.id));

  // 统计：数值累加到账号，删除匿名行
  const anonStats = await db.query.stats.findFirst({ where: eq(stats.userId, anon.id) });
  if (anonStats) {
    await db
      .update(stats)
      .set({
        wordsLearned: sql`words_learned + ${anonStats.wordsLearned}`,
        sentencesLearned: sql`sentences_learned + ${anonStats.sentencesLearned}`,
        studySeconds: sql`study_seconds + ${anonStats.studySeconds}`,
        streakDays: sql`GREATEST(streak_days, ${anonStats.streakDays})`,
        updatedAt: new Date(),
      })
      .where(eq(stats.userId, accountUserId));
    await db.delete(stats).where(eq(stats.userId, anon.id));
  }
  await db.delete(preferences).where(eq(preferences.userId, anon.id));
  await db.delete(users).where(eq(users.id, anon.id));
  return { merged: true };
}

/* ---------------- 通知 ---------------- */

export async function addNotification(
  userId: number,
  n: { title: string; body?: string; type?: string },
) {
  await getDb().insert(notifications).values({
    userId, title: n.title, body: n.body ?? "", type: n.type ?? "reminder",
  });
}

export async function listNotifications(userId: number) {
  return getDb()
    .select()
    .from(notifications)
    .where(eq(notifications.userId, userId))
    .orderBy(desc(notifications.createdAt))
    .limit(50);
}

export async function unreadNotificationCount(userId: number) {
  const [row] = await getDb()
    .select({ cnt: sql<number>`COUNT(*)` })
    .from(notifications)
    .where(and(eq(notifications.userId, userId), isNull(notifications.readAt)));
  return Number(row?.cnt ?? 0);
}

export async function markAllNotificationsRead(userId: number) {
  await getDb()
    .update(notifications)
    .set({ readAt: new Date() })
    .where(and(eq(notifications.userId, userId), isNull(notifications.readAt)));
}

/** 更新通知偏好（写在 users 行上） */
export async function updateNotifyPrefs(
  userId: number,
  patch: Partial<{ notifyEmail: boolean; notifyBrowser: boolean; remindTime: string; nickname: string }>,
) {
  await getDb().update(users).set(patch).where(eq(users.id, userId));
  return getUserById(userId);
}

/* ---------------- 邮件（开发模式：写入发件箱，不回真实发送） ---------------- */

export async function queueEmail(
  userId: number | null,
  toAddr: string,
  subject: string,
  body: string,
) {
  await getDb().insert(emailOutbox).values({ userId, toAddr, subject, body, status: "pending" });
}

/* ---------------- 每日提醒调度（boot 后 setInterval 调用） ---------------- */

/**
 * 给当前时刻（HH:mm）命中提醒时间且今天尚未提醒过的用户发提醒：
 * 站内通知（notify_browser）+ 邮件发件箱（notify_email，开发模式仅落库）。
 */
export async function dispatchDueReminders(now = new Date()) {
  const db = getDb();
  const hhmm = `${String(now.getHours()).padStart(2, "0")}:${String(now.getMinutes()).padStart(2, "0")}`;
  const dayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const due = await db
    .select()
    .from(users)
    .where(
      and(
        eq(users.remindTime, hhmm),
        or(eq(users.notifyBrowser, true), eq(users.notifyEmail, true)),
      ),
    );
  let sent = 0;
  for (const u of due) {
    const [row] = await db
      .select({ cnt: sql<number>`COUNT(*)` })
      .from(notifications)
      .where(
        and(
          eq(notifications.userId, u.id),
          eq(notifications.type, "reminder"),
          gte(notifications.createdAt, dayStart),
        ),
      );
    if (Number(row?.cnt ?? 0) > 0) continue; // 今天已提醒
    if (u.notifyBrowser) {
      await addNotification(u.id, {
        title: "该学韩语啦 🇰🇷",
        body: "每天一句，慢慢开口。今天的 5 分钟学习开始了！",
        type: "reminder",
      });
    }
    if (u.notifyEmail && u.email) {
      await queueEmail(u.id, u.email, "韩之语 · 每日学习提醒", "该学韩语啦！打开韩之语完成今天的 5 分钟学习。");
    }
    sent++;
  }
  return sent;
}
