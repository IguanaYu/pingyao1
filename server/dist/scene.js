import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";
export const serverRoot = fileURLToPath(new URL("../", import.meta.url));
export const scenePath = path.resolve(serverRoot, "../shared/scene.json");
export const scene = JSON.parse(readFileSync(scenePath, "utf8"));
function inside(area, x, z, margin = 0) {
    return x >= area.xMin - margin && x <= area.xMax + margin && z >= area.zMin - margin && z <= area.zMax + margin;
}
export function groundHeight(x, z) {
    let y = scene.groundY;
    for (const s of scene.surfaces)
        if (inside(s, x, z))
            y = Math.max(y, s.height);
    for (const r of scene.ramps) {
        if (inside(r, x, z)) {
            const t = Math.max(0, Math.min(1, (z - r.lowZ) / (r.highZ - r.lowZ)));
            y = Math.max(y, r.lowY + (r.highY - r.lowY) * t);
        }
    }
    return y;
}
export function canStand(x, z) {
    const radius = scene.playerRadius ?? 0.2;
    if (!inside(scene.bounds, x, z, -radius))
        return false;
    const y = groundHeight(x, z);
    return !scene.collisions.some(c => c.yMax > y + 0.16 && c.yMin < y + 1.04 && inside(c, x, z, radius));
}
export function clearMove(fromX, fromZ, x, z) {
    const samples = Math.max(1, Math.ceil(Math.hypot(x - fromX, z - fromZ) / 0.2));
    for (let i = 1; i <= samples; i++) {
        const t = i / samples;
        if (!canStand(fromX + (x - fromX) * t, fromZ + (z - fromZ) * t))
            return false;
    }
    return true;
}
//# sourceMappingURL=scene.js.map