// src/crypto.test.ts — Web Crypto core behavior tests.
// Runs at production PBKDF2 settings (600k iterations, Node webcrypto is
// OpenSSL-backed so a full derive is ~140ms — no iteration lowering needed).

import {
  randomBytes,
  b64urlEncode,
  b64urlDecode,
  safeEqual,
  deriveKey,
  encryptPlain,
  decryptPlain,
  createVault,
  unlockVault,
  saveVault,
  isVaultBlobV2,
  detectLegacy,
  resetSession,
  getSessionKey,
  getSessionSalt,
} from './crypto'
import type { Entry } from './crypto'

const PW = 'Str0ng!Pass'
const E1: Entry = { id: 'e1', site: 'github.com', username: 'octocat', password: 'hunter2' }
const E2: Entry = { id: 'e2', site: 'example.com', username: 'bob', password: 'pw-2!' }

beforeEach(() => resetSession())

describe('b64url / safeEqual primitives', () => {
  it('round-trips arbitrary bytes URL-safe and unpadded', () => {
    const bytes = new Uint8Array([0, 255, 128, 42, 97, 1, 200])
    const s = b64urlEncode(bytes)
    expect(s).not.toContain('+')
    expect(s).not.toContain('/')
    expect(s).not.toContain('=')
    expect([...b64urlDecode(s)]).toEqual([...bytes])
  })

  it('safeEqual is true only for identical bytes and length-guards first', () => {
    expect(safeEqual(new Uint8Array([1, 2, 3]), new Uint8Array([1, 2, 3]))).toBe(true)
    expect(safeEqual(new Uint8Array([1, 2, 3]), new Uint8Array([1, 2, 4]))).toBe(false)
    expect(safeEqual(new Uint8Array([1, 2]), new Uint8Array([1, 2, 3]))).toBe(false)
  })
})

describe('blob v2 / legacy detection', () => {
  it('detects legacy crypto-js blobs by the Salted__ base64 marker', () => {
    expect(detectLegacy('U2FsdGVkX1/Qk1rHwP...')).toBe(true)
    expect(detectLegacy('plain garbage')).toBe(false)
  })

  it('isVaultBlobV2 accepts well-formed v2 blobs and rejects everything else', async () => {
    const blob = await createVault(PW, [])
    expect(isVaultBlobV2(JSON.stringify(blob))).toBe(true)
    expect(detectLegacy(JSON.stringify(blob))).toBe(false)
    expect(isVaultBlobV2('garbage')).toBe(false)
    expect(isVaultBlobV2(JSON.stringify({ ...blob, version: 1 }))).toBe(false)
    expect(isVaultBlobV2(JSON.stringify({ version: 2, ciphertext: 'x' }))).toBe(false)
  })
})

describe('vault round-trip', () => {
  it('create → unlock returns exactly the stored entries', async () => {
    const entries = [E1, E2]
    const blob = await createVault(PW, entries)
    const res = await unlockVault(blob, PW)
    expect(res.ok).toBe(true)
    if (res.ok) expect(res.entries).toEqual(entries)
  })

  it('returns WRONG_PASSWORD for an incorrect master password', async () => {
    const blob = await createVault(PW, [E1])
    const res = await unlockVault(blob, 'WrongPass!1')
    expect(res).toEqual({ ok: false, reason: 'WRONG_PASSWORD' })
  })

  it('returns CORRUPT_VAULT for tampered ciphertext (GCM auth failure)', async () => {
    const blob = await createVault(PW, [E1])
    const flipped = blob.ciphertext.startsWith('A') ? 'B' : 'A'
    const tampered = { ...blob, ciphertext: flipped + blob.ciphertext.slice(1) }
    const res = await unlockVault(tampered, PW)
    expect(res).toEqual({ ok: false, reason: 'CORRUPT_VAULT' })
  })
})

describe('non-deterministic output', () => {
  it('every createVault yields a fresh salt, IV and verifier salt', async () => {
    const a = await createVault(PW, [E1])
    const b = await createVault(PW, [E1])
    expect(a.kdf.salt).not.toBe(b.kdf.salt)
    expect(a.cipher.iv).not.toBe(b.cipher.iv)
    expect(a.verifier.salt).not.toBe(b.verifier.salt)
    expect(a.ciphertext).not.toBe(b.ciphertext)
  })
})

describe('session key reuse', () => {
  it('saveVault reuses the session key and KDF salt while unlocked', async () => {
    const blob = await createVault(PW, [E1])
    expect(getSessionKey()).not.toBeNull()
    expect(getSessionSalt()).toBe(blob.kdf.salt)

    const saved = await saveVault('', [E1, E2], blob.kdf.salt)
    expect(saved.kdf.salt).toBe(blob.kdf.salt) // same salt — no re-derivation
    expect(saved.verifier).toEqual(blob.verifier) // same verifier
    expect(saved.cipher.iv).not.toBe(blob.cipher.iv) // fresh IV per save
    expect(saved.ciphertext).not.toBe(blob.ciphertext) // re-encrypted

    const res = await unlockVault(saved, PW)
    expect(res.ok).toBe(true)
    if (res.ok) expect(res.entries).toEqual([E1, E2])
  })

  it('fully re-derives when the supplied salt differs from the session salt', async () => {
    const blob = await createVault(PW, [E1])
    const otherSalt = b64urlEncode(randomBytes(16))
    const saved = await saveVault(PW, [E2], otherSalt)
    expect(saved.kdf.salt).toBe(otherSalt)
    expect(saved.verifier).not.toEqual(blob.verifier)

    const res = await unlockVault(saved, PW)
    expect(res.ok).toBe(true)
    if (res.ok) expect(res.entries).toEqual([E2])
  })

  it('resetSession wipes the key, salt and verifier references', async () => {
    await createVault(PW, [E1])
    expect(getSessionKey()).not.toBeNull()
    expect(getSessionSalt()).not.toBeNull()
    resetSession()
    expect(getSessionKey()).toBeNull()
    expect(getSessionSalt()).toBeNull()
  })
})

describe('key derivation', () => {
  it('derives a non-extractable AES-GCM key (exportKey rejects)', async () => {
    const key = await deriveKey(PW, new Uint8Array(16).fill(7))
    expect(key.extractable).toBe(false)
    await expect(crypto.subtle.exportKey('raw', key)).rejects.toThrow()
  })

  it('encryptPlain/decryptPlain round-trip through AES-GCM', async () => {
    const key = await deriveKey(PW, new Uint8Array(16).fill(7))
    const iv = new Uint8Array(12).fill(1)
    const ct = await encryptPlain(key, 'hello vault', iv)
    expect(await decryptPlain(key, ct, iv)).toBe('hello vault')
  })
})
