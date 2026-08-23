/**
 * auth.tsx — 账号系统前端状态（v2.3.0）
 * 职责：token 存取、当前用户缓存、登录/注册/退出动作。
 * 用法：main.tsx 里 <AuthProvider> 包裹 <App />，组件内 const { user, ... } = useAuth()。
 * 说明：登录是可选增强——未登录时应用照常离线可用（匿名 deviceId 体系）。
 */
import { createContext, useCallback, useContext, useEffect, useState } from 'react';
import type { ReactNode } from 'react';
import { client, AUTH_TOKEN_KEY, getDeviceId } from './sync';

/** 登录用户公开信息（与后端 users 表对应，密码哈希永不下发） */
export interface AuthUser {
  id: number;
  nickname: string;
  email: string | null;
  phone: string | null;
  plan: 'free' | 'pro';
  notifyEmail: boolean;
  notifyBrowser: boolean;
  remindTime: string;
  createdAt: string | Date;
}

interface AuthState {
  /** 当前登录用户；null = 未登录（匿名模式） */
  user: AuthUser | null;
  /** 启动时正在校验本地 token */
  loading: boolean;
  /** 登录/注册成功回调保存 token 并刷新用户 */
  applyAuth: (token: string, user: AuthUser) => void;
  /** 重新拉取当前用户（绑定/改资料后调用） */
  refresh: () => Promise<void>;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthState>({
  user: null,
  loading: true,
  applyAuth: () => {},
  refresh: async () => {},
  logout: async () => {},
});

export function useAuth() {
  return useContext(AuthContext);
}

export function getToken(): string | null {
  try {
    return window.localStorage.getItem(AUTH_TOKEN_KEY);
  } catch {
    return null;
  }
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    if (!getToken()) {
      setUser(null);
      setLoading(false);
      return;
    }
    try {
      const res = await client.auth.me.query();
      setUser((res.user as AuthUser | null) ?? null);
      if (!res.user) window.localStorage.removeItem(AUTH_TOKEN_KEY); // token 已失效
    } catch {
      // 后端不可达：保留本地登录态，离线可用
    } finally {
      setLoading(false);
    }
  }, []);

  // 启动时校验本地 token
  useEffect(() => {
    void refresh();
  }, [refresh]);

  const applyAuth = useCallback((token: string, u: AuthUser) => {
    try {
      window.localStorage.setItem(AUTH_TOKEN_KEY, token);
    } catch { /* 隐私模式 */ }
    setUser(u);
    setLoading(false);
  }, []);

  const logout = useCallback(async () => {
    try {
      await client.auth.logout.mutate();
    } catch { /* 静默 */ }
    try {
      window.localStorage.removeItem(AUTH_TOKEN_KEY);
    } catch { /* ignore */ }
    setUser(null);
  }, []);

  return (
    <AuthContext.Provider value={{ user, loading, applyAuth, refresh, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

/** 登录/注册成功后：检查匿名设备是否有历史数据，供「合并/重新开始」弹窗使用 */
export async function checkAnonymousData() {
  try {
    return await client.auth.anonStatus.query({ deviceId: getDeviceId() });
  } catch {
    return { hasData: false, vocab: 0, reviews: 0, sessions: 0, corpus: 0 };
  }
}

/** 用户选择：合并匿名数据到账号 / 账号全新开始 */
export async function resolveAnonymousData(choice: 'merge' | 'fresh') {
  try {
    return await client.auth.mergeAnonymous.mutate({ deviceId: getDeviceId(), choice });
  } catch {
    return { merged: false };
  }
}
