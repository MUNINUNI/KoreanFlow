/**
 * EmptyState — 空状态插画 + 引导文案 + CTA 按钮
 * 用法：<EmptyState image="/empty-vocab.svg" title="生词本还是空的" description="..." action={{label:'去学单词', to:'/vocabulary'}} />
 */
import { Link } from 'react-router';

interface EmptyStateProps {
  /** 插画路径（/empty-vocab.svg 等） */
  image: string;
  title: string;
  description?: string;
  /** CTA 按钮（可选） */
  action?: { label: string; to: string };
  className?: string;
}

export default function EmptyState({ image, title, description, action, className = '' }: EmptyStateProps) {
  return (
    <div className={`flex flex-col items-center gap-4 py-12 text-center ${className}`}>
      <img src={image} alt="" className="w-56 max-w-full" loading="lazy" />
      <h3 className="font-serif text-lg font-bold text-ink">{title}</h3>
      {description && <p className="max-w-sm text-sm text-ink-secondary">{description}</p>}
      {action && (
        <Link
          to={action.to}
          className="mt-2 rounded-full bg-terracotta px-6 py-2.5 text-sm font-medium text-paper shadow-card transition-all duration-200 ease-quint hover:bg-terracotta-deep"
        >
          {action.label}
        </Link>
      )}
    </div>
  );
}
