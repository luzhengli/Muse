---
version: 0.1.0
name: Muse
colors:
  background: "#FAF9F7"
  surface: "#FFFFFF"
  foreground: "#1C1917"
  muted: "#78716C"
  muted-bg: "#F5F4F2"
  border: "#E7E5E4"
  primary: "#7C3AED"
  primary-hover: "#6D28D9"
  primary-soft: "#F3EFFF"
  success: "#059669"
  success-soft: "#ECFDF5"
  warning: "#D97706"
  warning-soft: "#FFFBEB"
  danger: "#DC2626"
  danger-soft: "#FEF2F2"
typography:
  font-sans: 'ui-sans-serif, system-ui, -apple-system, "PingFang SC", "Hiragino Sans GB", "Microsoft YaHei", sans-serif'
  page-title: "20px / bold"
  card-title: "14px / semibold"
  body: "14px / regular / 1.8"
  caption: "12px / regular"
  micro: "10px / regular"
spacing:
  page-max-width: "64rem"
  page-padding: "2rem 1.5rem"
  card-padding: "1rem"
  gap-grid: "0.75rem"
  gap-form: "0.5rem"
rounded:
  card: "0.75rem"
  control: "0.5rem"
  badge: "9999px"
motion:
  fast: "120ms"
  normal: "220ms"
  slow: "320ms"
  easing: "cubic-bezier(0.16, 1, 0.3, 1)"
---

## Overview

Muse 是面向自媒体创作者的本地优先创作工厂。视觉基调为「安静的工作室」：
米白纸感底色 + 白色卡片承载内容，紫罗兰（violet）作为唯一品牌强调色，
表达「灵感 / 缪斯」的联想；界面全中文，信息密度中等，长文阅读行高 1.8。

## Colors

- **Primary `#7C3AED`（violet-600）**：主按钮、激活导航、链接强调、选中态。hover 加深为 `#6D28D9`。浅紫 `#F3EFFF` 用于选中背景与次级按钮。
- **中性色**：背景 `#FAF9F7`（暖米白），卡片表面纯白，正文 `#1C1917`，次要文字 `#78716C`，边框 `#E7E5E4`，浅灰底 `#F5F4F2`。
- **语义色**：success 绿（已清洗/已发布）、warning 琥珀（待处理/审阅中）、danger 红（失败/删除），各配 soft 底色用于 Badge。
- **对比度**：正文与背景 ≥ 12:1；muted 文字仅用于辅助信息（≥ 4.5:1）；白字按钮仅配 primary/danger 深底。

## Typography

系统中文字体栈（PingFang SC 优先），不引入网络字体，保证本地优先与加载速度。
页面标题 20px bold；卡片标题 14px semibold；正文 14px、行高 1.8（长文编辑器同）；
辅助说明 12px；时间戳等微文本 10px。代码/平台正文预览用等宽字体 12px。

## Layout

- 左侧固定 208px 侧边导航（模块入口 + 闭环流程提示），右侧内容区最大宽度 64rem 居中。
- 列表页用 2 列卡片栅格（间距 0.75rem）；工作区页用「主内容 + 16rem 侧栏」布局。
- 表单元素间距 0.5rem，行内表单用 flex + gap。

## Elevation & Depth

层级靠边框与浅阴影表达：卡片 `border + shadow-sm`；hover 将边框变为 primary 色；
不使用大面积阴影与叠层模糊。焦点态用 2px primary outline（offset 2px）。

## Motion

- 页面切换使用 220ms 的轻微上移淡入，导航开始时以顶部细进度条立即回应；不做大幅滑动或全屏遮罩。
- AI 操作按钮在 pending 时原位显示闪光图标与流光，结果提示用 160ms 缩放淡入；编辑器和无关区域保持可交互。
- 工作台 tab 内容使用 180ms 淡入位移，按钮按下缩放至 0.97；动画仅使用 opacity 与 transform。
- 所有动效遵守 `prefers-reduced-motion`，降级为无位移、无循环动画的即时状态变化。

## Shapes

卡片圆角 0.75rem，按钮/输入框 0.5rem，Badge 全圆角胶囊。整体软几何，无锐角装饰。

## Components

- **Button**：default（紫底白字）/ secondary（浅紫底紫字）/ outline / ghost / danger 五种；尺寸 sm/default/lg。
- **Card**：Header（标题+描述）+ Content；列表项与表单容器统一用卡片。
- **Badge**：状态语义色胶囊（清洗状态、文章状态、发布状态、审阅严重度、标签）。
- **Input / Textarea / Select / Label**：白底 + 边框 + primary 焦点 outline；Label 为 12px muted。
- **Tiptap 编辑器**：白卡片内嵌，工具栏浮于上方（H2/H3/加粗/斜体/列表/引用 + AI 扩写/改写/重组）。
- **AI 溯源表面**：AI 生成内容均标注来源（版本备注「AI 初稿」、审阅记录 🤖 前缀、mock 模式全局 Badge 提示）。

## Do's and Don'ts

- Do 保持紫色为唯一品牌色，语义色只用于状态。
- Do 所有界面文案使用中文；平台名等专有名词保留原文（X）。
- Do 修改令牌时同步更新 `src/app/globals.css` 的 `@theme` 变量。
- Don't 引入新的强调色、网络字体或大面积阴影。
- Don't 在卡片外直接平铺表单控件。
