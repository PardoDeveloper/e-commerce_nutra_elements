# QA: despliegue a staging en prod (qa-reviewer, 2026-10-19)

Volcado por el tech-lead: qa-reviewer no tiene herramienta de escritura.

## Veredicto
- **Cloud Functions** (`catalog`, `admin`, `triggers`, `common`): **APROBADAS**.
- **Frontend en App Hosting:** **RECHAZADO** hasta corregir B-1 y B-2.

Evidencia: en la raíz, lint OK, 294 tests y build OK. En `functions/`, build, lint, 441 tests y typecheck:rules OK. Sin secretos versionables (los `.env*`, `.demo-data` y `*.xls` están ignorados).

## Bloqueantes
- **B-1:** no existe `apphosting.yaml`, y `DATA_SOURCE` falla **abierto** hacia el modo demo (login simulado y catálogo mock). Archivos: `src/lib/data/index.ts:12`, `src/app/admin/layout.tsx:21` y `src/lib/admin/mode.ts:10-12`. Corrección:
  - (1) Crear `apphosting.yaml` con `DATA_SOURCE=firebase` (BUILD y RUNTIME), `REVALIDATE_SECRET` como secreto y `NEXT_PUBLIC_FIREBASE_*`.
  - (2) Fallar cerrado si hay `K_SERVICE` o `FIREBASE_CONFIG`.
  - (3) Unificar la comparación de `DATA_SOURCE`.
- **B-2:** `DEMO_FREE_SHIPPING_THRESHOLD` (`src/lib/checkout/server.ts:17-19`) tiene efecto en cualquier entorno, lo que contradice D-005. Debe ignorarse con firebase o en la nube, y llevar un test.

## Mejoras
1. La edición de contenido de un producto publicado no pasa por las validaciones de publicación (admin de confianza).
2. `claimAdmin` con un token viejo devuelve `alreadyAdmin` (inocuo).
3. Mantener "una cuenta por correo" en Auth.
4. Un import masivo dispara muchos triggers; conviene agruparlos.
5. `DEMO_MODE` debe depender del entorno, y hay que actualizar el comentario de `src/lib/admin/config.ts`.
6. Faltan `npm audit` y `test:rules` (D-031).

## Solo verificable después del deploy
Secretos y parámetros (`REVALIDATE_SECRET`, `SITE_URL` https, `ADMIN_EMAILS`); App Check registrado; flujo real de `claimAdmin`, `grantAdmin` y `revokeAdmin`; transacciones contra Firestore real; `settings/public` sembrado; prueba manual de reglas; trigger a `/api/revalidate` de punta a punta; `/api/demo-*` responde 404 en App Hosting; `X-Robots-Tag: noindex`; `DATA_SOURCE=firebase` efectivo.
