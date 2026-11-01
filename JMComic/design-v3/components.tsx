import {
  Button,
  HStack,
  Image,
  NavigationLink,
  ProgressView,
  Spacer,
  Text,
  VStack,
  useObservable,
} from "scripting"
import type { Color } from "scripting"
import { V3_DESIGN } from "./tokens"

export function V3SectionHeader(props: {
  title: string
  subtitle?: string
  actionTitle?: string
  action?: () => void
}) {
  return (
    <HStack spacing={V3_DESIGN.spacing.row} frame={{ maxWidth: "infinity", alignment: "center" }}>
      <VStack alignment="leading" spacing={2} frame={{ maxWidth: "infinity", alignment: "leading" }}>
        <Text font="headline" fontWeight="semibold" lineLimit={2}>{props.title}</Text>
        {props.subtitle ? <Text font="subheadline" foregroundStyle="secondaryLabel" lineLimit={3}>{props.subtitle}</Text> : null}
      </VStack>
      {props.action && props.actionTitle ? <Button title={props.actionTitle} action={props.action} /> : null}
    </HStack>
  )
}

export function V3ComicCover(props: {
  imageUrl?: string
  width?: number
  height?: number
  placeholderIcon?: string
}) {
  const width = props.width ?? V3_DESIGN.metric.listCoverWidth
  const height = props.height ?? V3_DESIGN.metric.listCoverHeight
  return (
    <VStack
      frame={{ width, height }}
      background={V3_DESIGN.color.surface}
      clipShape={{ type: "rect", cornerRadius: V3_DESIGN.radius.cover, style: "continuous" }}
    >
      {props.imageUrl ? (
        <Image imageUrl={props.imageUrl} frame={{ width, height }} resizable={true} aspectRatio={{ value: null, contentMode: "fill" }} clipped={true} />
      ) : (
        <Image systemName={props.placeholderIcon ?? "book.closed"} font="title2" foregroundStyle="tertiaryLabel" />
      )}
    </VStack>
  )
}

export function V3ActionRow(props: {
  title: string
  subtitle?: string
  systemImage: string
  status?: string
  tint?: Color
  action: () => void
}) {
  return (
    <Button action={props.action} buttonStyle="plain" frame={{ maxWidth: "infinity" }}>
      <HStack spacing={V3_DESIGN.spacing.row} frame={{ minHeight: V3_DESIGN.metric.rowMinHeight, maxWidth: "infinity" }}>
        <Image systemName={props.systemImage} frame={{ width: 30 }} foregroundStyle={props.tint ?? V3_DESIGN.color.accent} />
        <VStack alignment="leading" spacing={2} frame={{ maxWidth: "infinity", alignment: "leading" }}>
          <Text font="body" foregroundStyle="label" lineLimit={2}>{props.title}</Text>
          {props.subtitle ? <Text font="subheadline" foregroundStyle="secondaryLabel" lineLimit={2}>{props.subtitle}</Text> : null}
        </VStack>
        <Spacer />
        {props.status ? <Text font="subheadline" foregroundStyle="secondaryLabel" lineLimit={1}>{props.status}</Text> : null}
        <Image systemName="chevron.right" font="caption" foregroundStyle="tertiaryLabel" />
      </HStack>
    </Button>
  )
}

export function V3SourceRow(props: {
  title: string
  subtitle: string
  systemImage: string
  status?: string
  tint?: Color
  destination: JSX.Element
}) {
  return (
    <NavigationLink destination={props.destination}>
      <HStack spacing={V3_DESIGN.spacing.row} frame={{ minHeight: V3_DESIGN.metric.rowMinHeight }}>
        <Image systemName={props.systemImage} frame={{ width: 30 }} foregroundStyle={props.tint ?? V3_DESIGN.color.accent} />
        <VStack alignment="leading" spacing={2} frame={{ maxWidth: "infinity", alignment: "leading" }}>
          <Text font="body" lineLimit={2}>{props.title}</Text>
          <Text font="subheadline" foregroundStyle="secondaryLabel" lineLimit={2}>{props.subtitle}</Text>
        </VStack>
        <Spacer />
        {props.status ? <Text font="subheadline" foregroundStyle="secondaryLabel" lineLimit={1}>{props.status}</Text> : null}
      </HStack>
    </NavigationLink>
  )
}

function V3ComicTag(props: { title: string }) {
  return (
    <Text
      font="caption"
      foregroundStyle="secondaryLabel"
      lineLimit={1}
      padding={{ horizontal: 7, vertical: 3 }}
      background="secondarySystemFill"
      clipShape={{ type: "rect", cornerRadius: 7, style: "continuous" }}
    >
      {props.title}
    </Text>
  )
}

export function V3ComicListRow(props: {
  title: string
  subtitle?: string
  tags?: string[]
  metadata?: string
  imageUrl?: string
  progress?: number
  contextMenu?: any
  destination: JSX.Element
}) {
  const presented = useObservable(false)
  return (
    <Button
      action={() => presented.setValue(true)}
      buttonStyle="plain"
      frame={{ maxWidth: "infinity" }}
      navigationDestination={{ isPresented: presented, content: props.destination }}
    >
      <HStack alignment="center" spacing={V3_DESIGN.spacing.row} padding={{ vertical: 4 }} contextMenu={props.contextMenu} frame={{ maxWidth: "infinity" }}>
        <V3ComicCover imageUrl={props.imageUrl} />
        <VStack alignment="leading" spacing={V3_DESIGN.spacing.micro} frame={{ maxWidth: "infinity", minHeight: V3_DESIGN.metric.listCoverHeight, alignment: "leading" }}>
          <Text font="headline" lineLimit={2}>{props.title}</Text>
          {props.subtitle ? <Text font="subheadline" foregroundStyle="secondaryLabel" lineLimit={2}>{props.subtitle}</Text> : null}
          {props.tags?.length ? (
            <HStack spacing={5} frame={{ maxWidth: "infinity", alignment: "leading" }}>
              {props.tags.slice(0, 3).map(tag => <V3ComicTag key={tag} title={tag} />)}
            </HStack>
          ) : null}
          {props.metadata ? <Text font="caption" foregroundStyle="tertiaryLabel" lineLimit={2}>{props.metadata}</Text> : null}
          <Spacer />
          {props.progress != null && props.progress > 0 ? <ProgressView value={Math.max(0, Math.min(1, props.progress))} total={1} progressViewStyle="linear" tint={V3_DESIGN.color.accent} /> : null}
        </VStack>
        <HStack frame={{ width: V3_DESIGN.metric.touchTarget, minHeight: V3_DESIGN.metric.listCoverHeight, alignment: "center" }}>
          <Image systemName="chevron.right" font="caption" foregroundStyle="tertiaryLabel" />
        </HStack>
      </HStack>
    </Button>
  )
}

export function V3ContentState(props: {
  title: string
  message: string
  systemImage?: string
  actionTitle?: string
  action?: () => void
}) {
  return (
    <VStack alignment="center" spacing={V3_DESIGN.spacing.row} frame={{ maxWidth: "infinity" }} padding={{ horizontal: V3_DESIGN.spacing.page, vertical: 32 }}>
      <Image systemName={props.systemImage ?? "books.vertical"} font="largeTitle" foregroundStyle="tertiaryLabel" />
      <Text font="title3" fontWeight="semibold" multilineTextAlignment="center">{props.title}</Text>
      <Text font="subheadline" foregroundStyle="secondaryLabel" lineLimit={3} multilineTextAlignment="center" frame={{ maxWidth: 320 }}>{props.message}</Text>
      {props.action && props.actionTitle ? <Button title={props.actionTitle} action={props.action} /> : null}
    </VStack>
  )
}

export function V3PrimaryReadButton(props: {
  title: string
  systemImage?: string
  action: () => void
  disabled?: boolean
}) {
  return (
    <Button action={props.action} disabled={props.disabled ?? false} buttonStyle="borderedProminent" controlSize="large" tint={V3_DESIGN.color.accent} frame={{ maxWidth: "infinity", minHeight: V3_DESIGN.metric.touchTarget }}>
      <HStack spacing={V3_DESIGN.spacing.compact}>
        <Image systemName={props.systemImage ?? "book.pages.fill"} />
        <Text font="headline">{props.title}</Text>
      </HStack>
    </Button>
  )
}
