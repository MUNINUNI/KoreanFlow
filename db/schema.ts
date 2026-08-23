/**
 * KoreanFlow 数据库 Schema
 * -------------------------
 * 表结构总览：
 *   users            用户（匿名设备用户起步，预留 openid/会员字段，为登录+付费做准备）
 *   preferences      学习偏好（复习节奏、TTS 音色等，一用户一条）
 *   stats            累计学习统计（单词/句子/时长/连续天数，一用户一条）
 *   study_sessions   学习时长会话流水
 *   review_records   复习记录流水（记住/忘记/拼写对错/发音练习）
 *   system_words     系统词库（内置 84 词，后续可扩展付费词库）
 *   system_sentences 系统句库（每日一句 + 发音练习句）
 *   user_vocab       用户生词本（云端同步）
 *   user_corpus      用户语料元数据（媒体文件本体存浏览器 IndexedDB，此处存元数据）
 */
import {
  mysqlTable,
  mysqlEnum,
  serial,
  bigint,
  varchar,
  text,
  int,
  boolean,
  timestamp,
  index,
  uniqueIndex,
} from "drizzle-orm/mysql-core";

/* ---------------- 用户 ---------------- */

export const users = mysqlTable("users", {
  id: serial("id").primaryKey(),
  /** 匿名设备标识（未登录阶段的身份键，localStorage 持久化于前端） */
  deviceId: varchar("device_id", { length: 64 }).notNull(),
  /** 未来 Kimi 登录绑定的 openid（登录功能上线后回填） */
  openid: varchar("openid", { length: 128 }),
  nickname: varchar("nickname", { length: 64 }).notNull().default("韩语学习者"),
  /** 会员等级：为付费服务预留 */
  plan: mysqlEnum("plan", ["free", "pro"]).notNull().default("free"),
  /* ---- v2.3.0 账号系统 ---- */
  /** 绑定邮箱（可空，唯一） */
  email: varchar("email", { length: 191 }),
  /** 绑定手机号（可空，唯一） */
  phone: varchar("phone", { length: 32 }),
  /** scrypt 密码哈希，格式 salt:hash（hex） */
  passwordHash: varchar("password_hash", { length: 255 }),
  emailVerifiedAt: timestamp("email_verified_at"),
  phoneVerifiedAt: timestamp("phone_verified_at"),
  /** 学习通知开关：邮件 / 浏览器站内通知 */
  notifyEmail: boolean("notify_email").notNull().default(true),
  notifyBrowser: boolean("notify_browser").notNull().default(true),
  /** 每日提醒时间 HH:mm（服务器本地时区） */
  remindTime: varchar("remind_time", { length: 5 }).notNull().default("20:00"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  lastActiveAt: timestamp("last_active_at").notNull().defaultNow(),
}, (t) => ({
  deviceIdx: uniqueIndex("users_device_idx").on(t.deviceId),
  openidIdx: uniqueIndex("users_openid_idx").on(t.openid),
  emailIdx: uniqueIndex("users_email_idx").on(t.email),
  phoneIdx: uniqueIndex("users_phone_idx").on(t.phone),
}));

/* ---------------- 验证码（v2.3.0） ---------------- */

export const authCodes = mysqlTable("auth_codes", {
  id: serial("id").primaryKey(),
  /** 通道：邮箱 / 手机号 */
  channel: mysqlEnum("channel", ["email", "phone"]).notNull(),
  /** 目标地址：邮箱地址或手机号 */
  target: varchar("target", { length: 191 }).notNull(),
  code: varchar("code", { length: 8 }).notNull(),
  /** 用途：注册 / 登录 / 绑定 / 重置密码 */
  purpose: mysqlEnum("purpose", ["register", "login", "bind", "reset"]).notNull(),
  expiresAt: timestamp("expires_at").notNull(),
  used: boolean("used").notNull().default(false),
  createdAt: timestamp("created_at").notNull().defaultNow(),
}, (t) => ({
  targetIdx: index("auth_codes_target_idx").on(t.channel, t.target),
}));

/* ---------------- 登录会话（v2.3.0） ---------------- */

export const authSessions = mysqlTable("auth_sessions", {
  id: serial("id").primaryKey(),
  /** 64 位 hex 令牌，前端存 localStorage，请求带 Authorization: Bearer */
  token: varchar("token", { length: 64 }).notNull(),
  userId: bigint("user_id", { mode: "number", unsigned: true }).notNull(),
  expiresAt: timestamp("expires_at").notNull(),
  createdAt: timestamp("created_at").notNull().defaultNow(),
}, (t) => ({
  tokenIdx: uniqueIndex("auth_sessions_token_idx").on(t.token),
  userIdx: index("auth_sessions_user_idx").on(t.userId),
}));

/* ---------------- 站内通知（v2.3.0） ---------------- */

export const notifications = mysqlTable("notifications", {
  id: serial("id").primaryKey(),
  userId: bigint("user_id", { mode: "number", unsigned: true }).notNull(),
  title: varchar("title", { length: 128 }).notNull(),
  body: varchar("body", { length: 512 }).notNull().default(""),
  /** reminder=学习提醒 / system=系统通知 */
  type: varchar("type", { length: 32 }).notNull().default("reminder"),
  readAt: timestamp("read_at"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
}, (t) => ({
  userIdx: index("notifications_user_idx").on(t.userId),
}));

/* ---------------- 邮件发件箱（v2.3.0，开发模式先落库） ---------------- */

export const emailOutbox = mysqlTable("email_outbox", {
  id: serial("id").primaryKey(),
  userId: bigint("user_id", { mode: "number", unsigned: true }),
  toAddr: varchar("to_addr", { length: 191 }).notNull(),
  subject: varchar("subject", { length: 255 }).notNull(),
  body: text("body"),
  /** pending=待发送（开发模式永远 pending，接入 SMTP 后由发信任务置 sent） */
  status: mysqlEnum("status", ["pending", "sent", "failed"]).notNull().default("pending"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
}, (t) => ({
  statusIdx: index("email_outbox_status_idx").on(t.status),
}));

/* ---------------- 学习偏好（1:1） ---------------- */

export const preferences = mysqlTable("preferences", {
  id: serial("id").primaryKey(),
  userId: bigint("user_id", { mode: "number", unsigned: true }).notNull(),
  /** 复习节奏：每组多少个单词 */
  reviewGroupSize: int("review_group_size").notNull().default(10),
  /** TTS 音色偏好：清亮女声 / 清亮男声 */
  voiceGender: mysqlEnum("voice_gender", ["female", "male"]).notNull().default("female"),
  /** 具体语音引擎名（浏览器 speechSynthesis voice name），空 = 自动匹配 */
  voiceName: varchar("voice_name", { length: 128 }),
  /** 每日目标句数 */
  dailyGoal: int("daily_goal").notNull().default(5),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
}, (t) => ({
  userIdx: uniqueIndex("prefs_user_idx").on(t.userId),
}));

/* ---------------- 累计学习统计（1:1） ---------------- */

export const stats = mysqlTable("stats", {
  id: serial("id").primaryKey(),
  userId: bigint("user_id", { mode: "number", unsigned: true }).notNull(),
  wordsLearned: int("words_learned").notNull().default(0),
  sentencesLearned: int("sentences_learned").notNull().default(0),
  studySeconds: int("study_seconds").notNull().default(0),
  streakDays: int("streak_days").notNull().default(0),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
}, (t) => ({
  userIdx: uniqueIndex("stats_user_idx").on(t.userId),
}));

/* ---------------- 学习时长会话流水 ---------------- */

export const studySessions = mysqlTable("study_sessions", {
  id: serial("id").primaryKey(),
  userId: bigint("user_id", { mode: "number", unsigned: true }).notNull(),
  /** 本次时长（秒） */
  durationSeconds: int("duration_seconds").notNull(),
  /** 产生时长的页面/功能 */
  page: varchar("page", { length: 32 }).notNull().default("unknown"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
}, (t) => ({
  userIdx: index("sessions_user_idx").on(t.userId),
}));

/* ---------------- 复习记录流水 ---------------- */

export const reviewRecords = mysqlTable("review_records", {
  id: serial("id").primaryKey(),
  userId: bigint("user_id", { mode: "number", unsigned: true }).notNull(),
  itemType: mysqlEnum("item_type", ["word", "sentence"]).notNull(),
  /** 条目键：词库 id / 句子原文 */
  itemKey: varchar("item_key", { length: 191 }).notNull(),
  /** 复习结果：记住/忘记/拼写正确/拼写错误/发音已练 */
  result: mysqlEnum("result", ["remembered", "forgotten", "correct", "wrong", "practiced"]).notNull(),
  /** 复习模式：闪卡/拼写/发音 */
  mode: mysqlEnum("mode", ["flashcard", "spelling", "pronunciation"]).notNull(),
  createdAt: timestamp("created_at").notNull().defaultNow(),
}, (t) => ({
  userItemIdx: index("review_user_item_idx").on(t.userId, t.itemType, t.itemKey),
}));

/* ---------------- 系统词库 ---------------- */

export const systemWords = mysqlTable("system_words", {
  id: serial("id").primaryKey(),
  /** 与前端 words.ts 的 id 对应，如 'greet-01' */
  wordKey: varchar("word_key", { length: 64 }).notNull(),
  ko: varchar("ko", { length: 128 }).notNull(),
  rom: varchar("rom", { length: 255 }).notNull().default(""),
  zh: varchar("zh", { length: 255 }).notNull(),
  pos: varchar("pos", { length: 32 }).notNull().default(""),
  exampleKo: text("example_ko"),
  exampleZh: text("example_zh"),
  category: varchar("category", { length: 32 }).notNull().default(""),
  /** 来源：builtin=内置，后续可扩展付费词库包 */
  source: varchar("source", { length: 32 }).notNull().default("builtin"),
}, (t) => ({
  keyIdx: uniqueIndex("syswords_key_idx").on(t.wordKey),
}));

/* ---------------- 系统句库 ---------------- */

export const systemSentences = mysqlTable("system_sentences", {
  id: serial("id").primaryKey(),
  /** 唯一键：daily-1 / pron-basic-3 等 */
  sentenceKey: varchar("sentence_key", { length: 64 }).notNull(),
  korean: varchar("korean", { length: 512 }).notNull(),
  romanization: varchar("romanization", { length: 512 }).notNull().default(""),
  chinese: varchar("chinese", { length: 512 }).notNull().default(""),
  /** daily=每日一句；basic/intermediate/advanced=发音练习难度 */
  level: varchar("level", { length: 32 }).notNull().default("daily"),
  /** 单词拆解 JSON 数组 */
  wordsJson: text("words_json"),
}, (t) => ({
  keyIdx: uniqueIndex("syssent_key_idx").on(t.sentenceKey),
}));

/* ---------------- 用户生词本（云端同步） ---------------- */

export const userVocab = mysqlTable("user_vocab", {
  id: serial("id").primaryKey(),
  userId: bigint("user_id", { mode: "number", unsigned: true }).notNull(),
  ko: varchar("ko", { length: 128 }).notNull(),
  rom: varchar("rom", { length: 255 }).notNull().default(""),
  zh: varchar("zh", { length: 255 }).notNull().default(""),
  pos: varchar("pos", { length: 32 }).notNull().default(""),
  /** 来源：system=词库 / daily=每日一句 / corpus=语料中心 */
  source: varchar("source", { length: 32 }).notNull().default("system"),
  /** 例句（韩语），语料中心/查词添加时自动带上出处句 */
  exampleKo: varchar("example_ko", { length: 512 }).notNull().default(""),
  /** 例句（中文） */
  exampleZh: varchar("example_zh", { length: 512 }).notNull().default(""),
  mastered: boolean("mastered").notNull().default(false),
  createdAt: timestamp("created_at").notNull().defaultNow(),
}, (t) => ({
  userKoIdx: uniqueIndex("vocab_user_ko_idx").on(t.userId, t.ko),
}));

/* ---------------- 用户语料元数据 ---------------- */

export const userCorpus = mysqlTable("user_corpus", {
  id: serial("id").primaryKey(),
  userId: bigint("user_id", { mode: "number", unsigned: true }).notNull(),
  title: varchar("title", { length: 255 }).notNull(),
  kind: mysqlEnum("kind", ["audio", "video", "pdf", "text"]).notNull(),
  sizeBytes: int("size_bytes").notNull().default(0),
  /** 音视频时长（秒），文本类为 0 */
  durationSeconds: int("duration_seconds").notNull().default(0),
  /** 媒体文件在浏览器 IndexedDB 中的键（文件本体不上服务器） */
  localKey: varchar("local_key", { length: 128 }).notNull().default(""),
  createdAt: timestamp("created_at").notNull().defaultNow(),
}, (t) => ({
  userIdx: index("corpus_user_idx").on(t.userId),
}));

/* ---------------- 导出类型 ---------------- */

export type User = typeof users.$inferSelect;
export type Preferences = typeof preferences.$inferSelect;
export type Stats = typeof stats.$inferSelect;
export type StudySession = typeof studySessions.$inferSelect;
export type ReviewRecord = typeof reviewRecords.$inferSelect;
export type SystemWord = typeof systemWords.$inferSelect;
export type SystemSentence = typeof systemSentences.$inferSelect;
export type UserVocab = typeof userVocab.$inferSelect;
export type UserCorpus = typeof userCorpus.$inferSelect;
export type AuthCode = typeof authCodes.$inferSelect;
export type AuthSession = typeof authSessions.$inferSelect;
export type Notification = typeof notifications.$inferSelect;
export type EmailOutbox = typeof emailOutbox.$inferSelect;
