import { createServer } from "node:http";
import path from "node:path";
import express from "express";
import { Server, matchMaker } from "@colyseus/core";
import { WebSocketTransport } from "@colyseus/ws-transport";
import { TempleRoom } from "./TempleRoom.js";
import { scene, scenePath, serverRoot } from "./scene.js";
const app = express();
app.disable("x-powered-by");
const origins = (process.env.ALLOWED_ORIGINS ?? "").split(",").map(s => s.trim()).filter(Boolean);
app.use((req, res, next) => {
    const origin = req.headers.origin;
    if (origin && (!origins.length || origins.includes(origin))) {
        res.setHeader("Access-Control-Allow-Origin", origin);
        res.setHeader("Vary", "Origin");
        res.setHeader("Access-Control-Allow-Headers", "Content-Type");
        res.setHeader("Access-Control-Allow-Methods", "GET,POST,OPTIONS");
    }
    if (req.method === "OPTIONS") {
        res.sendStatus(204);
        return;
    }
    next();
});
app.get("/health", (_req, res) => res.json({ ok: true, room: "temple", protocolVersion: 2 }));
app.get("/runtime-config.json", (_req, res) => {
    res.setHeader("Cache-Control", "no-store");
    res.json({ serverUrl: process.env.NETWORK_URL || "auto", roomName: "temple", protocolVersion: 2 });
});
app.get("/scene.json", (_req, res) => res.sendFile(scenePath));
app.get("/api/scene", (_req, res) => res.json(scene));
const staticDir = path.resolve(serverRoot, process.env.STATIC_DIR || "../web");
app.use(express.static(staticDir, { index: "index.html", maxAge: 0, setHeaders(res, filePath) {
        if (filePath.endsWith("index.html") || filePath.endsWith("runtime-config.json"))
            res.setHeader("Cache-Control", "no-store");
    } }));
const httpServer = createServer(app);
const gameServer = new Server({
    transport: new WebSocketTransport({ server: httpServer, maxPayload: 16 * 1024, pingInterval: 5000, pingMaxRetries: 3 }),
    greet: false,
    gracefullyShutdown: false,
});
gameServer.define("temple", TempleRoom);
const port = Number(process.env.PORT || 2567);
if (!Number.isInteger(port) || port < 1 || port > 65535)
    throw new Error("PORT must be an integer from 1 to 65535");
await gameServer.listen(port, "0.0.0.0");
await matchMaker.createRoom("temple", {});
console.log(`TEMPLE_DEMO_READY http://localhost:${port} (static: ${staticDir})`);
let stopping = false;
async function shutdown() {
    if (stopping)
        return;
    stopping = true;
    await gameServer.gracefullyShutdown(false);
    process.exit(0);
}
process.on("SIGINT", () => { void shutdown(); });
process.on("SIGTERM", () => { void shutdown(); });
//# sourceMappingURL=index.js.map