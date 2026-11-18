var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
import { Schema, type, MapSchema } from "@colyseus/schema";
export class Player extends Schema {
    constructor() {
        super(...arguments);
        this.id = "";
        this.nickname = "";
        this.x = 0;
        this.y = 0;
        this.z = 0;
        this.yaw = 0;
        this.moving = false;
        this.action = "idle";
        this.actionStartedAt = 0;
        this.actionEndsAt = 0;
        this.stationId = "";
        this.offeringType = "";
    }
}
__decorate([
    type("string")
], Player.prototype, "id", void 0);
__decorate([
    type("string")
], Player.prototype, "nickname", void 0);
__decorate([
    type("number")
], Player.prototype, "x", void 0);
__decorate([
    type("number")
], Player.prototype, "y", void 0);
__decorate([
    type("number")
], Player.prototype, "z", void 0);
__decorate([
    type("number")
], Player.prototype, "yaw", void 0);
__decorate([
    type("boolean")
], Player.prototype, "moving", void 0);
__decorate([
    type("string")
], Player.prototype, "action", void 0);
__decorate([
    type("number")
], Player.prototype, "actionStartedAt", void 0);
__decorate([
    type("number")
], Player.prototype, "actionEndsAt", void 0);
__decorate([
    type("string")
], Player.prototype, "stationId", void 0);
__decorate([
    type("string")
], Player.prototype, "offeringType", void 0);
export class WorldObject extends Schema {
    constructor() {
        super(...arguments);
        this.id = "";
        this.kind = "";
        this.offeringType = "";
        this.ownerId = "";
        this.x = 0;
        this.y = 0;
        this.z = 0;
        this.yaw = 0;
        this.createdAt = 0;
        this.expiresAt = 0;
    }
}
__decorate([
    type("string")
], WorldObject.prototype, "id", void 0);
__decorate([
    type("string")
], WorldObject.prototype, "kind", void 0);
__decorate([
    type("string")
], WorldObject.prototype, "offeringType", void 0);
__decorate([
    type("string")
], WorldObject.prototype, "ownerId", void 0);
__decorate([
    type("number")
], WorldObject.prototype, "x", void 0);
__decorate([
    type("number")
], WorldObject.prototype, "y", void 0);
__decorate([
    type("number")
], WorldObject.prototype, "z", void 0);
__decorate([
    type("number")
], WorldObject.prototype, "yaw", void 0);
__decorate([
    type("number")
], WorldObject.prototype, "createdAt", void 0);
__decorate([
    type("number")
], WorldObject.prototype, "expiresAt", void 0);
export class TempleState extends Schema {
    constructor() {
        super(...arguments);
        this.players = new MapSchema();
        this.offerings = new MapSchema();
        this.serverTime = Date.now();
    }
}
__decorate([
    type({ map: Player })
], TempleState.prototype, "players", void 0);
__decorate([
    type({ map: WorldObject })
], TempleState.prototype, "offerings", void 0);
__decorate([
    type("number")
], TempleState.prototype, "serverTime", void 0);
//# sourceMappingURL=state.js.map