# ──────────────────────────────────────────────
# KoreanFlow 全栈应用 Dockerfile
# 前端 React/Vite 构建 + 后端 Hono/tRPC 打包（dist/boot.js 零依赖）
# ──────────────────────────────────────────────

# ── 构建阶段 ──
FROM node:20-alpine AS build
WORKDIR /app

# 构建期内存上限放大（2678 个模块 + 大体积 wasm 资源，防止小内存容器 OOM）
ENV NODE_OPTIONS=--max-old-space-size=4096

# 先装依赖（利用 Docker 层缓存：仅 package*.json 变化时重装）
COPY package.json package-lock.json ./
RUN npm ci --ignore-scripts --no-audit --no-fund

# 拷贝源码并构建（--ignore-scripts 跳过了 esbuild 的 postinstall，需手动补跑）
COPY . .
RUN node node_modules/esbuild/install.js && npm run build

# ── 运行阶段 ──
FROM node:20-alpine
WORKDIR /app
ENV NODE_ENV=production

# dist/boot.js 为 esbuild 零依赖打包产物；dist/public 为前端静态资源
COPY --from=build /app/dist ./dist
# 带上 .env（数据库连接等；若平台注入了同名环境变量，dotenv 不会覆盖，平台值优先）
COPY .env ./.env

# 端口由平台注入 PORT 环境变量，默认 3000
EXPOSE 3000
CMD ["node", "dist/boot.js"]
