// Local design-preview mode (http://127.0.0.1:5173/?demo). Never true in production builds,
// and it never talks to Spotify.
export const DEMO =
  import.meta.env.DEV && typeof location !== 'undefined' && new URLSearchParams(location.search).has('demo')
