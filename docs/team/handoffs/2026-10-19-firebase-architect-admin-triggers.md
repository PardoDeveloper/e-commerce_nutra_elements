# Handoff firebase-architect: permisos de admin y triggers de revalidación (2026-10-19)

## Qué hice
- `functions/src/admin/`: `claimAdmin` (D-031), `grantAdmin`, `revokeAdmin`.
- `functions/src/triggers/`: `onProductWritten`, `onCategoryWritten`, `onSettingsPublicWritten` (contrato sección 8).
- `functions/.env.example`: agregado `ADMIN_EMAILS` (solo nombre).
- No toqué `functions/src/index.ts`, `common/`, `catalog/`, reglas ni contratos.

## Archivos
- `functions/src/admin/`: `index.ts`, `callables.ts` (onCall + params), `claims.ts` (lógica con Auth inyectable), `emails.ts` (parseo, comparación, máscara), `errors.ts` (NOT_ALLOWED, USER_NOT_FOUND, CANNOT_REVOKE_SELF), `claims.test.ts`.
- `functions/src/triggers/`: `index.ts`, `handlers.ts` (onDocumentWritten + params/secreto), `routes.ts` (cálculo puro de rutas), `revalidate.ts` (firma HMAC y POST con reintento), `routes.test.ts`, `revalidate.test.ts`.
- Se eliminaron los `README.md` placeholder de `admin/` y `triggers/`.

## Firmas de las callables (todas `onCall`, us-east4, 256 MiB, 30 s, maxInstances 2, `enforceAppCheck` salvo `APP_ENV=local`)
```ts
claimAdmin(data: unknown /* se ignora */): { admin: true; alreadyAdmin: boolean }
grantAdmin({ email: string }):  { uid: string; admin: true }
revokeAdmin({ email: string }): { uid: string; admin: false }
```
Errores: `UNAUTHENTICATED`, `NOT_ADMIN`, `INVALID_INPUT` (comunes); `NOT_ALLOWED` (`permission-denied`, solo claimAdmin); `USER_NOT_FOUND` (`not-found`); `CANNOT_REVOKE_SELF` (`failed-precondition`).

Comportamiento:
- `claimAdmin`: requiere sesión. Asigna `admin: true` solo si `email_verified === true` y el correo (minúsculas, sin espacios) está en `ADMIN_EMAILS`. Si ya es admin (token o registro de Auth), responde `alreadyAdmin: true` sin escribir. Si no cumple, `NOT_ALLOWED` con mensaje fijo, sin revelar la lista. Lista vacía = nadie (falla cerrado). Conserva otros claims. Log estructurado con `uid`, correo enmascarado (`c***@gmail.com`) y resultado.
- `grantAdmin` / `revokeAdmin`: solo admin (`assertAdmin`). Idempotentes. Entrada `strictObject({email})`. `revokeAdmin` conserva otros claims, borra `admin` y llama `revokeRefreshTokens` para forzar un nuevo login. No hay "último admin" que proteger aparte de `CANNOT_REVOKE_SELF`: quien revoca es admin y el destino es otro, así que siempre queda al menos uno (el contrato 5.8 no pide más).
- **El cliente debe refrescar el token** tras `claimAdmin`/`grantAdmin`: `await auth.currentUser.getIdToken(true)`; sin eso el claim no aparece hasta ~1 h. Para nextjs-frontend: llamar `claimAdmin` tras el login, luego `getIdToken(true)`, y recién ahí leer `claims.admin`.

## Triggers
- Rutas (todas validadas con `^[a-z0-9-]{1,80}$`, máx. 50, sin duplicados):
  - Producto: `/productos/{slug}` y `/categorias/{categoryId}` del estado anterior y del nuevo (solo de los lados que eran/son públicos: published, active, no eliminado), más `/productos`, `/` y `/sitemap.xml`. Etiqueta `catalog`.
  - Categoría: `/categorias/{id}`, `/productos`, `/`, `/sitemap.xml`. Etiqueta `catalog`. No revalida si no está publicada antes ni después.
  - Settings: `/`, `/productos`, `/preguntas-frecuentes`, `/contacto` y etiqueta `settings`.
- No revalida si solo cambian `stock`/`reserved` (sin cambiar `inStock`), borradores, eliminados que siguen eliminados, ni campos no visibles.
- Envío: `POST {SITE_URL}/api/revalidate`, cuerpo `{paths, tags}`, cabeceras `x-ne-timestamp` y `x-ne-signature` (HMAC-SHA256 hex de `${timestamp}.${cuerpo}`), timeout 5 s por intento, 3 intentos con espera 0,5 s y 1,5 s solo ante red, timeout, 429 o 5xx (timestamp nuevo en cada intento). Nunca lanza; se registra y listo. Timeout de la función 40 s, `retry: false`.
- Sin `SITE_URL` o sin secreto: log `warn` y termina sin error. `SITE_URL` solo se acepta con https (o http a localhost): el secreto no viaja en claro.
- **Desviación menor del contrato 8.1** ("no se reintenta"): pediste reintento acotado; lo implementé interno (3 intentos). Conviene que el tech-lead lo refleje en 8.1.

## Texto propuesto para functions.md, sección 5.8b (aplicar por el tech-lead)

```md
### 5.8b `claimAdmin` (bootstrap del primer admin, D-031)
```ts
type ClaimAdminRequest = Record<string, never>;   // sin datos; se ignoran
interface ClaimAdminResponse { admin: true; alreadyAdmin: boolean }
```
- Callable, requiere sesión (no exige claim), `enforceAppCheck`, 256 MiB / 30 s / 2 instancias.
- Asigna `admin: true` con el Admin SDK **solo si** `token.email_verified === true` y el correo del token (en minúsculas y sin espacios) está en el parámetro `ADMIN_EMAILS` (`defineString`, correos separados por comas; no es secreto). Lista vacía = nadie puede reclamar. Conserva los demás claims.
- Si el usuario ya es admin: `alreadyAdmin: true` y no escribe. Idempotente.
- Si no cumple (fuera de la lista, correo sin verificar o sin correo): `permission-denied` / `NOT_ALLOWED`, mensaje fijo que no revela la lista.
- Registra un log estructurado (uid, correo enmascarado, resultado); nunca el correo completo.
- El cliente debe refrescar el token después de la llamada (`getIdToken(true)`) antes de usar el panel.
- Con el primer admin, el resto se gestiona con `grantAdmin`/`revokeAdmin` (5.8). Esto reemplaza el script local del primer admin mencionado en 5.8.
- Errores nuevos de admin: `NOT_ALLOWED`, `USER_NOT_FOUND`, `CANNOT_REVOKE_SELF`. `revokeAdmin` además invalida los refresh tokens del usuario revocado.
```
Y en la sección 7.1 agregar la fila: `ADMIN_EMAILS | parámetro | functions/.env.local | lista de correos de admins iniciales`.

## Pasos para Carlos
1. Secreto de revalidación (mismo valor que usará App Hosting; genera uno aleatorio largo, no lo pegues en chats ni archivos):
   `firebase functions:secrets:set REVALIDATE_SECRET --project prod`
   (pide el valor por consola). Más adelante el mismo valor se declara en `apphosting.yaml` como secreto de Secret Manager.
2. `ADMIN_EMAILS`: tu Gmail (el que entrará con Google), en minúsculas. En el deploy a prod (lo hace devops) el CLI preguntará el valor del parámetro, o se pone en `functions/.env.prod` (ignorado por git) como `ADMIN_EMAILS=tucorreo@gmail.com`. Importante: entra con una cuenta cuyo correo esté verificado (Google lo está).
3. `SITE_URL`: hasta que exista App Hosting se deja vacío (los triggers lo registran y no hacen nada). Después, la URL de App Hosting en `functions/.env.prod`.
4. Tras desplegar: iniciar sesión, llamar `claimAdmin`, refrescar el token.

## Para el tech-lead
- Exportar en `functions/src/index.ts`: `export * from "./admin/index.js"; export * from "./triggers/index.js";` (lo hace el otro agente).
- `common/auth.ts` (`AuthRequestLike`) no acepta `CallableRequest` directamente porque `DecodedIdToken` no comparte propiedades con `{admin?: unknown}` (error TS2345). Lo resolví con un adaptador local `authOf` en `admin/callables.ts`. Mejor arreglo si lo quieres en common: `token?: { admin?: unknown; [k: string]: unknown }`. Los otros callables del otro agente toparán con lo mismo.
- `admin/callables.ts` llama `initializeApp()` con guarda (`getApps().length === 0`); si `index.ts` o catalog también lo hacen con la misma guarda no hay conflicto.
- El frontend de `src/` debe tener la llamada a `claimAdmin` + refresco de token (nextjs-frontend).

## Resultados
En `functions/`: `npm run build` sin errores, `npm run lint` sin errores, `npm test` 10 archivos / 239 tests en verde.

## Sin verificar
- Que `index.ts` exporte los módulos y que el despliegue/descubrimiento de funciones los cargue (no se desplegó ni se usó el emulador).
- `defineString` con `default: ""` y `defineSecret` en el emulador, y el comportamiento real de `onDocumentWritten` (`event.data.before/after.data()`) y del `fetch` contra `/api/revalidate`: solo cubiertos con tests de lógica pura e inyección; falta que nextjs-frontend implemente el receptor y una prueba de punta a punta.
- `getAuth().setCustomUserClaims`/`getUserByEmail` contra Auth real o emulador (en tests se simulan).
- Los tests de integración de `claimAdmin` con el Auth Emulator (sin Java ni emuladores por D-026/D-031).
