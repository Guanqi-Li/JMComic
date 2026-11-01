import type { ShapeStyle, Color, ColorScheme, DynamicShapeStyle } from "scripting"
import type { AppTheme, AppearanceMode } from "./types"

const APPEARANCE_MODE_KEY = "comic_appearance_mode"
const LAST_SYSTEM_COLOR_SCHEME_KEY = "comic_last_system_color_scheme"

export const loadAppearanceMode = (): AppearanceMode => {
  const raw = Storage.get<string>(APPEARANCE_MODE_KEY)
  return raw === "light" || raw === "dark" ? raw : "auto"
}

export const saveAppearanceMode = (mode: AppearanceMode): void => {
  Storage.set(APPEARANCE_MODE_KEY, mode)
}

export const loadLastSystemColorScheme = (): ColorScheme => {
  const raw = Storage.get<string>(LAST_SYSTEM_COLOR_SCHEME_KEY)
  return raw === "light" || raw === "dark" ? raw : "dark"
}

export const saveLastSystemColorScheme = (scheme: ColorScheme): void => {
  Storage.set(LAST_SYSTEM_COLOR_SCHEME_KEY, scheme)
}

export const resolveThemeScheme = (mode: AppearanceMode, systemScheme: ColorScheme): ColorScheme => (
  mode === "auto" ? systemScheme : mode
)

const dynamicStyle = (light: ShapeStyle, dark: ShapeStyle): DynamicShapeStyle => ({ light, dark })

const dynamicGradient = (
  lightColors: Color[],
  darkColors: Color[],
): DynamicShapeStyle => ({
  light: { colors: lightColors, startPoint: "topLeading", endPoint: "bottomTrailing" },
  dark: { colors: darkColors, startPoint: "topLeading", endPoint: "bottomTrailing" },
})

export const readSystemColorScheme = (): ColorScheme => {
  try {
    const directScheme = (globalThis as { colorScheme?: ColorScheme }).colorScheme
    if (directScheme === "light" || directScheme === "dark") {
      saveLastSystemColorScheme(directScheme)
      return directScheme
    }
  } catch {
    /**/
  }

  try {
    const scheme = (globalThis as { colorScheme?: ColorScheme }).colorScheme
    if (scheme === "light" || scheme === "dark") {
      saveLastSystemColorScheme(scheme)
      return scheme
    }
  } catch {
    /**/
  }

  return loadLastSystemColorScheme()
}

const initialAppearanceMode = loadAppearanceMode()
let activeThemeSchemeOverride: ColorScheme | null = initialAppearanceMode === "auto"
  ? null
  : initialAppearanceMode

export const setActiveThemeScheme = (scheme: ColorScheme | null): void => {
  activeThemeSchemeOverride = scheme
}

export const buildAppTheme = (scheme: ColorScheme): AppTheme => {
  if (scheme === "dark") {
    return {
      scheme,
      pageBackground: "systemBackground",
      glassOuter: dynamicStyle("rgba(255,255,255,0.90)", "rgba(255,255,255,0.06)"),
      glassInner: dynamicStyle("regularMaterial", "ultraThickMaterial"),
      sectionCard: dynamicStyle("secondarySystemGroupedBackground", "secondarySystemGroupedBackground"),
      softFill: dynamicStyle("tertiarySystemFill", "tertiarySystemFill"),
      softFillStrong: dynamicStyle("secondarySystemFill", "secondarySystemFill"),
      iconChip: dynamicStyle("secondarySystemBackground", "tertiarySystemFill"),
      iconChipTint: dynamicStyle("rgba(0,122,255,0.10)", "rgba(0,122,255,0.18)"),
      iconChipWarning: dynamicStyle("rgba(255,149,0,0.12)", "rgba(255,149,0,0.18)"),
      rowBackground: dynamicStyle("tertiarySystemFill", "tertiarySystemFill"),
      rowProminentBackground: dynamicStyle("secondarySystemBackground", "secondarySystemBackground"),
      cardOuter: dynamicStyle("secondarySystemBackground", "secondarySystemBackground"),
      cardInner: dynamicStyle("tertiarySystemBackground", "tertiarySystemBackground"),
      textPrimary: "label",
      textSecondary: "secondaryLabel",
      textTertiary: "tertiaryLabel",
      textMuted: "secondaryLabel",
      pillInactiveOuter: dynamicStyle("secondarySystemFill", "secondarySystemFill"),
      pillInactiveInner: dynamicStyle("tertiarySystemBackground", "tertiarySystemFill"),
      filterInactiveOuter: dynamicStyle("secondarySystemFill", "secondarySystemFill"),
      filterInactiveInner: dynamicStyle("tertiarySystemBackground", "tertiarySystemFill"),
      neutralActiveOuter: dynamicStyle("secondarySystemFill", "secondarySystemFill"),
      neutralActiveInner: dynamicStyle("secondarySystemBackground", "secondarySystemBackground"),
      accentActiveOuter: dynamicStyle("rgba(0,122,255,0.14)", "rgba(0,122,255,0.28)"),
      accentActiveInner: dynamicGradient(
        ["rgba(247,250,255,0.99)", "rgba(235,243,255,0.96)"],
        ["rgba(36,70,116,0.98)", "rgba(28,55,93,0.96)"],
      ),
      successActiveOuter: dynamicStyle("rgba(52,199,89,0.14)", "rgba(52,199,89,0.24)"),
      successActiveInner: dynamicGradient(
        ["rgba(245,255,249,0.99)", "rgba(231,249,237,0.96)"],
        ["rgba(32,84,53,0.98)", "rgba(26,66,42,0.96)"],
      ),
      dangerActiveOuter: dynamicStyle("rgba(255,59,48,0.14)", "rgba(255,59,48,0.24)"),
      dangerActiveInner: dynamicGradient(
        ["rgba(255,248,248,0.99)", "rgba(255,236,235,0.96)"],
        ["rgba(104,41,41,0.98)", "rgba(84,32,32,0.96)"],
      ),
    }
  }

  return {
    scheme,
    pageBackground: "systemBackground",
    glassOuter: dynamicStyle("rgba(255,255,255,0.90)", "rgba(255,255,255,0.06)"),
    glassInner: dynamicStyle("regularMaterial", "ultraThickMaterial"),
    sectionCard: dynamicStyle("secondarySystemGroupedBackground", "secondarySystemGroupedBackground"),
    softFill: dynamicStyle("tertiarySystemFill", "tertiarySystemFill"),
    softFillStrong: dynamicStyle("secondarySystemFill", "secondarySystemFill"),
    iconChip: dynamicStyle("secondarySystemBackground", "tertiarySystemFill"),
    iconChipTint: dynamicStyle("rgba(0,122,255,0.10)", "rgba(0,122,255,0.18)"),
    iconChipWarning: dynamicStyle("rgba(255,149,0,0.12)", "rgba(255,149,0,0.18)"),
    rowBackground: dynamicStyle("tertiarySystemFill", "tertiarySystemFill"),
    rowProminentBackground: dynamicStyle("secondarySystemBackground", "secondarySystemBackground"),
    cardOuter: dynamicStyle("secondarySystemBackground", "secondarySystemBackground"),
    cardInner: dynamicStyle("tertiarySystemBackground", "tertiarySystemBackground"),
    textPrimary: "label",
    textSecondary: "secondaryLabel",
    textTertiary: "tertiaryLabel",
    textMuted: "tertiaryLabel",
    pillInactiveOuter: dynamicStyle("secondarySystemFill", "secondarySystemFill"),
    pillInactiveInner: dynamicStyle("tertiarySystemBackground", "tertiarySystemFill"),
    filterInactiveOuter: dynamicStyle("secondarySystemFill", "secondarySystemFill"),
    filterInactiveInner: dynamicStyle("tertiarySystemBackground", "tertiarySystemFill"),
    neutralActiveOuter: dynamicStyle("secondarySystemFill", "secondarySystemFill"),
    neutralActiveInner: dynamicStyle("secondarySystemBackground", "secondarySystemBackground"),
    accentActiveOuter: dynamicStyle("rgba(0,122,255,0.14)", "rgba(0,122,255,0.28)"),
    accentActiveInner: dynamicGradient(
      ["rgba(247,250,255,0.99)", "rgba(235,243,255,0.96)"],
      ["rgba(36,70,116,0.98)", "rgba(28,55,93,0.96)"],
    ),
    successActiveOuter: dynamicStyle("rgba(52,199,89,0.14)", "rgba(52,199,89,0.24)"),
    successActiveInner: dynamicGradient(
      ["rgba(245,255,249,0.99)", "rgba(231,249,237,0.96)"],
      ["rgba(32,84,53,0.98)", "rgba(26,66,42,0.96)"],
    ),
    dangerActiveOuter: dynamicStyle("rgba(255,59,48,0.14)", "rgba(255,59,48,0.24)"),
    dangerActiveInner: dynamicGradient(
      ["rgba(255,248,248,0.99)", "rgba(255,236,235,0.96)"],
      ["rgba(104,41,41,0.98)", "rgba(84,32,32,0.96)"],
    ),
  }
}

export const appearanceModeLabel = (mode: AppearanceMode, systemScheme: ColorScheme): string => {
  if (mode === "auto") return `自动 · 跟随系统 ${systemScheme === "dark" ? "深色" : "浅色"}`
  return mode === "dark" ? "深色" : "浅色"
}

export const currentTheme = (): AppTheme => buildAppTheme(
  activeThemeSchemeOverride ?? loadLastSystemColorScheme(),
)
