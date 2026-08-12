/**
 * Toast — 底部胶囊提示（基于 sonner 封装，暖色风格）
 * 用法：
 *   1. 在 Layout 中挂载一次 <AppToaster />
 *   2. 任意处调用 showToast('已加入生词本')
 */
import { Toaster, toast } from 'sonner';

/** 弹出底部胶囊提示，2.5s 自动消失 */
export function showToast(message: string) {
  toast(message, { duration: 2500 });
}

/** 全局挂载点（只挂一次），样式贴合暖色纸感主题 */
export function AppToaster() {
  // 移动端（<lg）底部有 64px Tab Bar + safe-area，Toast 需上抬避免被遮挡
  const isMobile = typeof window !== 'undefined' && window.matchMedia('(max-width: 1023px)').matches;
  return (
    <Toaster
      position="bottom-center"
      offset={isMobile ? 'calc(64px + env(safe-area-inset-bottom) + 12px)' : 24}
      toastOptions={{
        style: {
          background: '#FFFDF9',
          color: '#2E2A26',
          border: '1px solid #E8DFD3',
          borderRadius: '999px',
          boxShadow: '0 8px 28px rgba(46,42,38,0.10)',
        },
      }}
    />
  );
}
