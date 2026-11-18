import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

export type Point = [number, number, number];
export interface Area { xMin: number; xMax: number; zMin: number; zMax: number }
export interface Station {
  id: string; kind: string; name: string; position: Point; yaw: number; radius: number;
  propPosition?: Point; flowerPosition?: Point; fruitPosition?: Point;
}
export interface SceneConfig {
  version: number; bounds: Area; groundY: number; playerRadius: number;
  spawn: Point; spawnYaw: number;
  surfaces: (Area & { height: number })[];
  ramps: (Area & { lowZ: number; highZ: number; lowY: number; highY: number })[];
  collisions: (Area & { yMin: number; yMax: number; id?: string })[];
  stations: Station[];
}
export const serverRoot = fileURLToPath(new URL("../", import.meta.url));
export const scenePath = path.resolve(serverRoot, "../shared/scene.json");
export const scene: SceneConfig = JSON.parse(readFileSync(scenePath, "utf8"));

function inside(area: Area, x: number, z: number, margin = 0): boolean {
  return x >= area.xMin - margin && x <= area.xMax + margin && z >= area.zMin - margin && z <= area.zMax + margin;
}

export function groundHeight(x: number, z: number): number {
  let y = scene.groundY;
  for (const s of scene.surfaces) if (inside(s, x, z)) y = Math.max(y, s.height);
  for (const r of scene.ramps) {
    if (inside(r, x, z)) {
      const t = Math.max(0, Math.min(1, (z - r.lowZ) / (r.highZ - r.lowZ)));
      y = Math.max(y, r.lowY + (r.highY - r.lowY) * t);
    }
  }
  return y;
}

export function canStand(x: number, z: number): boolean {
  const radius = scene.playerRadius ?? 0.2;
  if (!inside(scene.bounds, x, z, -radius)) return false;
  const y = groundHeight(x, z);
  return !scene.collisions.some(c => c.yMax > y + 0.16 && c.yMin < y + 1.04 && inside(c, x, z, radius));
}

export function clearMove(fromX: number, fromZ: number, x: number, z: number): boolean {
  const samples = Math.max(1, Math.ceil(Math.hypot(x - fromX, z - fromZ) / 0.2));
  for (let i = 1; i <= samples; i++) {
    const t = i / samples;
    if (!canStand(fromX + (x - fromX) * t, fromZ + (z - fromZ) * t)) return false;
  }
  return true;
}
