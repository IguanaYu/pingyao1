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
// ---- 区域制仪式：站位格子、选点与旧协议兼容 --------------------------------
/** 旧协议 stationId → 区域内坐标（供旧打包网页客户端使用）。 */
export const LEGACY_STATIONS = {
    offering: { kind: "offering", x: 0, z: -11.6 },
    bow: { kind: "bow", x: 0, z: -18.8 },
    sit: { kind: "sit", x: -11, z: -5 },
    "sit-2": { kind: "sit", x: -11, z: -6.25 },
    "sit-3": { kind: "sit", x: -11, z: -3.75 },
};
export function zoneOf(kind) {
    return scene.zones.find(z => z.kind === kind);
}
export function insideZone(zone, x, z, margin = 0) {
    return inside(zone.rect, x, z, margin);
}
const PERSONAL_SPACE = { sit: 1.0, offering: 0.75, bow: 0.75 };
const slotCache = new Map();
/** 矩形内按 spacing 生成网格候选位（自 rect 角点起算），用 canStand 过滤。 */
export function zoneSlots(zone) {
    const cached = slotCache.get(zone);
    if (cached)
        return cached;
    const { rect, spacing } = zone;
    const points = [];
    for (let j = 0;; j++) {
        const z = rect.zMin + j * spacing;
        if (z > rect.zMax + 1e-6)
            break;
        for (let i = 0;; i++) {
            const x = rect.xMin + i * spacing;
            if (x > rect.xMax + 1e-6)
                break;
            if (canStand(x, z))
                points.push([x, groundHeight(x, z), z]);
        }
    }
    slotCache.set(zone, points);
    return points;
}
/**
 * 为玩家挑一个位置：优先选离 prefer 最近、与所有人距离达标的空格；
 * 全满则区域内随机采样取"离人最远"者；兜底区域中心。
 */
export function pickSpot(zone, others, preferX, preferZ) {
    const space = PERSONAL_SPACE[zone.kind] ?? 0.75;
    const prefer = { x: preferX ?? (zone.rect.xMin + zone.rect.xMax) / 2, z: preferZ ?? (zone.rect.zMin + zone.rect.zMax) / 2 };
    const free = (x, z) => others.every(o => Math.hypot(o.x - x, o.z - z) >= space);
    const slots = zoneSlots(zone).filter(([x, , z]) => free(x, z))
        .sort((a, b) => Math.hypot(a[0] - prefer.x, a[2] - prefer.z) - Math.hypot(b[0] - prefer.x, b[2] - prefer.z));
    if (slots.length)
        return { x: slots[0][0], z: slots[0][2] };
    let best = { x: prefer.x, z: prefer.z }, bestScore = -1;
    for (let i = 0; i < 24; i++) {
        const x = zone.rect.xMin + Math.random() * (zone.rect.xMax - zone.rect.xMin);
        const z = zone.rect.zMin + Math.random() * (zone.rect.zMax - zone.rect.zMin);
        if (!canStand(x, z))
            continue;
        const score = others.reduce((min, o) => Math.min(min, Math.hypot(o.x - x, o.z - z)), Infinity);
        if (score > bestScore) {
            bestScore = score;
            best = { x, z };
        }
    }
    return best;
}
//# sourceMappingURL=scene.js.map