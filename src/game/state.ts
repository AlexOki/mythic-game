import { Alignment, Biome, Resources, Tile } from './types'
import { BASE_YIELDS_PER_MIN_PER_100, BIOME_WEIGHTS, FAITH_PER_POP_PER_SEC } from './config'

export const SAVE_KEY = 'mythic-ogame-save-v6'

export const clamp = (n:number,min:number,max:number)=>Math.max(min,Math.min(max,n))
export const fmt = (n:number)=> (Math.abs(n)>=1000? n.toFixed(0): n.toFixed(2))

export function weightedPick<T extends string|number>(weights:Record<T,number>):T{
  const entries=Object.entries(weights) as [T,number][]
  const total=entries.reduce((s,[,w])=>s+w,0)
  let r=Math.random()*total
  for(const [k,w] of entries){ if((r-=w)<=0) return k }
  return entries[0][0]
}

/** Create a random biome mix (1–3 biomes) */
function randomMix(): Partial<Record<Biome, number>> {
  const biomes = Object.keys(BIOME_WEIGHTS) as Biome[]
  const k = Math.random()<0.15?1: (Math.random()<0.6?2:3)
  const picks: Biome[] = []
  const pool = [...biomes]
  for(let i=0;i<k;i++){
    const idx = Math.floor(Math.random()*pool.length)
    picks.push(pool.splice(idx,1)[0] as Biome)
  }
  const weights = picks.map(()=>Math.random())
  const sum = weights.reduce((s,n)=>s+n,0)
  const mix: Partial<Record<Biome, number>> = {}
  picks.forEach((b,i)=>{ mix[b] = weights[i]/sum })
  return mix
}

export function generateGrid(w:number,h:number):Tile[]{
  const out:Tile[]=[]
  for(let y=0;y<h;y++){
    for(let x=0;x<w;x++){
      out.push({ x, y, biomeMix: randomMix() })
    }
  }
  // Edge decoration: more Water on top row, more Coast on bottom row
  for(let x=0;x<w;x++){
    const top = out[x]
    const bottom = out[(h-1)*w + x]
    if (Math.random()<0.6){
      top.biomeMix[Biome.Water] = Math.max(0.5, top.biomeMix[Biome.Water] ?? 0)
      const s = Object.values(top.biomeMix).reduce((a,b)=>a+(b||0),0)
      Object.keys(top.biomeMix).forEach(k=>{ top.biomeMix[k as Biome]! /= s })
    }
    if (Math.random()<0.4){
      bottom.biomeMix[Biome.Coast] = Math.max(0.5, bottom.biomeMix[Biome.Coast] ?? 0)
      const s2 = Object.values(bottom.biomeMix).reduce((a,b)=>a+(b||0),0)
      Object.keys(bottom.biomeMix).forEach(k=>{ bottom.biomeMix[k as Biome]! /= s2 })
    }
  }
  return out
}

/** Weighted baseline production from a biome mix (per second). */
export function biomeYieldsPerSecond(mix: Partial<Record<Biome, number>>, population:number){
  const scale=(population/100)/60
  const out:Partial<Resources>={}
  const total = Object.values(mix).reduce((s,n)=>s+(n||0),0)||1
  for(const [b,w] of Object.entries(mix)){
    const base=BASE_YIELDS_PER_MIN_PER_100[b as Biome]||{}
    const weight = (w as number)/total
    for(const [res, perMin] of Object.entries(base)){
      (out as any)[res]=((out as any)[res]||0)+(perMin as number)*scale*weight
    }
  }
  return out
}

export function saveGame(blob:any){
  localStorage.setItem(SAVE_KEY, JSON.stringify(blob))
}

export function loadGame(){
  const raw=localStorage.getItem(SAVE_KEY)
  if(!raw) return null
  try{
    const blob = JSON.parse(raw)
    // Migration: if tiles had { biome } before, map to 100% mix of that biome.
    if (Array.isArray(blob.grid) && blob.grid.length && (blob.grid[0] as any).biome && !(blob.grid[0] as any).biomeMix) {
      blob.grid = blob.grid.map((t:any)=>({
        x: t.x, y: t.y, claimedByPlayer: t.claimedByPlayer,
        biomeMix: { [t.biome]: 1 }
      }))
      blob.version = '6'
    }
    return blob
  }catch{
    return null
  }
}

export function faithFromAlignment(alignment:Alignment|null, population:number){
  if(!alignment) return 0
  return population*FAITH_PER_POP_PER_SEC[alignment]
}
