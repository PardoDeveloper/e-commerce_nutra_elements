# Handoff devops: merge del PR #3 (banner del hero)

Fecha: 2026-10-21

## Merge
- PR #3 (develop a main): MERGED a las 19:47:53Z. Ya estaba mergeado cuando devops empezó (lo hizo Carlos); devops no repitió el merge.
- Hash del merge commit en main: 4f921ff6d65b211f26761770fb6e835457d0e21e
- Archivos: DECISIONS.md, handoff del banner, public/banner.jpeg, src/app/page.tsx, store.module.css (los esperados).

## Rollout
- App Hosting nutraelements/us-east4/nutra-web: disparado automáticamente por el push a main, completado con éxito (~3 min). No hizo falta crearlo a mano.
- Aviso: el check "App Hosting - Rollout (nutraelementsprod/us-east4/backend-123)" figura en failure. Es el proyecto sin uso (D-030); no se tocó.

## Humo (solo lectura) sobre https://nutra-web--nutraelements.us-east4.hosted.app
- / : 200, X-Robots-Tag "noindex, nofollow" y meta robots noindex. OK
- Un solo <h1>. OK
- Un solo enlace "Ver catálogo" (a /productos) en el hero. OK
- Banner: <img src="/banner.jpeg"> con preload; /banner.jpeg responde 200 image/jpeg. OK
- /robots.txt: "Disallow: /". OK
- /admin/login: 200, sin "Modo demostración". OK
- /api/demo-catalog: 404. OK
- /_next/image?url=%2Fbanner.jpeg&w=1920&q=75: 404 text/html (también con w=1200/1080/2048). NO CUMPLE lo esperado: el banner se sirve directo, sin optimizar (sin webp/avif).

## Pedido al tech-lead
- Revisar por qué /_next/image devuelve 404 (en App Hosting o por config del componente de imagen) y si el banner debe optimizarse. Peso del archivo original en public/banner.jpeg: ver `ls -l`. Devops no modifica código.

## Reversa
- Opción 1 (preferida, por PR): `git revert -m 1 4f921ff` en una rama fix/ y PR a main; App Hosting redespliega.
- Opción 2 (rápida): en Firebase Console, App Hosting > nutra-web > Rollouts, redesplegar el rollout previo (commit 62a0b62's predecesor en main). Requiere confirmación de Carlos.
