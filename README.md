# Password Manager / Gestor de Contraseñas

A modern React + Vite password manager with encrypted local storage, master-password gating, and a clean interface.

## English

### Overview
- UI built with React + Vite (TypeScript) and `lucide-react` icons.
- Encrypted storage using AES via `crypto-js` and persistence in IndexedDB.
- Master password controls access: unlock to decrypt; lock clears the key from memory.
- Modern cards, reveal/copy/delete actions, language toggle (English ↔ Español), and a footer link.

### Security Model
- Encryption at rest: vault data is stored only as ciphertext in IndexedDB.
- Key material: derived directly from the master password (kept only in memory while unlocked).
- No plaintext persistence: entries are serialized and encrypted before saving.
- Lock clears the in-memory key and hides data; Clear wipes the vault from IndexedDB.

### Features
- Welcome flow to create and confirm a master password.
- Password entry cards with reveal, copy to clipboard, and delete.
- Add-entry form with hints and requirements checklist.
- Language toggle: switches all visible labels to Spanish or English.
- Footer with “Project created by” and a LinkedIn button.

### Run Locally
- Requirements: Node.js LTS.
- Commands:
  - `npm install`
  - `npm run dev`
- Open the local URL printed by Vite (e.g., `http://localhost:5173/` or `http://localhost:5174/`).

### Troubleshooting (Windows PowerShell)
- If `npm.ps1` execution is blocked:
  - Run: `Set-ExecutionPolicy -Scope CurrentUser -ExecutionPolicy RemoteSigned -Force`
  - Then re-run `npm install` and `npm run dev`.

### Improvements (Optional)
- Derive encryption keys with PBKDF2 (salt + iterations) and use Web Crypto AES-GCM.
- Clipboard auto-clear timer after copying a password.
- Export/Import encrypted vault for manual backup.

## Español

### Descripción
- Interfaz moderna con React + Vite (TypeScript) e iconos `lucide-react`.
- Almacenamiento cifrado usando AES con `crypto-js` y persistencia en IndexedDB.
- La contraseña maestra controla el acceso: al desbloquear se descifra; al bloquear se borra la clave de memoria.
- Tarjetas modernas, acciones de mostrar/copiar/eliminar, cambio de idioma (English ↔ Español) y enlace en el pie.

### Modelo de Seguridad
- Cifrado en reposo: la bóveda se guarda únicamente como texto cifrado en IndexedDB.
- Material de clave: derivado directamente de la contraseña maestra (solo permanece en memoria mientras está desbloqueado).
- Sin persistencia de texto plano: las entradas se serializan y cifran antes de guardarse.
- Bloquear borra la clave en memoria y oculta los datos; Limpiar elimina la bóveda de IndexedDB.

### Funcionalidades
- Pantalla de bienvenida para crear y confirmar la contraseña maestra.
- Tarjetas de contraseñas con mostrar, copiar al portapapeles y eliminar.
- Formulario para añadir entradas con consejos y lista de requisitos.
- Cambio de idioma: alterna todas las etiquetas visibles entre español e inglés.
- Pie de página con “Proyecto creado por” y botón de LinkedIn.

### Ejecutar Localmente
- Requisitos: Node.js LTS.
- Comandos:
  - `npm install`
  - `npm run dev`
- Abre la URL local que muestra Vite (por ejemplo, `http://localhost:5173/` o `http://localhost:5174/`).

### Solución de Problemas (Windows PowerShell)
- Si se bloquea la ejecución de `npm.ps1`:
  - Ejecuta: `Set-ExecutionPolicy -Scope CurrentUser -ExecutionPolicy RemoteSigned -Force`
  - Luego vuelve a ejecutar `npm install` y `npm run dev`.

### Mejoras (Opcional)
- Derivar claves con PBKDF2 (sal + iteraciones) y usar AES-GCM con Web Crypto.
- Temporizador para borrar el portapapeles después de copiar una contraseña.
- Exportar/Importar la bóveda cifrada para copias de seguridad manuales.

---

Project created by: LinkedIn `https://www.linkedin.com/in/andy-bencomo-608741287`
