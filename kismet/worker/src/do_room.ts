import type { Env } from "./kv.js";
import type { RPv1, RoundHistory, PlayerState, RoomStatePayload, GamePhase, RoomStage, PlayerRole } from "./types.js";
import type { AuditFrame, WSFromClient, WSFromServer } from "../../shared/src/types.js";

type DurableObjectStorage = {
  get<T>(key: string): Promise<T | undefined>;
  put<T>(key: string, value: T): Promise<void>;
  delete(key: string): Promise<void>;
};

type DurableObjectState = {
  waitUntil(promise: Promise<any>): void;
  storage: DurableObjectStorage;
  blockConcurrencyWhile<T>(closure: () => Promise<T>): Promise<T>;
};

declare const WebSocketPair: { new (): { 0: WebSocket; 1: WebSocket } };

type Client = { ws: WebSocket };

type PlayerRecord = {
  id: string;
  name: string;
  role: PlayerRole;
  token: string;
  spectator: boolean;
  phase: GamePhase;
  streak: number;
  xp: number;
  diceReady: boolean;
  connected: boolean;
  lastSeen: number;
};

type RoomData = {
  roomId: string;
  createdAt: number;
  stage: RoomStage;
  hostId: string | null;
  challengerId: string | null;
  order: string[];
  currentIdx: number;
  roundHistory: RoundHistory[];
  turnStartTime: number | null;
  globalPhase: GamePhase;
};

type PersistedState = {
  data: RoomData;
  players: Record<string, Omit<PlayerRecord, "connected" | "lastSeen">>;
};

const STORAGE_KEY = "room";

export class RoomDO {
  state: DurableObjectState;
  env: Env;
  clients: Map<string, Client>;
  players: Map<string, PlayerRecord>;
  data: RoomData;

  constructor(state: DurableObjectState, env: Env) {
    this.state = state;
    this.env = env;
    this.clients = new Map();
    this.players = new Map();
    this.data = {
      roomId: "",
      createdAt: Date.now(),
      stage: "AWAITING_OPPONENT" as RoomStage,
      hostId: null,
      challengerId: null,
      order: [],
      currentIdx: 0,
      roundHistory: [],
      turnStartTime: null,
      globalPhase: "LOBBY" as GamePhase
    };

    state.blockConcurrencyWhile(async () => {
      const stored = await state.storage.get<PersistedState>(STORAGE_KEY);
      if (!stored) return;
      this.data = stored.data;
      for (const [id, player] of Object.entries(stored.players)) {
        this.players.set(id, {
          ...player,
          id,
          connected: false,
          lastSeen: Date.now()
        });
      }
    });
  }

  async fetch(req: Request) {
    const url = new URL(req.url);

    if (url.pathname.endsWith("/do/create") && req.method === "POST") return this.handleCreate(req);
    if (url.pathname.endsWith("/do/join") && req.method === "POST") return this.handleJoin(req);
    if (url.pathname.endsWith("/do/state") && req.method === "GET") return this.handleState();
    if (url.pathname.endsWith("/do/leave") && req.method === "POST") return this.handleLeave(req);
    if (url.pathname.endsWith("/do/auth") && req.method === "POST") return this.handleAuth(req);
    if (url.pathname.endsWith("/do/thumb") && req.method === "POST") return this.handleThumb(req);
    if (url.pathname.endsWith("/do/submit") && req.method === "POST") return this.handleSubmit(req);

    if (req.headers.get("Upgrade") === "websocket") {
      const pair = new WebSocketPair();
      const [client, server] = Object.values(pair);
      this.handleSocket(server, url);
      return new Response(null, { status: 101, webSocket: client } as any);
    }

    return new Response("not found", { status: 404 });
  }

  private async handleCreate(req: Request): Promise<Response> {
    const { roomId, hostName } = (await req.json()) as { roomId: string; hostName?: string };
    const now = Date.now();
    const playerId = `host-${crypto.randomUUID().slice(0, 8)}`;
    const token = randomToken();
    const name = sanitizeName(hostName || "Host");

    this.data = {
      roomId,
      createdAt: now,
      stage: "AWAITING_OPPONENT" as RoomStage,
      hostId: playerId,
      challengerId: null,
      order: [playerId],
      currentIdx: 0,
      roundHistory: [],
      turnStartTime: null,
      globalPhase: "JOINING" as GamePhase
    };
    this.players.clear();
    this.clients.clear();

    this.players.set(playerId, {
      id: playerId,
      name,
      role: "host",
      token,
      spectator: false,
      phase: "JOINING" as GamePhase,
      streak: 0,
      xp: 0,
      diceReady: false,
      connected: false,
      lastSeen: now
    });

    await this.persist();
    return jsonResponse({ playerId, token, playerName: name, room: this.buildRoomState() });
  }

  private async handleJoin(req: Request): Promise<Response> {
    if (!this.data.hostId) return jsonResponse({ error: "room_not_initialized" }, 400);
    const body = (await req.json()) as { name: string; role?: PlayerRole };
    const role: PlayerRole = body.role === "spectator" ? "spectator" : "challenger";
    if (role === "challenger" && this.data.challengerId && this.players.has(this.data.challengerId)) {
      return jsonResponse({ error: "room_full" }, 409);
    }

    const playerId = `${role}-${crypto.randomUUID().slice(0, 8)}`;
    const token = randomToken();
    const name = sanitizeName(body.name);
    const now = Date.now();

    this.players.set(playerId, {
      id: playerId,
      name,
      role,
      token,
      spectator: role === "spectator",
      phase: "JOINING" as GamePhase,
      streak: 0,
      xp: 0,
      diceReady: false,
      connected: false,
      lastSeen: now
    });

    if (role === "challenger") {
      this.data.challengerId = playerId;
      if (!this.data.order.includes(playerId)) this.data.order.push(playerId);
      this.data.stage = "AWAITING_DICE" as RoomStage;
    }

    await this.persist();
    return jsonResponse({ playerId, token, playerName: name, room: this.buildRoomState() });
  }

  private async handleState(): Promise<Response> {
    return jsonResponse({ room: this.buildRoomState() });
  }

  private async handleLeave(req: Request): Promise<Response> {
    const { playerId } = (await req.json()) as { playerId: string };
    const player = playerId ? this.players.get(playerId) : undefined;
    if (!player) return jsonResponse({ ok: true });

    this.players.delete(playerId);
    this.clients.delete(playerId);
    this.data.order = this.data.order.filter(id => id !== playerId);
    if (player.role === "host") {
      this.data.hostId = null;
      this.data.stage = "AWAITING_OPPONENT" as RoomStage;
    } else if (player.role === "challenger") {
      this.data.challengerId = null;
      this.data.stage = "AWAITING_OPPONENT" as RoomStage;
    }
    await this.persist();
    this.broadcastState();
    return jsonResponse({ ok: true });
  }

  private async handleAuth(req: Request): Promise<Response> {
    const { playerId, token } = (await req.json()) as { playerId: string; token: string };
    const player = this.players.get(playerId);
    if (!player || player.token !== token) return jsonResponse({ ok: false }, 403);
    return jsonResponse({ ok: true, role: player.role });
  }

  private async handleThumb(req: Request): Promise<Response> {
    const { userId, thumb } = (await req.json()) as { userId: string; thumb: AuditFrame };
    const player = this.players.get(userId);
    if (player) player.phase = "SEALING" as GamePhase;
    this.broadcastPhase("SEALING" as GamePhase, userId);
    this.broadcastExcept(userId, JSON.stringify({ t: "opp_thumb", p: thumb } as WSFromServer));
    this.broadcastState();
    await this.persist();
    return jsonResponse({ ok: true });
  }

  private async handleSubmit(req: Request): Promise<Response> {
    const { userId, rp } = (await req.json()) as { userId: string; rp: RPv1 };
    const player = this.players.get(userId);
    if (player) {
      player.phase = "SEALED" as GamePhase;
      const score = rp.integrity_scores.overall;
      const bonusXp = Math.round(10 + score * 20 + (player.streak > 0 ? player.streak * 5 : 0));
      player.xp += bonusXp;
      if (score >= 0.8) player.streak++; else player.streak = 0;
      this.data.roundHistory.push({ round_id: rp.round_id, userId, dice: rp.dice_values, score, timestamp: rp.timestamp_server });
      if (this.data.roundHistory.length > 50) this.data.roundHistory = this.data.roundHistory.slice(-50);
    }
    this.broadcastExcept(userId, JSON.stringify({ t: "opp_result", p: rp } as WSFromServer));
    this.broadcastPhase("SEALED" as GamePhase, userId);
    this.advanceTurn();
    await this.persist();
    return jsonResponse({ ok: true });
  }

  private handleSocket(ws: WebSocket, url: URL) {
    (ws as any).accept();
    const playerId = url.searchParams.get("playerId");
    const token = url.searchParams.get("token");
    if (!playerId || !token) {
      ws.close(4001, "missing_credentials");
      return;
    }
    const player = this.players.get(playerId);
    if (!player || player.token !== token) {
      ws.close(4003, "unauthorized");
      return;
    }

    this.clients.set(playerId, { ws });
    player.connected = true;
    player.lastSeen = Date.now();
    if (!player.diceReady) player.phase = "VERIFYING" as GamePhase;

    const send = (m: WSFromServer) => ws.send(JSON.stringify(m));
    // Initial joined for this socket
    send({ t: "joined", p: { roomId: this.data.roomId, you: playerId, opp: this.getOpponentId(playerId), spectator: player.spectator } });
    // If both participants (host + challenger) are now present, ensure each has opp populated.
    if (this.data.hostId && this.data.challengerId) {
      const hostClient = this.clients.get(this.data.hostId);
      const challClient = this.clients.get(this.data.challengerId);
      if (hostClient) hostClient.ws.send(JSON.stringify({ t: "joined", p: { roomId: this.data.roomId, you: this.data.hostId, opp: this.data.challengerId, spectator: false } }));
      if (challClient) challClient.ws.send(JSON.stringify({ t: "joined", p: { roomId: this.data.roomId, you: this.data.challengerId, opp: this.data.hostId, spectator: false } }));
    }
    this.broadcastState();

    ws.addEventListener("message", (event) => {
      try {
        const msg = JSON.parse(event.data as string) as WSFromClient;
        this.handleClientMessage(playerId, msg);
      } catch {
        /* ignore malformed */
      }
    });

    ws.addEventListener("close", () => {
      player.connected = false;
      player.diceReady = false;
      player.phase = "WAITING" as GamePhase;
      this.clients.delete(playerId);
      this.broadcastState();
      this.persist().catch(() => {});
    });
  }

  private handleClientMessage(playerId: string, msg: WSFromClient) {
    const player = this.players.get(playerId);
    if (!player) return;

    switch (msg.t) {
      case "join": {
        player.spectator = !!msg.p.spectator;
        player.role = msg.p.role;
        if (!this.data.order.includes(playerId) && !player.spectator) this.data.order.push(playerId);
        player.phase = this.data.stage === "READY" ? "WAITING" as GamePhase : "VERIFYING" as GamePhase;
        this.broadcastState();
        this.persist().catch(() => {});
        break;
      }
      case "rtc_offer": {
        this.broadcastExcept(playerId, JSON.stringify({ t: "rtc_offer", p: { from: playerId, sdp: msg.p.sdp } } as WSFromServer));
        break;
      }
      case "rtc_answer": {
        this.broadcastExcept(playerId, JSON.stringify({ t: "rtc_answer", p: { from: playerId, sdp: msg.p.sdp } } as WSFromServer));
        break;
      }
      case "rtc_ice": {
        this.broadcastExcept(playerId, JSON.stringify({ t: "rtc_ice", p: { from: playerId, candidate: msg.p.candidate } } as WSFromServer));
        break;
      }
      case "dice_status": {
        player.diceReady = !!msg.p.ready;
        player.phase = player.diceReady ? "VERIFYING" as GamePhase : "WAITING" as GamePhase;
        this.checkStageTransitions();
        this.broadcastState();
        this.persist().catch(() => {});
        break;
      }
      case "start_verification": {
        // Only host can initiate pre-game verification start
        if (player.role === "host" && this.data.stage === "AWAITING_OPPONENT") {
          // Require challenger present first
          if (this.data.challengerId) {
            this.data.stage = "AWAITING_DICE" as RoomStage;
            this.data.globalPhase = "VERIFYING" as GamePhase;
            // Update players phases
            for (const p of this.players.values()) {
              if (!p.spectator) p.phase = "VERIFYING" as GamePhase;
            }
            this.broadcastStage();
            this.broadcastState();
            this.persist().catch(() => {});
          } else {
            const client = this.clients.get(playerId);
            client?.ws.send(JSON.stringify({ t: "toast", p: { kind: "warn", text: "Opponent not yet present" } }));
          }
        }
        break;
      }
      case "ready": {
        this.notifyTurn();
        break;
      }
      default:
        break;
    }
  }

  private checkStageTransitions() {
    const host = this.data.hostId ? this.players.get(this.data.hostId) : undefined;
    const challenger = this.data.challengerId ? this.players.get(this.data.challengerId) : undefined;

    if (!host) {
      this.data.stage = "AWAITING_OPPONENT" as RoomStage;
      return;
    }

    if (!challenger) {
      this.data.stage = "AWAITING_OPPONENT" as RoomStage;
      return;
    }

    if (!host.diceReady || !challenger.diceReady) {
      this.data.stage = "AWAITING_DICE" as RoomStage;
      this.data.globalPhase = "VERIFYING" as GamePhase;
      return;
    }

    if (this.data.stage === "AWAITING_DICE" || this.data.stage === "AWAITING_OPPONENT") {
      this.data.stage = "READY" as RoomStage;
      this.data.globalPhase = "TURN_READY" as GamePhase;
      this.notifyTurn();
    }
  }

  private notifyTurn() {
    if (this.data.order.length === 0) return;
    const current = this.data.order[this.data.currentIdx % this.data.order.length];
    const now = Date.now();
    this.data.turnStartTime = now;
    this.data.stage = "IN_PROGRESS" as RoomStage;
    this.data.globalPhase = "TURN_READY" as GamePhase;

    for (const [id, player] of this.players) {
      if (player.spectator) continue;
      if (id === current) {
        player.phase = "TURN_READY" as GamePhase;
        const client = this.clients.get(id);
        if (client) {
          client.ws.send(JSON.stringify({ t: "your_turn", p: { round_id: crypto.randomUUID() } } as WSFromServer));
        }
      } else {
        player.phase = "WAITING" as GamePhase;
      }
    }
    this.broadcastPhase("TURN_READY" as GamePhase, current);
    this.broadcastState();
    this.persist().catch(() => {});
  }

  private advanceTurn() {
    if (this.data.order.length === 0) return;
    this.data.currentIdx = (this.data.currentIdx + 1) % this.data.order.length;
    this.data.stage = "READY" as RoomStage;
    this.data.globalPhase = "SEALED" as GamePhase;
    this.broadcastState();
    this.persist().catch(() => {});
    this.notifyTurn();
  }

  private broadcastExcept(userId: string, msg: string) {
    for (const [uid, client] of this.clients) if (uid !== userId) client.ws.send(msg);
  }

  private broadcastPhase(phase: GamePhase, userId?: string) {
    const msg = JSON.stringify({ t: "phase", p: { phase, userId } } as WSFromServer);
    for (const client of this.clients.values()) client.ws.send(msg);
  }

  private broadcastState() {
    const payload = this.buildRoomState();
    const msg = JSON.stringify({ t: "state", p: payload } as WSFromServer);
    for (const client of this.clients.values()) client.ws.send(msg);
  }

  private broadcastStage() {
    const msg = JSON.stringify({ t: "room_stage", p: { stage: this.data.stage } } as WSFromServer);
    for (const client of this.clients.values()) client.ws.send(msg);
  }

  private buildRoomState(): RoomStatePayload {
    const players: PlayerState[] = Array.from(this.players.values()).map((p) => ({
      userId: p.id,
      name: p.name,
      role: p.role,
      spectator: p.spectator,
      phase: p.phase,
      streak: p.streak,
      xp: p.xp,
      diceReady: p.diceReady,
      connected: p.connected
    }));

    return {
      roomId: this.data.roomId,
      createdAt: this.data.createdAt,
      stage: this.data.stage,
      hostId: this.data.hostId,
      challengerId: this.data.challengerId,
      players,
      order: this.data.order.slice(),
      currentIdx: this.data.currentIdx,
      phase: this.data.globalPhase,
      roundHistory: this.data.roundHistory.slice(-10),
      turnStartTime: this.data.turnStartTime
    };
  }

  private getOpponentId(playerId: string): string | undefined {
    if (!this.data.hostId || !this.data.challengerId) return undefined;
    if (playerId === this.data.hostId) return this.data.challengerId;
    if (playerId === this.data.challengerId) return this.data.hostId;
    return undefined;
  }

  private async persist() {
    const players: PersistedState["players"] = {};
    for (const [id, player] of this.players) {
      const { connected: _connected, lastSeen: _lastSeen, ...rest } = player;
      players[id] = rest;
    }
    const payload: PersistedState = { data: this.data, players };
    await this.state.storage.put(STORAGE_KEY, payload);
  }
}

function sanitizeName(name: string): string {
  const trimmed = name.trim().slice(0, 24);
  return trimmed.length > 0 ? trimmed : "Player";
}

function randomToken(): string {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, b => b.toString(16).padStart(2, "0")).join("");
}

async function jsonResponse(data: unknown, status = 200): Promise<Response> {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "content-type": "application/json" }
  });
}
