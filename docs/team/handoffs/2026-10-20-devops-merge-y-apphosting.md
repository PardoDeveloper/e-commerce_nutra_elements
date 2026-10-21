# devops: merge del PR #1 y backend de App Hosting, 2026-10-20

## Hecho
- Verificado: PR #1 abierto, MERGEABLE/CLEAN; `develop` y `origin/develop` en 8f48166.
- `gh pr merge 1 --merge` -> estado MERGED. Hash del merge commit en main: `888c7a389beb977f3c70ac59d4f650166808815c`.
- Herramientas: firebase 15.34.0, sesión Firebase y gh activas. El repo es público (`private: false`).
- Secreto `REVALIDATE_SECRET` existe en nutraelements (versión 1, ENABLED).
- `firebase apphosting:backends:list --project nutraelements`: no hay backends.

## Bloqueado: creación del backend
`firebase apphosting:backends:create --help` ofrece solo `--app`, `--backend`, `--primary-region`, `--root-dir`, `--service-account`, `--runtime`. No hay opción para repositorio ni rama en vivo: la conexión GitHub (Developer Connect) solo se hace en el asistente interactivo con autorización en navegador. No lo ejecuté (sin repo se crearía un backend permanente sin conexión, contrario a lo autorizado). No se creó nada, no se dio acceso al secreto y no se hicieron pruebas de humo (no hay URL).

## Pasos para Carlos (su terminal, en la raíz del repo)
1. `firebase apphosting:backends:create --project nutraelements --location us-east4`
2. Respuestas del asistente: región `us-east4`; conectar GitHub (autorizar en el navegador la app de Developer Connect/Firebase si lo pide) y elegir el repo `PardoDeveloper/e-commerce_nutra_elements`; directorio raíz `/`; rama en vivo `main`; rollouts automáticos: sí; backend ID `nutra-web`; asociar la app web `1:48808849043:web:f3249fc13c0b0cf86b6766` (nutra-web).
3. Avisar al devops; él continúa con:
   - `firebase apphosting:secrets:grantaccess REVALIDATE_SECRET --backend nutra-web --project nutraelements`
   - esperar el primer rollout, obtener la URL con `firebase apphosting:backends:get nutra-web --project nutraelements --location us-east4`
   - pruebas de humo (noindex, robots, /admin/login sin "Modo demostración", /api/demo-* 404, /carrito y /checkout noindex, 403 en orders y settings/private).

Nota: el primer rollout puede fallar si el secreto aún no tiene acceso concedido; en ese caso, tras el grantaccess, relanzar el rollout desde la consola.

## Sintaxis de apphosting.yaml
Sin cambios. El `--help` no cubre el esquema del YAML y no tuve acceso a la documentación en línea; sigue sin contrastarse y lo validará el primer rollout. Después, `SITE_URL` deberá fijarse con la URL real (cambio propuesto, no hecho).

## Reversa
- Merge: `git revert -m 1 888c7a3` mediante PR (no push directo a main).
- Backend (cuando exista): `firebase apphosting:backends:delete nutra-web --project nutraelements --location us-east4` (destructivo, con confirmación) o rollback del rollout desde la consola.
