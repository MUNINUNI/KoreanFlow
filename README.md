# KoreanFlow 韩语学习工具

零基础友好的韩语学习 Web 应用：从 40 音入门到单词、发音、语料、复习的完整学习闭环。

- 当前版本：**v2.0.1**（2026-08-18）· 版本历史见 [CHANGELOG.md](./CHANGELOG.md)
- 项目全景思维导图：[markmap.svg](./markmap.svg)（源文件 [markmap.md](./markmap.md)）
- 版本迭代流程：[docs/版本迭代管理规范.md](./docs/版本迭代管理规范.md)

## 功能

| 模块 | 说明 |
|---|---|
| 首页 | 学习数据总览、每日一句、开始学习 |
| 40音入门 | 韩语字母表、发音讲解、跟读 |
| 单词学习 | 内置韩语词库、分组学习 |
| 发音练习 | 录音波形可视化、跟读对比 |
| 语料中心 | 音频/视频/PDF/文本导入、划词翻译、A-B 循环、倍速 |
| 复习系统 | 单词闪卡 / 拼写练习 / 发音复习 三种模式 |
| 用户中心 | 学习统计、复习节奏与 TTS 音色偏好 |

## 技术栈

- 前端：React 18 + Vite + TypeScript + Tailwind CSS + shadcn/ui
- 后端：Hono + tRPC（类型安全 API）
- 数据库：MySQL + Drizzle ORM（首次启动自动建表、灌入内置词库）

## 本地运行（需要 Node.js 20+）

```bash
npm install        # 安装依赖
npm run dev        # 启动开发服务器，浏览器打开 http://localhost:3000
```

> 不配置数据库也能先跑前端页面；需要云端同步/用户中心数据时，
> 复制 `.env.example` 为 `.env` 并填入 `DATABASE_URL` 即可。

## 服务器部署

见 [docs/deploy/部署说明.md](./docs/deploy/部署说明.md)（含 nginx 配置与一键启动说明）。

## 目录速览

```
src/pages/      7 大页面（首页/40音/单词/发音/语料/复习/用户中心）
src/components/ 业务组件 + shadcn/ui 组件库
src/lib/        本地存储、学习统计、TTS、云端同步
api/            tRPC 后端路由与服务
db/             Drizzle 数据表结构与种子数据
docs/           设计文档、部署文档、版本规范、历史归档
```
