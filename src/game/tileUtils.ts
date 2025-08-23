import { Biome } from './types'

/** Convert a biome mix into a deterministic array of 25 biome cells (5x5). */
export function mixToCells(mix: Partial<Record<Biome, number>>){
  const entries = Object.entries(mix).filter(([, v]) => (v ?? 0) > 0) as [Biome, number][]
  if (!entries.length) return new Array(25).fill(Biome.Plain)

  const total = entries.reduce((s, [, w]) => s + w, 0) || 1
  const norm = entries.map(([b, w]) => [b, w / total] as [Biome, number])

  const counts: Record<Biome, number> = {} as any
  let allocated = 0
  const fractions: [Biome, number][] = norm.map(([b, w]) => {
    const exact = w * 25
    const base = Math.floor(exact)
    counts[b] = base
    allocated += base
    return [b, exact - base]
  })
  let remaining = 25 - allocated
  fractions.sort((a, b) => b[1] - a[1])
  for (const [b] of fractions) {
    if (remaining <= 0) break
    counts[b] = (counts[b] || 0) + 1
    remaining--
  }

  const cells: Biome[] = []
  for (const [b] of norm) {
    const c = counts[b] || 0
    for (let i = 0; i < c; i++) cells.push(b)
  }
  while (cells.length < 25) cells.push(Biome.Plain)
  return cells
}
