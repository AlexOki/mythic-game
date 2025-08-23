import React from 'react'
import { Resource, Resources } from '../game/types'
import { fmt } from '../game/state'

export default function ResourceBar({
  resources, prodPerSec, foodUsePerSec, faithPerSec
}: {
  resources: Resources
  prodPerSec: Partial<Resources>
  foodUsePerSec: number
  faithPerSec: number
}) {
  const order: Resource[] = ['Wood','Stone','Iron','Gold','Food','Linen','Leather','Faith']
  return (
    <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
      {order.map((res) => {
        const rate = res === 'Food'
          ? (prodPerSec[res] ?? 0) - foodUsePerSec
          : res === 'Faith'
          ? faithPerSec
          : prodPerSec[res] ?? 0
        return (
          <div key={res} className="bg-slate-900/60 rounded-xl p-3">
            <div className="text-xs opacity-70">{res}</div>
            <div className="text-xl font-semibold">{fmt(resources[res])}</div>
            <div className={`text-xs ${rate >= 0 ? 'rate-pos' : 'rate-neg'}`}>
              {rate >= 0 ? '+' : ''}{fmt(rate)}/s
            </div>
          </div>
        )
      })}
    </div>
  )
}
