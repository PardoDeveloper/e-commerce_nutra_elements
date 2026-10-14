# Handoff devops - Tarea 0.3: git init (2026-10-14)

## Que hice
- `git init -b main`; commit inicial en main (f755ba0) con todo lo existente.
- Cree `.gitignore` (Next.js + Firebase + Functions TS, Windows).
- Cree la rama `develop` desde main; el repo queda en `develop`.
- Sin remotos, sin push, sin gh, sin .firebaserc.

## Archivos creados
- `.gitignore`
- `docs/team/handoffs/2026-10-14-devops-git-init.md`

## Decisiones
- `.vscode/*` ignorado, con excepcion de `settings.json` y `extensions.json` (compartibles).
- Agregados extras: `pnpm-debug.log*`, `.vercel/`.
- `.env.*` ignorado con `!.env.example`. `.firebaserc`, `firebase.json`, rules e indexes NO se ignoran. `docs/` y `.claude/` tampoco.
- Git avisa de conversion LF->CRLF (core.autocrlf de Windows); no se cambio. Sugerencia: `.gitattributes` con `* text=auto eol=lf` mas adelante.

## Verificacion
`git check-ignore -v .env node_modules/x .env.example`:
```
.gitignore:2:.env	.env
.gitignore:11:node_modules/	node_modules/x
.gitignore:4:!.env.example	.env.example
```
La tercera linea es la regla de negacion (`!`), es decir `.env.example` NO se ignora. Temporales borrados.

## Necesito de otros
- Del tech-lead: cuando Carlos instale firebase-tools, crear .firebaserc (alias dev/prod); crear el remoto GitHub y gh para poder abrir PRs; decidir si agregar `.gitattributes`.
