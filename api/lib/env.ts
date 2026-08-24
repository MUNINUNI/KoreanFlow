import "dotenv/config";

function required(name: string): string {
  const value = process.env[name];
  if (!value) {
    // 生产环境缺少环境变量时不再直接崩溃：静态站点仍可访问，
    // 依赖该变量的功能（数据库/登录）自动离线降级，避免整站 502/预览失败。
    if (process.env.NODE_ENV === "production") {
      console.error(`[env] 缺少环境变量 ${name}，相关功能将离线降级（页面仍可访问）`);
    }
  }
  return value ?? "";
}

export const env = {
  appId: required("APP_ID"),
  appSecret: required("APP_SECRET"),
  isProduction: process.env.NODE_ENV === "production",
  databaseUrl: required("DATABASE_URL"),
};
