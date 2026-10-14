# DECISIONS — Nutra Elements

Formato: fecha · decisión · alternativas consideradas · por qué.

## D-001 · 2026-10-14 · Carpeta del proyecto
- **Decisión:** el proyecto vive en `C:\Workspace\E-Commerce NutraElements`.
- **Alternativas:** `C:\Workspace\nutra-elements-app` (plantilla de app de Shopify, con su propio git).
- **Por qué:** es la única carpeta cuyo CLAUDE.md declara `Proyecto: nutra-elements` y `Stack: B`. La plantilla de Shopify no forma parte de este proyecto, salvo que Carlos diga lo contrario.

## D-002 · 2026-10-14 · Stack B
- **Decisión:** Stack B (Next.js + Firebase), con el equipo firebase-architect, nextjs-frontend, seo-specialist, qa-reviewer, devops y organizador.
- **Alternativas:** Stack A (Angular + Go + PostgreSQL).
- **Por qué:** está declarado en CLAUDE.md, y el SEO es un requisito central, lo que favorece a Next.js con SSR/SSG.

## Pendientes de decidir
- Firestore o Data Connect para pedidos, stock e inventario (firebase-architect, tarea 1.3).
- Pasarela de pago: la descripción del negocio dice **Flow**, pero la sección Stack del AGENTS.md todavía tiene el texto de ejemplo "Webpay o Mercado Pago". Hay que confirmarlo con Carlos.
