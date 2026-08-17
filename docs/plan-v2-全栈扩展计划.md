# KoreanFlow 全栈扩展计划（v2：用户中心 + 复习系统 + 数据库）

## 需求拆解
1. **数据库后端**（backend-building-swarm，--features db）：users / preferences / stats / study_sessions / review_records / system_words / system_sentences / user_corpus 表，为将来登录、付费做准备（users 表预留 openid/会员字段）
2. **用户中心页** `/profile`：累计学习单词数、句子数、学习时长；学习偏好设置（复习节奏=每组单词数、TTS 音色男声/女声）
3. **复习页** `/review`：三种模式 —— ①单词闪卡（先隐藏释义，选"记住/忘记"后显示）②单词+句子拼写练习 ③发音练习复习；首页"开始今日学习"旁加"复习"按钮
4. **语料中心联动**：语料内容可一键添加到单词学习库和发音练习库
5. TTS 音色偏好全局生效（SpeakButton 读取偏好）

## 阶段
- **S1 基线恢复**：git init + 提交当前源码为 master 基线（沙箱已清空 .git）
- **S2 后端嫁接**（主代理亲自）：读 backend-building-swarm/SKILL.md → init.sh --features db → 按本计划写 schema/queries/routers → npm run db:push → 合并 master → .env 暂存
- **S3 设计**（Pro_Designer 子代理）：产出 design/review.md、design/profile.md、design/corpus-v2.md
- **S4 共享基建**（1 个子代理）：路由 stub、Navbar 用户图标、首页复习按钮、SpeakButton 音色偏好、学习时长统计 lib、tRPC 客户端接线 → 合并
- **S5 并行页面代理**（3 个）：review 页 / profile 页 / corpus 联动
- **S6 整合**：合并 → build → Playwright 验证 → zip ×3 → build_version

## 数据策略
- 服务端 MySQL 为权威存储；localStorage/IndexedDB 作为离线缓存（媒体文件仍存 IndexedDB，DB 只存语料元数据）
- 匿名设备用户：首次访问自动以 deviceId 建档，未来接 Kimi 登录后绑定 openid
