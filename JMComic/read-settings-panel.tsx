import {
  Button,
  HStack,
  Image,
  List,
  Section,
  Spacer,
  Text,
  VStack,
} from "scripting"

const MODE_ORDER = ["scroll-v", "scroll-h", "page-ltr", "page-rtl"]

const modeHint = (mode: string): string => {
  if (mode === "scroll-v") return "上下滑动连续阅读，轻点页面显示控制栏。"
  if (mode === "scroll-h") return "左右滑动连续阅读，轻点页面显示控制栏。"
  if (mode === "page-rtl") return "按从右向左的漫画阅读方向翻页，轻点中央显示控制栏。"
  return "轻点左右边缘翻页，轻点中央显示控制栏。"
}

export function ReadSettingsPanel(props: {
  currentMode: string
  onModeChange: (mode: any) => void
  onGoToFirstPage: () => void
  onGoToLastPage: () => void
  onClose: () => void
  readModeConfigs: Record<string, { label: string; icon: string }>
}) {
  return (
    <List
      navigationTitle="阅读设置"
      navigationBarTitleDisplayMode="inline"
      listStyle="insetGroup"
      presentationDetents={["medium"]}
      presentationDragIndicator="visible"
    >
      <Section title="阅读模式">
        {MODE_ORDER.map((mode) => {
          const config = props.readModeConfigs[mode]
          const active = props.currentMode === mode
          return (
            <Button
              key={mode}
              action={() => props.onModeChange(mode)}
              buttonStyle="plain"
              frame={{ maxWidth: "infinity", minHeight: 52 }}
            >
              <HStack spacing={12} frame={{ maxWidth: "infinity" }} alignment="center">
                <Image
                  systemName={config.icon}
                  frame={{ width: 24 }}
                  foregroundStyle={active ? "systemPink" : "secondaryLabel"}
                />
                <Text font="body" foregroundStyle="label">{config.label}</Text>
                <Spacer />
                {active ? <Image systemName="checkmark" foregroundStyle="systemPink" /> : undefined}
              </HStack>
            </Button>
          )
        })}
      </Section>

      <Section title="章节位置">
        <Button title="回到第一页" systemImage="backward.end" action={props.onGoToFirstPage} />
        <Button title="前往最后一页" systemImage="forward.end" action={props.onGoToLastPage} />
      </Section>

      <Section title="当前模式">
        <VStack alignment="leading" spacing={4} padding={{ vertical: 4 }}>
          <Text font="subheadline" foregroundStyle="label">
            {props.readModeConfigs[props.currentMode].label}
          </Text>
          <Text font="footnote" foregroundStyle="secondaryLabel">
            {modeHint(props.currentMode)}
          </Text>
        </VStack>
      </Section>
    </List>
  )
}
