// src/lib/i18n.test.ts — bilingual dict lockstep: en and es must expose the
// same key set (compile-time via the Txt type; runtime check here) and tr()
// must return the typed dict for the active locale.

import { TXT, LOCALES, tr } from './i18n'

// Collect every leaf key path (e.g. "reqLabels.len") so nested dicts like
// reqLabels are compared too, independent of insertion order.
function leafKeys(obj: Record<string, unknown>, prefix = ''): string[] {
  return Object.keys(obj).flatMap((k) => {
    const v = obj[k]
    const path = prefix ? `${prefix}.${k}` : k
    if (v !== null && typeof v === 'object' && !Array.isArray(v)) {
      return leafKeys(v as Record<string, unknown>, path)
    }
    return [path]
  })
}

describe('i18n', () => {
  it('en and es expose identical key sets (lockstep overlay)', () => {
    expect(leafKeys(TXT.en).sort()).toEqual(leafKeys(TXT.es).sort())
  })

  it('both locales provide the same nested requirement labels', () => {
    expect(leafKeys(TXT.en.reqLabels).sort()).toEqual(leafKeys(TXT.es.reqLabels).sort())
  })

  it('tr returns the typed dict for the active locale', () => {
    expect(tr('en')).toBe(TXT.en)
    expect(tr('es')).toBe(TXT.es)
  })

  it('es is a real translation, not a copy of en', () => {
    expect(TXT.es.title).toBe('Gestor de Contraseñas')
    expect(TXT.es.wrongPassword).toBe('Contraseña maestra incorrecta')
    expect(TXT.en.wrongPassword).not.toBe(TXT.es.wrongPassword)
  })

  it('LOCALES lists exactly the supported languages', () => {
    expect(LOCALES).toEqual(['en', 'es'])
  })

  it('en exposes the full set of UI strings consumed by the app', () => {
    const keys = [
      'title', 'lock', 'clearAll', 'createMaster', 'masterLabel', 'confirmLabel',
      'setMaster', 'vaultLocked', 'enterMaster', 'unlock', 'addNew', 'website',
      'username', 'password', 'add', 'reset', 'wrongPassword', 'corruptVault',
      'storageError', 'clipboardError', 'copied', 'confirmDelete',
    ] as const
    for (const key of keys) {
      expect(typeof TXT.en[key]).toBe('string')
    }
  })
})
