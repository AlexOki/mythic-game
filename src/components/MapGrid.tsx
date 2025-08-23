import React from 'react'
import { Biome, Tile } from '../game/types'

function biomeColor(b: Biome): string {
  switch (b) {
    case Biome.Plain: return '#3f6212'
    case Biome.Forest: return '#065f46'
    case Biome.Mountain: return '#334155'
    case Biome.Coast: return '#0e7490'
    case Biome.Water: return '#1e40af'
    default: return '#475569'
  }
}

/**
 * Turn biome percentages into a striped gradient string.
 * Example: 50% Plains + 50% Coast → half green, half teal.
 */
function mixGradient(mix: Partial<Record<Biome, number>>) {
  const entries = Object.entries(mix).filter(([, v]) => (v ?? 0) > 0) as [Biome, number][]
  if (!entries.length) return biomeColor(Biome.Plain)

  // Normalize weights
  const total = entries.reduce((s, [, w]) => s + w, 0) || 1
  const norm = entries.map(([b, w]) => [b, w / total] as [Biome, number])

  let acc = 0
  const stops = norm.map(([b, w]) => {
    const start = acc * 100
    acc += w
    const end = acc * 100
    return `${biomeColor(b)} ${start.toFixed(0)}%, ${biomeColor(b)} ${end.toFixed(0)}%`
  })

  return `linear-gradient(135deg, ${stops.join(', ')})`
}

export default function MapGrid({
  grid, width, height, startTile, onClaim
}: {
  grid: Tile[]
  width: number
  height: number
  startTile: { x: number; y: number } | null
  onClaim: (x: number, y: number) => void
}) {
  const cellSize = 28

  return (
    <div
      className="inline-grid"
      style={{
        gridTemplateColumns: `repeat(${width}, ${cellSize}px)`,
        gap: 4,
      }}
    >
      {grid.map((t) => (
        <button
          key={`${t.x}-${t.y}`}
          className="rounded-lg border text-[8px] flex items-center justify-center transition-colors"
          style={{
            width: cellSize,
            height: cellSize,
            background: mixGradient(t.biomeMix),
            borderColor: t.claimedByPlayer ? '#f59e0b' : '#0f172a',
            boxShadow: t.claimedByPlayer ? '0 0 0 2px rgba(245,158,11,0.6) inset' : 'none',
          }}
          onClick={() => onClaim(t.x, t.y)}
          title={`${Object.entries(t.biomeMix).map(([b, p]) => `${b}: ${Math.round((p as number) * 100)}%`).join(' · ')} (${t.x},${t.y})`}
        >
          {startTile && startTile.x === t.x && startTile.y === t.y ? '★' : ''}
        </button>
      ))}
    </div>
  )
}
