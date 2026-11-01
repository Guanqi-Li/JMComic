// Share a small download/render budget across visible reader pages.
let active = 0
const waiting: Array<() => void> = []
export const withPageLoadSlot = async <T,>(load: () => Promise<T>): Promise<T> => {
  if (active >= 3) await new Promise<void>(resolve => waiting.push(resolve))
  else active += 1
  try { return await load() }
  finally {
    const next = waiting.shift()
    if (next) next()
    else active -= 1
  }
}
