// A tiny on-device troubleshooting log (sign-ins, token refreshes, deletes).
// Never stores tokens, codes or emails, only what happened, when, and Spotify's status codes.

const KEY = 'bopbox.log'
const MAX = 40

export type LogEntry = { at: number; what: string }

export function logEvent(what: string) {
  try {
    const list: LogEntry[] = JSON.parse(localStorage.getItem(KEY) ?? '[]')
    list.push({ at: Date.now(), what })
    localStorage.setItem(KEY, JSON.stringify(list.slice(-MAX)))
  } catch {
    /* storage unavailable */
  }
}

export function readLog(): LogEntry[] {
  try {
    return JSON.parse(localStorage.getItem(KEY) ?? '[]')
  } catch {
    return []
  }
}

export function clearLog() {
  try {
    localStorage.removeItem(KEY)
  } catch {
    /* ignore */
  }
}
