# PLAN — Nutra Elements

Estados: pendiente · en curso · en revisión · hecha · bloqueada

## Fase 0 — Preparación del proyecto

| # | Tarea | Dueño | Terminado cuando | Depende de | Estado |
|---|-------|-------|------------------|------------|--------|
| 0.1 | Revisar coherencia de CLAUDE.md y AGENTS.md con el Stack B | tech-lead | Observaciones entregadas a Carlos | — | hecha |
| 0.2 | Crear docs/team (PLAN, DECISIONS, contracts, contracts/seo, handoffs) | tech-lead | Estructura creada | — | hecha |
| 0.3 | git init con main y develop, .gitignore, commit inicial | devops | `git branch` muestra main y develop; .gitignore excluye .env, node_modules, builds y archivos locales de Firebase | 0.2 | en curso |
| 0.4 | Crear Proyectos/nutra-elements/ en la bóveda | organizador | Existen _resumen.md, decisiones/ y aprendizajes/ | — | en curso |
| 0.5 | Verificar firebase-tools y gh con sesión iniciada | tech-lead / Carlos | `firebase login:list` y `gh auth status` OK; se ven nutra-elements-dev y nutra-elements-prod | Carlos instala y hace login | bloqueada (no instalados) |
| 0.6 | Crear .firebaserc con alias dev y prod | devops | Alias dev → nutra-elements-dev, prod → nutra-elements-prod | 0.5 | pendiente |

## Fase 1 — Descubrimiento (sin código)

| # | Tarea | Dueño | Terminado cuando | Depende de | Estado |
|---|-------|-------|------------------|------------|--------|
| 1.1 | Preguntas de negocio a Carlos | tech-lead | Carlos respondió | — | en curso |
| 1.2 | Propuesta de alcance del MVP y lo que queda para después | tech-lead | Carlos lo aprueba | 1.1 | pendiente |
| 1.3 | Recomendación Firestore vs Data Connect (pedidos, stock, inventario) | firebase-architect | Handoff con recomendación y porqué | 1.1 | pendiente |
| 1.4 | Primera propuesta de palabras clave y prioridades SEO | seo-specialist | Documento en contracts/seo/ | 1.1 y agente cargado en la sesión | pendiente |
| 1.5 | Plan del MVP por fases en este archivo y decisiones en DECISIONS.md | tech-lead | Carlos lo aprueba | 1.2, 1.3, 1.4 | pendiente |
