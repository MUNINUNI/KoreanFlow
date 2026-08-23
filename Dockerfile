# ──────────────────────────────────────────────
# KoreanFlow 全栈应用 Dockerfile
# 前端 React/Vite 构建 + 后端 Hono/tRPC 打包（dist/boot.js 零依赖）
# ──────────────────────────────────────────────

# ── 构建阶段 ──
FROM node:20-alpine AS build
WORKDIR /app

# 先装依赖（利用 Docker 层缓存：仅 package*.json 变化时重装）
COPY package.json package-lock.json ./
RUN npm ci --ignore-scripts

# 拷贝源码并构建（--ignore-scripts 跳过了 esbuild 的 postinstall，需手动补跑）
COPY . .
RUN node node_modules/esbuild/install.js && npm run build

# ── 运行阶段 ──
FROM node:20-alpine
WORKDIR /app
ENV NODE_ENV=production

# dist/boot.js 为 esbuild 零依赖打包产物；dist/public 为前端静态资源
COPY --from=build /app/dist ./dist

# 端口由平台注入 PORT 环境变量，默认 3000
EXPOSE 3000
CMD ["node", "dist/boot.js"]
