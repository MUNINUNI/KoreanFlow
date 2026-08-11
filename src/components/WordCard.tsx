/**
 * WordCard — 3D 翻卡词卡组件（单词学习页使用）
 * 正面：分类标签 + 韩语词 + 罗马音 + 发音钮；背面：中文释义 + 词性 + 例句 + 收藏星。
 * 翻面 rotateY 0→180°（600ms, easeOutQuint），容器透视 1200px。
 */
import { motion } from 'framer-motion';
import { Star } from 'lucide-react';
import SpeakButton from './SpeakButton';
import { CATEGORIES, type Word } from '@/data/words';
import { cn } from '@/lib/utils';

interface WordCardProps {
  word: Word;
  /** 是否已翻面 */
  flipped: boolean;
  /** 点击卡片翻面 */
  onFlip: () => void;
  /** 是否已收藏（生词本） */
  isFavorite: boolean;
  onToggleFavorite: () => void;
}

const FLIP_TRANSITION = { duration: 0.6, ease: [0.22, 1, 0.36, 1] as [number, number, number, number] };

export default function WordCard({ word, flipped, onFlip, isFavorite, onToggleFavorite }: WordCardProps) {
  const category = CATEGORIES.find((c) => c.id === word.category);

  return (
    <div className="w-full max-w-[480px]" style={{ perspective: 1200 }}>
      {/* 点击卡片任意处翻面 */}
      <motion.div
        role="button"
        aria-label={flipped ? '翻到词卡正面' : '翻到词卡背面查看释义'}
        onClick={onFlip}
        className="relative h-[300px] w-full cursor-pointer md:h-[320px]"
        style={{ transformStyle: 'preserve-3d' }}
        animate={{ rotateY: flipped ? 180 : 0 }}
        transition={FLIP_TRANSITION}
      >
        {/* ===== 正面 ===== */}
        <div
          className="absolute inset-0 flex flex-col items-center justify-center gap-3 rounded-3xl border border-warm bg-paper p-6 shadow-card"
          style={{ backfaceVisibility: 'hidden' }}
        >
          <span className="absolute left-5 top-5 rounded-full bg-honey/15 px-3 py-1 text-xs font-medium text-honey">
            {category?.label}
          </span>
          <p className="font-kr text-4xl font-bold text-ink md:text-[40px]">{word.ko}</p>
          <p className="text-sm text-ink-muted">{word.rom}</p>
          <div onClick={(e) => e.stopPropagation()}>
            <SpeakButton text={word.ko} size="lg" />
          </div>
          <p className="absolute bottom-4 text-xs text-ink-muted">点击卡片查看释义</p>
        </div>

        {/* ===== 背面 ===== */}
        <div
          className="absolute inset-0 flex flex-col items-center justify-center gap-3 rounded-3xl border border-warm bg-sand/60 bg-paper p-6 shadow-card"
          style={{ backfaceVisibility: 'hidden', transform: 'rotateY(180deg)' }}
        >
          {/* 收藏星（右上） */}
          <button
            type="button"
            aria-label={isFavorite ? '从生词本移除' : '加入生词本'}
            onClick={(e) => {
              e.stopPropagation();
              onToggleFavorite();
            }}
            className="absolute right-5 top-5 rounded-full p-1 transition-transform duration-200 hover:scale-110"
          >
            <Star
              size={24}
              className={cn(
                'transition-colors duration-200',
                isFavorite ? 'fill-honey text-honey' : 'text-ink-muted hover:text-honey',
              )}
            />
          </button>
          <span className="rounded-full bg-terracotta-soft px-3 py-1 text-xs font-medium text-terracotta">{word.pos}</span>
          <p className="font-serif text-2xl font-bold text-ink">{word.zh}</p>
          {/* 例句：韩语 + 中文，各带小喇叭 */}
          <div className="mt-1 flex flex-col items-center gap-1.5 text-center">
            <div className="flex items-center gap-2">
              <p className="font-kr text-base text-ink">{word.exampleKo}</p>
              <div onClick={(e) => e.stopPropagation()}>
                <SpeakButton text={word.exampleKo} size="sm" />
              </div>
            </div>
            <p className="text-sm text-ink-secondary">{word.exampleZh}</p>
          </div>
        </div>
      </motion.div>
    </div>
  );
}
