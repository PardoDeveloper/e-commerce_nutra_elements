# Handoff nextjs-frontend: PR.6a, la tienda pública lee de Firestore (2026-10-19)

## Qué hice
- Selector `DATA_SOURCE` (`"demo"` por defecto, `"firebase"`) en `src/lib/data/index.ts`. Solo nombre en `.env.example`.
- Implementación Firestore de `@/lib/data` con el SDK cliente **lite** (`firebase/firestore/lite`, REST, sin `window`). Sin Admin SDK (D-031).
- `POST /api/revalidate` con firma HMAC-SHA256 (formato del handoff de triggers).

## Archivos
- Nuevos: `src/lib/firebase/server.ts` (app con nombre `ne-public-server`, Firestore lite, URL pública de Storage), `src/lib/data/firestore.ts`, `src/lib/data/firestore-map.ts` (mapeo puro) y su test, `src/lib/data/defaults.ts` (6 categorías de D-023 sin intro y ajustes por defecto), `src/app/api/revalidate/{route.ts,verify.ts,verify.test.ts}`.
- Modificados: `src/lib/data/index.ts`, `src/lib/data/mock.ts` (solo importa los ajustes desde `defaults.ts`; mismo comportamiento), `.env.example` (`DATA_SOURCE`).
- No toqué `client.ts`, admin, auth, functions, reglas ni contratos.

## Decisiones
- Consultas de `products` con siempre `published == true`, `active == true`, `deletedAt == null` más `orderBy("name")` (índice del contrato) y, en categoría, `categoryId ==`. `getProduct(slug)` agrega `slug ==` + `limit(1)` **sin** orderBy para no exigir otro índice compuesto (se resuelve por unión de índices simples; **sin verificar con datos reales**, Firestore está vacío).
- Categorías: solo `where published == true`, orden en memoria. Si no hay, usa las 6 por defecto y deja un aviso (una vez por proceso). `settings/public`: `getDoc`; si no existe, valores por defecto.
- `finalPrice` se recalcula con `computeFinalPrice` (no se confía en el guardado). `inStock` viene del documento. `stock`/`reserved` no pasan al tipo público (test).
- Imágenes: URL `https://firebasestorage.googleapis.com/v0/b/<bucket>/o/<path>?alt=media` (con emulador, el host del emulador). Se mantiene `<img>`; no hay CSP ni `next/image` en el proyecto, así que no cambió `next.config.ts`. **Si se agrega CSP, permitir `img-src https://firebasestorage.googleapis.com`.**
- Build sin datos: en `next build` un fallo de lectura se registra y se usa el respaldo (lista vacía o valores por defecto), así `generateStaticParams` devuelve `[]` (con `dynamicParams = true` ya existente). **En ejecución el error se propaga** (no se cachea un catálogo vacío por un error pasajero; ISR conserva la última página buena).
- `/api/revalidate`: lee cuerpo crudo, exige ambas cabeceras, timestamp en segundos dentro de ±5 min, firma hex de 64 caracteres y `timingSafeEqual`. Sin secreto configurado falla cerrado (401). El formato no trae nonce, así que el anti-replay es solo la ventana (según el contrato, revalidar es idempotente). Lista blanca: las del contrato 8.2 (incluye páginas estáticas y legales), slug `^[a-z0-9-]{1,80}$`, máx. 50 rutas y 10 etiquetas, claves extra rechazadas, cuerpo máx. 16 KB. 401 firma inválida, 400 entrada inválida; respuestas sin detalle.
- Las páginas no usan etiquetas de caché: `tags` se valida (`catalog`, `settings`) y `settings` se traduce a `revalidatePath("/productos/[slug]", "page")`.

## Resultados
- `npm run lint`: 0 errores. `npm test`: 23 archivos, 252 tests en verde. `npm run build`: OK con `DATA_SOURCE` sin definir y con `DATA_SOURCE=firebase`.
- Con `DATA_SOURCE=firebase` y `next start -p 3101`: `/` 200, `/productos` 200; `/categorias/vitaminas` y `/productos/no-existe` 404 (catálogo vacío). En los logs del build y del servidor no hay `permission-denied` ni errores de lectura: solo los avisos "no hay categorías publicadas" y "settings/public no existe". Es decir, Firestore de prod existe, las reglas públicas aceptan las consultas y está vacío.
- `/api/revalidate`: firma inválida 401; firma válida 200; ruta `/admin` firmada 400.
- El servidor de prueba del puerto 3101 se detuvo; el puerto 3000 no se tocó. El último build dejado en `.next` es el de demo.

## Sin verificar
- Consultas con documentos reales (índices desplegados, `getProduct` por unión de índices, URL de imágenes del bucket real).
- Que los triggers de Functions lleguen a `/api/revalidate` desplegado (requiere `SITE_URL` y el mismo `REVALIDATE_SECRET`); probé la firma solo con un cliente local con el mismo algoritmo.
- `sitemap.ts` y `robots.ts` siguen usando la capa de datos (funcionan con ambas fuentes), pero no los probé con datos reales.

## Para el tech-lead
- Para `apphosting.yaml` (devops/firebase-architect): `DATA_SOURCE=firebase` y `REVALIDATE_SECRET` como secreto de Secret Manager, más `NEXT_PUBLIC_FIREBASE_*`.
- `getBaseCatalog` (demo) se sigue exportando desde `@/lib/data` porque el admin lo usa; con `DATA_SOURCE=firebase` devuelve el catálogo mock, y el otro agente del admin debe dejar de depender de él en ese modo.
