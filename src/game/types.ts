export type Resource = 'Wood'|'Stone'|'Iron'|'Gold'|'Food'|'Linen'|'Leather'|'Faith'
export type Resources = Record<Resource, number>

export type Alignment = 'Good'|'Neutral'|'Evil'

export enum Biome { Plain='Plain', Forest='Forest', Mountain='Mountain', Coast='Coast', Water='Water' }

/** Each tile can now be a MIX of biomes (weights sum to ~1.0). */
export type Tile = {
  x: number
  y: number
  biomeMix: Partial<Record<Biome, number>>
  claimedByPlayer?: boolean
}

export type BuildingId =
  | 'Farm' | 'Pasture' | 'Hunting Grounds' | 'Fisheries' | 'Flax Fields' | 'Lumber Camps'
  | 'Quarry' | 'Iron Mine' | 'Gold Mine' | 'Hut' | 'House' | 'Temple' | 'Villa'

export type BuildingDef = {
  id: BuildingId
  description: string
  allowedBiomes: Biome[]
  yields?: Partial<Resources>
  popCapDelta?: number
  faithPerSec?: number
  /** each building needs 1 worker for full output (unless false); housing/temple don't */
  requiresWorker?: boolean
}

export type BuildingCounts = Partial<Record<BuildingId, number>>
export type BuildJob = { id: BuildingId; remainingSec: number }
export type WorkerAlloc = Partial<Record<BuildingId, number>> // (if you add worker sliders later)

export type UnitId =
  'Psilos'|'Hoplite'|'Peltast'|'Hippeis'|'Cyclops'|'Satyr'|'Pegasus Rider'|'Centaur'|'Minotaur'|'Medusa'|'Harpie'

export type UnitDef = {
  id: UnitId
  type: 'Mortal'|'Mythical'
  allowedAlignments: Alignment[]
  timeSec: number
  cost: Partial<Resources>
}

export type UnitCounts = Partial<Record<UnitId, number>>
export type UnitJob = { id: UnitId; remainingSec: number }

export type SaveBlob = {
  version: string
  alignment: Alignment | null
  faction: 'Greek'
  resources: Resources
  population: number
  maxPopulation: number
  startTile: { x: number; y: number } | null
  grid: Tile[]
  buildings: BuildingCounts
  buildQueue: BuildJob[]
  units: UnitCounts
  trainQueue: UnitJob[]
  // workerAlloc?: WorkerAlloc  // uncomment if/when you add sliders again
  timeSaved: number
}
