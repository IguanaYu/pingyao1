export interface GroundPoint { x: number; z: number }
interface Area { xMin: number; xMax: number; zMin: number; zMax: number }
interface Ramp extends Area { lowZ: number; highZ: number; lowY: number; highY: number }
interface Ground extends GroundPoint { y: number }
interface Terrain {
  bounds: Area; groundY: number; playerRadius: number;
  surfaces: (Area & { height: number })[];
  ramps: Ramp[];
  collisions: (Area & { yMin: number; yMax: number })[];
}

const GRID = .35;
const STEP_UP = .28;
// Keep planned routes off obstacle corners even between movement packets.
const ROUTE_CLEARANCE = .065;
const OFFSETS = [-1, -1, 0, -1, 1, -1, -1, 0, 1, 0, -1, 1, 0, 1, 1, 1];
const inside = (a: Area, x: number, z: number, margin = 0) =>
  x >= a.xMin - margin && x <= a.xMax + margin && z >= a.zMin - margin && z <= a.zMax + margin;
const rampSlope = (r: Ramp) => (r.highY - r.lowY) / (r.highZ - r.lowZ);
const distance = (a: GroundPoint, b: GroundPoint) => Math.hypot(a.x - b.x, a.z - b.z);

export function floorHeight(data: Terrain, x: number, z: number): number {
  let y = data.groundY;
  for (const s of data.surfaces) if (inside(s, x, z)) y = Math.max(y, s.height);
  for (const r of data.ramps) if (inside(r, x, z)) {
    const low = Math.min(r.lowY, r.highY), high = Math.max(r.lowY, r.highY);
    y = Math.max(y, Math.max(low, Math.min(high, r.lowY + rampSlope(r) * (z - r.lowZ))));
  }
  return y;
}

function canStand(data: Terrain, x: number, z: number, y: number, clearance = 0): boolean {
  const r = data.playerRadius + clearance;
  return inside(data.bounds, x, z, -r) &&
    !data.collisions.some(c => c.yMax > y + .16 && c.yMin < y + 1.04 && inside(c, x, z, r));
}

export class Navigation {
  private readonly width: number;
  private readonly depth: number;
  private readonly cells: (Ground | null)[] = [];
  private readonly links: [number, number][][] = [];
  constructor(private data: Terrain) {
    const { bounds: b } = data;
    this.width = Math.floor((b.xMax - b.xMin) / GRID) + 1;
    this.depth = Math.floor((b.zMax - b.zMin) / GRID) + 1;
    for (let j = 0; j < this.depth; j++) for (let i = 0; i < this.width; i++) {
      const x = b.xMin + i * GRID, z = b.zMin + j * GRID, y = floorHeight(data, x, z);
      this.cells.push(canStand(data, x, z, y, ROUTE_CLEARANCE) ? { x, y, z } : null);
    }
    this.cells.forEach((from, id) => {
      this.links[id] = [];
      if (!from) return;
      const x = id % this.width, z = Math.floor(id / this.width);
      for (let k = 0; k < OFFSETS.length; k += 2) {
        const i = x + OFFSETS[k], j = z + OFFSETS[k + 1];
        if (i < 0 || j < 0 || i >= this.width || j >= this.depth) continue;
        const next = j * this.width + i, to = this.cells[next];
        if (to && this.clear(from, to, ROUTE_CLEARANCE)) this.links[id].push([next, distance(from, to)]);
      }
    });
  }

  // Sample entire segments so diagonals and shortcuts cannot cross walls or skip stairs.
  clear(from: GroundPoint, to: GroundPoint, clearance = 0): boolean {
    let y = floorHeight(this.data, from.x, from.z);
    const count = Math.max(1, Math.ceil(distance(from, to) / (clearance ? .06 : .14)));
    for (let i = 1; i <= count; i++) {
      const t = i / count, x = from.x + (to.x - from.x) * t, z = from.z + (to.z - from.z) * t;
      const nextY = floorHeight(this.data, x, z);
      if (Math.abs(nextY - y) > (clearance ? .23 : STEP_UP) || !canStand(this.data, x, z, nextY, clearance)) return false;
      y = nextY;
    }
    return true;
  }

  // Intersect the gameplay planes; the visible top surface wins over ground underneath.
  pick(origin: Ground, direction: Ground): GroundPoint | null {
    let best = Infinity, hit: GroundPoint | null = null;
    const plane = (area: Area, intercept: number, slope = 0) => {
      const denom = direction.y - slope * direction.z;
      if (denom >= -1e-7) return;
      const t = (intercept + slope * origin.z - origin.y) / denom;
      if (t <= 0 || t >= best) return;
      const x = origin.x + t * direction.x, z = origin.z + t * direction.z;
      if (!inside(area, x, z) || !inside(this.data.bounds, x, z)) return;
      if (Math.abs(floorHeight(this.data, x, z) - (intercept + slope * z)) > .025) return;
      hit = { x, z }; best = t;
    };
    plane(this.data.bounds, this.data.groundY);
    for (const s of this.data.surfaces) plane(s, s.height);
    for (const r of this.data.ramps) plane(r, r.lowY - rampSlope(r) * r.lowZ, rampSlope(r));
    return hit;
  }

  private nearby(p: GroundPoint, max: number): [number, number][] {
    const { bounds: b } = this.data, i = Math.round((p.x - b.xMin) / GRID), j = Math.round((p.z - b.zMin) / GRID);
    const steps = Math.ceil(max / GRID), options: [number, number][] = [];
    for (let z = Math.max(0, j - steps); z <= Math.min(this.depth - 1, j + steps); z++) {
      for (let x = Math.max(0, i - steps); x <= Math.min(this.width - 1, i + steps); x++) {
        const id = z * this.width + x, cell = this.cells[id];
        if (cell && distance(p, cell) <= max) options.push([id, distance(p, cell)]);
      }
    }
    return options.sort((a, b) => a[1] - b[1]);
  }

  path(from: GroundPoint, target: GroundPoint, allowNearby = false): GroundPoint[] | null {
    if (this.clear(from, target, ROUTE_CLEARANCE)) return [target];
    const start = this.nearby(from, .85).find(([id]) => this.clear(from, this.cells[id]!, ROUTE_CLEARANCE))?.[0];
    if (start === undefined) return null;
    const nearby = this.nearby(target, .95);
    const exact = canStand(this.data, target.x, target.z, floorHeight(this.data, target.x, target.z), ROUTE_CLEARANCE);
    const goals = new Set(nearby.filter(([id]) => exact && this.clear(this.cells[id]!, target, ROUTE_CLEARANCE)).map(([id]) => id));
    if (!goals.size && !allowNearby) return null;
    const y = floorHeight(this.data, target.x, target.z);
    const alternates = new Map(allowNearby ? nearby.filter(([id]) => Math.abs(this.cells[id]!.y - y) < .28) : []);
    const firstAlternate = alternates.keys().next().value;
    const n = this.cells.length, cost = new Float64Array(n).fill(Infinity), prev = new Int32Array(n).fill(-1);
    const seen = new Uint8Array(n), open = new Set([start]), score = new Float64Array(n);
    cost[start] = 0; score[start] = distance(this.cells[start]!, target);
    let finish = -1, bestAlternate = -1, alternateDistance = Infinity;
    while (open.size) {
      let id = -1;
      for (const candidate of open) if (id < 0 || score[candidate] < score[id]) id = candidate;
      open.delete(id); seen[id] = 1;
      if (goals.has(id)) { finish = id; break; }
      const alternate = alternates.get(id);
      if (alternate !== undefined && alternate < alternateDistance) {
        bestAlternate = id; alternateDistance = alternate;
        if (!goals.size && id === firstAlternate) break;
      }
      for (const [next, length] of this.links[id]) {
        const nextCost = cost[id] + length;
        if (seen[next] || nextCost >= cost[next]) continue;
        cost[next] = nextCost; prev[next] = id;
        score[next] = nextCost + distance(this.cells[next]!, target);
        open.add(next);
      }
    }
    if (finish < 0 && bestAlternate < 0) return null;
    const route: GroundPoint[] = finish < 0 ? [] : [target];
    for (let at = finish < 0 ? bestAlternate : finish; at >= 0; at = prev[at]) route.push(this.cells[at]!);
    route.reverse();
    const simplified: GroundPoint[] = [];
    for (let i = 0, p = from; i < route.length;) {
      let next = route.length - 1;
      while (next > i && !this.clear(p, route[next], ROUTE_CLEARANCE)) next--;
      p = route[next]; simplified.push(p); i = next + 1;
    }
    return simplified;
  }
}
