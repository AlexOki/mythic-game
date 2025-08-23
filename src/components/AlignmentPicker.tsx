import React from 'react'
import type { Alignment } from '../game/types'

export default function AlignmentPicker({ onSelect }: { onSelect: (a: Alignment) => void }) {
  return (
    <div className="mb-4 card">
      <h2 className="text-lg font-semibold mb-2">Choose Your Alignment</h2>
      <p className="text-sm opacity-80 mb-3">Alignment affects future events.</p>
      <div className="flex gap-2 flex-wrap">
        {(['Good','Neutral','Evil'] as Alignment[]).map(a => (
          <button key={a} className="px-4 py-2 rounded-xl bg-slate-700 hover:bg-slate-600 shadow" onClick={() => onSelect(a)}>{a}</button>
        ))}
      </div>
    </div>
  )
}
