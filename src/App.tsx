import React, { useEffect, useMemo, useRef, useState } from 'react'
import AlignmentPicker from './components/AlignmentPicker'
import MapGrid from './components/MapGrid'
import ResourceBar from './components/ResourceBar'
import {
  Alignment, Biome, BuildingCounts, BuildingId, Resource, Resources,
  SaveBlob, Tile, BuildJob, UnitJob, UnitCounts, UnitId
} from './game/types'
import {
  GRID_H, GRID_W, START_MAX_POP, START_POP, START_RESOURCES, TICK_MS,
  BUILDINGS, FOOD_CONSUMPTION_PER_POP_PER_MIN, BUILD_COST, BUILD_TIME_SEC, UNITS,
  POP_GROWTH_PER_SEC_IF_SURPLUS, POP_DECAY_PER_SEC_IF_STARVING
} from './game/config'
import { faithFromAlignment, fmt, generateGrid, loadGame, saveGame } from './game/state'

/* ------------------------- helpers ------------------------- */
function canAfford(res: Resources, cost: Partial<Resources>) {
  return Object.entries(cost).every(([k, v]) => res[k as Resource] >= (v as number))
}
function spend(res: Resources, cost: Partial<Resources>): Resources {
  const next = { ...res }
  for (const [k, v] of Object.entries(cost)) next[k as Resource] -= v as number
  return next
}
function sumUnits(units: UnitCounts) {
  return Object.values(units).reduce((s, n) => s + (n ?? 0), 0)
}
function scaleCost(cost: Partial<Resources>, factor: number): Partial<Resources> {
  const out: Partial<Resources> = {}
  for (const [k,v] of Object.entries(cost)) out[k as Resource] = (v as number) * factor
  return out
}

/* ------------------------- app ------------------------- */
type Page = 'map' | 'build' | 'army'

export default function App() {
  const [alignment, setAlignment] = useState<Alignment | null>(null)
  const faction = 'Greek' as const

  const [grid, setGrid] = useState<Tile[]>(() => generateGrid(GRID_W, GRID_H))
  const [startTile, setStartTile] = useState<{ x: number; y: number } | null>(null)

  const [resources, setResources] = useState<Resources>({ ...START_RESOURCES })
  const [population, setPopulation] = useState<number>(START_POP)
  const [maxPopulation, setMaxPopulation] = useState<number>(START_MAX_POP)

  const [buildings, setBuildings] = useState<BuildingCounts>({})
  const [buildQueue, setBuildQueue] = useState<BuildJob[]>([])

  const [units, setUnits] = useState<UnitCounts>({})
  const [trainQueue, setTrainQueue] = useState<UnitJob[]>([])

  const [running, setRunning] = useState<boolean>(false)
  const tickRef = useRef<number | null>(null)

  const [page, setPage] = useState<Page>('map')

  // Start tile MIX (still used for building availability, not for passive yields)
  const startMix = useMemo(() => {
    if (!startTile) return null
    const tile = grid.find((t) => t.x === startTile.x && t.y === startTile.y)
    return tile ? tile.biomeMix : null
  }, [startTile, grid])

  // Buildings need workers; output scales by coverage
  const prodFromBuildings = useMemo(() => {
    const totalUnits = sumUnits(units)
    let requiredWorkers = 0
    const raw: Partial<Resources> = {}
    let faithFlat = 0

    for (const [id, n] of Object.entries(buildings)) {
      const count = n ?? 0
      if (!count) continue
      const def = BUILDINGS.find(b => b.id === id)!
      if (def.yields) {
        const needsWorker = def.requiresWorker !== false
        if (needsWorker) requiredWorkers += count
        for (const [k, v] of Object.entries(def.yields))
          raw[k as Resource] = (raw[k as Resource] ?? 0) + (v as number) * count
      }
      if (def.faithPerSec) faithFlat += def.faithPerSec * count
    }

    const availableWorkers = Math.max(0, population - totalUnits)
    const coverage = requiredWorkers > 0 ? Math.min(1, availableWorkers / requiredWorkers) : 1
    const out: Partial<Resources> = {}
    for (const [k, v] of Object.entries(raw)) out[k as Resource] = (v as number) * coverage

    return { out, faithFlat, coverage, requiredWorkers, availableWorkers, totalUnits }
  }, [buildings, units, population])

  const foodConsumptionPerSec = useMemo(
    () => (population * FOOD_CONSUMPTION_PER_POP_PER_MIN) / 60,
    [population]
  )
  const faithPerSec = useMemo(
    () => faithFromAlignment(alignment, population) + prodFromBuildings.faithFlat,
    [alignment, population, prodFromBuildings.faithFlat]
  )

  useEffect(() => {
    if (running) tickRef.current = window.setInterval(() => doTick(), TICK_MS) as unknown as number
    return () => { if (tickRef.current) { clearInterval(tickRef.current); tickRef.current = null } }
  }, [running, alignment, population, resources, prodFromBuildings, buildQueue, trainQueue])

  function doTick() {
    if (!alignment) return

    setResources(prev => {
      const next: Resources = { ...prev }
      for (const [k, v] of Object.entries(prodFromBuildings.out)) next[k as Resource] = (next[k as Resource] ?? 0) + (v as number)
      next.Faith += faithPerSec
      next.Food = Math.max(0, next.Food - foodConsumptionPerSec)
      return next
    })

    // Build queue
    setBuildQueue(q => {
      if (!q.length) return q
      const [head, ...rest] = q
      const upd = { ...head, remainingSec: head.remainingSec - 1 }
      if (upd.remainingSec > 0) return [upd, ...rest]
      const def = BUILDINGS.find(b => b.id === head.id)
      if (def?.popCapDelta) setMaxPopulation(p => p + def.popCapDelta!)
      setBuildings(b => ({ ...b, [head.id]: (b[head.id] ?? 0) + 1 }))
      return rest
    })

    // Training queue
    setTrainQueue(q => {
      if (!q.length) return q
      const [head, ...rest] = q
      const upd = { ...head, remainingSec: head.remainingSec - 1 }
      if (upd.remainingSec > 0) return [upd, ...rest]
      setUnits(u => ({ ...u, [head.id]: (u[head.id] ?? 0) + 1 }))
      return rest
    })

    // Population grows if fed, decays if starving, capped by housing
    setPopulation(prev => {
      const hasFood = resources.Food > foodConsumptionPerSec
      const atCap = prev >= maxPopulation
      const growth = hasFood && !atCap ? prev * POP_GROWTH_PER_SEC_IF_SURPLUS : 0
      const decay = !hasFood ? prev * POP_DECAY_PER_SEC_IF_STARVING : 0
      return Math.max(1, Math.min(maxPopulation, prev + growth - decay))
    })
  }

  // Save/Load
  useEffect(() => {
    const id = window.setInterval(() => onSave(), 10_000)
    return () => clearInterval(id)
  }, [alignment, startTile, grid, resources, population, maxPopulation, buildings, buildQueue, units, trainQueue])

  function onSave() {
    const blob: SaveBlob = {
      version: '8',
      alignment, faction, resources, population, maxPopulation,
      startTile, grid,
      buildings, buildQueue,
      units, trainQueue,
      timeSaved: Date.now()
    }
    saveGame(blob)
  }
  function onLoad() {
    const blob = loadGame(); if (!blob) return
    setAlignment(blob.alignment); setStartTile(blob.startTile); setGrid(blob.grid)
    setResources(blob.resources); setPopulation(blob.population); setMaxPopulation(blob.maxPopulation)
    setBuildings(blob.buildings || {}); setBuildQueue(blob.buildQueue || [])
    setUnits(blob.units || {}); setTrainQueue(blob.trainQueue || [])
  }
  function onNew() {
    setAlignment(null); setGrid(generateGrid(GRID_W, GRID_H)); setStartTile(null)
    setResources({ ...START_RESOURCES }); setPopulation(START_POP); setMaxPopulation(START_MAX_POP)
    setBuildings({}); setBuildQueue([]); setUnits({}); setTrainQueue([]); setRunning(false)
    localStorage.removeItem('mythic-ogame-save-v6')
    localStorage.removeItem('mythic-ogame-save-v7')
    localStorage.removeItem('mythic-ogame-save-v8')
  }

  const canStart = alignment && startTile
  const affordable = (cost: Partial<Resources>) => canAfford(resources, cost)

  /** A building is allowed if ANY of the start tile's biomes is in its allowedBiomes and has >0 weight. */
  const buildingIsAllowedOnStart = (id: BuildingId) => {
    if (!startMix) return false
    const def = BUILDINGS.find(b=>b.id===id)!;
    return def.allowedBiomes.some(bm => (startMix[bm] ?? 0) > 0)
  }

  function enqueueBuild(id: BuildingId) {
    if (!buildingIsAllowedOnStart(id)) return
    const cost = BUILD_COST[id]
    const timeSec = BUILD_TIME_SEC[id]
    setResources(prev => {
      if (!canAfford(prev, cost)) return prev
      setBuildQueue(q => [...q, { id, remainingSec: timeSec }])
      return spend(prev, cost)
    })
  }

  function enqueueTrain(id: UnitId) {
    const def = UNITS.find(u => u.id === id)
    if (!def || !alignment || !def.allowedAlignments.includes(alignment)) return
    const usedPop = sumUnits(units) + trainQueue.length
    if (usedPop >= population) return // no free population
    const cost = def.cost
    setResources(prev => {
      if (!canAfford(prev, cost)) return prev
      setTrainQueue(q => [...q, { id, remainingSec: def.timeSec }])
      return spend(prev, cost)
    })
  }

  // Cancel / refund (50%)
  const REFUND_RATE = 0.5
  function cancelBuild(index: number){
    setBuildQueue(q => {
      if (index<0||index>=q.length) return q
      const job = q[index]
      const refund = scaleCost(BUILD_COST[job.id], REFUND_RATE)
      setResources(r => {
        const next = { ...r }
        for (const [k,v] of Object.entries(refund)) next[k as Resource] += v as number
        return next
      })
      const nq = [...q]; nq.splice(index,1); return nq
    })
  }
  function cancelTrain(index: number){
    setTrainQueue(q => {
      if (index<0||index>=q.length) return q
      const job = q[index]
      const def = UNITS.find(u=>u.id===job.id)!
      const refund = scaleCost(def.cost, REFUND_RATE)
      setResources(r => {
        const next = { ...r }
        for (const [k,v] of Object.entries(refund)) next[k as Resource] += v as number
        return next
      })
      const nq = [...q]; nq.splice(index,1); return nq
    })
  }

  /* ------------------------- layout ------------------------- */

  const TopBar = (
    <div className="sticky top-0 z-20 border-b border-slate-800 bg-slate-900/95 backdrop-blur p-3">
      <div className="max-w-[1600px] mx-auto flex items-start gap-4">
        {/* Resources */}
        <div className="flex-1">
          <ResourceBar
            resources={resources}
            prodPerSec={prodFromBuildings.out}
            foodUsePerSec={foodConsumptionPerSec}
            faithPerSec={faithPerSec}
          />
        </div>
        {/* Summary chips */}
        <div className="flex flex-col gap-2 min-w-[220px]">
          <div className="bg-slate-800 rounded-xl px-3 py-2 text-sm">
            <div className="opacity-70 text-xs">Population</div>
            <div className="font-semibold">{fmt(population)} / {fmt(maxPopulation)}</div>
          </div>
          <div className="bg-slate-800 rounded-xl px-3 py-2 text-sm">
            <div className="opacity-70 text-xs">Alignment</div>
            <div className="font-semibold">{alignment ?? '—'}</div>
          </div>
          <div className="bg-slate-800 rounded-xl px-3 py-2 text-sm">
            <div className="opacity-70 text-xs">Economy</div>
            <div className="font-semibold">
              {resources.Food > foodConsumptionPerSec ? 'Stable food' : 'Starvation risk'}
            </div>
          </div>
          <div className="flex gap-2">
            <button className={`px-3 py-1 rounded-lg ${running ? 'bg-rose-600 hover:bg-rose-700' : 'bg-emerald-600 hover:bg-emerald-700'}`} disabled={!canStart} onClick={() => setRunning(r => !r)}>{running ? 'Pause' : 'Start'}</button>
            <button className="px-3 py-1 rounded-lg bg-slate-700 hover:bg-slate-600" onClick={onSave}>Save</button>
            <button className="px-3 py-1 rounded-lg bg-slate-700 hover:bg-slate-600" onClick={onLoad}>Load</button>
            <button className="px-3 py-1 rounded-lg bg-slate-700 hover:bg-slate-600" onClick={onNew}>New</button>
          </div>
        </div>
      </div>
    </div>
  )

  const Sidebar = (
    <aside className="w-[230px] shrink-0 border-r border-slate-800 bg-slate-950/40 p-3 space-y-2">
      <div className="text-sm font-semibold opacity-80 mb-2">Navigation</div>
      <nav className="flex flex-col gap-2">
        <button onClick={()=>setPage('map')} className={`text-left px-3 py-2 rounded-xl ${page==='map' ? 'bg-slate-800' : 'bg-slate-900 hover:bg-slate-800'}`}>World Map</button>
        <button onClick={()=>setPage('build')} className={`text-left px-3 py-2 rounded-xl ${page==='build' ? 'bg-slate-800' : 'bg-slate-900 hover:bg-slate-800'}`}>Construction / Buildings / Queue</button>
        <button onClick={()=>setPage('army')} className={`text-left px-3 py-2 rounded-xl ${page==='army' ? 'bg-slate-800' : 'bg-slate-900 hover:bg-slate-800'}`}>Army / Training Queue</button>
      </nav>
      <div className="mt-4 text-xs opacity-60">
        Faction: <span className="font-semibold">Greek</span>
      </div>
    </aside>
  )

  /* ------------------------- pages ------------------------- */

  function PageMap() {
    return (
      <div className="card">
        {!alignment && (<AlignmentPicker onSelect={setAlignment} />)}

        <h2 className="text-lg font-semibold mb-3">World Map</h2>
        <p className="text-sm mb-3 opacity-80">Choose your starting square. Tiles can mix multiple biomes.</p>
        <MapGrid
          grid={grid}
          width={GRID_W}
          height={GRID_H}
          startTile={startTile}
          onClaim={(x, y) => {
            if (startTile) return
            setStartTile({ x, y })
            setGrid(g => g.map(t => (t.x === x && t.y === y ? { ...t, claimedByPlayer: true } : t)))
          }}
        />
        {startTile && startMix && (
          <div className="mt-3 text-sm">
            <div><span className="opacity-70">Starting Tile Mix:</span>{' '}
              <span className="font-semibold">
                {Object.entries(startMix).map(([b,w])=>`${b} ${Math.round((w as number)*100)}%`).join(' · ')}
              </span>
            </div>
          </div>
        )}
      </div>
    )
  }

  function PageBuild() {
    return (
      <div className="grid lg:grid-cols-2 gap-4">
        <div className="card">
          <h2 className="text-lg font-semibold mb-2">Construction</h2>
          <p className="text-sm opacity-80 mb-2">Only buildings compatible with your starting tile’s biomes are shown.</p>
          {startMix ? (
            <div className="grid sm:grid-cols-2 gap-2">
              {BUILDINGS.filter(b => b.allowedBiomes.some(bm => (startMix[bm] ?? 0) > 0)).map(b => (
                <div key={b.id} className="bg-slate-900/60 rounded-xl p-3">
                  <div className="flex items-center justify-between">
                    <div>
                      <div className="font-semibold">{b.id}</div>
                      <div className="text-xs opacity-70">{b.description}</div>
                    </div>
                    <div className="text-sm opacity-80">x{buildings[b.id] ?? 0}</div>
                  </div>
                  <div className="text-xs opacity-80 mt-2">Cost: {Object.entries(BUILD_COST[b.id]).map(([k,v]) => `${k}:${v}`).join(' ') || '—'}</div>
                  <div className="text-xs opacity-80">Time: {BUILD_TIME_SEC[b.id]}s</div>
                  <button
                    className={`mt-2 w-full px-3 py-1 rounded-md ${affordable(BUILD_COST[b.id]) && alignment ? 'bg-emerald-600 hover:bg-emerald-700' : 'bg-slate-700 opacity-60 cursor-not-allowed'}`}
                    disabled={!(affordable(BUILD_COST[b.id]) && alignment)}
                    onClick={() => enqueueBuild(b.id)}
                  >Build</button>
                </div>
              ))}
            </div>
          ) : <div className="text-sm opacity-70">Claim a start tile first on the World Map.</div>}
        </div>

        <div className="card">
          <h2 className="text-lg font-semibold mb-2">Build Queue</h2>
          {buildQueue.length ? (
            <ul className="text-sm space-y-1">
              {buildQueue.map((j, i) => (
                <li key={i} className="flex justify-between items-center gap-2">
                  <span>{j.id}</span>
                  <span className="text-xs opacity-80">{j.remainingSec}s</span>
                  <button className="text-xs px-2 py-0.5 rounded bg-rose-700 hover:bg-rose-600" onClick={()=>cancelBuild(i)}>Cancel (50%)</button>
                </li>
              ))}
            </ul>
          ) : <div className="text-xs opacity-70">Queue is empty.</div>}

          <div className="mt-4 text-xs opacity-70">
            Workers available: {prodFromBuildings.availableWorkers} / Needed: {prodFromBuildings.requiredWorkers} · Coverage: {(prodFromBuildings.coverage*100).toFixed(0)}%
          </div>
        </div>
      </div>
    )
  }

  function PageArmy() {
    return (
      <div className="grid lg:grid-cols-2 gap-4">
        <div className="card">
          <h2 className="text-lg font-semibold mb-2">Army</h2>
          {alignment ? (
            <div className="grid sm:grid-cols-2 gap-2">
              {UNITS.filter(u => u.allowedAlignments.includes(alignment)).map(u => (
                <div key={u.id} className="bg-slate-900/60 rounded-xl p-3">
                  <div className="flex items-center justify-between">
                    <div>
                      <div className="font-semibold">{u.id} <span className="text-xs opacity-70">({u.type})</span></div>
                      <div className="text-xs opacity-70">Align: {u.allowedAlignments.join('/')}</div>
                    </div>
                    <div className="text-sm opacity-80">x{units[u.id] ?? 0}</div>
                  </div>
                  <div className="text-xs opacity-80 mt-2">Cost: {Object.entries(u.cost).map(([k,v]) => `${k}:${v}`).join(' ')}</div>
                  <div className="text-xs opacity-80">Time: {u.timeSec}s</div>
                  <button
                    className={`mt-2 w-full px-3 py-1 rounded-md ${affordable(u.cost) && (sumUnits(units)+trainQueue.length < population) ? 'bg-sky-600 hover:bg-sky-700' : 'bg-slate-700 opacity-60 cursor-not-allowed'}`}
                    disabled={!(affordable(u.cost) && (sumUnits(units)+trainQueue.length < population))}
                    onClick={() => enqueueTrain(u.id)}
                  >Train</button>
                </div>
              ))}
            </div>
          ) : <div className="text-sm opacity-70">Choose an alignment to unlock units (World Map).</div>}
        </div>

        <div className="card">
          <h2 className="text-lg font-semibold mb-2">Training Queue</h2>
          {trainQueue.length ? (
            <ul className="text-sm space-y-1">
              {trainQueue.map((j, i) => (
                <li key={i} className="flex justify-between items-center gap-2">
                  <span>{j.id}</span>
                  <span className="text-xs opacity-80">{j.remainingSec}s</span>
                  <button className="text-xs px-2 py-0.5 rounded bg-rose-700 hover:bg-rose-600" onClick={()=>cancelTrain(i)}>Cancel (50%)</button>
                </li>
              ))}
            </ul>
          ) : <div className="text-xs opacity-70">Queue is empty.</div>}

          <div className="mt-4 text-xs opacity-70">
            Units: {prodFromBuildings.totalUnits} · Free workers: {Math.max(0, population - prodFromBuildings.totalUnits)}
          </div>
        </div>
      </div>
    )
  }

  /* ------------------------- render ------------------------- */

  return (
    <div className="min-h-screen w-full bg-slate-900 text-slate-100 flex flex-col">
      {/* Top bar (resources + population + alignment + controls) */}
      {TopBar}

      {/* Body with sidebar + page content */}
      <div className="flex flex-1 overflow-hidden max-w-[1600px] mx-auto w-full">
        {Sidebar}
        <main className="flex-1 p-4 overflow-auto">
          {page === 'map' && <PageMap />}
          {page === 'build' && <PageBuild />}
          {page === 'army' && <PageArmy />}
        </main>
      </div>

      <footer className="p-4 text-xs text-center opacity-60 border-t border-slate-800">
        © Mythic Ogame Prototype · Greek faction only · v0.8
      </footer>
    </div>
  )
}
