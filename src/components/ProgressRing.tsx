/**
 * ProgressRing — SVG 圆环进度（今日目标、40音掌握度）
 * 用法：<ProgressRing percent={60} size={56} label="60%" />
 */
interface ProgressRingProps {
  /** 0–100 */
  percent: number;
  /** 圆环尺寸 px */
  size?: number;
  /** 线条宽度 */
  strokeWidth?: number;
  /** 进度色 */
  color?: string;
  /** 中心文字（默认显示百分比） */
  label?: string;
  className?: string;
}

export default function ProgressRing({
  percent,
  size = 56,
  strokeWidth = 6,
  color = '#C96F4A',
  label,
  className = '',
}: ProgressRingProps) {
  const clamped = Math.min(100, Math.max(0, percent));
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference * (1 - clamped / 100);

  return (
    <div className={`relative inline-flex items-center justify-center ${className}`} style={{ width: size, height: size }}>
      <svg width={size} height={size} className="-rotate-90">
        {/* 底环 */}
        <circle cx={size / 2} cy={size / 2} r={radius} fill="none" stroke="#E8DFD3" strokeWidth={strokeWidth} />
        {/* 进度环 */}
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke={color}
          strokeWidth={strokeWidth}
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={offset}
          style={{ transition: 'stroke-dashoffset 0.8s cubic-bezier(0.22,1,0.36,1)' }}
        />
      </svg>
      <span className="absolute text-xs font-bold text-ink">{label ?? `${Math.round(clamped)}%`}</span>
    </div>
  );
}
