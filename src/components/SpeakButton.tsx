/**
 * SpeakButton — 通用 TTS 发音按钮（喇叭图标 + 声波涟漪动效）
 * 用法：<SpeakButton text="안녕하세요" rate={0.7} size="md" />
 */
import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Volume2, VolumeX } from 'lucide-react';
import { speakKorean, isTtsSupported } from '@/lib/tts';

interface SpeakButtonProps {
  /** 要朗读的韩语文本 */
  text: string;
  /** 语速 0.6–1.2，默认常速 1 */
  rate?: number;
  size?: 'sm' | 'md' | 'lg';
  className?: string;
  /** 不支持 TTS 时的提示回调（默认 console 提示） */
  onUnsupported?: () => void;
}

const SIZE_CLASS = {
  sm: 'h-8 w-8',
  md: 'h-11 w-11',
  lg: 'h-14 w-14',
} as const;
const ICON_SIZE = { sm: 14, md: 20, lg: 26 } as const;

export default function SpeakButton({ text, rate = 1, size = 'md', className = '', onUnsupported }: SpeakButtonProps) {
  const [speaking, setSpeaking] = useState(false);
  const [rippleKey, setRippleKey] = useState(0);

  const handleClick = () => {
    // 触发涟漪动效
    setRippleKey((k) => k + 1);
    const ok = speakKorean(text, {
      rate,
      onStart: () => setSpeaking(true),
      onEnd: () => setSpeaking(false),
    });
    if (!ok) {
      onUnsupported?.();
    }
  };

  const supported = isTtsSupported();

  return (
    <motion.button
      type="button"
      aria-label={`发音：${text}`}
      onClick={handleClick}
      // 图标按压脉冲 1→0.9→1
      whileTap={{ scale: 0.9 }}
      whileHover={{ scale: 1.05 }}
      transition={{ duration: 0.2, ease: [0.22, 1, 0.36, 1] }}
      className={`relative inline-flex items-center justify-center rounded-full bg-terracotta text-paper shadow-card hover:bg-terracotta-deep ${SIZE_CLASS[size]} ${className}`}
    >
      {/* 发音涟漪：从中心扩散两圈 */}
      <AnimatePresence>
        {rippleKey > 0 && (
          <motion.span
            key={rippleKey}
            className="pointer-events-none absolute inset-0 rounded-full border-2 border-terracotta"
            initial={{ scale: 0.8, opacity: 0.5 }}
            animate={{ scale: 1.6, opacity: 0 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.6, ease: 'easeOut' }}
          />
        )}
      </AnimatePresence>
      {supported ? (
        <Volume2 size={ICON_SIZE[size]} className={speaking ? 'animate-pulse' : ''} />
      ) : (
        <VolumeX size={ICON_SIZE[size]} />
      )}
    </motion.button>
  );
}
