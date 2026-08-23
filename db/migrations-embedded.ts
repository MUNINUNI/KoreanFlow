/**
 * 内嵌迁移 SQL（由 drizzle-kit generate 自动生成后转写）
 * 用途：部署运行时首启自动建表——开发沙箱无法访问 VPC 内网数据库，
 * 故在服务器启动时执行 CREATE TABLE IF NOT EXISTS（幂等）。
 * 兼容说明（v2.2.3）：时间默认值统一用 CURRENT_TIMESTAMP（兼容 MySQL 5.6.5+/5.7/8.0/MariaDB），
 * 主键不用 serial 别名写法，统一 bigint unsigned NOT NULL AUTO_INCREMENT。
 */
export const MIGRATION_SQL: string[] = [
  "CREATE TABLE IF NOT EXISTS `preferences` (\n\t`id` bigint unsigned NOT NULL AUTO_INCREMENT,\n\t`user_id` bigint unsigned NOT NULL,\n\t`review_group_size` int NOT NULL DEFAULT 10,\n\t`voice_gender` enum('female','male') NOT NULL DEFAULT 'female',\n\t`voice_name` varchar(128),\n\t`daily_goal` int NOT NULL DEFAULT 5,\n\t`updated_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,\n\tCONSTRAINT `preferences_id` PRIMARY KEY(`id`),\n\tCONSTRAINT `prefs_user_idx` UNIQUE(`user_id`)\n);",
  "CREATE TABLE IF NOT EXISTS `review_records` (\n\t`id` bigint unsigned NOT NULL AUTO_INCREMENT,\n\t`user_id` bigint unsigned NOT NULL,\n\t`item_type` enum('word','sentence') NOT NULL,\n\t`item_key` varchar(191) NOT NULL,\n\t`result` enum('remembered','forgotten','correct','wrong','practiced') NOT NULL,\n\t`mode` enum('flashcard','spelling','pronunciation') NOT NULL,\n\t`created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,\n\tCONSTRAINT `review_records_id` PRIMARY KEY(`id`)\n);",
  "CREATE TABLE IF NOT EXISTS `stats` (\n\t`id` bigint unsigned NOT NULL AUTO_INCREMENT,\n\t`user_id` bigint unsigned NOT NULL,\n\t`words_learned` int NOT NULL DEFAULT 0,\n\t`sentences_learned` int NOT NULL DEFAULT 0,\n\t`study_seconds` int NOT NULL DEFAULT 0,\n\t`streak_days` int NOT NULL DEFAULT 0,\n\t`updated_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,\n\tCONSTRAINT `stats_id` PRIMARY KEY(`id`),\n\tCONSTRAINT `stats_user_idx` UNIQUE(`user_id`)\n);",
  "CREATE TABLE IF NOT EXISTS `study_sessions` (\n\t`id` bigint unsigned NOT NULL AUTO_INCREMENT,\n\t`user_id` bigint unsigned NOT NULL,\n\t`duration_seconds` int NOT NULL,\n\t`page` varchar(32) NOT NULL DEFAULT 'unknown',\n\t`created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,\n\tCONSTRAINT `study_sessions_id` PRIMARY KEY(`id`)\n);",
  "CREATE TABLE IF NOT EXISTS `system_sentences` (\n\t`id` bigint unsigned NOT NULL AUTO_INCREMENT,\n\t`sentence_key` varchar(64) NOT NULL,\n\t`korean` varchar(512) NOT NULL,\n\t`romanization` varchar(512) NOT NULL DEFAULT '',\n\t`chinese` varchar(512) NOT NULL DEFAULT '',\n\t`level` varchar(32) NOT NULL DEFAULT 'daily',\n\t`words_json` text,\n\tCONSTRAINT `system_sentences_id` PRIMARY KEY(`id`),\n\tCONSTRAINT `syssent_key_idx` UNIQUE(`sentence_key`)\n);",
  "CREATE TABLE IF NOT EXISTS `system_words` (\n\t`id` bigint unsigned NOT NULL AUTO_INCREMENT,\n\t`word_key` varchar(64) NOT NULL,\n\t`ko` varchar(128) NOT NULL,\n\t`rom` varchar(255) NOT NULL DEFAULT '',\n\t`zh` varchar(255) NOT NULL,\n\t`pos` varchar(32) NOT NULL DEFAULT '',\n\t`example_ko` text,\n\t`example_zh` text,\n\t`category` varchar(32) NOT NULL DEFAULT '',\n\t`source` varchar(32) NOT NULL DEFAULT 'builtin',\n\tCONSTRAINT `system_words_id` PRIMARY KEY(`id`),\n\tCONSTRAINT `syswords_key_idx` UNIQUE(`word_key`)\n);",
  "CREATE TABLE IF NOT EXISTS `user_corpus` (\n\t`id` bigint unsigned NOT NULL AUTO_INCREMENT,\n\t`user_id` bigint unsigned NOT NULL,\n\t`title` varchar(255) NOT NULL,\n\t`kind` enum('audio','video','pdf','text') NOT NULL,\n\t`size_bytes` int NOT NULL DEFAULT 0,\n\t`duration_seconds` int NOT NULL DEFAULT 0,\n\t`local_key` varchar(128) NOT NULL DEFAULT '',\n\t`created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,\n\tCONSTRAINT `user_corpus_id` PRIMARY KEY(`id`)\n);",
  "CREATE TABLE IF NOT EXISTS `user_vocab` (\n\t`id` bigint unsigned NOT NULL AUTO_INCREMENT,\n\t`user_id` bigint unsigned NOT NULL,\n\t`ko` varchar(128) NOT NULL,\n\t`rom` varchar(255) NOT NULL DEFAULT '',\n\t`zh` varchar(255) NOT NULL DEFAULT '',\n\t`pos` varchar(32) NOT NULL DEFAULT '',\n\t`source` varchar(32) NOT NULL DEFAULT 'system',\n\t`example_ko` varchar(512) NOT NULL DEFAULT '',\n\t`example_zh` varchar(512) NOT NULL DEFAULT '',\n\t`mastered` boolean NOT NULL DEFAULT false,\n\t`created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,\n\tCONSTRAINT `user_vocab_id` PRIMARY KEY(`id`),\n\tCONSTRAINT `vocab_user_ko_idx` UNIQUE(`user_id`,`ko`)\n);",
  "CREATE TABLE IF NOT EXISTS `users` (\n\t`id` bigint unsigned NOT NULL AUTO_INCREMENT,\n\t`device_id` varchar(64) NOT NULL,\n\t`openid` varchar(128),\n\t`nickname` varchar(64) NOT NULL DEFAULT '韩语学习者',\n\t`plan` enum('free','pro') NOT NULL DEFAULT 'free',\n\t`created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,\n\t`last_active_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,\n\tCONSTRAINT `users_id` PRIMARY KEY(`id`),\n\tCONSTRAINT `users_device_idx` UNIQUE(`device_id`),\n\tCONSTRAINT `users_openid_idx` UNIQUE(`openid`)\n);",
  "CREATE INDEX `review_user_item_idx` ON `review_records` (`user_id`,`item_type`,`item_key`);",
  "CREATE INDEX `sessions_user_idx` ON `study_sessions` (`user_id`);",
  "CREATE INDEX `corpus_user_idx` ON `user_corpus` (`user_id`);"
];

/**
 * 增量列补丁：针对已建表的旧部署，启动时逐列检查并补列（幂等）。
 * 每项：[表名, 列名, 补列 SQL]
 */
export const COLUMN_PATCHES: [string, string, string][] = [
  ["user_vocab", "example_ko", "ALTER TABLE `user_vocab` ADD COLUMN `example_ko` varchar(512) NOT NULL DEFAULT ''"],
  ["user_vocab", "example_zh", "ALTER TABLE `user_vocab` ADD COLUMN `example_zh` varchar(512) NOT NULL DEFAULT ''"],
];
