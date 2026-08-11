/**
 * SectionHeading — 衬线中文大标 + 韩语小字副标 + 装饰性短线
 * 用法：<SectionHeading title="每日一句" sub="매일 조금씩" />
 */
interface SectionHeadingProps {
  /** 中文主标题 */
  title: string;
  /** 韩语小字副标（可选） */
  sub?: string;
  /** 对齐方式，默认居中 */
  align?: 'left' | 'center';
  className?: string;
}

export default function SectionHeading({ title, sub, align = 'center', className = '' }: SectionHeadingProps) {
  const alignCls = align === 'center' ? 'items-center text-center' : 'items-start text-left';
  return (
    <div className={`flex flex-col gap-3 ${alignCls} ${className}`}>
      {sub && <span className="font-kr text-sm tracking-wider text-honey">{sub}</span>}
      <h2 className="font-serif text-2xl font-bold text-ink md:text-3xl">{title}</h2>
      {/* 装饰性短线 */}
      <span className="h-0.5 w-10 rounded-full bg-terracotta" aria-hidden />
    </div>
  );
}
