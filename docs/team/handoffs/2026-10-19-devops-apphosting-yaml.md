# devops: apphosting.yaml (corrección B-1.1 de QA), 2026-10-19

## Qué hice
- Creé `apphosting.yaml` en la raíz. No desplegué nada, no creé backends, no usé git.
- Validé que el YAML parsea con node (9 variables y `runConfig` correcto).
- Obtuve la configuración web con `firebase apps:sdkconfig web 1:48808849043:web:f3249fc13c0b0cf86b6766 --project prod`. Son identificadores públicos; no hay secretos en el archivo.

## Contenido
- `runConfig`: `minInstances: 0`, `maxInstances: 2`. La región NO va en el yaml: se fija al crear el backend y no se puede cambiar después.
- `DATA_SOURCE=firebase` (BUILD y RUNTIME): corrige la parte (1) de B-1.
- `SITE_INDEXABLE="false"` (BUILD y RUNTIME): noindex de prelanzamiento (D-021, D-023).
- `REVALIDATE_SECRET`: `secret: REVALIDATE_SECRET` (RUNTIME).
- `NEXT_PUBLIC_FIREBASE_*` de prod (6 variables, BUILD y RUNTIME). El código las lee directamente de `process.env` y no usa `FIREBASE_WEBAPP_CONFIG` (verificado con grep en `src`), por eso van explícitas. Next.js las incrusta en el cliente, por eso necesitan BUILD.
- `SITE_URL`: comentada con placeholder. No es obligatoria; si falta, `src/lib/site.ts` aplica su valor por defecto, así que conviene fijarla pronto.
- `NEXT_PUBLIC_APPCHECK_SITE_KEY`: comentada, pendiente de que Carlos entregue la clave.
- No incluí `DEMO_PERSISTENCE` ni `DEMO_FREE_SHIPPING_THRESHOLD`.

## Advertencia sobre la verificación
No tuve acceso web en esta sesión: la sintaxis (`runConfig`, `env` con `variable/value/secret/availability`) sale de mi conocimiento de la documentación de App Hosting y NO la contrasté con la documentación en línea. La primera creación del rollout la validará; conviene revisarla antes de aplicar.

## Pendiente para cerrar B-1 (no es mío)
- Partes (2) y (3) de B-1 (fallar cerrado si hay `K_SERVICE` o `FIREBASE_CONFIG`, y unificar la comparación de `DATA_SOURCE`) y B-2 son código de la aplicación: pedir a nextjs-frontend vía tech-lead.

## Pasos para crear el backend (requieren confirmación de Carlos; toca prod)
1. Crear el secreto si no existe: `firebase apphosting:secrets:set REVALIDATE_SECRET --project prod` (mismo valor que usan las Functions).
2. Crear el backend: `firebase apphosting:backends:create --project prod --location us-east4`. En el asistente: conectar el repo `PardoDeveloper/e-commerce_nutra_elements`, rama en vivo `main`, directorio raíz `/`.
3. Dar acceso al secreto: `firebase apphosting:secrets:grantaccess REVALIDATE_SECRET --backend <backend> --project prod`.
4. Con la URL del backend, descomentar y completar `SITE_URL` en `apphosting.yaml` (PR a develop y luego a main) y apuntar las Functions a la misma URL para `/api/revalidate`.
5. Cuando Carlos entregue la clave de App Check, descomentar `NEXT_PUBLIC_APPCHECK_SITE_KEY`.
6. Tras el primer rollout, verificar: `X-Robots-Tag: noindex`, `/robots.txt` bloqueando todo, `/api/demo-*` responde 404 y `DATA_SOURCE=firebase` efectivo.

## Cómo revertir
Es un archivo nuevo sin versionar aún: borrarlo o `git revert` del commit que lo incluya. Si ya hay backend, hacer rollback del rollout desde la consola de App Hosting.

## Qué necesito del tech-lead
- Que nextjs-frontend haga las partes (2) y (3) de B-1 y B-2 antes de crear el backend.
- Confirmación de Carlos para los pasos de creación del backend y la clave de App Check.
