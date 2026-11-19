import { Room, ServerError } from "@colyseus/core";
import { Player, TempleState, WorldObject } from "./state.js";
import { LEGACY_STATIONS, canStand, clearMove, groundHeight, insideZone, pickSpot, scene, zoneOf, } from "./scene.js";
const DURATIONS = { incense: 4800, bow: 3400, offering: 3500, sit: 0 };
const MAX_SPEED = 6;
const OFFERING_LIFETIME = 600_000;
const SPAWN_MIN_GAP = 1.0;
const CLAIM_MARGIN = 0.35;
const ARRIVE_XZ = 0.3;
const ARRIVE_Y = 0.18;
const SPOT_CROWDED = 0.6;
export class TempleRoom extends Room {
    constructor() {
        super(...arguments);
        this.state = new TempleState();
        this.maxClients = 60;
        this.autoDispose = false;
        this.patchRate = 50;
        this.lastMove = new Map();
        this.movementBudget = new Map();
        this.rates = new Map();
        this.offeringCounter = 0;
    }
    static { this.active = false; }
    onCreate() {
        if (TempleRoom.active)
            throw new ServerError(4001, "演示院子已满，请稍后再进入。");
        TempleRoom.active = true;
        this.setMetadata({ title: "平遥城隍庙 · 同院演示" });
        this.onMessage("move", (client, data) => this.movePlayer(client, data));
        this.onMessage("act", (client, data) => this.startAction(client, data));
        this.onMessage("cancel", client => this.cancelAction(client));
        this.onMessage("stand", client => this.cancelAction(client));
        this.setSimulationInterval(() => this.tick(), 100);
        console.log("TEMPLE_ROOM_READY", this.roomId);
    }
    onJoin(client, options) {
        const player = new Player();
        player.id = client.sessionId;
        const raw = options && typeof options === "object" ? options.nickname : "";
        player.nickname = typeof raw === "string" ? raw.replace(/[\u0000-\u001f\u007f]/g, "").trim().slice(0, 16) : "";
        if (!player.nickname)
            player.nickname = `访客${String(this.clients.length).padStart(2, "0")}`;
        const spawn = this.pickSpawn();
        player.x = spawn.x;
        player.z = spawn.z;
        player.y = groundHeight(player.x, player.z);
        player.yaw = scene.spawnYaw;
        this.state.players.set(client.sessionId, player);
        this.lastMove.set(client.sessionId, Date.now());
        this.movementBudget.set(client.sessionId, { time: Date.now(), credit: 0.65 });
        client.send("event", { type: "joined", text: "已进入同一座院子", sessionId: client.sessionId });
    }
    onLeave(client) {
        this.state.players.delete(client.sessionId);
        this.lastMove.delete(client.sessionId);
        this.movementBudget.delete(client.sessionId);
        this.rates.delete(client.sessionId);
    }
    onDispose() {
        TempleRoom.active = false;
    }
    allowMessage(client) {
        const now = Date.now();
        let rate = this.rates.get(client.sessionId);
        if (!rate || now - rate.start >= 1000) {
            rate = { start: now, count: 0 };
            this.rates.set(client.sessionId, rate);
        }
        return ++rate.count <= 80;
    }
    correct(client, p) {
        client.send("correction", { x: p.x, y: p.y, z: p.z, yaw: p.yaw });
    }
    movePlayer(client, data) {
        if (!this.allowMessage(client) || !data || typeof data !== "object")
            return;
        const p = this.state.players.get(client.sessionId);
        if (!p || p.action !== "idle")
            return;
        const d = data;
        if (![d.x, d.z, d.yaw].every(v => typeof v === "number" && Number.isFinite(v)))
            return;
        const x = d.x, z = d.z, yaw = d.yaw;
        const now = Date.now();
        const budget = this.movementBudget.get(p.id) ?? { time: now, credit: 0.65 };
        budget.credit = Math.min(0.9, budget.credit + Math.max(0, now - budget.time) / 1000 * MAX_SPEED);
        budget.time = now;
        this.movementBudget.set(p.id, budget);
        const distance = Math.hypot(x - p.x, z - p.z);
        if (distance > budget.credit + 0.02 || groundHeight(x, z) - p.y > 0.28 || !clearMove(p.x, p.z, x, z)) {
            p.moving = false;
            this.correct(client, p);
            return;
        }
        budget.credit = Math.max(0, budget.credit - distance);
        p.x = x;
        p.z = z;
        p.y = groundHeight(x, z);
        p.yaw = ((yaw + Math.PI) % (Math.PI * 2) + Math.PI * 2) % (Math.PI * 2) - Math.PI;
        p.moving = d.moving === true && distance > 0.001;
        this.lastMove.set(p.id, now);
    }
    /** 入口区域内随机出生：优先可站且与他人相距够远的点，兜底取离人最远的采样点。 */
    pickSpawn() {
        const area = scene.spawnArea ?? {
            xMin: scene.spawn[0] - 0.5, xMax: scene.spawn[0] + 0.5,
            zMin: scene.spawn[2] - 0.5, zMax: scene.spawn[2] + 0.5,
        };
        const others = [];
        this.state.players.forEach(o => others.push({ x: o.x, z: o.z }));
        const center = { x: (area.xMin + area.xMax) / 2, z: (area.zMin + area.zMax) / 2 };
        const sample = () => ({
            x: area.xMin + Math.random() * (area.xMax - area.xMin),
            z: area.zMin + Math.random() * (area.zMax - area.zMin),
        });
        for (let i = 0; i < 30; i++) {
            const point = sample();
            if (canStand(point.x, point.z) && others.every(o => Math.hypot(o.x - point.x, o.z - point.z) >= SPAWN_MIN_GAP))
                return point;
        }
        let best = center, bestScore = -1;
        for (let i = 0; i < 24; i++) {
            const point = sample();
            if (!canStand(point.x, point.z))
                continue;
            const score = others.reduce((min, o) => Math.min(min, Math.hypot(o.x - point.x, o.z - point.z)), Infinity);
            if (score > bestScore) {
                bestScore = score;
                best = point;
            }
        }
        if (!canStand(best.x, best.z))
            return canStand(center.x, center.z) ? center : { x: scene.spawn[0], z: scene.spawn[2] };
        return best;
    }
    startAction(client, data) {
        if (!this.allowMessage(client) || !data || typeof data !== "object")
            return;
        const p = this.state.players.get(client.sessionId);
        if (!p)
            return;
        const d = data;
        const kind = typeof d.kind === "string" ? d.kind : "";
        if (!Object.hasOwn(DURATIONS, kind))
            return this.rejectAction(client, "invalid", "请选择有效的仪式。");
        if (p.action !== "idle")
            return this.rejectAction(client, "busy", "请先完成当前动作，或点击取消／起身。");
        if (kind === "offering" && d.offeringType !== "flower" && d.offeringType !== "fruit") {
            return this.rejectAction(client, "invalid", "请选择鲜花或果盘。");
        }
        // In-place incense uses the last accepted movement position and facing.
        const zone = kind === "incense" ? undefined : zoneOf(kind);
        if (kind !== "incense" && !zone)
            return this.rejectAction(client, "invalid", "请选择有效的互动位置。");
        if (zone) {
            let claimX, claimZ;
            if (typeof d.x === "number" && typeof d.z === "number" && Number.isFinite(d.x) && Number.isFinite(d.z)) {
                claimX = d.x;
                claimZ = d.z;
            }
            else {
                const legacy = typeof d.stationId === "string" ? LEGACY_STATIONS[d.stationId] : undefined;
                if (!legacy || legacy.kind !== kind)
                    return this.rejectAction(client, "invalid", "请选择有效的互动位置。");
                claimX = legacy.x;
                claimZ = legacy.z;
            }
            if (!insideZone(zone, claimX, claimZ, CLAIM_MARGIN) || !canStand(claimX, claimZ)) {
                return this.rejectAction(client, "invalid", "请选择有效的互动位置。");
            }
            if (Math.hypot(p.x - claimX, p.z - claimZ) > ARRIVE_XZ || Math.abs(p.y - groundHeight(claimX, claimZ)) > ARRIVE_Y) {
                return this.rejectAction(client, "notArrived", `到达${zone.name}区域后才能开始。`);
            }
            const others = [];
            this.state.players.forEach(o => { if (o.id !== p.id)
                others.push({ x: o.x, z: o.z }); });
            if (others.some(o => Math.hypot(o.x - claimX, o.z - claimZ) < SPOT_CROWDED)) {
                // 声称点被占：不再拒绝，由服务器把人挪到最近的空位（schema 广播后客户端自动对齐）。
                const spot = pickSpot(zone, others, claimX, claimZ);
                p.x = spot.x;
                p.z = spot.z;
            }
            p.y = groundHeight(p.x, p.z);
            p.yaw = zone.yaw;
        }
        const now = Date.now();
        p.moving = false;
        p.action = kind;
        p.stationId = "";
        p.offeringType = kind === "offering" ? d.offeringType : "";
        p.actionStartedAt = now;
        p.actionEndsAt = DURATIONS[kind] ? now + DURATIONS[kind] : 0;
        this.lastMove.set(p.id, now);
        client.send("event", { type: "actionStarted", kind, stationId: p.stationId });
    }
    cancelAction(client) {
        if (!this.allowMessage(client))
            return;
        const p = this.state.players.get(client.sessionId);
        if (!p || p.action === "idle")
            return;
        const kind = p.action;
        this.clearAction(p);
        this.lastMove.set(p.id, Date.now());
        client.send("event", { type: "actionCancelled", kind });
    }
    clearAction(p) {
        p.action = "idle";
        p.stationId = "";
        p.offeringType = "";
        p.actionStartedAt = 0;
        p.actionEndsAt = 0;
        p.moving = false;
    }
    /** 供物多件并存：按类型在案面摆物点顺序取空位；同类型 4 点全满则替换最旧的一件。 */
    placeOffering(p, zone, now) {
        const type = p.offeringType || "flower";
        const placements = zone.placements?.[type] ?? [];
        const sameType = [];
        this.state.offerings.forEach(o => { if (o.offeringType === type)
            sameType.push(o); });
        const nearestPoint = (x, z) => {
            let index = -1, nearest = Infinity;
            placements.forEach((point, i) => {
                const distance = Math.hypot(x - point[0], z - point[2]);
                if (distance < nearest) {
                    nearest = distance;
                    index = i;
                }
            });
            return index;
        };
        const used = new Set(sameType.map(o => nearestPoint(o.x, o.z)).filter(i => i >= 0));
        let index = placements.findIndex((_, i) => !used.has(i));
        if (index < 0 && placements.length) {
            const oldest = sameType.sort((a, b) => a.createdAt - b.createdAt)[0];
            if (oldest) {
                index = Math.max(0, nearestPoint(oldest.x, oldest.z));
                this.state.offerings.delete(oldest.id);
            }
        }
        const object = new WorldObject();
        object.id = `${type}-${++this.offeringCounter}`;
        object.kind = "offering";
        object.offeringType = type;
        object.ownerId = p.id;
        object.createdAt = now;
        object.yaw = zone.yaw;
        const point = index >= 0 ? placements[index] : [p.x, groundHeight(p.x, p.z) + 0.9, p.z];
        [object.x, object.y, object.z] = point;
        object.expiresAt = now + OFFERING_LIFETIME;
        this.state.offerings.set(object.id, object);
    }
    tick() {
        const now = Date.now();
        this.state.serverTime = now;
        this.state.players.forEach(p => {
            if (p.moving && now - (this.lastMove.get(p.id) ?? now) > 300)
                p.moving = false;
            if (p.action !== "idle" && p.actionEndsAt > 0 && now >= p.actionEndsAt) {
                const kind = p.action;
                if (kind === "offering") {
                    const zone = zoneOf("offering");
                    if (zone)
                        this.placeOffering(p, zone, now);
                }
                this.clearAction(p);
                this.lastMove.set(p.id, now);
                this.clients.find(c => c.sessionId === p.id)?.send("event", { type: "actionCompleted", kind });
            }
        });
        this.state.offerings.forEach((o, key) => { if (now >= o.expiresAt)
            this.state.offerings.delete(key); });
    }
    rejectAction(client, reason, text) { client.send("actionRejected", { reason, text }); }
}
//# sourceMappingURL=TempleRoom.js.map