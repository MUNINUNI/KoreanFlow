/** @type {import('tailwindcss').Config} */
// Tailwind 主题配置：依据 design.md 色彩 token 与字体系统
module.exports = {
  darkMode: ["class"],
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        // ---- design.md 色彩 token ----
        base: '#FAF6F0',          // 米白 全局背景
        paper: '#FFFDF9',         // 纸白 卡片
        sand: '#F3ECE1',          // 暖沙 分区底 / hover
        ink: {
          DEFAULT: '#2E2A26',     // 墨褐 主文字
          secondary: '#6B625A',   // 暖灰褐 次要文字
          muted: '#A79C90',       // 浅褐 占位说明
        },
        terracotta: {
          DEFAULT: '#C96F4A',     // 赤陶橘 主强调
          soft: '#F4DDD0',        // 强调浅底
          deep: '#B4552D',        // 陶红 / hover 加深
        },
        olive: '#7A8450',         // 橄榄绿 成功/已掌握
        honey: '#D9A441',         // 蜂蜜金 收藏/点缀
        warm: '#E8DFD3',          // 卡片描边 / 分隔线
        // ---- shadcn 变量（保留兼容 ui 组件） ----
        border: "hsl(var(--border))",
        input: "hsl(var(--input))",
        ring: "hsl(var(--ring))",
        background: "hsl(var(--background))",
        foreground: "hsl(var(--foreground))",
        primary: { DEFAULT: "hsl(var(--primary))", foreground: "hsl(var(--primary-foreground))" },
        secondary: { DEFAULT: "hsl(var(--secondary))", foreground: "hsl(var(--secondary-foreground))" },
        destructive: { DEFAULT: "hsl(var(--destructive) / <alpha-value>)", foreground: "hsl(var(--destructive-foreground) / <alpha-value>)" },
        muted: { DEFAULT: "hsl(var(--muted))", foreground: "hsl(var(--muted-foreground))" },
        accent: { DEFAULT: "hsl(var(--accent))", foreground: "hsl(var(--accent-foreground))" },
        popover: { DEFAULT: "hsl(var(--popover))", foreground: "hsl(var(--popover-foreground))" },
        card: { DEFAULT: "hsl(var(--card))", foreground: "hsl(var(--card-foreground))" },
      },
      fontFamily: {
        serif: ['"Noto Serif SC"', '"Noto Serif KR"', 'serif'],   // 中文标题衬线
        sans: ['"Noto Sans SC"', '"Noto Sans KR"', 'sans-serif'], // 中文正文/UI
        kr: ['"Noto Serif KR"', '"Noto Serif SC"', 'serif'],      // 韩语例句/词卡
      },
      borderRadius: {
        xl: "calc(var(--radius) + 4px)",
        lg: "var(--radius)",
        md: "calc(var(--radius) - 2px)",
        sm: "calc(var(--radius) - 4px)",
        xs: "calc(var(--radius) - 6px)",
      },
      boxShadow: {
        card: '0 2px 12px rgba(46,42,38,0.06)',   // 卡片阴影
        lift: '0 8px 28px rgba(46,42,38,0.10)',   // 悬停阴影
        xs: "0 1px 2px 0 rgb(0 0 0 / 0.05)",
      },
      transitionTimingFunction: {
        // easeOutQuint 质感曲线（design.md 动画约定）
        quint: 'cubic-bezier(0.22, 1, 0.36, 1)',
      },
      maxWidth: {
        content: '1120px', // 内容区最大宽度
      },
      keyframes: {
        "accordion-down": { from: { height: "0" }, to: { height: "var(--radix-accordion-content-height)" } },
        "accordion-up": { from: { height: "var(--radix-accordion-content-height)" }, to: { height: "0" } },
        "caret-blink": { "0%,70%,100%": { opacity: "1" }, "20%,50%": { opacity: "0" } },
      },
      animation: {
        "accordion-down": "accordion-down 0.2s ease-out",
        "accordion-up": "accordion-up 0.2s ease-out",
        "caret-blink": "caret-blink 1.25s ease-out infinite",
      },
    },
  },
  plugins: [require("tailwindcss-animate")],
}
