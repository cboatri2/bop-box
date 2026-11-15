import { useSyncExternalStore } from 'react'

export type Toast = { id: number; text: string; emoji?: string }

let toasts: Toast[] = []
const listeners = new Set<() => void>()
let seq = 0

export function toast(text: string, emoji?: string) {
  const t = { id: ++seq, text, emoji }
  toasts = [...toasts.slice(-2), t]
  listeners.forEach((l) => l())
  setTimeout(() => {
    toasts = toasts.filter((x) => x.id !== t.id)
    listeners.forEach((l) => l())
  }, 3200)
}

export function useToasts() {
  return useSyncExternalStore(
    (l) => {
      listeners.add(l)
      return () => listeners.delete(l)
    },
    () => toasts,
  )
}
