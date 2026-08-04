// src/test/setup.ts — vitest global setup (runs once per test file).
// - jest-dom matchers (module augmentation also type-checks the matchers)
// - fake-indexeddb/auto installs an in-memory IndexedDB on globalThis
// - Node Web Crypto shim: jsdom's crypto has no `subtle`, so when it is
//   missing we swap in node:crypto's webcrypto (PBKDF2/AES-GCM/randomUUID,
//   OpenSSL-backed). Node >= 20 required.

import '@testing-library/jest-dom/vitest'
import 'fake-indexeddb/auto'
import { webcrypto } from 'node:crypto'

if (!globalThis.crypto?.subtle) {
  globalThis.crypto = webcrypto as unknown as Crypto
}
