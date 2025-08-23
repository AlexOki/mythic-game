import React, { useState } from 'react'
import { Biome, BuildingId } from '../game/types'
import { mixToCells } from '../game/tileUtils'
import { BuildingIcon } from './icons'

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

export default function TilePreview({ mix, reservedMap, selectedCell, onSelectCell, incompatibleCells, placedBuildings, cellWorkerAlloc, onAssignWorkers, extraWorkersAvailable, totalAssignedExtra, openAssignCell, openAssignValue, onRequestOpenAssign, onRequestCloseAssign, onRequestChangeAssign }:{
  mix: Partial<Record<Biome, number>> | null,
  /** reservedMap[cellIndex] = { id, queueIndex, remainingSec } */
  reservedMap?: Partial<Record<number, { id: BuildingId; queueIndex:number; remainingSec:number }>>,
  selectedCell?: number | null,
  onSelectCell?: (i:number)=>void,
  incompatibleCells?: Set<number>,
  /** already placed buildings by cell */
  placedBuildings?: Partial<Record<number, BuildingId>>,
  /** workers assigned per cell */
  cellWorkerAlloc?: Partial<Record<number, number>>,
  onAssignWorkers?: (cell:number, n:number)=>void
  /** how many extra worker slots are available to allocate (beyond base workers) */
  extraWorkersAvailable?: number,
  /** total currently assigned extra workers across cells */
  totalAssignedExtra?: number
  openAssignCell?: number | null
  openAssignValue?: number
  onRequestOpenAssign?: (cell:number, value:number)=>void
  onRequestCloseAssign?: ()=>void
  onRequestChangeAssign?: (v:number)=>void
}){
  if (!mix) return (
    <div className="card text-sm">No tile selected. Claim a start tile on the World Map to preview it here.</div>
  )
  const cells = mixToCells(mix)
  // build a map of reserved indices for quick lookup
  const reservedIndices = new Set(Object.keys(reservedMap || {}).map(k => Number(k)))
  // assigner UI is optionally controlled by parent App
  const assigningCell = openAssignCell ?? null
  const localAssign = openAssignValue ?? 0
  // determine incompatible cells based on allowedBiomes passed in via mix? We'll mark any cell if its biome is not in a provided allowed set
  // For now parent component can rely on titles and disabled click; we also show a red overlay for cells whose biome is not allowed for the current pendingBuild via css class (prop not provided here).
  const normEntries = Object.entries(mix).filter(([,v]) => (v ?? 0) > 0) as [Biome, number][]
  const total = normEntries.reduce((s,[,w])=>s+w,0) || 1
  const norm = normEntries.map(([b,w]) => [b, w/total] as [Biome, number])

  return (
    <div className="card">
      <h2 className="text-lg font-semibold mb-2">Start Tile Preview</h2>
      <div className="inline-grid" style={{ gridTemplateColumns: `repeat(5, 30px)`, gap: 4 }}>
        {cells.map((b, i) => {
          const reserved = reservedIndices.has(i)
          const selected = selectedCell === i
          const ownerInfo = reservedMap ? reservedMap[i] : undefined
          const placed = placedBuildings ? placedBuildings[i] : undefined
          const assigned = (cellWorkerAlloc && cellWorkerAlloc[i]) ? cellWorkerAlloc[i] : 0
          const title = ownerInfo ? `${ownerInfo.id} · #${ownerInfo.queueIndex} · ${ownerInfo.remainingSec}s` : (placed ? `${placed} · workers ${assigned}` : String(b))
          return (
            <div key={i} className="relative">
              <button
                title={title}
                onClick={() => {
                  if (placed) {
                    onRequestOpenAssign?.(i, assigned)
                  } else if(onSelectCell && !reserved && !incompatibleCells?.has(i)) {
                    onSelectCell(i)
                  }
                }}
                className={`relative rounded-sm border transition-transform ${reserved ? 'cursor-not-allowed' : 'hover:scale-105'}`}
                style={{ width: 30, height: 30, background: biomeColor(b), borderColor: selected ? '#f59e0b' : '#0f172a', boxShadow: selected ? '0 0 0 2px rgba(245,158,11,0.6) inset' : 'none' }}
              >
                {(ownerInfo || placed) && (
                  <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                    <div style={{ width:18, height:18, borderRadius:9, background: 'rgba(255,255,255,0.9)', display:'flex', alignItems:'center', justifyContent:'center', boxShadow:'0 1px 0 rgba(0,0,0,0.4)' }}>
                      <BuildingIcon id={ownerInfo ? ownerInfo.id : placed!} size={12} />
                    </div>
                  </div>
                )}
                {reserved && (
                  <div className="absolute inset-0 bg-black/30 pointer-events-none rounded-sm" />
                )}
                {incompatibleCells?.has(i) && (
                  <div className="absolute inset-0 bg-red-600/40 pointer-events-none rounded-sm" />
                )}
                {placed && (
                  <div className="absolute bottom-0 left-0 text-xs px-1 bg-black bg-opacity-60 text-white rounded-tr">W:{assigned}</div>
                )}
              </button>

              {assigningCell === i && (
                <div onMouseDown={(e)=>e.stopPropagation()} onClick={(e)=>e.stopPropagation()} className="absolute z-10 left-full ml-2 w-36 p-2 bg-slate-900 border rounded shadow text-white">
                  <div className="text-sm font-semibold text-white">Assign workers</div>
                  <div className="mt-2 flex items-center space-x-2">
                      <button onClick={(e) => { e.stopPropagation(); onRequestChangeAssign?.(Math.max(0, localAssign-1)) }} className="px-2 py-1 bg-gray-200 rounded">-</button>
                      <div className="flex-1 text-center">{localAssign}</div>
                      {(() => {
                        const currentlyAssigned = totalAssignedExtra ?? 0
                        const available = Math.max(0, (extraWorkersAvailable ?? 0) - Math.max(0, currentlyAssigned - (cellWorkerAlloc?.[i] ?? 0)))
                        const disabled = localAssign >= ( (cellWorkerAlloc?.[i] ?? 0) + available )
                        return (
                          <button
                            onClick={(e) => { e.stopPropagation(); if (!disabled) onRequestChangeAssign?.(localAssign+1) }}
                            className={`px-2 py-1 ${disabled ? 'bg-gray-400 text-gray-200 cursor-not-allowed' : 'bg-gray-200' } rounded`}
                            disabled={disabled}
                          >+</button>
                        )
                      })()}
                    </div>
                  <div className="mt-2 flex justify-end space-x-2">
                    <button onClick={(e)=>{ e.stopPropagation(); onRequestCloseAssign?.(); }} className="px-2 py-1 text-sm text-white/80">Cancel</button>
                    <button onClick={(e)=>{ e.stopPropagation(); onAssignWorkers?.(i, localAssign); onRequestCloseAssign?.(); }} className="px-2 py-1 bg-indigo-600 text-white rounded text-sm">Save</button>
                  </div>
                </div>
              )}
            </div>
          )
        })}
      </div>

      <div className="mt-3 text-sm">
        {norm.map(([b, w]) => (
          <div key={b} className="flex items-center gap-2">
            <div style={{ width: 14, height: 14, background: biomeColor(b), borderRadius: 3 }} />
            <div className="opacity-80 text-xs">{b}: <span className="font-semibold">{Math.round(w * 100)}%</span></div>
          </div>
        ))}
      </div>
    </div>
  )
}
