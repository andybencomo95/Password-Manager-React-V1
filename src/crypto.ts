// Web Crypto security core — replaces crypto-js.
// PBKDF2-HMAC-SHA256 (600k) key derivation + AES-256-GCM encrypt/decrypt,
// a dual verifier to distinguish wrong password from corruption, and a
// module-scoped session key reused across saves (no re-derivation per save).

export interface Entry {
  id: string
  site: string
  username: string
  password: string
}

interface KdfParams {
  name: 'PBKDF2'
  salt: string // base64url, 16B
  iterations: number
  hash: 'SHA-256'
}

interface CipherParams {
  name: 'AES-GCM'
  iv: string // base64url, 12B
}

interface Verifier {
  salt: string // base64url, 16B
  value: string // base64url, 32B (256-bit derivation)
}

export interface VaultBlobV2 {
  version: 2
  kdf: KdfParams
  cipher: CipherParams
  verifier: Verifier
  ciphertext: string
}

export type UnlockOk = { ok: true; entries: Entry[] }
export type UnlockFail = { ok: false; reason: 'WRONG_PASSWORD' | 'CORRUPT_VAULT' }
export type UnlockResult = UnlockOk | UnlockFail

export const KDF_ITERATIONS = 600_000
export const SALT_LEN = 16
export const IV_LEN = 12

// --- low-level primitives (pure-ish; what tests exercise) ---

export function randomBytes(n: number): Uint8Array {
  const b = new Uint8Array(n)
  crypto.getRandomValues(b)
  return b
}

export function b64urlEncode(b: Uint8Array): string {
  let bin = ''
  const CHUNK = 0x8000
  for (let i = 0; i < b.length; i += CHUNK) {
    bin += String.fromCharCode(...b.subarray(i, i + CHUNK))
  }
  return btoa(bin)
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '')
}

export function b64urlDecode(s: string): Uint8Array {
  const b64 = s.replace(/-/g, '+').replace(/_/g, '/')
  const pad = b64.length % 4 === 0 ? '' : '='.repeat(4 - (b64.length % 4))
  const bin = atob(b64 + pad)
  const out = new Uint8Array(bin.length)
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i)
  return out
}

// Constant-time XOR compare (length guard first, then accumulate diff).
export function safeEqual(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length) return false
  let diff = 0
  for (let i = 0; i < a.length; i++) diff |= a[i] ^ b[i]
  return diff === 0
}

// PBKDF2-HMAC-SHA256 at 600k iterations -> AES-256-GCM key, non-extractable.
export async function deriveKey(password: string, salt: Uint8Array): Promise<CryptoKey> {
  const keyMaterial = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(password),
    'PBKDF2',
    false,
    ['deriveKey']
  )
  return crypto.subtle.deriveKey(
    { name: 'PBKDF2', salt: salt as BufferSource, iterations: KDF_ITERATIONS, hash: 'SHA-256' },
    keyMaterial,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt']
  )
}

// PBKDF2 at 600k iterations -> 256-bit raw verifier bytes.
export async function deriveVerifier(password: string, salt: Uint8Array): Promise<Uint8Array> {
  const keyMaterial = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(password),
    'PBKDF2',
    false,
    ['deriveBits']
  )
  const bits = await crypto.subtle.deriveBits(
    { name: 'PBKDF2', salt: salt as BufferSource, iterations: KDF_ITERATIONS, hash: 'SHA-256' },
    keyMaterial,
    256
  )
  return new Uint8Array(bits)
}

export async function encryptPlain(key: CryptoKey, plaintext: string, iv: Uint8Array): Promise<Uint8Array> {
  const ct = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv: iv as BufferSource },
    key,
    new TextEncoder().encode(plaintext)
  )
  return new Uint8Array(ct)
}

// Throws on GCM authentication failure / invalid data.
export async function decryptPlain(key: CryptoKey, data: Uint8Array, iv: Uint8Array): Promise<string> {
  const pt = await crypto.subtle.decrypt(
    { name: 'AES-GCM', iv: iv as BufferSource },
    key,
    data as BufferSource
  )
  return new TextDecoder().decode(pt)
}

// --- session-key reuse (avoid re-deriving 600k PBKDF2 on every save) ---

let sessionKey: CryptoKey | null = null
let sessionKdfSalt: string | null = null
let sessionVerifier: Verifier | null = null

export function getSessionKey(): CryptoKey | null {
  return sessionKey
}

export function getSessionSalt(): string | null {
  return sessionKdfSalt
}

// Wipe key + blob refs; call on Lock / Clear.
export function resetSession(): void {
  sessionKey = null
  sessionKdfSalt = null
  sessionVerifier = null
}

// --- public crypto surface ---

export function isVaultBlobV2(data: string): boolean {
  if (typeof data !== 'string') return false
  let parsed: unknown
  try {
    parsed = JSON.parse(data)
  } catch {
    return false
  }
  if (!parsed || typeof parsed !== 'object') return false
  const p = parsed as Record<string, unknown>
  const k = p.kdf as Record<string, unknown> | undefined
  const c = p.cipher as Record<string, unknown> | undefined
  const v = p.verifier as Record<string, unknown> | undefined
  if (p.version !== 2 || typeof p.ciphertext !== 'string') return false
  if (!k || !c || !v) return false
  return (
    k.name === 'PBKDF2' && k.hash === 'SHA-256' &&
    typeof k.salt === 'string' && typeof k.iterations === 'number' &&
    c.name === 'AES-GCM' && typeof c.iv === 'string' &&
    typeof v.salt === 'string' && typeof v.value === 'string'
  )
}

// Legacy crypto-js blobs start with the OpenSSL "Salted__" marker.
export function detectLegacy(data: string): boolean {
  return !isVaultBlobV2(data) && /^U2FsdGVkX1/.test(data)
}

export async function createVault(masterPassword: string, entries: Entry[]): Promise<VaultBlobV2> {
  const salt = randomBytes(SALT_LEN)
  const key = await deriveKey(masterPassword, salt)
  const verifierSalt = randomBytes(SALT_LEN)
  const verifierVal = await deriveVerifier(masterPassword, verifierSalt)
  const iv = randomBytes(IV_LEN)
  const ciphertext = await encryptPlain(key, JSON.stringify(entries), iv)

  const kdfSalt = b64urlEncode(salt)
  const verifier: Verifier = { salt: b64urlEncode(verifierSalt), value: b64urlEncode(verifierVal) }
  sessionKey = key
  sessionKdfSalt = kdfSalt
  sessionVerifier = verifier

  return {
    version: 2,
    kdf: { name: 'PBKDF2', salt: kdfSalt, iterations: KDF_ITERATIONS, hash: 'SHA-256' },
    cipher: { name: 'AES-GCM', iv: b64urlEncode(iv) },
    verifier,
    ciphertext: b64urlEncode(ciphertext),
  }
}

export async function unlockVault(blob: VaultBlobV2, masterPassword: string): Promise<UnlockResult> {
  // Verifier checked BEFORE any decrypt attempt -> distinguishes wrong password.
  const verifierVal = await deriveVerifier(masterPassword, b64urlDecode(blob.verifier.salt))
  if (!safeEqual(verifierVal, b64urlDecode(blob.verifier.value))) {
    return { ok: false, reason: 'WRONG_PASSWORD' }
  }

  const key = await deriveKey(masterPassword, b64urlDecode(blob.kdf.salt))
  try {
    const plaintext = await decryptPlain(key, b64urlDecode(blob.ciphertext), b64urlDecode(blob.cipher.iv))
    const entries = JSON.parse(plaintext) as Entry[]
    sessionKey = key
    sessionKdfSalt = blob.kdf.salt
    sessionVerifier = blob.verifier
    return { ok: true, entries }
  } catch {
    return { ok: false, reason: 'CORRUPT_VAULT' }
  }
}

// Save while unlocked: reuse the session key + KDF salt + verifier (only a new
// IV + ciphertext are produced). masterPassword is the fallback used only on a
// full re-derivation (first save / salt mismatch), which App never hits while
// unlocked — since lock-wipe clears the session and requires a fresh unlock.
export async function saveVault(
  masterPassword: string,
  entries: Entry[],
  existingSalt?: string
): Promise<VaultBlobV2> {
  const reuse = getSessionKey() !== null && existingSalt !== undefined && existingSalt === sessionKdfSalt
  const iv = randomBytes(IV_LEN)

  if (reuse && sessionVerifier !== null) {
    const ciphertext = await encryptPlain(getSessionKey()!, JSON.stringify(entries), iv)
    return {
      version: 2,
      kdf: { name: 'PBKDF2', salt: existingSalt!, iterations: KDF_ITERATIONS, hash: 'SHA-256' },
      cipher: { name: 'AES-GCM', iv: b64urlEncode(iv) },
      verifier: sessionVerifier,
      ciphertext: b64urlEncode(ciphertext),
    }
  }

  const saltBytes = existingSalt ? b64urlDecode(existingSalt) : randomBytes(SALT_LEN)
  const kdfSalt = b64urlEncode(saltBytes)
  const key = await deriveKey(masterPassword, saltBytes)
  const verifierSalt = randomBytes(SALT_LEN)
  const verifierVal = await deriveVerifier(masterPassword, verifierSalt)
  const verifier: Verifier = { salt: b64urlEncode(verifierSalt), value: b64urlEncode(verifierVal) }
  const ciphertext = await encryptPlain(key, JSON.stringify(entries), iv)

  sessionKey = key
  sessionKdfSalt = kdfSalt
  sessionVerifier = verifier

  return {
    version: 2,
    kdf: { name: 'PBKDF2', salt: kdfSalt, iterations: KDF_ITERATIONS, hash: 'SHA-256' },
    cipher: { name: 'AES-GCM', iv: b64urlEncode(iv) },
    verifier,
    ciphertext: b64urlEncode(ciphertext),
  }
}