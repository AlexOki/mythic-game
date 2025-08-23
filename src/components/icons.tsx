import React from 'react'
import { BuildingId } from '../game/types'

export function BuildingIcon({ id, size=14 }:{ id: BuildingId, size?: number }){
  // Small, simple SVGs for different building types. Use small shapes to keep it lightweight.
  switch(id){
    case 'Farm': return <svg width={size} height={size} viewBox="0 0 24 24" fill="none"><rect x="3" y="10" width="18" height="8" fill="#f59e0b"/></svg>
    case 'Lumber Camps': return <svg width={size} height={size} viewBox="0 0 24 24" fill="none"><rect x="6" y="6" width="4" height="12" fill="#065f46"/><rect x="14" y="6" width="4" height="12" fill="#065f46"/></svg>
    case 'Quarry': return <svg width={size} height={size} viewBox="0 0 24 24" fill="none"><polygon points="12,4 20,20 4,20" fill="#334155"/></svg>
    case 'Iron Mine': return <svg width={size} height={size} viewBox="0 0 24 24" fill="none"><circle cx="12" cy="12" r="6" fill="#94a3b8"/></svg>
    case 'Gold Mine': return <svg width={size} height={size} viewBox="0 0 24 24" fill="none"><circle cx="12" cy="12" r="6" fill="#fbbf24"/></svg>
    case 'Fisheries': return <svg width={size} height={size} viewBox="0 0 24 24" fill="none"><path d="M2 12c4 4 8 4 12 0s8-4 12 0" stroke="#0e7490" strokeWidth="2" fill="none"/></svg>
    case 'Hunting Grounds': return <svg width={size} height={size} viewBox="0 0 24 24" fill="none"><path d="M12 2 L15 10 L9 10 Z" fill="#065f46"/></svg>
    case 'Flax Fields': return <svg width={size} height={size} viewBox="0 0 24 24" fill="none"><rect x="4" y="8" width="16" height="8" fill="#c084fc"/></svg>
    case 'Hut': return <svg width={size} height={size} viewBox="0 0 24 24" fill="none"><polygon points="12,4 4,10 4,20 20,20 20,10" fill="#fff" stroke="#871c6f" strokeWidth="0.5"/></svg>
    case 'House': return <svg width={size} height={size} viewBox="0 0 24 24" fill="none"><rect x="4" y="8" width="16" height="10" fill="#94a3b8"/></svg>
    case 'Temple': return <svg width={size} height={size} viewBox="0 0 24 24" fill="none"><polygon points="2,10 12,2 22,10" fill="#fde68a"/><rect x="6" y="10" width="12" height="8" fill="#fde68a"/></svg>
    case 'Villa': return <svg width={size} height={size} viewBox="0 0 24 24" fill="none"><rect x="3" y="7" width="18" height="12" fill="#60a5fa"/></svg>
    default: return <svg width={size} height={size} viewBox="0 0 24 24" fill="none"><rect x="4" y="4" width="16" height="16" fill="#94a3b8"/></svg>
  }
}
