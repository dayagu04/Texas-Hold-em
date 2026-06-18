/**
 * Tailwind v4 配置：仅声明内容扫描范围。
 * 设计令牌（颜色 / 圆角 / 阴影 / 时长 / 字体）集中在 src/theme/tokens.css 的
 * @theme 块，自动生成 utility（bg-felt / text-gold / shadow-card / rounded-panel …）。
 * @type {import('tailwindcss').Config}
 */
export default {
  content: ["./index.html", "./src/**/*.{js,ts,jsx,tsx}"],
};
