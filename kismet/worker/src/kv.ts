type KVNamespace = {
  put(key: string, value: string, options?: { expirationTtl?: number }): Promise<void>;
  get(key: string): Promise<string | null>;
  delete?(key: string): Promise<void>;
  list?<T = unknown>(options?: { prefix?: string }): Promise<{ keys: Array<{ name: string; expiration?: number }>; cursor?: string }>;
  getWithMetadata?<T = unknown>(key: string): Promise<{ value: string | null; metadata: T | null }>;
};
type DurableObjectId = unknown;
type DurableObjectStub = { fetch(request: Request): Promise<Response> };
type DurableObjectNamespace = { idFromName(name: string): DurableObjectId; get(id: DurableObjectId): DurableObjectStub };
export type Env = {
  KISMET_KV: KVNamespace;
  ROOM_DO: DurableObjectNamespace;
  PROTOCOL_VERSION: string;
  STRICT_MODE?: string;
};
export async function kvPutTTL(kv: KVNamespace, key: string, value: any, ttlSec = 600) {
  await kv.put(key, JSON.stringify(value), { expirationTtl: ttlSec });
}
export async function kvGet<T>(kv: KVNamespace, key: string): Promise<T | null> {
  const v = await kv.get(key); return v ? JSON.parse(v) as T : null;
}
export async function kvIncr(kv: KVNamespace, key: string, by = 1) {
  const cur = Number((await kv.get(key)) || "0"); await kv.put(key, String(cur + by));
}
