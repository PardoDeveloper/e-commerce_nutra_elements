# Handoff firebase-architect: B2 catálogo, admin y triggers (2026-10-19)

Sin deploy, sin emuladores, sin Java y sin git (D-026, D-030, D-031). No se tocaron `orders/`, `payments/`, `metrics/`, `index.ts`, `package.json`, reglas, contratos, `src/` ni `.env*`.

## Estado al empezar
Las tres áreas ya estaban implementadas y verificadas por sesiones anteriores (handoffs `2b6-catalogo` y `admin-triggers`). En esta sesión revisé que cumplen B2 y completé lo que faltaba: **los datos iniciales (función pura, test y script de siembra)**.

## Funciones y archivos
- Catálogo (`functions/src/catalog/`, barrel `index.ts`): `importCatalog`, `importPrices`, `importStock`, `applyDiscount`, `setProductsPublished`, `createProduct`, `updateProductCommerce`, `deleteProducts`, `restoreProducts` (`callables.ts` + `handlers.ts`). Todas con `assertAdmin` y App Check. Todo producto se escribe con `deletedAt: null` (`writes.ts`); un SKU eliminado devuelve `PRODUCT_DELETED` y no se revive. Las filas llegan ya parseadas desde el navegador; el servidor no lee Excel.
- Admin (`functions/src/admin/`): `claimAdmin`, `grantAdmin`, `revokeAdmin`.
- Triggers (`functions/src/triggers/`): `onProductWritten` (considera `deletedAt`), `onCategoryWritten`, `onSettingsPublicWritten`. Cliente HTTP inyectable y tolerante a fallos (nunca lanza).
- **Nuevo:** `functions/src/catalog/seed.ts` (`buildSeedData()`, `communeCode()`), `seed.test.ts` (6 tests) y `functions/scripts/seed.mjs`.

## Arranque del primer admin (diseño)
El encargo propone `bootstrapFirstAdmin`, pero el contrato (5.8b) y D-031 ya fijan `claimAdmin`, y lo implementé así para no contradecir una decisión registrada:
- Requiere sesión. Asigna `admin: true` solo si `email_verified === true` y el correo está en el parámetro no secreto `ADMIN_EMAILS` (hay que poner `admin@gmail.com`). Lista vacía = nadie (falla cerrado). Mensaje de rechazo fijo, sin revelar la lista. Idempotente.
- Diferencia con la propuesta: la propuesta se cierra para siempre cuando existe un admin; `claimAdmin` no, porque solo puede otorgar el rol a correos de la lista. Quedan dos riesgos reales:
  1. El correo `admin@gmail.com` con contraseña provisoria y débil (D-031): quien la adivine entra como admin. Es el bloqueo 1 de D-031 antes de recibir pedidos reales.
  2. `email_verified`: si la cuenta se creó por consola sin verificar el correo, `claimAdmin` la rechaza. Hay que marcarla como verificada o usar una cuenta verificada (p. ej. Google).
- **Alternativa mejor, recomendada:** una vez creado el primer admin, vaciar `ADMIN_EMAILS` (y redesplegar solo `claimAdmin`) o cambiar la lista a un correo propio de Carlos con MFA. Así el bootstrap queda desactivado de hecho y todo se gestiona con `grantAdmin`. Si el tech-lead prefiere el cierre automático "solo si no existe ningún admin", hay que listar usuarios de Auth (costo O(n), aceptable aquí) o guardar un marcador `settings`; es un cambio de contrato que no hice.
- Protección del último admin: `revokeAdmin` sobre uno mismo falla con `CANNOT_REVOKE_SELF`. Como quien llama siempre es admin y el destino es otro, nunca queda cero admins por esa vía.
- El cliente debe llamar `getIdToken(true)` tras `claimAdmin`.
- **El deploy de `claimAdmin` lo confirma Carlos** (contraseña provisoria).

## Parámetros y secretos (solo nombres)
- Secreto: `REVALIDATE_SECRET` (Secret Manager, `defineSecret`, solo en los 3 triggers).
- Parámetros no secretos: `ADMIN_EMAILS`, `SITE_URL`. Ya están en `functions/.env.example`. Los secretos de Flow son de B1.

## Siembra de datos iniciales
- `buildSeedData()` arma las 6 categorías (D-023, descripciones neutras sin declaraciones de salud), `settings/public` (52 comunas, envío 3990, retiro en tienda, `freeShippingThreshold: null`) y `settings/private` (reservas 30 min / 48 h, límites, `orderNumberStart: 1`). **Banco de prueba** ("BANCO DE PRUEBA", cuenta 000000000), como dice el contrato; se reemplaza desde el panel.
- `functions/scripts/seed.mjs`: requiere `npm run build` antes (importa de `lib/`). Sin `--apply` solo simula. Exige `--project` explícito, se niega a correr con `FIRESTORE_EMULATOR_HOST`, y usa `create()`: nunca pisa documentos existentes. Uso: `node scripts/seed.mjs --project nutraelements [--apply]`.
- Verificado: la simulación (sin credenciales) lista los 8 documentos. **El modo `--apply` no se ejecutó.**
- Se escribe con credenciales del operador (ADC); las reglas no aplican al Admin SDK. Los `createdAt`/`updatedAt` usan hora del servidor. Escribir en `nutraelements` lo confirma Carlos.
- Nota: la siembra de categorías dispara `onCategoryWritten` (revalida solo si `SITE_URL` y secreto existen; si no, `warn` y sigue).

## Verificación (en `functions/`)
- `npm run build`: OK. `npm run lint`: OK, sin avisos.
- `npm test`: **17 archivos, 447 tests, todos pasan** (441 previos + 6 de la siembra).

## Qué cubren los tests
Lógica pura (celdas, GTIN, descuentos, planes de importación/publicación/eliminación, rutas de revalidación, firma HMAC y reintentos con cliente HTTP inyectado, claims de admin con Auth falso) y los handlers del catálogo contra un almacén transaccional en memoria (idempotencia, lotes parciales, `PRODUCT_DELETED`, `deletedAt: null`, auditoría en `imports`).

## Qué NO se pudo verificar
- Nada contra Firestore/Auth/Functions reales ni emuladores: el comportamiento real de transacciones (contención, límites de escritura), `onCall` con App Check y los triggers desplegados.
- El almacén en memoria es una aproximación: no replica reglas, índices ni límites de Firestore.
- `seed.mjs --apply` no se ejecutó; el código gRPC 6 (ALREADY_EXISTS) para el salto de existentes es por conocimiento de la API, sin prueba real.
- Los tests de reglas siguen sin ejecutarse (sin Java, D-026).
- Que `SITE_URL` + `REVALIDATE_SECRET` coincidan con la ruta `/api/revalidate` de Next.js (la implementa nextjs-frontend).

## Inconsistencias y pedidos al tech-lead
- Propuesta del encargo (`bootstrapFirstAdmin`, cierre automático) vs. contrato 5.8b (`claimAdmin` por lista): se siguió el contrato; ver alternativa arriba.
- El contrato 8.1 dice que los triggers no reintentan; implementé 3 intentos internos acotados (ya informado en el handoff `admin-triggers`). Conviene actualizar 8.1.
- `scripts/seed.mjs` depende de `lib/` (compilado); si se quiere ejecutar sin build, habría que añadir `tsx`. No lo agregué (no tocar `package.json`).
