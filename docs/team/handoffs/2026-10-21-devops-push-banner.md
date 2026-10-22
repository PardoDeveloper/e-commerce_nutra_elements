# Handoff devops: push del banner de la home (2026-10-21)

## Qué hice
Con la autorización de Carlos ("Hace el push"; D-030 y D-034): commit, push a develop y PR a main. No hice merge.

## Commits (rama develop)
- 9c2098a feat(web): usar banner.jpeg en el hero de la home con botón Ver catálogo (page.tsx, store.module.css, public/banner.jpeg)
- 62a0b62 docs: registrar D-034 y handoff del banner (DECISIONS.md y handoff de nextjs-frontend)

## PR
https://github.com/PardoDeveloper/e-commerce_nutra_elements/pull/3 (develop a main). Abierto, sin merge. El merge publica el sitio: requiere confirmación aparte de Carlos.

## Verificaciones
- npm run lint sin errores; npm test: 313 pruebas en verde.
- Escaneo de secretos de lo staged: solo prosa y nombres, sin credenciales.
- develop y origin/develop apuntan al mismo hash.

## Dejado fuera
- img/ (logos originales, sin versionar a propósito).
- No se desplegó nada: pedidos y pagos, Functions, reglas y datos siguen sin desplegar.

## Reversa
Antes del merge: cerrar el PR. Después: git revert de 9c2098a y 62a0b62 (o del merge) mediante PR y nuevo rollout de App Hosting, con confirmación de Carlos.

## Necesito del tech-lead
Que pida a Carlos la confirmación para el merge y el rollout cuando corresponda.
