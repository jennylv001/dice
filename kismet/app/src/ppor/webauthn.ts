export async function ephemeralSigner() {
  const key = await crypto.subtle.generateKey({ name: "ECDSA", namedCurve: "P-256" }, true, ["sign", "verify"]);
  const publicKeyJwk = await crypto.subtle.exportKey("jwk", key.publicKey);
  return {
    publicKeyJwk,
    sign: async (digest: ArrayBuffer) => new Uint8Array(await crypto.subtle.sign({ name: "ECDSA", hash: "SHA-256" }, key.privateKey, digest) as ArrayBuffer),
    type: "webcrypto" as const
  };
}
