import { Schema, type, MapSchema } from "@colyseus/schema";

export class Player extends Schema {
  @type("string") id = "";
  @type("string") nickname = "";
  @type("number") x = 0;
  @type("number") y = 0;
  @type("number") z = 0;
  @type("number") yaw = 0;
  @type("boolean") moving = false;
  @type("string") action = "idle";
  @type("number") actionStartedAt = 0;
  @type("number") actionEndsAt = 0;
  @type("string") stationId = "";
  @type("string") offeringType = "";
}

export class WorldObject extends Schema {
  @type("string") id = "";
  @type("string") kind = "";
  @type("string") offeringType = "";
  @type("string") ownerId = "";
  @type("number") x = 0;
  @type("number") y = 0;
  @type("number") z = 0;
  @type("number") yaw = 0;
  @type("number") createdAt = 0;
  @type("number") expiresAt = 0;
}

export class TempleState extends Schema {
  @type({ map: Player }) players = new MapSchema<Player>();
  @type({ map: WorldObject }) offerings = new MapSchema<WorldObject>();
  @type("number") serverTime = Date.now();
}
