# Handoff nextjs-frontend: PR.6b admin con Firebase real (2026-10-19)

## Qué hice
- **Selector `DATA_SOURCE`** (la misma variable de servidor que usa la capa de datos pública): `"demo"` por defecto, `"firebase"` para el admin real.
  - Decisión: **no** se duplica como `NEXT_PUBLIC_*`. El layout del admin (`force-dynamic`) lee `process.env.DATA_SOURCE` en cada petición, la resuelve con `resolveDataSource` (solo el valor exacto `firebase` activa el modo real; cualquier otro es demo) y la pasa por props a `AdminProvider`. Un solo valor, cambiable sin recompilar. Con `demo` todo queda igual.
- **Login real** (`/admin/login`): correo y contraseña, "Entrar con Google" (popup; redirect si el navegador lo bloquea o no lo soporta), "Olvidé mi contraseña" (`sendPasswordResetEmail`, misma respuesta exista o no el correo). No hay "crear cuenta". Errores en español que no revelan si el correo existe (`user-not-found`, `wrong-password`, `invalid-credential` y `user-disabled` dan el mismo texto).
  - Tras el login: si el token ya trae `admin === true` se entra; si no, `claimAdmin` (us-east4) y, con OK o `alreadyAdmin`, `getIdToken(true)` y se vuelve a leer el claim. Sin claim: "Tu cuenta no tiene permisos de administrador." y `signOut`. Si `claimAdmin` no existe (no desplegada) o hay un fallo de red, el mensaje es distinto ("la función de acceso aún no está disponible") y también se cierra la sesión.
  - Desviación menor: no se llama a `claimAdmin` si el token ya tiene el claim (evita una llamada y permite entrar a un admin existente si Functions cae). La seguridad real sigue en reglas y Functions.
  - Guard de `/admin/*` en el cliente (`AdminShell`) con estado de carga; muestra el correo y "Salir". Al salir se descartan los listeners de Firestore y los datos en memoria.
- **`AdminService` real** (`src/lib/admin/firebase-service.ts`), misma interfaz que el demo. Las firmas de las callables están aisladas en `src/lib/admin/firebase-callables.ts` (el handoff 2b6 no existía: me guié por functions.md v1.2). Si 2b6 cambia algo, solo hay que tocar ese archivo.
- **Banners**: con firebase se quita "Modo demostración" y se muestra "Staging: Flow en sandbox". Los textos "(simulado)" de los avisos se limpian con `sim()` solo en modo firebase. Los botones "Activar/Desactivar" no se muestran con firebase (el contrato no tiene función para `active`; viene de la planilla).
- **Test** que garantiza que con firebase el login simulado no es accesible (`src/components/admin/login-source.test.ts`): renderiza `LoginForm` y `AdminShell` con cada fuente, comprueba que no aparece el texto del login simulado ni "Modo demostración", que `demoLogin` no hace nada con firebase y que los archivos de Firebase no importan la sesión simulada.

## Operación → mecanismo
| Operación | Mecanismo |
|---|---|
| Leer productos (todos, incluidos eliminados) | SDK cliente, `onSnapshot(products)` como admin |
| Leer pedidos | `onSnapshot(orders)` ordenado por `createdAt desc`, **`limit(200)`** |
| Leer métricas | `onSnapshot` de `metrics/daily/days` (90 días, `orderBy date desc`) y `metrics/products/items` (top 10 por `unitsSold`). Si no hay datos, el panel calcula desde los pedidos cargados |
| Leer ajustes | `onSnapshot(settings/public)` y `onSnapshot(settings/private)`; si no existen, valores iniciales del contrato y aviso |
| Editar contenido de producto (nombre, descripciones, categoría, slug, formato, unidades, familia, seo, imágenes) | `updateDoc` con solo esos campos + `updatedAt: serverTimestamp()` (sin `undefined`; imágenes reducidas a `{path, alt}`) |
| Subir imagen | Compresión a WebP en el navegador (≤ 1600 px, ≤ 2 MiB) y `uploadBytes` a `products/{sku}/{id24}.webp` (cumple el regex de las reglas; `cacheControl` immutable). La URL se guarda con `updateDoc` de contenido (`images`) |
| Quitar imagen | `updateDoc(images)` y luego `deleteObject` del archivo (si falla, queda huérfano) |
| Precio y stock de un producto | callable `updateProductCommerce` |
| Publicar / despublicar | callable `setProductsPublished` |
| Eliminar / restaurar | callables `deleteProducts` / `restoreProducts` (el `BatchReport` se adapta a `DeleteReport`/`RestoreReport`) |
| Importar catálogo / precios / stock | callables `importCatalog` / `importPrices` / `importStock`; el Excel se parsea en el navegador y se envían filas JSON |
| Descuentos | callable `applyDiscount` |
| Crear producto | callable `createProduct` |
| Activar/desactivar (`active`) | **No disponible** (no hay función en el contrato; viene de la planilla) |
| Confirmar transferencia | callable `confirmTransferPayment` |
| Cancelar pedido | callable `cancelOrder` |
| Estado logístico | callable `updateFulfillment` |
| Registrar reembolso | callable `recordManualRefund` |
| Ajustes | `writeBatch` con `set` de `settings/public` y `settings/private` (documentos completos; conserva `communes`, `limits` y `orderNumberStart`) |
| Login / claim | Auth del SDK + callable `claimAdmin` + `getIdToken(true)` |

Errores de callables: `details.code` mapeado a mensajes en español; una función sin desplegar (`not-found` sin código de aplicación) muestra "Función no disponible todavía."

## Archivos
- Nuevos: `src/lib/admin/mode.ts`, `firebase-service.ts`, `firebase-callables.ts`, `firebase-mappers.ts` (+ tests); `src/lib/auth/{messages,admin-claim,admin-auth}.ts` (+ test); `src/components/admin/{FirebaseLoginForm,DemoLoginForm,DataGate}.tsx`, `login-source.test.ts`.
- Modificados: `src/app/admin/layout.tsx`, `src/components/admin/{AdminProvider,AdminShell,LoginForm,MetricsView,OrdersView,OrderDetail,ProductEditor,ProductsView,SettingsView,ImageManager,DiscountsView,ImportView}.tsx`, `src/lib/admin/{service,session,metrics}.ts`.
- `AdminService` ganó miembros **opcionales** (`uploadProductImage`, `dispose`) y `AdminState` campos opcionales (`status`, `loadError`, `settingsMissing`, `metrics`). La demo no cambia.

## Resultados
- `npm run lint`: sin errores ni avisos. `npx tsc --noEmit`: limpio. `npm test`: 28 archivos, 294 tests en verde.
- **Build**: no ejecuté `npm run build` en el repo para no pisar `.next` de la app de Carlos (puerto 3000, intacta). Lo ejecuté en una copia aislada (`.verify-build`, ya borrada) con `next build --webpack`, **en verde con `DATA_SOURCE` sin definir y con `DATA_SOURCE=firebase`**. En esa copia Turbopack falló solo por `next/font/google` al estar la copia anidada (no es del código); conviene que quien lo pueda, corra `npm run build` normal.
- Probado en navegador (Edge headless, otro puerto, ya detenido) con `DATA_SOURCE=firebase`: `/admin` sin sesión redirige a `/admin/login`; el login muestra correo, contraseña, "Ingresar", "Entrar con Google" y "Olvidé mi contraseña", con el banner "Staging: Flow en sandbox" y sin login simulado. Con Auth sin proveedores activos, ingresar, Google y recuperar contraseña muestran "El inicio de sesión aún no está habilitado en este entorno (falta activar el proveedor en Firebase Authentication)…". Con `demo` el login simulado y el panel siguen como antes.

## Sin verificar (requiere Functions, reglas y Auth desplegados)
- Todo el flujo autenticado: `claimAdmin`, refresco del token, lecturas con reglas, `updateDoc` de contenido, subida a Storage y todas las callables (solo probadas con tests de adaptadores y mapeadores).
- La forma exacta de las respuestas de las callables (contrato, no handoff 2b6): `deleteProducts` y `restoreProducts` como `BatchReport` (se usa `row` = posición 1-based para deducir los SKU aceptados); `updateProductCommerce` devuelve `{sku, price, finalPrice, stock}`; `confirmTransferPayment` devuelve `alreadyPaid` y `paymentStatus`; `updateFulfillment` devuelve `changed`; `recordManualRefund` devuelve `alreadyRefunded`.
- App Check: las callables exigen `enforceAppCheck`. Si `NEXT_PUBLIC_APPCHECK_SITE_KEY` no está configurada o la clave no está registrada, llegará `APP_CHECK_FAILED` ("La verificación de seguridad falló…").
- Vista previa (`dryRun`) de importaciones y descuentos: el reporte es el del servidor, pero el detalle "antes → después" se calcula en el cliente con los planificadores existentes y se filtra por las filas que el servidor aceptó.
- Reglas de `settings`: se envían todas las claves exigidas; no se ejecutaron contra las reglas.
- Upload a Storage desde el navegador (CORS no debería hacer falta para subir con el SDK, sin verificar).

## Limitaciones conocidas y pedidos al tech-lead
1. **Sembrado de `settings/public`** (con las 52 comunas) y `settings/private`: si `settings/public` no existe, guardar ajustes falla con "falta el sembrado inicial" (no invento las comunas). La pantalla avisa y muestra los valores iniciales del contrato. Lo debe sembrar firebase-architect / devops.
2. **`resolvePaymentReview`** (functions.md 4.2) existe en el contrato pero **no está en la interfaz `AdminService` ni en la UI**: un pedido en `payment_review` solo se puede ver. Hay que decidir si se agrega la pantalla.
3. **Pedidos**: solo se cargan los 200 más recientes (el contrato pide paginar; se acotó). Las métricas salen de `metrics/**` si hay datos.
4. **Usuarios con contraseña**: `claimAdmin` exige `email_verified === true` y el correo en `ADMIN_EMAILS`. Una cuenta de correo y contraseña creada en la consola no está verificada: debe entrar con Google o recibir el claim por `grantAdmin` de otro admin.
5. **`DATA_SOURCE=firebase`** debe estar definida como variable de ejecución de App Hosting (devops, `apphosting.yaml`). Las `NEXT_PUBLIC_FIREBASE_*` se incrustan en el build.
6. **Quitar una imagen** borra el archivo de Storage. Si se prefiere conservarlos (como pasa con los productos eliminados, D-029), se quita `deleteObject` en `updateProductContent`.
7. `active` no se puede cambiar a mano con firebase. Si Carlos lo quiere, hace falta una función nueva (cambio de contrato).
8. Los avisos "Modo demostración" del layout público (si los hay) no son de este alcance.

## Pasos de prueba cuando se despliegue
1. Auth: activar correo/contraseña y Google; agregar el dominio en dominios autorizados. Functions: desplegar con `ADMIN_EMAILS` = el Gmail de Carlos. Reglas de Firestore y Storage desplegadas; sembrar `settings/*` y `categories`.
2. Arrancar con `DATA_SOURCE=firebase` y abrir `/admin/login`.
3. Entrar con Google (cuenta de `ADMIN_EMAILS`): debe pasar por "Verificando permisos…" y llegar a `/admin`. Entrar con otra cuenta: "Tu cuenta no tiene permisos de administrador." y la sesión se cierra.
4. Lecturas: Productos, Pedidos, Resumen y Ajustes cargan sin error de permisos (si falla, el panel muestra el error de lectura).
5. Contenido: editar nombre y descripción de un producto y guardar; recargar y comprobar.
6. Imágenes: subir una foto, poner texto alternativo, guardar; verificar el objeto en `products/{sku}/{id}.webp`, la URL en `images` y que la ficha pública la muestre tras la revalidación.
7. Comercio: cambiar precio y stock de un producto; publicar con todos los datos; despublicar; eliminar y restaurar.
8. Importaciones: vista previa y aplicar con `importCatalog`, precios y stock; descuentos con `applyDiscount`.
9. Pedidos (con un pedido de prueba): confirmar transferencia, avanzar el estado logístico, retroceder con motivo, reembolso manual.
10. Ajustes: cambiar el costo de envío, guardar y comprobar `settings/public`.
11. "Salir": debe volver al login y, al entrar con otra cuenta, no mostrar datos de la anterior.
