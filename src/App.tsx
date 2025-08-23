import React, { useEffect, useMemo, useRef, useState } from 'react'
import AlignmentPicker from './components/AlignmentPicker'
import MapGrid from './components/MapGrid'
import TilePreview from './components/TilePreview'
import ResourceBar from './components/ResourceBar'
import {
  Alignment, Biome, BuildingCounts, BuildingId, Resource, Resources,
  SaveBlob, Tile, BuildJob, UnitJob, UnitCounts, UnitId
} from './game/types'
import {
  GRID_H, GRID_W, START_MAX_POP, START_POP, START_RESOURCES, TICK_MS,
  BUILDINGS, FOOD_CONSUMPTION_PER_POP_PER_MIN, BUILD_COST, BUILD_TIME_SEC, UNITS
} from './game/config'
import { /* biomeYieldsPerSecond (removed), */ faithFromAlignment, fmt, generateGrid, loadGame, saveGame } from './game/state'
import { mixToCells } from './game/tileUtils'
import ConfirmModal from './components/ConfirmModal'

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
type Page = 'map' | 'build' | 'army' | 'tile'

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
  const [placedBuildings, setPlacedBuildings] = useState<Partial<Record<number, BuildingId>>>({})
  const [cellWorkerAlloc, setCellWorkerAlloc] = useState<Partial<Record<number, number>>>({})
  // assignment UI state lifted so it survives re-renders/ticks
  const [assigningCell, setAssigningCell] = useState<number | null>(null)
  const [assigningValue, setAssigningValue] = useState<number>(0)
  // When player initiates a build, they must pick one of the 25 cells of the start tile.
  const [pendingBuild, setPendingBuild] = useState<BuildingId | null>(null)
  const [pendingBuildCell, setPendingBuildCell] = useState<number | null>(null)

  const [units, setUnits] = useState<UnitCounts>({})
  const [trainQueue, setTrainQueue] = useState<UnitJob[]>([])
  // Extra worker requests per building id (total extra workers requested across all instances)
  const [workerAlloc, setWorkerAlloc] = useState<Partial<Record<BuildingId, number>>>({})

  const [running, setRunning] = useState<boolean>(false)
  const tickRef = useRef<number | null>(null)

  const [page, setPage] = useState<Page>('map')

  // Ensure total extra assignments never exceed available extra worker slots.
  useEffect(() => {
    // strict available workers (use integer population)
    const maxAssignedTotal = Math.max(0, Math.floor(population) - sumUnits(units))
    const allocKeys = Object.keys(cellWorkerAlloc || {}).map(k=>Number(k)).sort((a,b)=>a-b)
    let totalAssigned = allocKeys.reduce((s,k)=>s + (cellWorkerAlloc?.[k] ?? 0), 0)
    if (totalAssigned <= maxAssignedTotal) return
    // trim assignments deterministically (from highest cell index downward)
    const copy: Partial<Record<number, number>> = { ...(cellWorkerAlloc || {}) }
    for (let i = allocKeys.length - 1; i >= 0 && totalAssigned > maxAssignedTotal; i--) {
      const k = allocKeys[i]
      const cur = copy[k] ?? 0
      const remove = Math.min(cur, totalAssigned - maxAssignedTotal)
      const next = cur - remove
      if (next <= 0) delete copy[k]
      else copy[k] = next
      totalAssigned -= remove
    }
    setCellWorkerAlloc(copy)
  }, [population, units, placedBuildings, cellWorkerAlloc])

  // Start tile MIX (still used for building availability, not for passive yields)
  const startMix = useMemo(() => {
    if (!startTile) return null
    const tile = grid.find((t) => t.x === startTile.x && t.y === startTile.y)
    return tile ? tile.biomeMix : null
  }, [startTile, grid])

  // ❌ Removed passive biome production
  const prodFromBiome = useMemo(() => ({} as Partial<Resources>), [])

  // Buildings need workers; output scales by actual placed buildings and per-cell worker allocation with diminishing returns
  const prodFromBuildings = useMemo(() => {
    const totalUnits = sumUnits(units)
    let faithFlat = 0
    const out: Partial<Resources> = {}

    // Parameters for per-instance extra workers diminishing returns
    const BASE_WORKERS_PER_INSTANCE = 1
    const EXTRA_EFFECT_PER_WORKER = 0.5 // each extra worker gives up to this fraction of base output, subject to diminishing returns
    const DIMINISHING_POWER = 0.7 // apply (1 - exp(-k * n)) style via n^power to model diminishing returns

    // Count available workers
  const availableWorkers = Math.max(0, Math.floor(population) - totalUnits)

    // Build a list of placed building cells
    const placedCells = Object.entries(placedBuildings).map(([cell, id]) => ({ cell: Number(cell), id }))

    // For production, iterate each placed building cell and compute its output based on assigned workers for that cell.
    // A building only produces if it has at least 1 worker assigned (base worker). Buildings can be placed with 0 workers and produce nothing until assigned.
    let requiredWorkersCount = 0
    for (const { cell, id } of placedCells) {
      const def = BUILDINGS.find(b => b.id === id)!
      if (def.faithPerSec) faithFlat += def.faithPerSec
      if (!def.yields) continue

      const assignedExtra = Math.max(0, Math.floor(cellWorkerAlloc[cell] ?? 0))
      // the instance produces only if assignedExtra >= 1 (meaning at least the base worker is present)
      const hasBase = assignedExtra >= 1
      if (hasBase) requiredWorkersCount++

      if (!hasBase) continue

      // workersOnThis counts base (1) + extra
      const workersOnThis = BASE_WORKERS_PER_INSTANCE + assignedExtra
      const extra = Math.max(0, workersOnThis - BASE_WORKERS_PER_INSTANCE)
      const extraEffect = Math.pow(extra, DIMINISHING_POWER) * EXTRA_EFFECT_PER_WORKER
      const multiplier = 1 + extraEffect

      for (const [k, v] of Object.entries(def.yields)) {
        out[k as Resource] = (out[k as Resource] ?? 0) + (v as number) * multiplier
      }
    }

    return { out, faithFlat, coverage: 1, requiredWorkers: requiredWorkersCount, availableWorkers, totalUnits }
  }, [placedBuildings, cellWorkerAlloc, units, population])

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
      // ❌ No passive biome gain
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
        // If this job had a startCell, mark it as placed at that cell; otherwise increment counts as before
        if (typeof head.startCell === 'number'){
          setPlacedBuildings(pb => ({ ...pb, [head.startCell as number]: head.id }))
        }
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
      const hasFood = resources.Food > 0
      const atCap = prev >= maxPopulation
      const growth = hasFood && !atCap ? prev * 0.00003 : 0
      const decay = !hasFood ? prev * 0.00005 : 0
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
      version: '7',
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
    localStorage.removeItem('mythic-ogame-save-v6'); localStorage.removeItem('mythic-ogame-save-v7')
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
    // Start a pending build: require the player to pick a cell in the Start Tile preview.
    if (!buildingIsAllowedOnStart(id)) return
    setPendingBuild(id)
    setPendingBuildCell(null)
  }

  // Commit the pending build to the queue when a cell is selected
  function commitPendingBuild(cellIndex:number){
    if (!pendingBuild) return
  const id = pendingBuild
  const cost = BUILD_COST[id]
  const timeSec = BUILD_TIME_SEC[id]
    // Validate biome compatibility for the chosen cell
    if (!startMix) { setPendingBuild(null); setPendingBuildCell(null); return }
    // get the biome at cellIndex using the same mapping as TilePreview
    // import inline to avoid circular imports: replicate logic minimal here
    const mixEntries = Object.entries(startMix).filter(([,v]) => (v ?? 0) > 0) as [any,number][]
    const total = mixEntries.reduce((s,[,w])=>s+w,0) || 1
    const norm = mixEntries.map(([b,w])=>[b, w/total] as [any,number])
    // create cells
    const cells: any[] = []
    // compute counts
    const counts: Record<string, number> = {}
    let allocated = 0
    const fractions: [string,number][] = norm.map(([b,w])=>{ const exact=w*25; const base=Math.floor(exact); counts[b]=base; allocated+=base; return [b, exact-base] })
    let rem = 25-allocated
    fractions.sort((a,b)=>b[1]-a[1])
    for(const [b] of fractions){ if(rem<=0) break; counts[b]=(counts[b]||0)+1; rem-- }
    for(const [b] of norm){ const c = counts[b]||0; for(let i=0;i<c;i++) cells.push(b) }
    while(cells.length<25) cells.push('Plain')
    const chosenBiome = cells[cellIndex]

    const def = BUILDINGS.find(b=>b.id===id)!
    if (!def.allowedBiomes.includes(chosenBiome as any)){
      // incompatible
      window.alert(`${def.id} cannot be built on ${chosenBiome}. Choose another cell.`)
      setPendingBuild(null)
      setPendingBuildCell(null)
      return
    }

    // open confirmation modal; commit will be performed after user confirms
    setConfirmData({ id, cellIndex, cost, timeSec })
    setConfirmOpen(true)
  }

  // confirmation modal state
  const [confirmOpen, setConfirmOpen] = useState(false)
  const [confirmData, setConfirmData] = useState<null | { id: BuildingId; cellIndex:number; cost: Partial<Resources>; timeSec:number }>(null)

  function onConfirmBuild(){
    if(!confirmData) return
    const { id, cellIndex, cost, timeSec } = confirmData
    setResources(prev => {
      if (!canAfford(prev, cost)) return prev
      setBuildQueue(q => [...q, { id, remainingSec: timeSec, startCell: cellIndex }])
      return spend(prev, cost)
    })
    setConfirmOpen(false); setConfirmData(null); setPendingBuild(null); setPendingBuildCell(null)
  }
  function onCancelBuildConfirm(){ setConfirmOpen(false); setConfirmData(null); setPendingBuild(null); setPendingBuildCell(null) }

  // compute reserved info map: cellIndex -> { id, queueIndex, remainingSec }
  const reservedInfoMap: Partial<Record<number, { id: BuildingId; queueIndex:number; remainingSec:number }>> = {}
  buildQueue.forEach((b, idx) => { if (typeof b.startCell === 'number') reservedInfoMap[b.startCell] = { id: b.id, queueIndex: idx, remainingSec: b.remainingSec } })

  // If there is a pendingBuild, compute which of the 25 cells are incompatible for that building
  const incompatibleCells = new Set<number>()
  if (pendingBuild && startMix) {
    const cells = mixToCells(startMix)
    const def = BUILDINGS.find(b => b.id === pendingBuild)!
    for (let i = 0; i < cells.length; i++) if (!def.allowedBiomes.includes(cells[i])) incompatibleCells.add(i)
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
            prodPerSec={{ ...prodFromBiome, ...prodFromBuildings.out }} // biome part is empty now
            foodUsePerSec={foodConsumptionPerSec}
            faithPerSec={faithPerSec}
          />
        </div>
        {/* Summary chips */}
        <div className="flex flex-col gap-2 min-w-[220px]">
          <div className="bg-slate-800 rounded-xl px-3 py-2 text-sm">
            <div className="opacity-70 text-xs">Population</div>
              <div className="font-semibold">{Math.floor(population)} / {Math.floor(maxPopulation)}</div>
          </div>
          <div className="bg-slate-800 rounded-xl px-3 py-2 text-sm">
            <div className="opacity-70 text-xs">Alignment</div>
            <div className="font-semibold">{alignment ?? '—'}</div>
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
    {/* Start Tile page removed; preview is available in Construction */}
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
                  {pendingBuild === b.id ? (
                    <div className="mt-2">
                      <div className="text-xs opacity-80">Pick a cell in the Start Tile preview to place this building.</div>
                      <button className="mt-2 w-full px-3 py-1 rounded-md bg-rose-700 hover:bg-rose-600" onClick={()=>{ setPendingBuild(null); setPendingBuildCell(null) }}>Cancel</button>
                    </div>
                  ) : (
                    <button
                      className={`mt-2 w-full px-3 py-1 rounded-md ${affordable(BUILD_COST[b.id]) && alignment ? 'bg-emerald-600 hover:bg-emerald-700' : 'bg-slate-700 opacity-60 cursor-not-allowed'}`}
                      disabled={!(affordable(BUILD_COST[b.id]) && alignment)}
                      onClick={() => enqueueBuild(b.id)}
                    >Build</button>
                  )}
                  {/* per-building extra worker controls removed: worker assignment happens per-cell in the tile preview */}
                </div>
              ))}
            </div>
          ) : <div className="text-sm opacity-70">Claim a start tile first on the World Map.</div>}
        </div>

        {/* Start Tile preview moved here so placement is visible while building */}
        <div className="card">
            <TilePreview
            mix={startMix}
            reservedMap={reservedInfoMap}
            selectedCell={pendingBuildCell}
            onSelectCell={(i:number)=>{ if(pendingBuild!==null){ setPendingBuildCell(i); commitPendingBuild(i) } }}
            incompatibleCells={incompatibleCells}
            placedBuildings={placedBuildings}
            cellWorkerAlloc={cellWorkerAlloc}
              onAssignWorkers={(cell: number, n: number) => {
                // compute extra pool and clamp to safe value to avoid over-assigning
                const extraPool = Math.max(0, prodFromBuildings.availableWorkers - prodFromBuildings.requiredWorkers)
                const totalAssigned = Object.values(cellWorkerAlloc || {}).reduce((s:number, v)=>s + (v ?? 0), 0)
                const currentAssigned = cellWorkerAlloc[cell] ?? 0
                const availableForCell = Math.max(0, extraPool - Math.max(0, totalAssigned - currentAssigned))
                const maxAllowed = currentAssigned + availableForCell
                const clamped = Math.max(0, Math.min(n, maxAllowed))
                setCellWorkerAlloc(prev => {
                  const copy = { ...(prev || {}) }
                  const clampedInt = Math.floor(clamped)
                  if (clampedInt <= 0) delete copy[cell]
                  else copy[cell] = clampedInt
                  return copy
                })
                setAssigningCell(null)
              }}
              // assigner controlled by App to survive re-renders
              openAssignCell={assigningCell}
              openAssignValue={assigningValue}
              onRequestOpenAssign={(cell: number, value: number) => { setAssigningCell(cell); setAssigningValue(Math.floor(value)) }}
              onRequestCloseAssign={() => setAssigningCell(null)}
              onRequestChangeAssign={(v: number) => {
                if (assigningCell === null) return
                // compute available extras and clamp
                const extraPool = Math.max(0, prodFromBuildings.availableWorkers - prodFromBuildings.requiredWorkers)
                const totalAssigned = Object.values(cellWorkerAlloc || {}).reduce((s:number, n)=>s + (n ?? 0), 0)
                const currentAssigned = cellWorkerAlloc[assigningCell] ?? 0
                const availableForCell = Math.max(0, extraPool - Math.max(0, totalAssigned - currentAssigned))
                const maxAllowed = currentAssigned + availableForCell
                const clamped = Math.max(0, Math.min(v, maxAllowed))
                setAssigningValue(Math.floor(clamped))
              }}
            // pass worker pool info so the preview can validate assignments
            extraWorkersAvailable={Math.max(0, prodFromBuildings.availableWorkers - prodFromBuildings.requiredWorkers)}
            totalAssignedExtra={Object.values(cellWorkerAlloc || {}).reduce((s:number, n)=>s + (n ?? 0), 0)}
          />
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
                    className={`mt-2 w-full px-3 py-1 rounded-md ${affordable(u.cost) && (sumUnits(units)+trainQueue.length < Math.floor(population)) ? 'bg-sky-600 hover:bg-sky-700' : 'bg-slate-700 opacity-60 cursor-not-allowed'}`}
                    disabled={!(affordable(u.cost) && (sumUnits(units)+trainQueue.length < Math.floor(population)))}
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
            Units: {prodFromBuildings.totalUnits} · Free workers: {Math.max(0, Math.floor(population) - prodFromBuildings.totalUnits)}
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
            {page === 'tile' && <TilePreview mix={startMix} reservedMap={reservedInfoMap} incompatibleCells={incompatibleCells} selectedCell={pendingBuildCell} onSelectCell={(i:number)=>{ if(pendingBuild!==null){ setPendingBuildCell(i); commitPendingBuild(i) } }} />}
        </main>
      </div>

      <ConfirmModal open={confirmOpen} title={confirmData ? `Build ${confirmData.id}` : undefined} onConfirm={onConfirmBuild} onCancel={onCancelBuildConfirm}>
        {confirmData ? (
          <div>
            <div className="text-sm mb-2">Do you want to spend:</div>
            <div className="text-xs">
              {Object.entries(confirmData.cost).map(([k,v])=> <div key={k}>{k}: {v}</div>)}
            </div>
            <div className="text-xs opacity-70 mt-2">Time: {confirmData.timeSec}s · Cell: {confirmData.cellIndex}</div>
          </div>
        ) : null}
      </ConfirmModal>

      <footer className="p-4 text-xs text-center opacity-60 border-t border-slate-800">
        © Mythic Ogame Prototype · Greek faction only · v0.8
      </footer>
    </div>
  )
}
