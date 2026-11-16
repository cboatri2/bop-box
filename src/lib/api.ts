import { DEMO } from './demo-flag'

/**
 * Where Bop Box's own server routes live (settings sync, the family's grown-up connection).
 * Local development never touches the family's real data unless VITE_API_BASE says so.
 */
export const API_BASE: string | null =
  DEMO || (import.meta.env.DEV && !import.meta.env.VITE_API_BASE)
    ? null
    : ((import.meta.env.VITE_API_BASE as string | undefined) ??
      (location.hostname.endsWith('github.io') ? 'https://bop-box.vercel.app/api' : '/api'))
