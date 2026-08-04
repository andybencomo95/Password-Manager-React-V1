// src/lib/i18n.ts
// Typed bilingual dictionary. `Txt` is derived from the `en` baseline so the
// `es` overlay is checked against it at compile time — a missing or extra key
// in any locale fails the build (lockstep overlay by construction). `tr(lang)`
// returns the typed dict for the active locale. Zero `any` (TS strict).

const en = {
  title: 'Password Manager',
  lock: 'Lock',
  clearAll: 'Clear all',
  createMaster: 'Create your master password',
  securityHint: 'Passwords are encrypted (PBKDF2 + AES-256-GCM) and stored locally in IndexedDB; the encryption key derives from your master password and is kept in memory only while unlocked.',
  masterLabel: 'Master password',
  confirmLabel: 'Confirm master password',
  setMaster: 'Set master password',
  vaultLocked: 'Vault locked',
  enterMaster: 'Enter master password',
  unlock: 'Unlock',
  lockHint: 'Enter your master password to unlock your encrypted vault.',
  addNew: 'Add a new password',
  website: 'Website or service',
  websitePh: 'e.g., github.com',
  username: 'Username',
  usernamePh: 'john@example.com',
  password: 'Password',
  add: 'Add',
  reset: 'Reset',
  managerHint: 'Changes are saved encrypted locally. Lock clears the key from memory.',
  langTo: 'Español',
  footerText: 'Project created by:',
  legacyNotice: 'A legacy vault was detected. Creating a new vault here will replace it and reset all stored passwords.',
  wrongPassword: 'Incorrect master password',
  corruptVault: 'Vault is corrupted',
  storageError: 'Unable to access local storage',
  busy: 'Unlocking…',
  saving: 'Saving…',
  copied: 'Copied ✓',
  copyPassword: 'Copy password',
  deletePassword: 'Delete password',
  confirmDelete: 'Confirm?',
  confirmClearAll: 'Confirm?',
  clipboardError: 'Unable to copy',
  revealPassword: 'Reveal password',
  hidePassword: 'Hide password',
  reqLabels: {
    len: 'At least 8 characters',
    match: 'Password and confirmation match',
    upper: 'Include an uppercase letter',
    lower: 'Include a lowercase letter',
    digit: 'Include a number',
    symbol: 'Include a symbol'
  }
}

export type Locale = 'en' | 'es'
export type Txt = typeof en

// es is annotated with the en-derived type: any missing or extra key here
// fails the build, keeping both locales in lockstep.
const es: Txt = {
  title: 'Gestor de Contraseñas',
  lock: 'Bloquear',
  clearAll: 'Borrar todo',
  createMaster: 'Crea tu contraseña maestra',
  securityHint: 'Las contraseñas se cifran (PBKDF2 + AES-256-GCM) y se almacenan localmente en IndexedDB; la clave de cifrado se deriva de tu contraseña maestra y permanece en memoria solo mientras el gestor está desbloqueado.',
  masterLabel: 'Contraseña maestra',
  confirmLabel: 'Confirmar contraseña maestra',
  setMaster: 'Establecer contraseña maestra',
  vaultLocked: 'Bóveda bloqueada',
  enterMaster: 'Introduce la contraseña maestra',
  unlock: 'Desbloquear',
  lockHint: 'Introduce tu contraseña maestra para desbloquear la bóveda cifrada.',
  addNew: 'Añadir nueva contraseña',
  website: 'Sitio o servicio',
  websitePh: 'ej., github.com',
  username: 'Usuario',
  usernamePh: 'juan@ejemplo.com',
  password: 'Contraseña',
  add: 'Añadir',
  reset: 'Reiniciar',
  managerHint: 'Los cambios se guardan cifrados localmente. Bloquear borra la clave de memoria.',
  langTo: 'English',
  footerText: 'Proyecto creado por:',
  legacyNotice: 'Se detectó una bóveda antigua. Crear una nueva bóveda aquí la reemplazará y restablecerá todas las contraseñas guardadas.',
  wrongPassword: 'Contraseña maestra incorrecta',
  corruptVault: 'La bóveda está dañada',
  storageError: 'No se pudo acceder al almacenamiento local',
  busy: 'Desbloqueando…',
  saving: 'Guardando…',
  copied: '¡Copiado! ✓',
  copyPassword: 'Copiar contraseña',
  deletePassword: 'Eliminar contraseña',
  confirmDelete: '¿Confirmar?',
  confirmClearAll: '¿Confirmar?',
  clipboardError: 'No se pudo copiar',
  revealPassword: 'Mostrar contraseña',
  hidePassword: 'Ocultar contraseña',
  reqLabels: {
    len: 'Al menos 8 caracteres',
    match: 'La contraseña y la confirmación coinciden',
    upper: 'Incluye una mayúscula',
    lower: 'Incluye una minúscula',
    digit: 'Incluye un número',
    symbol: 'Incluye un símbolo'
  }
}

export const TXT: Record<Locale, Txt> = { en, es }
export const LOCALES: readonly Locale[] = ['en', 'es']
export const tr = (lang: Locale): Txt => TXT[lang]
