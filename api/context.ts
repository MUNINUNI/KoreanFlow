import type { FetchCreateContextFnOptions } from "@trpc/server/adapters/fetch";

export type TrpcContext = {
  req: Request;
  resHeaders: Headers;
  /** v2.3.0：Bearer token 解析出的登录用户 ID（未登录为 null） */
  userId: number | null;
  /** 原始 token（logout 时删除会话用） */
  token: string | null;
};

export async function createContext(
  opts: FetchCreateContextFnOptions,
): Promise<TrpcContext> {
  const base: TrpcContext = { req: opts.req, resHeaders: opts.resHeaders, userId: null, token: null };
  const header = opts.req.headers.get("authorization") ?? "";
  const match = /^Bearer\s+([0-9a-f]{64})$/i.exec(header.trim());
  if (!match) return base;
  try {
    // 延迟加载，避免未登录请求也触发数据库连接
    const { getUserByToken } = await import("./queries/auth");
    const user = await getUserByToken(match[1]);
    if (user) {
      base.userId = user.id;
      base.token = match[1];
    }
  } catch {
    // 数据库不可达时按未登录处理，前端自动离线降级
  }
  return base;
}
