import { Room, ServerError, type Client } from "@colyseus/core";
import { Player, TempleState, WorldObject } from "./state.js";
import { canStand, clearMove, groundHeight, scene, type Station } from "./scene.js";

const DURATIONS: Record<string, number> = { incense: 4800, bow: 3400, offering: 3500, sit: 0 };
const MAX_SPEED = 6;
const OFFERING_LIFETIME = 600_000;

export class TempleRoom extends Room<{ state: TempleState }> {
  private static active = false;
  state = new TempleState();
  maxClients = 60;
  autoDispose = false;
  patchRate = 50;
  private lastMove = new Map<string, number>();
  private movementBudget = new Map<string, { time: number; credit: number }>();
  private rates = new Map<string, { start: number; count: number }>();

  onCreate(): void {
    if (TempleRoom.active) throw new ServerError(4001, "演示院子已满，请稍后再进入。");
    TempleRoom.active = true;
    this.setMetadata({ title: "平遥城隍庙 · 同院演示" });
    this.onMessage("move", (client, data) => this.movePlayer(client, data));
    this.onMessage("act", (client, data) => this.startAction(client, data));
    this.onMessage("cancel", client => this.cancelAction(client));
    this.onMessage("stand", client => this.cancelAction(client));
    this.setSimulationInterval(() => this.tick(), 100);
    console.log("TEMPLE_ROOM_READY", this.roomId);
  }

  onJoin(client: Client, options: unknown): void {
    const player = new Player();
    player.id = client.sessionId;
    const raw = options && typeof options === "object" ? (options as Record<string, unknown>).nickname : "";
    player.nickname = typeof raw === "string" ? raw.replace(/[\u0000-\u001f\u007f]/g, "").trim().slice(0, 16) : "";
    if (!player.nickname) player.nickname = `访客${String(this.clients.length).padStart(2, "0")}`;
    const offset = ((this.clients.length - 1) % 5) * 0.65;
    player.x = scene.spawn[0] + offset;
    player.z = scene.spawn[2];
    if (!canStand(player.x, player.z)) player.x = scene.spawn[0];
    player.y = groundHeight(player.x, player.z);
    player.yaw = scene.spawnYaw;
    this.state.players.set(client.sessionId, player);
    this.lastMove.set(client.sessionId, Date.now());
    this.movementBudget.set(client.sessionId, { time: Date.now(), credit: 0.65 });
    client.send("event", { type: "joined", text: "已进入同一座院子", sessionId: client.sessionId });
  }

  onLeave(client: Client): void {
    this.state.players.delete(client.sessionId);
    this.lastMove.delete(client.sessionId);
    this.movementBudget.delete(client.sessionId);
    this.rates.delete(client.sessionId);
  }

  onDispose(): void {
    TempleRoom.active = false;
  }

  private allowMessage(client: Client): boolean {
    const now = Date.now();
    let rate = this.rates.get(client.sessionId);
    if (!rate || now - rate.start >= 1000) {
      rate = { start: now, count: 0 };
      this.rates.set(client.sessionId, rate);
    }
    return ++rate.count <= 80;
  }

  private correct(client: Client, p: Player): void {
    client.send("correction", { x: p.x, y: p.y, z: p.z, yaw: p.yaw });
  }

  private movePlayer(client: Client, data: unknown): void {
    if (!this.allowMessage(client) || !data || typeof data !== "object") return;
    const p = this.state.players.get(client.sessionId);
    if (!p || p.action !== "idle") return;
    const d = data as Record<string, unknown>;
    if (![d.x, d.z, d.yaw].every(v => typeof v === "number" && Number.isFinite(v))) return;
    const x = d.x as number, z = d.z as number, yaw = d.yaw as number;
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
    p.x = x; p.z = z; p.y = groundHeight(x, z);
    p.yaw = ((yaw + Math.PI) % (Math.PI * 2) + Math.PI * 2) % (Math.PI * 2) - Math.PI;
    p.moving = d.moving === true && distance > 0.001;
    this.lastMove.set(p.id, now);
  }

  private startAction(client: Client, data: unknown): void {
    if (!this.allowMessage(client) || !data || typeof data !== "object") return;
    const p = this.state.players.get(client.sessionId);
    if (!p) return;
    const d = data as Record<string, unknown>;
    const kind = typeof d.kind === "string" ? d.kind : "";
    if (!Object.hasOwn(DURATIONS, kind)) return this.rejectAction(client, "invalid", "请选择有效的仪式。");
    if (p.action !== "idle") return this.rejectAction(client, "busy", "请先完成当前动作，或点击取消／起身。");
    // In-place incense uses the last accepted movement position and facing.
    const station = kind === "incense" ? undefined : scene.stations.find(s => s.id === d.stationId && s.kind === kind);
    if (kind !== "incense" && !station) return this.rejectAction(client, "invalid", "请选择有效的互动位置。");
    if (station) {
      if (Math.hypot(p.x - station.position[0], p.z - station.position[2]) > 0.24 || Math.abs(p.y - station.position[1]) > 0.18) {
        return this.rejectAction(client, "notArrived", `到达${station.name}位置后才能开始。`);
      }
      let occupied = false;
      this.state.players.forEach(other => { if (other.id !== p.id && other.stationId === station.id) occupied = true; });
      if (occupied) return this.rejectAction(client, "occupied", "这里有人正在使用，请稍等或换一个位置。");
    }
    if (kind === "offering" && d.offeringType !== "flower" && d.offeringType !== "fruit") {
      return this.rejectAction(client, "invalid", "请选择鲜花或果盘。");
    }
    const now = Date.now();
    if (station) p.yaw = station.yaw;
    p.moving = false;
    p.action = kind;
    p.stationId = station?.id ?? "";
    p.offeringType = kind === "offering" ? d.offeringType as string : "";
    p.actionStartedAt = now;
    p.actionEndsAt = DURATIONS[kind] ? now + DURATIONS[kind] : 0;
    this.lastMove.set(p.id, now);
    client.send("event", { type: "actionStarted", kind, stationId: p.stationId });
  }

  private cancelAction(client: Client): void {
    if (!this.allowMessage(client)) return;
    const p = this.state.players.get(client.sessionId);
    if (!p || p.action === "idle") return;
    const kind = p.action;
    this.clearAction(p);
    this.lastMove.set(p.id, Date.now());
    client.send("event", { type: "actionCancelled", kind });
  }

  private clearAction(p: Player): void {
    p.action = "idle";
    p.stationId = "";
    p.offeringType = "";
    p.actionStartedAt = 0;
    p.actionEndsAt = 0;
    p.moving = false;
  }

  private placeOffering(p: Player, station: Station, now: number): void {
    const object = new WorldObject();
    object.kind = "offering";
    object.id = p.offeringType;
    object.offeringType = p.offeringType;
    object.ownerId = p.id;
    object.createdAt = now;
    object.yaw = station.yaw;
    const point = p.offeringType === "flower" ? (station.flowerPosition ?? station.position) : (station.fruitPosition ?? station.position);
    [object.x, object.y, object.z] = point;
    object.expiresAt = now + OFFERING_LIFETIME;
    this.state.offerings.set(object.id, object);
  }
  private tick(): void {
    const now = Date.now();
    this.state.serverTime = now;
    this.state.players.forEach(p => {
      if (p.moving && now - (this.lastMove.get(p.id) ?? now) > 300) p.moving = false;
      if (p.action !== "idle" && p.actionEndsAt > 0 && now >= p.actionEndsAt) {
        const kind = p.action;
        const station = scene.stations.find(s => s.id === p.stationId);
        if (station && kind === "offering") this.placeOffering(p, station, now);
        this.clearAction(p);
        this.lastMove.set(p.id, now);
        this.clients.find(c => c.sessionId === p.id)?.send("event", { type: "actionCompleted", kind });
      }
    });
    this.state.offerings.forEach((o, key) => { if (now >= o.expiresAt) this.state.offerings.delete(key); });
  }

  private rejectAction(client: Client, reason: string, text: string): void { client.send("actionRejected", { reason, text }); }
}
