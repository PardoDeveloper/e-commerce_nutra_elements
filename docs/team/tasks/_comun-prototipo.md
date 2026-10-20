# Reglas comunes del prototipo (P2, P3, P4) — D-028

- Proyecto: e-commerce de suplementos para Chile (es-CL). Next.js 16 App Router, TypeScript estricto. Repo público.
- Código en inglés; comentarios y textos en español.
- Lee antes de empezar:
  - docs/team/DECISIONS.md: D-005, D-014, D-022, D-023, D-024, D-025, D-027 y **D-028**.
  - El handoff de la base: docs/team/handoffs/2026-10-14-nextjs-frontend-p1-base-prototipo.md. Ahí están `@/lib/data`, `useCart`/`cartActions`/`toOrderItems`, los componentes y los tokens. Úsalos; no los dupliques.
- Las páginas importan datos solo desde `@/lib/data` (desde el servidor). `<main>` no trae contenedor: envuelve el contenido en `<Container>`.
- Tres agentes trabajan **en paralelo**. Solo edita tus archivos. Si necesitas cambiar algo compartido (componentes existentes, `globals.css`, `layout.tsx`, `src/lib/data`, `src/lib/cart`), que sea un cambio mínimo y aditivo, y repórtalo en el handoff. Estilos en CSS Modules propios.
- No toques `functions/`, `docs/team/contracts/`, AGENTS.md ni `.env*`. No hay dependencias nuevas, salvo la excepción indicada en P4.
- Sin git, sin Firebase real, sin emuladores y sin deploy. **No ejecutes `next dev`**, porque reescribe AGENTS.md; usa `npm run build` y `next start -p <puerto libre>`, y ciérralo al terminar.
- Contenido: **prohibido** atribuir a los suplementos propiedades de curar, tratar o prevenir enfermedades (normativa chilena). Nada de reseñas ni valoraciones inventadas.
- **Si encuentras archivos parciales en tus carpetas** (un intento anterior se cortó), revísalos y reutilízalos o reemplázalos.
- **Trabaja de forma incremental:** deja el build en verde después de cada pantalla importante, para que un corte no deje el proyecto roto.
- Verificación final: `npm run lint`, `npm test` y `npm run build` en verde. Además, las comprobaciones con curl de tu tarea.
