# Handoff nextjs-frontend: fix de QA B-1, B-2, mejora 5 y ajustes iniciales (2026-10-19)

## Qué se hizo
- **B-1:** `resolveDataSource(env = process.env)` única en `src/lib/data-source.ts`. Normaliza con trim y minúsculas. Con `K_SERVICE` o `FIREBASE_CONFIG` devuelve siempre `"firebase"`. En local, `"firebase"` solo si la variable lo dice. Usada en `src/lib/data/index.ts`, `src/app/admin/layout.tsx`, `src/lib/admin/mode.ts` (reexporta el tipo `DataSource`; ya no tiene su propia función) y `src/lib/checkout/server.ts`. Ya no queda otro lector de `DATA_SOURCE` en `src/`.
- **B-2:** `demoThreshold()` (exportada) devuelve el fallback si `resolveDataSource(env) !== "demo"`.
- **Mejora 5:** `DEMO_MODE` (constante) se reemplazó por `isDemoMode()` (`resolveDataSource() === "demo"`), reexportada desde `src/lib/admin/config.ts` con el comentario actualizado. Se evalúa solo en el servidor (el layout del admin); el navegador recibe la fuente por props. Se quitó el chequeo `!DEMO_MODE` de `AdminShell`: en el cliente `process.env` no existe, así que era engañoso.
- **Ajustes iniciales (PR.6b):**
  - `src/lib/admin/firebase-seed.ts`: documentos puros que calzan con `validPublicSettings`, `validPrivateSettings` y `validCategory`.
  - `firebase-service.ts`: `seedInitialSettings()` y `seedInitialCategories()` con `runTransaction`. Solo crean lo que no existe, con `serverTimestamp()` en `updatedAt` y `createdAt`.
  - Un listener nuevo y no crítico sobre `categories` cuenta cuántas de las 6 existen.
  - `SettingsView`: sección "Datos iniciales" con los botones **"Crear ajustes iniciales"** (si falta `settings/public` o `settings/private`) y **"Crear categorías iniciales"** (si faltan categorías). El formulario se remonta al crear los ajustes.

## Archivos
Nuevos:
- `src/lib/data-source.ts` y `src/lib/data-source.test.ts`.
- `src/lib/checkout/server.test.ts`.
- `src/lib/admin/firebase-seed.ts` y `src/lib/admin/firebase-seed.test.ts`.

Modificados:
- `src/lib/data/index.ts`.
- `src/app/admin/layout.tsx`.
- `src/lib/admin/mode.ts` y `src/lib/admin/mode.test.ts`.
- `src/lib/admin/config.ts`.
- `src/lib/admin/service.ts`.
- `src/lib/admin/firebase-service.ts`.
- `src/lib/checkout/server.ts`.
- `src/components/admin/AdminShell.tsx`.
- `src/components/admin/SettingsView.tsx`.

## Revisión de reglas (nada que reportar como bloqueo)
- Los documentos calzan con las reglas. Puntos a tener presentes:
  - `validPrivateSettings` exige `bank` con textos de 1 a 100 caracteres, así que no puede ir vacío. El sembrado usa los datos de PRUEBA del ejemplo del contrato ("BANCO DE PRUEBA", etc.). Carlos debe reemplazarlos desde Ajustes. Antes de vender por transferencia hay que cargar los reales.
  - `DEFAULT_SETTINGS` de `firebase-mappers.ts` (el panel antes del sembrado) tiene `bank` vacío, que las reglas rechazarían. Por eso "Guardar ajustes" antes de sembrar falla con `SETTINGS_NOT_SEEDED` (comportamiento previo, ahora se resuelve con el botón).
  - Categorías: se omiten `description`, `seo` e `imagePath` (opcionales). `createdAt` y `updatedAt` son `serverTimestamp()`.
  - Las reglas NO validan los elementos de `communes`; la forma `{code, name}` es la de `src/lib/data/defaults.ts`.
- No verifiqué las transacciones contra Firestore real ni contra el emulador (no se pidió). Quedan para la prueba manual posterior al deploy.

## Verificación
- `npm run lint`: sin errores. `npm test`: 31 archivos y 308 tests en verde. `npm run build`: OK.
- `next start -p 3107` con `K_SERVICE=x DATA_SOURCE=demo`:
  - `/admin/login` no contiene "Cualquier correo" ni "Modo demostración", y muestra el banner "Staging: Flow en sandbox". El formulario de Firebase se pinta en el cliente tras cargar la sesión (el HTML inicial muestra "Cargando…").
  - `/api/demo-store` responde 404.
  - El servidor de prueba ya se detuvo. La app de Carlos (puerto 3000) no se tocó, pero el `npm run build` reemplazó `.next`: hay que reiniciarla.

## Para el tech-lead
- devops: `apphosting.yaml` es suyo. Con este cambio `DATA_SOURCE` ya no es crítico en la nube (K_SERVICE fuerza firebase), pero igual conviene declararlo.
- Si se quiere un sembrado con datos bancarios vacíos, habría que relajar `validBank` (decisión de firebase-architect).
