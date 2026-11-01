// Share a download/render budget; visible pages take priority over prefetches.
let active = 0
const waiting: Array<{ run: () => void; priority: () => number }> = []
export const withPageLoadSlot = async <T,>(load: () => Promise<T>, priority: () => number = () => 1): Promise<T> => {
  if (active >= 3) await new Promise<void>(resolve => waiting.push({ run: resolve, priority }))
  else active += 1
  try { return await load() }
  finally {
    let nextIndex = 0
    for (let i = 1; i < waiting.length; i++) {
      if (waiting[i].priority() > waiting[nextIndex].priority()) nextIndex = i
    }
    const next = waiting.splice(nextIndex, 1)[0]
    if (next) next.run()
    else active -= 1
  }
}
