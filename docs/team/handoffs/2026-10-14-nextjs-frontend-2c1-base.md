# Handoff nextjs-frontend: 2C.1 proyecto base, layout y clientes de Firebase

Fecha: 2026-10-14. Estado: terminado, pendiente de revisión.

## Versiones
Node 24.21.0, npm 11.19.0, next 16.4.1 (Turbopack), react / react-dom 19.3.0, typescript 5.9.3, eslint 9.39.5 con eslint-config-next 16.4.1, firebase 13.0.0, vitest 5.0.4 (solo tests).

## Archivos creados
- Raíz: `package.json`, `package-lock.json`, `tsconfig.json`, `eslint.config.mjs`, `next.config.ts`, `vitest.config.mts`. `.env.example` solo con nombres agregados (sin valores).
- `src/app/`: `layout.tsx`, `page.tsx` (marcador), `not-found.tsx`, `robots.ts`, `sitemap.ts`, `globals.css`.
- `src/lib/site.ts` (+ `site.test.ts`): `getSiteUrl()` e `isIndexable()`.
- `src/lib/firebase/config.ts` y `client.ts`: SDK de cliente.
- `src/components/` existe con `.gitkeep` (aún sin componentes).
- No se tocaron AGENTS.md, CLAUDE.md, docs/contracts, .gitignore, functions/, reglas ni firebase.json.

## Decisiones
- **Estilos: CSS plano con variables CSS (design tokens) en `globals.css`.** Cero dependencias, funciona con Server Components y no añade JS. No hay tokens de diseño oficiales todavía: los valores actuales (colores, espaciados, 44 px táctil) son provisionales. Se creó el proyecto con `create-next-app --no-tailwind`; Tailwind queda como opción si Carlos lo prefiere.
- **`cacheComponents` y `partialPrefetching`**: la plantilla de create-next-app 16.4 los activa por defecto. No se copiaron: `cacheComponents` cambia el modelo de caché y no convive con `export const revalidate` (ISR de D-022 / D-023, 3600 s). Hay que decidir con el tech-lead antes de activarlos.
- **Interruptor noindex**: `SITE_INDEXABLE === "true"` exacto; cualquier otro valor o ausencia = noindex. Se aplica en tres sitios: `metadata.robots` del layout, cabecera `X-Robots-Tag` en `next.config.ts` y `robots.ts` / `sitemap.ts`. La cabecera se decide al arrancar/compilar; cambiar la variable exige rebuild o reinicio (devops debe redesplegar al activar el lanzamiento).
- **robots.txt**: lanzado = `Allow /`, `Disallow /admin/ /api/` y Sitemap. Se siguió el contrato 06, que no bloquea /carrito, /checkout ni /cuenta (se excluyen con noindex en sus páginas, a construir). El pedido de la tarea decía bloquearlos también; prevaleció el contrato porque bloquear impide leer el noindex.
- **App Check**: `ReCaptchaEnterpriseProvider` (el contrato solo habla de "clave del proveedor"; Enterprise es la recomendación actual de Firebase). Se inicializa solo si existe `NEXT_PUBLIC_APPCHECK_SITE_KEY`. En desarrollo se usa el token de depuración (`NEXT_PUBLIC_APPCHECK_DEBUG_TOKEN` o autogenerado). Cambiar a v3 es una línea.
- **Cliente Firebase**: inicialización perezosa (`getFirebaseAuth/Db/Storage/Functions`), solo navegador (lanza error en el servidor), estado en `globalThis` para HMR. Emuladores solo con `NEXT_PUBLIC_USE_EMULATORS === "true"` (127.0.0.1; auth 9099, firestore 8080, storage 9199, functions 5001). Functions fija región `us-east4`. No se importa en el layout, así no entra al JS de las páginas públicas.
- Admin SDK server-only: no creado (aún no hay lecturas ISR). Se hará en 2C.2.
- Home: título absoluto "Nutra Elements | Suplementos alimenticios en Chile" porque el template del layout no aplica en el mismo segmento.
- Fuente: Inter con `next/font/google`, `display: swap`. Se descarga en build (necesita red).

## Verificación (ejecutada)
- `npm install`, `npm run lint`, `npm test` (5 tests del interruptor y de `getSiteUrl`) y `npm run build`: en verde. `functions/` excluido de tsconfig y eslint; el build no lo compila.
- Rutas del build: `/`, `/_not-found`, `/robots.txt`, `/sitemap.xml`, todas estáticas.
- `next start` en puerto 3457 con SITE_INDEXABLE sin definir (cerrado después): home 200 con `<html lang="es-CL">`, `<meta name="robots" content="noindex, nofollow">`, cabecera `X-Robots-Tag: noindex, nofollow`; robots.txt = `User-Agent: *` + `Disallow: /`; sitemap vacío; ruta inexistente = 404 con noindex.
- `.env`, `.next` y `node_modules` ignorados por git.

## Sin verificar
- Conexión real a Firebase (no hay config web de ningún proyecto) ni a emuladores (D-026: no se levantaron). El código del cliente solo pasó tipos y lint.
- Comportamiento con `SITE_INDEXABLE=true` (solo cubierto por test unitario, no por build/curl).
- App Check con clave real; Lighthouse; la fuente Inter en el despliegue de App Hosting.
- Canonical del layout con `SITE_URL` no definida usa `http://localhost:3000`.

## Pendiente / pedidos al tech-lead
- Pendiente de 2C.2: `/api/revalidate` (contrato 8.2), páginas, JSON-LD, `apphosting.yaml` (lo define quien corresponda), Admin SDK server-only.
- A firebase-architect: la configuración web de los proyectos `nutraelementsdev` y `nutraelements` (nombres de las 6 variables `NEXT_PUBLIC_FIREBASE_*`, valores por entorno en `.env.local` o `apphosting.yaml`); confirmar proveedor de App Check (Enterprise o v3) y registrar la clave; confirmar que el emulador de Functions use la región us-east4 para los callables; y que `REVALIDATE_SECRET` sea el mismo valor en Functions y Next.
- Decisión del tech-lead: tokens de diseño definitivos y `cacheComponents`.
- Nota: `next dev` reescribe un bloque en AGENTS.md (plantilla de Next 16) y no se ejecutó; conviene decidir si se acepta ese bloque.
