import type { Color, DynamicShapeStyle } from "scripting"

/**
 * UI 3.0 使用系统语义色与内容型间距。这里不提供装饰性渐变，
 * 页面结构应优先由 Navigation、List、Section 与排版层级表达。
 */
export const V3_DESIGN = {
  color: {
    accent: "systemPink" as Color,
    destructive: "systemRed" as Color,
    background: {
      light: "systemBackground",
      dark: "systemBackground",
    } as DynamicShapeStyle,
    groupedBackground: {
      light: "systemGroupedBackground",
      dark: "systemGroupedBackground",
    } as DynamicShapeStyle,
    surface: {
      light: "secondarySystemGroupedBackground",
      dark: "secondarySystemGroupedBackground",
    } as DynamicShapeStyle,
    elevatedSurface: {
      light: "systemBackground",
      dark: "secondarySystemBackground",
    } as DynamicShapeStyle,
    selected: {
      light: "rgba(255,45,85,0.12)",
      dark: "rgba(255,45,85,0.24)",
    } as DynamicShapeStyle,
    readerHUD: {
      light: "rgba(28,28,30,0.92)",
      dark: "rgba(28,28,30,0.92)",
    } as DynamicShapeStyle,
    readerControl: {
      light: "rgba(255,255,255,0.14)",
      dark: "rgba(255,255,255,0.14)",
    } as DynamicShapeStyle,
  },
  spacing: {
    micro: 4,
    compact: 8,
    row: 12,
    section: 16,
    page: 20,
    spacious: 24,
  },
  radius: {
    cover: 10,
    featured: 18,
    control: 12,
    sheet: 20,
  },
  metric: {
    touchTarget: 44,
    compactRowMinHeight: 52,
    rowMinHeight: 60,
    listCoverWidth: 72,
    listCoverHeight: 102,
    featuredCoverWidth: 104,
    featuredCoverHeight: 148,
  },
} as const

export type V3MainTab = "discover" | "library" | "search" | "settings"
