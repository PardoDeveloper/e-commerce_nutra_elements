# Handoff · nextjs-frontend · Persistencia local del prototipo (D-030)

Fecha: 2026-10-19. Resultado: los cambios de productos hechos en el admin se ven en la tienda tras recargar, desde cualquier navegador del mismo PC.

## Qué hace

- Con `DEMO_PERSISTENCE=true`, el servidor de Next.js guarda en `.demo-data/` (ignorado por git, verificado con `git check-ignore`) los cambios de productos por SKU sobre el catálogo base: contenido, imágenes, precio y stock, publicar/despublicar, eliminar/restaurar (D-029) y descuentos.
- `@/lib/data` (mock) mezcla lo guardado con el catálogo base. Un producto eliminado, despublicado o inactivo no aparece y su ficha da 404.
- Tras guardar se llama a `revalidatePath` de `/productos/<slug>` (slug anterior y nuevo), `/categorias/<cat>` (anterior y nueva), `/productos`, `/` y `/sitemap.xml`.
- Pedidos, métricas y ajustes siguen en memoria. Se generan siempre desde el catálogo base, así que editar productos no cambia el historial de demostración.
- Sin la variable todo funciona como antes y las rutas nuevas responden 404.

## Diseño

```
Navegador (admin)                               Servidor Next.js
─────────────────                               ────────────────
demo-service (en memoria)  ──cambio──►
withProductPersistence  ── diff de productos ─►  POST /api/demo-admin/products  ─► valida ─► .demo-data/products.json (tmp + rename)
ImageManager            ── blob WebP ─────────►  POST /api/demo-admin/images    ─► magic bytes ─► .demo-data/images/<sku>/<id16hex>.<ext>
Ajustes > Restablecer   ──────────────────────►  POST /api/demo-admin/reset     ─► borra todo
                                                 GET  /api/demo-images/<sku>/<file>  ─► sirve solo de images/
Layout /admin (servidor): catálogo base + lo guardado ─► estado inicial de productos del admin
@/lib/data (servidor):    catálogo base + lo guardado ─► tienda
```

- Se eligieron **Route Handlers** y no Server Actions: la subida de archivos y el envío de lotes son más simples con `fetch`, y las rutas se pueden desactivar con un 404 limpio.
- El admin ejecuta su lógica local de siempre y, después, envía al servidor **solo los productos cuyo registro cambió** (`withProductPersistence`). El servidor valida todo otra vez; nunca confía en el cliente.
- Un registro guardado es el producto completo (campos del contrato, sin `reserved`, `sourceName` ni `source`). Lo que no se guardó viene del catálogo base.
- La caché de la capa de datos se invalida por mtime y tamaño de `products.json`.
- Al arrancar con `demo:start`, el script llama a `POST /api/demo-admin/sync` (revalida todo), porque las páginas generadas en el build no conocen lo guardado en sesiones anteriores. Verificado: se guarda un precio, se reinicia el servidor y la ficha muestra el precio guardado.

## Seguridad

- **Activación** (`src/lib/demo-store/config.ts`): solo con `DEMO_PERSISTENCE === "true"`. Se **desactiva** si existe `K_SERVICE` (Cloud Run / App Hosting) o `FIREBASE_CONFIG`, aunque la variable esté puesta. Con `NODE_ENV=production` se permite (así corre `next start` en el PC de Carlos). Probado con tests y a mano con `next start`.
- **Guardia de escritura** (`guard.ts`): además del 404 sin variable, las rutas de escritura exigen Host loopback (`localhost`, `127.0.0.1`, `[::1]`), `Origin` igual al Host si viene, y la cabecera `x-demo-admin: 1`. Eso evita escrituras desde otro equipo de la red (el servidor igual escucha en la red local) y desde páginas de otros sitios (CSRF y DNS rebinding). Respuesta 403.
- **Validación estricta** (`validate.ts`): el SKU debe existir en el catálogo base; solo los campos del contrato (los desconocidos se rechazan); precio entero de 1 a 10.000.000; stock entero de 0 a 1.000.000; descuento válido para el precio; slug, categoría y largos; coherencia (eliminado no puede estar publicado; publicado requiere activo, slug y categoría); y slug único entre productos visibles (409).
- **Imágenes**: solo `image/webp`, `image/jpeg` o `image/png`, de 1 byte a 2 MiB. Se comprueban los **bytes mágicos** y que coincidan con el tipo declarado. El nombre es `randomBytes(8).hex + extensión` generado por el servidor; nada del cliente entra en la ruta. Máximo 8 imágenes por producto y 60 archivos por SKU en disco. Un producto solo puede referenciar rutas `products/<su-sku>/<id>.<ext>` que existan.
- **Lectura de imágenes** (`/api/demo-images/[sku]/[file]`): SKU con `^[A-Za-z0-9_-]{1,32}$`, archivo con `^[a-f0-9]{16}\.(webp|jpg|png)$`, y la ruta resuelta debe quedar dentro de `images/`. `Content-Type` por extensión, `Cache-Control: public, max-age=60` y `nosniff`. Sin persistencia, 404. Probado: `..`, `%2e%2e`, `%5c`, barras y SKU inválidos devuelven 404.
- Escritura atómica (archivo temporal + rename, con reintentos por Windows) y serializada en el proceso. Un `products.json` dañado se ignora (la tienda vuelve al catálogo base).
- `DEMO_DATA_DIR` existe solo para los tests automáticos.
- Para qa-reviewer: `DEMO_PERSISTENCE` no debe estar en ningún entorno desplegado, y antes de producción se elimina todo `src/lib/demo-store/`, `src/app/api/demo-*`, `src/lib/admin/demo-persistence.ts`, `scripts/demo-start.mjs` y el script `demo:start`.

## Tienda

- `ProductImage` acepta `image={{url, alt}}`. `ProductCard` y la ficha pasan la **primera** imagen con su texto alternativo; sin imagen siguen con el marcador SVG.
- **Se usa `<img>` y no `next/image`**: las fotos ya vienen comprimidas (WebP, máx. 1600 px) desde el admin; están en una ruta dinámica fuera de `public/`; y el optimizador agregaría un paso y una caché que podrían quedar desactualizadas. Con Storage se puede pasar a `next/image`. Lleva `width`/`height`, `loading="lazy"` y `aspect-ratio` en CSS (sin saltos de diseño).
- JSON-LD Product: agrega `image` con URL absoluta (`SITE_URL`) cuando hay imágenes. Verificado: `["http://localhost:3000/api/demo-images/2427826/<id>.webp"]` (el valor sale de `SITE_URL`, que en local es el por defecto).
- Tipo público `ProductImage` (en `@/lib/data/types`): nuevo campo opcional `url`.
- Cambio menor en `mock.ts`: el precio final usa `computeFinalPrice` (el mismo del admin) en lugar de su fórmula propia, para que tienda y admin coincidan al céntimo en descuentos porcentuales.

## Admin

- El layout (servidor) entrega `seed.persistence.products` (catálogo base + lo guardado, incluidos borradores y eliminados). Al recargar el admin se ven los cambios.
- Banner: «Modo demostración: los cambios de productos se guardan solo en este PC» cuando la persistencia está activa (`useIsPersistent`, que no crea el servicio).
- Ajustes > «Catálogo de la demo» > **Restablecer catálogo de la demo**, con diálogo de confirmación. Borra `products.json` e `images/` y recarga el panel. Solo aparece con la persistencia activa.
- Subida de imágenes: con persistencia, `ImageManager` envía el WebP ya comprimido al servidor al elegir el archivo y usa la ruta que devuelve. Las vistas previas sobreviven a la recarga.

## Archivos

Nuevos:
- `src/lib/demo-store/{types,config,validate,merge,guard,store,index}.ts` (`store.ts` e `index.ts` con `import "server-only"`)
- `src/lib/demo-store/{validate,guard,store}.test.ts`
- `src/app/api/demo-admin/{_shared.ts,products,images,reset,sync}/route.ts`
- `src/app/api/demo-images/[sku]/[file]/route.ts`
- `src/lib/admin/demo-persistence.ts` y `demo-persistence.test.ts`
- `src/components/admin/ResetDemoCatalog.tsx`
- `scripts/demo-start.mjs`

Modificados:
- `src/lib/data/{mock,index,types}.ts`, `src/lib/data/mock.test.ts` (solo agrega `vi.mock("server-only")`)
- `src/app/admin/layout.tsx`
- `src/components/admin/{AdminProvider,AdminShell,ImageManager,SettingsView}.tsx`
- `src/lib/admin/config.ts`
- `src/components/{ProductImage.tsx,ProductImage.module.css,ProductCard.tsx}`
- `src/app/productos/[slug]/page.tsx`
- `package.json` (solo el script `demo:start`)

No se tocó `functions/`, contratos, AGENTS.md, `.env*`, el checkout ni `vitest.config.mts`. Sin dependencias nuevas. (`server-only` lo resuelve Next internamente; en los tests se mockea.)

## Cómo lo reemplazan Firestore y Storage

- `store.ts` y las rutas `demo-admin` desaparecen: las Cloud Functions y las reglas de Firestore ya persisten (`updateProductCommerce`, `setProductsPublished`, `deleteProducts`, etc.). `withProductPersistence` se elimina y `AdminProvider` vuelve a usar el servicio real.
- `/api/demo-images` se reemplaza por Storage (`products/<sku>/<id>.webp`); el campo `url` del tipo público pasa a ser la URL de descarga y `ProductImage` puede usar `next/image`.
- `mergeStoredIntoProduct` equivale a la lectura de Firestore con `published == true`, `active == true` y `deletedAt == null`. `revalidateCatalog` pasa a la revalidación bajo demanda que dispare la Function al escribir (D-022).
- Las validaciones de `validate.ts` ya son las del contrato: sirven de referencia para las reglas.

## Paso a paso para Carlos

1. Detén la app actual (Ctrl+C en la ventana de PowerShell del puerto 3000).
2. `npm run build` (obligatorio la primera vez y después de cada cambio de código).
3. `npm run demo:start` (puerto 3000; para otro puerto: `$env:PORT=3100; npm run demo:start`). Fija `DEMO_PERSISTENCE=true` y `DEMO_FREE_SHIPPING_THRESHOLD=30000`.
4. Entra a http://localhost:3000/admin (cualquier correo y contraseña). Debe verse el banner nuevo.
5. Abre un producto, sube una imagen, escribe su texto alternativo y pulsa «Guardar imágenes». Cambia el precio en «Comercio» y pulsa «Guardar comercio».
6. Abre la ficha pública (http://localhost:3000/productos/<slug>) en otra ventana o navegador, o en el mismo, y recarga: aparecen la imagen y el precio nuevos, también en el catálogo y la categoría.
7. Para volver al estado original: Ajustes > «Restablecer catálogo de la demo».
- Los cambios sobreviven a reiniciar el servidor. Para empezar de cero también puedes borrar la carpeta `.demo-data`.
- Con `npm run start` o `next start` sin `demo:start`, todo vuelve a funcionar solo en memoria.
- Abre el sitio como `localhost` o `127.0.0.1`: por IP de red (192.168.x.x) el admin carga, pero guardar da 403 a propósito.

## Verificación

- `npm run lint`, `npm test` (21 archivos, 237 tests) y `npm run build`: en verde.
- Tests nuevos: validación de entradas e imágenes (tipo, tamaño, bytes mágicos), path traversal (`..`, `%2e%2e`, barras invertidas, SKU inválido, byte nulo), mezcla en `@/lib/data` (eliminado, despublicado, inactivo, precio, descuento, stock, imágenes, cambio de slug, restablecer), activación (sin variable, valor distinto, `K_SERVICE`, `FIREBASE_CONFIG`), guardia de escritura (host, origen, cabecera) y el envoltorio del admin (solo envía lo modificado, no envía dryRun ni SKU fuera del catálogo base, falla con error claro).
- Prueba de punta a punta en Edge headless por CDP contra `demo:start` en el puerto 3611 (35 comprobaciones, consola sin errores):
  - Login, subida de una PNG de 640×480 (convertida a WebP en el navegador), texto alternativo y precio nuevo.
  - Contexto de navegador nuevo: la ficha muestra `<img src="/api/demo-images/2427826/<id>.webp">` (200, `image/webp`, `max-age=60`, ancho natural 640), el precio $15.990, y el JSON-LD con `image` absoluta y `offers.price` 15990. También en `/productos` y `/categorias/vitaminas`.
  - El admin recargado conserva precio e imagen.
  - Eliminar un producto desde el admin: su ficha da 404 y desaparece del catálogo.
  - Restablecer: vuelven la ficha original, el precio original y el JSON-LD sin `image`; la imagen pasa a 404.
  - Sin la variable, y con `DEMO_PERSISTENCE=true` más `K_SERVICE`: la imagen y las 4 rutas de escritura dan 404; la ficha sigue en 200 y el banner es el antiguo.
  - Escritura sin cabecera: 403. SKU inválido: 400. Traversal: 404.
  - Reinicio del servidor con un cambio guardado: la ficha muestra el cambio (por la sincronización de arranque).
- Los servidores de prueba (puertos 3611 y 3612) y Edge quedaron cerrados. No se tocó el puerto 3000.

## Sin verificar o con límites conocidos

- **Productos creados a mano o por importación de planilla** (SKU que no están en el catálogo base) siguen solo en memoria: el servidor rechaza SKU fuera del catálogo base, como pide D-030, y el cliente no los envía. Se pierden al recargar. Si Carlos los quiere persistentes, hace falta un cambio de diseño (guardar también el producto completo).
- Los cambios de **stock por cancelación de pedidos** no se persisten (los pedidos son en memoria).
- Si el servidor rechaza un guardado, el estado local del navegador ya cambió: el aviso pide recargar para volver a lo guardado.
- Imágenes subidas y luego descartadas con «Quitar» (o sin guardar) quedan en disco hasta «Restablecer». Hay tope de 60 archivos por SKU.
- Los textos de confirmación de las vistas de productos siguen diciendo «(simulado)» aunque ahora se guarden; no se cambiaron para no tocar muchas pantallas (el banner y el mensaje de imágenes sí están actualizados).
- El sitemap está vacío mientras `SITE_INDEXABLE` no sea `true`, así que "sitemap sin el eliminado" en la prueba solo prueba la ausencia; con `SITE_INDEXABLE=true` no se ejecutó.
- No se probó concurrencia real con dos pestañas de admin guardando a la vez (las escrituras están serializadas en el proceso, pero no hay control de versiones: gana la última).
- No se probó en Chrome/Firefox, solo en Edge headless. El admin no se revisó visualmente a 360 px después de agregar la tarjeta de «Restablecer» (usa las clases existentes).
- La app de Carlos (puerto 3000) sigue corriendo con el build anterior hasta que el tech-lead la reinicie: el `.next` ya tiene el build nuevo.
