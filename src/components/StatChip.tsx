/**
 * StatChip — 统计徽章卡片（连续天数 / 已学单词 / 今日进度等）
 * 用法：<StatChip icon={<Flame/>} label="连续学习" value="7" unit="天" tone="honey" />
 */
import type { ReactNode } from 'react';

interface StatChipProps {
  icon: ReactNode;
  label: string;
  /** 主数值（数字或文本） */
  value: ReactNode;
  /** 数值单位（如 天 / %） */
  unit?: string;
  /** 图标色调 */
  tone?: 'honey' | 'terracotta' | 'olive' | 'clay';
  /** 右侧附加内容（如 ProgressRing） */
  extra?: ReactNode;
  className?: string;
}

const TONE_CLASS = {
  honey: 'bg-honey/15 text-honey',
  terracotta: 'bg-terracotta-soft text-terracotta',
  olive: 'bg-olive/15 text-olive',
  clay: 'bg-terracotta-deep/15 text-terracotta-deep',
} as const;

export default function StatChip({ icon, label, value, unit, tone = 'terracotta', extra, className = '' }: StatChipProps) {
  return (
    <div className={`flex items-center gap-3 rounded-2xl border border-warm bg-paper p-4 shadow-card ${className}`}>
      <span className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ${TONE_CLASS[tone]}`}>
        {icon}
      </span>
      <div className="min-w-0 flex-1">
        <p className="text-xs text-ink-muted">{label}</p>
        <p className="truncate text-lg font-bold text-ink">
          {value}
          {unit && <span className="ml-0.5 text-sm font-normal text-ink-secondary">{unit}</span>}
        </p>
      </div>
      {extra}
    </div>
  );
}
