# Handoff devops: rollout de nutra-web en prod (2026-10-20)

## Qué hice (autorizado por D-030 y D-031)
1. `apphosting:backends:list`: `nutra-web` existe en `nutraelements`, us-east4, repo `PardoDeveloper-e-commerce_nutra_elements`, runtime nodejs24. URL: https://nutra-web--nutraelements.us-east4.hosted.app
2. `firebase apphosting:secrets:grantaccess REVALIDATE_SECRET --backend nutra-web --project nutraelements`: OK ("Successfully set IAM bindings"). El valor del secreto no se leyó ni se imprimió.
3. `firebase apphosting:rollouts:create nutra-web --git-branch main --force --project nutraelements`: rollout creado desde el commit 888c7a3 (merge del PR #1). Un solo intento. El sitio respondió 200 a los pocos minutos. No tuve el estado formal del rollout: la CLI no tiene `rollouts:list` y no hay gcloud instalado. Confírmalo en https://console.firebase.google.com/project/nutraelements/apphosting
4. Pruebas de humo (solo lectura) sobre la URL.

## Resultados del humo
- `/`: 200, cabecera `X-Robots-Tag: noindex, nofollow` y meta `robots` noindex, nofollow. OK
- `/robots.txt`: `User-Agent: *` / `Disallow: /`. OK
- `/sitemap.xml`: 200, urlset vacío. OK
- `/productos`, `/carrito`, `/checkout`, `/admin/login`: 200. `/productos` no lista ningún producto (catálogo aún sin cargar), esperado.
- `/admin/login`: sin "Modo demostración" (0 coincidencias de "demostraci"). OK
- `/api/demo-catalog`: 404. OK
- `/productos/no-existe`: 404. OK
- API REST de Firestore sin credenciales: `orders` 403 y `settings/private` 403. OK

## No hice
Nada de Functions, Firestore, Storage, Auth, git ni cambios en apphosting.yaml. No hubo errores de sintaxis de apphosting.yaml en este build.

## Reversa de un rollout en App Hosting
- Consola Firebase > App Hosting > nutra-web > pestaña de rollouts/despliegues: elegir un rollout anterior correcto y usar "Rollback" (reactiva ese build sin recompilar).
- Por CLI: `firebase apphosting:rollouts:create nutra-web --git-commit <sha-bueno> --project nutraelements`.
- Nota: aún no existe un rollout anterior bueno (este es el primero exitoso). Hasta tener otro, la reversa sería desactivar tráfico o redeploy de un commit previo.

## Para el tech-lead
- Pendiente de confirmar en consola que el rollout figura como exitoso.
- Prod sigue en modo staging (noindex, Flow sandbox, sin dominio, D-021). Antes del lanzamiento hay que quitar noindex y verificarlo.
- Sin commit hecho.
