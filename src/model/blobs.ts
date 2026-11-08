// Large data in a plan, for example a background image, a 3D model, or a photo of a note, is a
// data URL. Each revision of a plan has the same images again, so the stores of the revisions
// (the server, and the history of the browser) keep each large value only once: `dehydrate`
// replaces it with a reference to its hash, and `hydrate` puts it back. The plan files and the
// API always have the full data URLs.
//
// The hash is a pure function without the Web Crypto API, because a server in a local network
// without https has no `crypto.subtle` in the browser. Two hashes of 53 bits and the length make a
// collision practically impossible for the few hundred images of a store.

/** The start of a reference to a stored value. */
export const BLOB_PREFIX = "grundriss-blob:";

/** Data URLs at least this long, in characters, go to the store. */
export const BLOB_MIN = 4096;

/** A hash of 53 bits (cyrb53). */
function cyrb53(text: string, seed: number): number {
  let h1 = 0xdeadbeef ^ seed;
  let h2 = 0x41c6ce57 ^ seed;
  for (let i = 0; i < text.length; i++) {
    const c = text.charCodeAt(i);
    h1 = Math.imul(h1 ^ c, 2654435761);
    h2 = Math.imul(h2 ^ c, 1597334677);
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
  return 4294967296 * (2097151 & h2) + (h1 >>> 0);
}

/** The hash of a value: two hashes and the length, as a text for a file name or a key. */
export function blobHash(text: string): string {
  return `${cyrb53(text, 1).toString(36)}-${cyrb53(text, 2).toString(36)}-${text.length.toString(36)}`;
}

const isBlob = (value: string) => value.startsWith("data:") && value.length >= BLOB_MIN;

/**
 * Replaces each large data URL in the JSON of a plan with a reference to its hash. It gives the
 * new JSON and the values of the references, by hash.
 */
export function dehydrate(json: string): { json: string; blobs: Map<string, string> } {
  const blobs = new Map<string, string>();
  // A text that is not JSON has no data URLs to keep apart.
  let parsed: unknown;
  try {
    parsed = JSON.parse(json);
  } catch {
    return { json, blobs };
  }
  const out = JSON.stringify(parsed, (_key, value: unknown) => {
    if (typeof value !== "string" || !isBlob(value)) return value;
    const hash = blobHash(value);
    blobs.set(hash, value);
    return BLOB_PREFIX + hash;
  });
  return { json: out, blobs };
}

/** The hashes of the references in a dehydrated JSON. */
export function blobRefs(json: string): string[] {
  const refs = new Set<string>();
  for (const match of json.matchAll(/"grundriss-blob:([0-9a-z-]+)"/g)) refs.add(match[1]);
  return [...refs];
}

/**
 * Puts the values back into a dehydrated JSON. `get` gives the value of a hash, or undefined if
 * the store does not have it; then the function throws.
 */
export function hydrate(json: string, get: (hash: string) => string | undefined): string {
  if (!json.includes(BLOB_PREFIX)) return json;
  return JSON.stringify(
    JSON.parse(json, (_key, value: unknown) => {
      if (typeof value !== "string" || !value.startsWith(BLOB_PREFIX)) return value;
      const hash = value.slice(BLOB_PREFIX.length);
      const data = get(hash);
      if (data === undefined) throw new Error("A stored image of the version is missing.");
      return data;
    }),
  );
}
