import { Hono } from "hono";
import { bodyLimit } from "hono/body-limit";
import type { HttpBindings } from "@hono/node-server";
import { fetchRequestHandler } from "@trpc/server/adapters/fetch";
import { appRouter } from "./router";
import { createContext } from "./context";
import { env } from "./lib/env";

const app = new Hono<{ Bindings: HttpBindings }>();

app.use(bodyLimit({ maxSize: 50 * 1024 * 1024 }));
app.use("/api/trpc/*", async (c) => {
  return fetchRequestHandler({
    endpoint: "/api/trpc",
    req: c.req.raw,
    router: appRouter,
    createContext,
  });
});
app.all("/api/*", (c) => c.json({ error: "Not Found" }, 404));

export default app;

if (env.isProduction) {
  const { serve } = await import("@hono/node-server");
  const { serveStaticFiles } = await import("./lib/vite");
  const { autoMigrateAndSeed } = await import("./autoboot");

  // 首启自动建表 + 灌入系统语料（幂等，后台执行不阻塞启动；失败前端自动离线降级）
  void autoMigrateAndSeed();

  // 每日学习提醒调度：每 5 分钟检查一次到点用户（站内通知 + 邮件发件箱，v2.3.0）
  setInterval(() => {
    void import("./queries/auth")
      .then((m) => m.dispatchDueReminders())
      .then((n) => { if (n > 0) console.log(`[remind] 已发送 ${n} 条学习提醒`); })
      .catch(() => { /* 数据库不可达时静默 */ });
  }, 5 * 60 * 1000);

  serveStaticFiles(app);

  const port = parseInt(process.env.PORT || "3000");
  serve({ fetch: app.fetch, port }, () => {
    console.log(`Server running on http://localhost:${port}/`);
  });
}
