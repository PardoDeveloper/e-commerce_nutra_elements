# Handoff devops - Tareas 0.7 y 0.8: .firebaserc, .gitattributes y primer push (2026-10-14)

## Que hice
- Cree `.firebaserc` (default y dev = nutraelementsdev, prod = nutraelements), `.gitattributes` (LF + binarios) y agregue la seccion "Datos del negocio (D-017)" al `.gitignore` (`*.xls`, `*.xlsx`, `*.csv`).
- Commits en develop: `1a927b7` (chore: config firebase/gitattributes/exclusion de datos) y `600d02b` (docs: descubrimiento, decisiones y plan). Agregados uno por uno, sin `git add -A`.
- Escaneo de secretos del historial completo antes del push: limpio (sin FLOW_*_KEY con valor, sin ghp_/AIza/-----BEGIN/private_key; los unicos hex de 40 son hashes de commit). `git ls-files` solo incluye `.env.example`; ningun .xls/.xlsx/.csv versionado.
- Remoto `origin` agregado; `gh auth setup-git` ejecutado. main avanzo por fast-forward a develop; push de main y develop con `-u`, sin force.
- Repo queda en develop.

## Archivos cambiados
`.firebaserc`, `.gitattributes`, `.gitignore`, `.env.example`, `AGENTS.md`, docs/team (PLAN, DECISIONS, DESCUBRIMIENTO, contrato SEO, 3 handoffs) y este handoff.

## Decisiones / notas
- El archivo real en la raiz se llama `productos_nutra_elements.xls` (no `.xlsx.xls`); queda ignorado por `*.xls`.
- Aviso de git: AGENTS.md tenia CRLF y se normaliza a LF al commitear (esperado por D-003).
- No se desplego nada en Firebase, no se toco proteccion de ramas ni visibilidad.

## Necesito de otros
- Del tech-lead: el handoff nuevo de firebase-architect (en paralelo) no se incluyo; commitearlo despues. Pendiente decidir proteccion de ramas main/develop y crear los workflows de Actions cuando haya codigo. Recordar que el repo es publico: revisar secretos antes de cada push.

## Como revertir
`git revert 600d02b 1a927b7` en develop via PR. El remoto no se debe reescribir con force.
