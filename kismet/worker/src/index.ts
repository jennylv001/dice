import { handleApi } from "./router.js";
import { RoomDO } from "./do_room.js";
import type { Env } from "./kv.js";

type ExecutionContext = { waitUntil(promise: Promise<any>): void };
type ExportedHandler<TEnv> = { fetch: (req: Request, env: TEnv, ctx: ExecutionContext) => Promise<Response> | Response };

const handler: ExportedHandler<Env> = {
  async fetch(req, env, ctx) {
    const url = new URL(req.url);
    if (url.pathname.startsWith("/api/")) {
      return handleApi(req, env as Env);
    }
    return new Response("Kismet Worker", { status: 200 });
  }
};

export default handler;

export { RoomDO };
