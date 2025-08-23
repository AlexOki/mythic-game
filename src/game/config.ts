import { Alignment, Biome, BuildingDef, Resource, Resources, UnitDef } from './types'

export const GRID_W = 12
export const GRID_H = 8
export const TICK_MS = 1000

export const START_POP = 50
export const START_MAX_POP = 80

// ⬇️ Start resources x3
export const START_RESOURCES: Resources = {
  Wood: 60, Stone: 60, Iron: 30, Gold: 30, Food: 150, Linen: 20, Leather: 20, Faith: 0
}

export const FOOD_CONSUMPTION_PER_POP_PER_MIN = 0.02
export const POP_GROWTH_PER_SEC_IF_SURPLUS = 0.00003
export const POP_DECAY_PER_SEC_IF_STARVING = 0.00005

export const FAITH_PER_POP_PER_SEC: Record<Alignment, number> = {
  Good: 0.0000, Neutral: 0.0000, Evil: 0.0000
}

export const BIOME_WEIGHTS: Record<Biome, number> = {
  [Biome.Plain]: 3, [Biome.Forest]: 3, [Biome.Mountain]: 2, [Biome.Coast]: 2, [Biome.Water]: 1
}

// Baseline per-biome data kept for reference, but no longer used for passive production
export const BASE_YIELDS_PER_MIN_PER_100: Record<
  Biome,
  Partial<Record<Exclude<Resource,'Faith'>, number>>
> = {
  [Biome.Forest]: { Wood: 2, Food: 1, Leather: 0.3 },
  [Biome.Plain]: { Food: 2, Linen: 0.8, Wood: 0.6 },
  [Biome.Mountain]: { Stone: 2.2, Iron: 1.1, Gold: 0.4 },
  [Biome.Coast]: { Food: 1.8, Gold: 0.6, Linen: 0.3 },
  [Biome.Water]: { Food: 2.0, Gold: 0.3 },
}

export const BUILDINGS: BuildingDef[] = [
  { id:'Farm',            description:'Produces food',              allowedBiomes:[Biome.Plain],                        yields:{ Food:0.8 },                         requiresWorker:true },
  { id:'Pasture',         description:'Produces food and leather',  allowedBiomes:[Biome.Plain, Biome.Mountain],        yields:{ Food:0.6, Leather:0.2 },           requiresWorker:true },
  { id:'Hunting Grounds', description:'Produces food and leather',  allowedBiomes:[Biome.Forest],                       yields:{ Food:0.5, Leather:0.3 },           requiresWorker:true },
  { id:'Fisheries',       description:'Produces food',              allowedBiomes:[Biome.Coast],                        yields:{ Food:0.7 },                         requiresWorker:true },
  { id:'Flax Fields',     description:'Produces linen',             allowedBiomes:[Biome.Plain],                        yields:{ Linen:0.4 },                        requiresWorker:true },

  // Lumber Camps → WOOD
  { id:'Lumber Camps',    description:'Produces wood',              allowedBiomes:[Biome.Forest],                       yields:{ Wood:0.6 },                         requiresWorker:true },

  { id:'Quarry',          description:'Produces stone',             allowedBiomes:[Biome.Plain],                        yields:{ Stone:0.6 },                        requiresWorker:true },
  { id:'Iron Mine',       description:'Produces iron',              allowedBiomes:[Biome.Mountain],                     yields:{ Iron:0.4 },                         requiresWorker:true },
  { id:'Gold Mine',       description:'Produces gold',              allowedBiomes:[Biome.Mountain],                     yields:{ Gold:0.3 },                         requiresWorker:true },

  // Housing/Temple don’t need workers
  { id:'Hut',             description:'Small housing (+20 cap)',    allowedBiomes:[Biome.Plain, Biome.Forest, Biome.Mountain, Biome.Coast], popCapDelta:20, requiresWorker:false },
  { id:'House',           description:'Large housing (+60 cap)',    allowedBiomes:[Biome.Plain, Biome.Forest, Biome.Mountain, Biome.Coast], popCapDelta:60, requiresWorker:false },
    { id:'Villa',           description:'Luxury housing (+120 cap)',   allowedBiomes:[Biome.Plain, Biome.Forest, Biome.Mountain, Biome.Coast], popCapDelta:120, requiresWorker:false },
    { id:'Temple',          description:'Generates Faith flat/s',     allowedBiomes:[Biome.Plain, Biome.Forest, Biome.Mountain, Biome.Coast], faithPerSec:0.5, requiresWorker:false },
]

export const BUILD_COST: Record<string, Partial<Resources>> = {
  'Farm': { Wood: 30, Food: 10 }, 'Pasture': { Wood: 25, Food: 20 },
  'Hunting Grounds': { Wood: 35 }, 'Fisheries': { Wood: 40 },
  'Flax Fields': { Wood: 30 }, 'Lumber Camps': { Wood: 25 },
  'Quarry': { Wood: 30 }, 'Iron Mine': { Wood: 40, Stone: 20 },
  'Gold Mine': { Wood: 50, Stone: 30}, 'Hut': { Wood: 40, Food: 20 },
  'House': { Wood: 80, Stone: 40 }, 'Temple': { Wood: 60, Stone: 60},
    'Villa': { Wood: 160, Stone: 120 },
}

export const BUILD_TIME_SEC: Record<string, number> = {
  'Farm': 20, 'Pasture': 25, 'Hunting Grounds': 25, 'Fisheries': 30,
  'Flax Fields': 25, 'Lumber Camps': 20, 'Quarry': 30, 'Iron Mine': 35,
  'Gold Mine': 40, 'Hut': 20, 'House': 45, 'Temple': 60,
    'Villa': 90,
}

export const UNITS: UnitDef[] = [
  { id:'Psilos',        type:'Mortal',   allowedAlignments:['Good','Neutral','Evil'], cost:{ Food:15, Linen:5 },                    timeSec:10 },
  { id:'Hoplite',       type:'Mortal',   allowedAlignments:['Good','Neutral','Evil'], cost:{ Food:25, Iron:10, Linen:8 },          timeSec:18 },
  { id:'Peltast',       type:'Mortal',   allowedAlignments:['Good','Neutral','Evil'], cost:{ Food:22, Wood:12, Linen:8 },          timeSec:16 },
  { id:'Hippeis',       type:'Mortal',   allowedAlignments:['Good','Neutral','Evil'], cost:{ Food:35, Leather:12, Iron:8 },        timeSec:24 },
  { id:'Cyclops',       type:'Mythical', allowedAlignments:['Good'],                  cost:{ Food:50, Stone:30, Faith:20 },         timeSec:45 },
  { id:'Satyr',         type:'Mythical', allowedAlignments:['Good'],                  cost:{ Food:30, Linen:10, Faith:15 },         timeSec:28 },
  { id:'Pegasus Rider', type:'Mythical', allowedAlignments:['Good','Neutral'],        cost:{ Food:40, Linen:15, Gold:10, Faith:15 }, timeSec:36 },
  { id:'Centaur',       type:'Mythical', allowedAlignments:['Neutral'],               cost:{ Food:38, Leather:12, Faith:12 },       timeSec:32 },
  { id:'Minotaur',      type:'Mythical', allowedAlignments:['Neutral','Evil'],        cost:{ Food:45, Stone:20, Faith:18 },         timeSec:40 },
  { id:'Medusa',        type:'Mythical', allowedAlignments:['Evil'],                  cost:{ Food:30, Linen:10, Gold:15, Faith:22 }, timeSec:38 },
  { id:'Harpie',        type:'Mythical', allowedAlignments:['Evil'],                  cost:{ Food:28, Linen:10, Faith:14 },         timeSec:26 },
]
