# B2 — Funciones de catálogo, admin y triggers (firebase-architect)

Proyecto Nutra Elements (Stack B). Repo en la raíz del workspace, Node 24. Responde en español. Código en inglés, comentarios en español. **Repo público: ningún secreto ni dato del negocio en archivos versionados.**

## Contexto y decisiones
Lee en docs/team/DECISIONS.md: D-011, D-016, D-018, D-022, D-024, D-025, D-026, D-027, **D-029, D-030 y D-031**. Contratos (v1.2, fuente de verdad): docs/team/contracts/functions.md (secciones 5, 8 y 9) y data-model.md. Tus handoffs previos: docs/team/handoffs/2026-10-14-firebase-architect-2b1-estructura.md y 2b3-common.md, y el módulo `functions/src/common/`.

El proyecto de trabajo es `nutraelements` (Blaze, Firestore us-east4). **No despliegues nada** (cada despliegue lo confirma Carlos). Tampoco emuladores ni Java (D-026): verificación con tests unitarios, build y lint.

## Qué construir (functions/src/catalog, admin y triggers)
1. **Catálogo, sección 5 del contrato:** `importCatalog`, `importPrices`, `importStock`, `applyDiscount`, `setProductsPublished`, `createProduct`, `updateProductCommerce`, y **`deleteProducts` y `restoreProducts` (D-029, sección 5.9)**.
   - Todos son callables de admin: `assertAdmin` y App Check.
   - Reglas finas: SKU eliminado → `PRODUCT_DELETED`; D-018 y D-025 (stock vacío); lotes y límites según el contrato; **los productos siempre se escriben con `deletedAt: null`**.
   - El contrato define qué reciben las funciones (filas ya parseadas en el navegador, según 5.1 a 5.3). **Síguelo y no parsees Excel en el servidor.** Si el contrato es ambiguo, elige lo más seguro y anótalo.
2. **Admin:** `grantAdmin` y `revokeAdmin` (sección 5.8), con protección para que el último admin no pueda quitarse a sí mismo el permiso.
   - Además, el **arranque del primer admin**, que hoy no existe y lo necesitamos. Diseña e implementa lo más simple y seguro.
   - Propuesta: un callable `bootstrapFirstAdmin` que solo funciona si **todavía no existe ningún admin** y el llamador está autenticado con el correo definido por la variable `BOOTSTRAP_ADMIN_EMAIL` (parámetro no secreto). El primer admin es `admin@gmail.com`.
   - Debe dejar de funcionar para siempre una vez que existe un admin. Documéntalo en el handoff y dime si ves una alternativa mejor.
   - **Aviso:** la contraseña de esa cuenta es provisoria y débil (D-031). Por eso el bootstrap queda **protegido**, y el despliegue de esta función lo confirma Carlos.
   - **No escribas ninguna contraseña en ningún archivo.**
3. **Triggers de revalidación ISR, sección 8:** `onProductWritten` (considera `deletedAt`), `onCategoryWritten` y `onSettingsPublicWritten`. Llaman a la ruta de revalidación de Next.js, con `REVALIDATE_SECRET` por `defineSecret` y la URL del sitio por parámetro. Tolera fallos de red sin dañar la escritura, e inyecta el cliente HTTP para testear.
4. **Datos iniciales:** documentos de `settings/public`, `settings/private` y las 6 categorías (D-023) para dejar el proyecto utilizable, **como un script de siembra** en `functions/scripts/` (que no se ejecuta ahora) y una función pura que arme los datos. Los datos bancarios son **de prueba** (como dice el contrato).

Reglas de diseño: lógica pura separada de una capa fina de Firestore, tests de lo puro y un doble en memoria para lo transaccional. Dile al tech-lead con honestidad qué **no se pudo verificar**.

## Archivos que te pertenecen (hay otro agente en paralelo, B1)
- Tuyos: `functions/src/catalog/**`, `functions/src/admin/**`, `functions/src/triggers/**` y `functions/scripts/**`. Puedes **leer** `common/`, y hacer cambios mínimos y aditivos allí (reportarlos).
- **NO toques** `functions/src/orders/**`, `payments/**` ni `metrics/**` (de B1), `functions/src/index.ts` (lo conecta el tech-lead), `package.json` salvo una dependencia imprescindible, reglas, contratos, `src/` de Next.js, `.env*`.
- Cada carpeta tuya expone un `index.ts` (barrel) con sus funciones exportadas.

## Terminado cuando
- En `functions/`: `npm run build`, `npm run lint` y `npm test` en verde (pega el conteo).
- Handoff en docs/team/handoffs/2026-10-19-firebase-architect-b2-catalog-admin.md, con:
  - Las funciones y sus archivos.
  - El diseño del arranque del admin.
  - Los parámetros y secretos (**solo los nombres**).
  - Qué cubren los tests y qué **no se pudo verificar**.
  - Las inconsistencias del contrato, si las hay.
