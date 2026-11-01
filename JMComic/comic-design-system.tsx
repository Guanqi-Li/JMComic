import {
  Button,
  HStack,
  Image,
  ProgressView,
  Text,
  VStack,
} from "scripting"
import type { Color, DynamicShapeStyle, LinearGradient } from "scripting"

function accentGradient(tint: Color, surface: Color): LinearGradient {
  return {
    colors: [tint, surface],
    startPoint: "topLeading",
    endPoint: "bottomTrailing",
  }
}

const COMIC_SPACING = {
  micro: 4,
  compact: 8,
  row: 12,
  page: 20,
  section: 18,
  spacious: 24,
} as const

const COMIC_RADIUS = {
  hero: 24,
  section: 20,
  row: 16,
  control: 14,
} as const

/**
 * 第一阶段设计基础：新增语义 token，同时保留 layout/surface 旧入口，
 * 让现有页面无需迁移即可继续调用。
 */
export const COMIC_UI = {
  spacing: COMIC_SPACING,
  radius: COMIC_RADIUS,
  layout: {
    micro: COMIC_SPACING.micro,
    compact: COMIC_SPACING.compact,
    row: COMIC_SPACING.row,
    pageInset: COMIC_SPACING.page,
    section: COMIC_SPACING.section,
    cardPadding: COMIC_SPACING.section,
    emptyStatePadding: COMIC_SPACING.spacious,
    heroRadius: COMIC_RADIUS.hero,
    cardRadius: COMIC_RADIUS.section,
    sectionRadius: COMIC_RADIUS.section,
    rowRadius: COMIC_RADIUS.row,
    controlRadius: COMIC_RADIUS.control,
    iconSlot: 40,
    compactIconSlot: 32,
    rowMinHeight: 68,
    compactRowMinHeight: 52,
    metricMinHeight: 92,
    actionMinHeight: 44,
  },
  chrome: {
    appBackground: {
      light: "systemGroupedBackground",
      dark: "systemGroupedBackground",
    } as DynamicShapeStyle,
  },
  surface: {
    accentCard: {
      light: accentGradient("rgba(255,45,85,0.16)", "rgba(255,255,255,0.98)"),
      dark: accentGradient("rgba(255,45,85,0.28)", "rgba(38,24,31,0.98)"),
    } as DynamicShapeStyle,
    softAccentCard: {
      light: accentGradient("rgba(255,45,85,0.09)", "rgba(255,255,255,0.98)"),
      dark: accentGradient("rgba(255,45,85,0.16)", "rgba(31,26,30,0.98)"),
    } as DynamicShapeStyle,
    sectionCard: {
      light: accentGradient("rgba(255,45,85,0.07)", "rgba(255,255,255,0.96)"),
      dark: accentGradient("rgba(255,45,85,0.13)", "rgba(31,27,30,0.96)"),
    } as DynamicShapeStyle,
    rowCard: {
      light: "rgba(255,255,255,0.82)",
      dark: "rgba(255,255,255,0.11)",
    } as DynamicShapeStyle,
    statCard: {
      light: "rgba(255,255,255,0.82)",
      dark: "rgba(255,255,255,0.11)",
    } as DynamicShapeStyle,
    actionPill: {
      light: "rgba(255,255,255,0.76)",
      dark: "rgba(255,255,255,0.13)",
    } as DynamicShapeStyle,
    stateCard: {
      light: "rgba(255,255,255,0.92)",
      dark: "rgba(255,255,255,0.09)",
    } as DynamicShapeStyle,
    selectedRow: {
      light: "rgba(255,45,85,0.12)",
      dark: "rgba(255,45,85,0.23)",
    } as DynamicShapeStyle,
  },
  library: {
    card: {
      light: "secondarySystemGroupedBackground",
      dark: "secondarySystemGroupedBackground",
    } as DynamicShapeStyle,
    selectedRow: {
      light: "rgba(255,45,85,0.12)",
      dark: "rgba(255,45,85,0.23)",
    } as DynamicShapeStyle,
  },
  cover: {
    placeholder: {
      light: "tertiarySystemFill",
      dark: "secondarySystemFill",
    } as DynamicShapeStyle,
    scrim: "rgba(0,0,0,0.28)" as Color,
  },
  reader: {
    background: "#000000" as Color,
    scrim: "rgba(0,0,0,0.28)" as Color,
    hud: {
      light: "rgba(250,250,252,0.94)",
      dark: "rgba(28,28,30,0.94)",
    } as DynamicShapeStyle,
    hudControl: {
      light: "rgba(118,118,128,0.12)",
      dark: "rgba(255,255,255,0.12)",
    } as DynamicShapeStyle,
  },
}

/** 中性主题别名，供新页面采用；COMIC_UI 继续作为兼容入口。 */
export const COMIC_THEME = COMIC_UI

export type ComicHeroStat = {
  title: string
  value: string
  icon?: string
}

export function ComicHeroCard(props: {
  eyebrow?: string
  title: string
  subtitle: string
  stats?: ComicHeroStat[]
  actions?: JSX.Element | JSX.Element[]
  tone?: "primary" | "soft"
  tint?: Color
}) {
  const tint = props.tint ?? "systemPink"
  return (
    <VStack
      alignment="leading"
      spacing={COMIC_UI.layout.row}
      padding={COMIC_UI.layout.section}
      frame={{ maxWidth: "infinity", alignment: "leading" }}
      background={{
        style: props.tone === "soft" ? COMIC_UI.surface.softAccentCard : COMIC_UI.surface.accentCard,
        shape: { type: "rect", cornerRadius: COMIC_UI.layout.heroRadius },
      }}
    >
      <VStack alignment="leading" spacing={COMIC_UI.spacing.micro} frame={{ maxWidth: "infinity", alignment: "leading" }}>
        {props.eyebrow ? <Text font="caption" fontWeight="semibold" foregroundStyle={tint} lineLimit={1}>{props.eyebrow}</Text> : null}
        <Text font="title2" fontWeight="bold" lineLimit={3} multilineTextAlignment="leading" frame={{ maxWidth: "infinity", alignment: "leading" }}>{props.title}</Text>
        <Text font="subheadline" foregroundStyle="secondaryLabel" lineLimit={4} multilineTextAlignment="leading" frame={{ maxWidth: "infinity", alignment: "leading" }}>{props.subtitle}</Text>
      </VStack>
      {props.stats && props.stats.length > 0 ? (
        <HStack spacing={COMIC_UI.layout.row} frame={{ maxWidth: "infinity" }}>
          {props.stats.slice(0, 3).map((item) => <ComicStatTile key={item.title} {...item} tint={tint} />)}
        </HStack>
      ) : null}
      {props.actions ? <HStack spacing={COMIC_UI.layout.compact} frame={{ maxWidth: "infinity" }}>{props.actions}</HStack> : null}
    </VStack>
  )
}

export function ComicStatTile(props: ComicHeroStat & { tint?: Color }) {
  return (
    <VStack
      alignment="leading"
      spacing={props.icon ? 4 : 2}
      frame={{ maxWidth: "infinity", minHeight: 72, alignment: "leading" }}
      padding={{ horizontal: 12, vertical: 12 }}
      background={COMIC_UI.surface.statCard}
      clipShape={{ type: "rect", cornerRadius: COMIC_UI.layout.rowRadius }}
    >
      {props.icon ? <Image systemName={props.icon} font="caption" tint={props.tint ?? "systemPink"} /> : null}
      <Text font="caption" foregroundStyle="secondaryLabel" lineLimit={2} multilineTextAlignment="leading">{props.title}</Text>
      <Text font="headline" lineLimit={2} multilineTextAlignment="leading">{props.value}</Text>
    </VStack>
  )
}

export function ComicActionPill(props: {
  title: string
  systemImage: string
  action: () => void
  disabled?: boolean
  role?: "cancel" | "destructive"
  tone?: "primary" | "secondary" | "danger"
  tint?: Color
}) {
  const foreground = props.tone === "danger" ? "systemRed" : props.tone === "secondary" ? "label" : (props.tint ?? "systemPink")
  return (
    <Button action={props.action} disabled={props.disabled ?? false} role={props.role} buttonStyle="plain" frame={{ maxWidth: "infinity" }}>
      <HStack
        spacing={6}
        frame={{ maxWidth: "infinity", minHeight: COMIC_UI.layout.actionMinHeight, alignment: "center" }}
        padding={{ horizontal: 12, vertical: 9 }}
        background={COMIC_UI.surface.actionPill}
        clipShape={{ type: "rect", cornerRadius: COMIC_UI.layout.controlRadius }}
      >
        <Image systemName={props.systemImage} font="caption" foregroundStyle={foreground} />
        <Text font="subheadline" fontWeight="semibold" foregroundStyle={foreground} lineLimit={2} multilineTextAlignment="center">{props.title}</Text>
      </HStack>
    </Button>
  )
}

export function ComicEmptyState(props: {
  title: string
  message: string
  icon?: string
  actions?: JSX.Element | JSX.Element[]
  actionTitle?: string
  action?: () => void
}) {
  return (
    <VStack spacing={12} alignment="center" frame={{ maxWidth: "infinity" }} padding={{ horizontal: 18, top: 34, bottom: 28 }}>
      <Image systemName={props.icon ?? "books.vertical"} font="largeTitle" foregroundStyle="tertiaryLabel" />
      <Text font="title3" fontWeight="bold" foregroundStyle="label" multilineTextAlignment="center">{props.title}</Text>
      <Text font="subheadline" foregroundStyle="secondaryLabel" lineLimit={3} multilineTextAlignment="center" frame={{ maxWidth: 300 }}>
        {props.message}
      </Text>
      {props.actions ? <VStack spacing={8} frame={{ maxWidth: "infinity" }} padding={{ top: 4 }}>{props.actions}</VStack> : null}
      {!props.actions && props.action && props.actionTitle ? <ComicActionPill title={props.actionTitle} systemImage="arrow.right.circle.fill" action={props.action} /> : null}
    </VStack>
  )
}

export function ComicLoadingState({ message = "正在加载…" }: { message?: string }) {
  return <VStack spacing={12} padding={COMIC_UI.layout.emptyStatePadding} frame={{ maxWidth: "infinity" }} background={COMIC_UI.surface.stateCard} clipShape={{ type: "rect", cornerRadius: COMIC_UI.layout.cardRadius }}><ProgressView progressViewStyle="circular" /><Text font="subheadline" foregroundStyle="secondaryLabel">{message}</Text></VStack>
}

export function ComicErrorState({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return (
    <VStack frame={{ maxWidth: "infinity" }} background={COMIC_UI.surface.stateCard} clipShape={{ type: "rect", cornerRadius: COMIC_UI.layout.cardRadius }}>
      <ComicEmptyState title="加载失败" message={message} icon="exclamationmark.triangle" actionTitle={onRetry ? "重新加载" : undefined} action={onRetry} />
    </VStack>
  )
}

