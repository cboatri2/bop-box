// Pull a vivid, white-text-friendly color out of album art for the Now Playing backdrop.

const cache = new Map<string, string | null>()

export function dominantColor(url: string): Promise<string | null> {
  if (!url) return Promise.resolve(null)
  if (cache.has(url)) return Promise.resolve(cache.get(url)!)
  return new Promise((resolve) => {
    const img = new Image()
    img.crossOrigin = 'anonymous'
    img.onload = () => {
      try {
        const c = document.createElement('canvas')
        c.width = c.height = 24
        const ctx = c.getContext('2d', { willReadFrequently: true })!
        ctx.drawImage(img, 0, 0, 24, 24)
        const d = ctx.getImageData(0, 0, 24, 24).data
        let r = 0, g = 0, b = 0, w = 0
        for (let i = 0; i < d.length; i += 4) {
          const [h, s, l] = rgbToHsl(d[i], d[i + 1], d[i + 2])
          void h
          const weight = s * s * (1 - Math.abs(l - 0.5) * 1.6) + 0.02
          r += d[i] * weight
          g += d[i + 1] * weight
          b += d[i + 2] * weight
          w += weight
        }
        let [h, s, l] = rgbToHsl(r / w, g / w, b / w)
        s = Math.max(0.45, Math.min(0.8, s * 1.3))
        l = Math.max(0.36, Math.min(0.5, l))
        const out = `hsl(${Math.round(h * 360)} ${Math.round(s * 100)}% ${Math.round(l * 100)}%)`
        cache.set(url, out)
        resolve(out)
      } catch {
        cache.set(url, null)
        resolve(null)
      }
    }
    img.onerror = () => {
      cache.set(url, null)
      resolve(null)
    }
    img.src = url
  })
}

function rgbToHsl(r: number, g: number, b: number): [number, number, number] {
  r /= 255
  g /= 255
  b /= 255
  const max = Math.max(r, g, b)
  const min = Math.min(r, g, b)
  const l = (max + min) / 2
  if (max === min) return [0, 0, l]
  const d = max - min
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min)
  let h = 0
  if (max === r) h = (g - b) / d + (g < b ? 6 : 0)
  else if (max === g) h = (b - r) / d + 2
  else h = (r - g) / d + 4
  return [h / 6, s, l]
}
