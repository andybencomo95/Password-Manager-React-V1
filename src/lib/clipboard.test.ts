// src/lib/clipboard.test.ts — writeClipboard fallback chain and the 25s
// no-clobber auto-clear guard, driven with stubbed navigator.clipboard and
// fake timers (jsdom ships no Clipboard API implementation).

import { writeClipboard } from './clipboard'

interface ClipboardStub {
  writeText?: (text: string) => Promise<void>
  readText?: () => Promise<string>
}

function stubNavigator(clipboard?: ClipboardStub) {
  const nav = clipboard ? { ...navigator, clipboard } : { ...navigator }
  vi.stubGlobal('navigator', nav)
}

// jsdom does not implement execCommand; install a controllable stand-in.
function stubExecCommand(result: boolean) {
  document.execCommand = () => result
}

afterEach(() => {
  vi.useRealTimers()
  vi.unstubAllGlobals()
  document.execCommand = () => false // restore jsdom default (not implemented)
})

describe('writeClipboard', () => {
  it('writes via the async Clipboard API when available', async () => {
    const writeText = vi.fn(async (_t: string) => {})
    stubNavigator({ writeText, readText: async () => '' })
    await writeClipboard('hunter2')
    expect(writeText).toHaveBeenCalledWith('hunter2')
  })

  it('falls back to execCommand when the Clipboard API is missing', async () => {
    stubNavigator() // no clipboard at all (insecure/non-localhost context)
    const exec = vi.fn(() => true)
    document.execCommand = exec
    await writeClipboard('hunter2')
    expect(exec).toHaveBeenCalledWith('copy')
  })

  it('falls back to execCommand when the Clipboard API rejects', async () => {
    const writeText = vi.fn(async () => { throw new Error('permission denied') })
    stubNavigator({ writeText })
    const exec = vi.fn(() => true)
    document.execCommand = exec
    await writeClipboard('hunter2')
    expect(exec).toHaveBeenCalledWith('copy')
  })

  it('throws a real error when both the Clipboard API and execCommand fail', async () => {
    stubNavigator()
    stubExecCommand(false)
    await expect(writeClipboard('hunter2')).rejects.toThrow('clipboard-unavailable')
  })

  it('clears the clipboard ~25s later when the content is unchanged', async () => {
    vi.useFakeTimers()
    const writeText = vi.fn(async (_t: string) => {})
    const readText = vi.fn(async () => 'hunter2')
    stubNavigator({ writeText, readText })
    await writeClipboard('hunter2')
    await vi.advanceTimersByTimeAsync(25_000)
    expect(readText).toHaveBeenCalled()
    expect(writeText).toHaveBeenLastCalledWith('')
  })

  it('does not clobber a newer clipboard copy (no-clobber guard)', async () => {
    vi.useFakeTimers()
    const writeText = vi.fn(async (_t: string) => {})
    const readText = vi.fn(async () => 'newer-copy')
    stubNavigator({ writeText, readText })
    await writeClipboard('hunter2')
    await vi.advanceTimersByTimeAsync(25_000)
    expect(writeText).toHaveBeenLastCalledWith('hunter2') // never cleared
    expect(writeText).not.toHaveBeenCalledWith('')
  })

  it('skips clearing when the clipboard cannot be read', async () => {
    vi.useFakeTimers()
    const writeText = vi.fn(async (_t: string) => {})
    const readText = vi.fn(async () => { throw new Error('denied') })
    stubNavigator({ writeText, readText })
    await writeClipboard('hunter2')
    await vi.advanceTimersByTimeAsync(25_000)
    expect(writeText).not.toHaveBeenCalledWith('')
  })

  it('skips clearing when readText is unavailable', async () => {
    vi.useFakeTimers()
    const writeText = vi.fn(async (_t: string) => {})
    stubNavigator({ writeText }) // no readText in this context
    await writeClipboard('hunter2')
    await vi.advanceTimersByTimeAsync(25_000)
    expect(writeText).not.toHaveBeenCalledWith('')
  })
})
