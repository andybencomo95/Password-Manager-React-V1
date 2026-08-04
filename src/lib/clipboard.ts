// src/lib/clipboard.ts
// Copy with a graceful fallback chain and a best-effort no-clobber auto-clear.
//
// writeClipboard prefers the async Clipboard API; if it is unavailable (e.g. an
// insecure/non-localhost context) or throws, it falls back to the legacy
// document.execCommand('copy') path. Nothing is swallowed here — if both fail
// the caller receives a real error to render inline.

const AUTO_CLEAR_MS = 25_000

let lastWritten: string | null = null
let clearTimer: number | null = null

async function tryClipboardApi(text: string): Promise<boolean> {
  if (typeof navigator.clipboard?.writeText !== 'function') return false
  try {
    await navigator.clipboard.writeText(text)
    return true
  } catch {
    return false
  }
}

async function execCommandCopy(text: string): Promise<void> {
  const ta = document.createElement('textarea')
  ta.value = text
  ta.setAttribute('readonly', '')
  ta.style.position = 'fixed'
  ta.style.opacity = '0'
  document.body.appendChild(ta)
  ta.select()
  ta.setSelectionRange(0, text.length)
  let ok = false
  try {
    ok = document.execCommand('copy')
  } finally {
    document.body.removeChild(ta)
  }
  if (!ok) throw new Error('clipboard-unavailable')
}

// Best-effort clear: only wipe if we can still confirm the clipboard holds our
// content. If the user copied something else meanwhile (or we cannot read the
// clipboard to verify), skip clearing to avoid destroying their newer copy.
async function copyGuard(): Promise<void> {
  clearTimer = null
  const expected = lastWritten
  if (expected === null) return
  if (typeof navigator.clipboard?.readText !== 'function') return
  let current: string
  try {
    current = await navigator.clipboard.readText()
  } catch {
    return
  }
  if (current !== expected) return
  lastWritten = null
  try {
    await navigator.clipboard.writeText('')
  } catch {
    /* best-effort; auto-clear failure is not surfaced to the user */
  }
}

export async function writeClipboard(text: string): Promise<void> {
  const ok = await tryClipboardApi(text)
  if (!ok) await execCommandCopy(text)
  lastWritten = text
  if (clearTimer !== null) window.clearTimeout(clearTimer)
  clearTimer = window.setTimeout(copyGuard, AUTO_CLEAR_MS)
}