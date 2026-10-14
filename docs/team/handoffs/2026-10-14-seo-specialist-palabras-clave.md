# Handoff - seo-specialist - Tarea 1.4 (2026-10-14)

## Qué hice
- Leí AGENTS.md, DESCUBRIMIENTO.md y PLAN.md.
- Investigué con WebSearch (whey y creatina en Chile; normativa de suplementos). Resultados: dominan Lider, Falabella, Paris y Mercado Libre; la herramienta no está geolocalizada a Chile, es una muestra orientativa.
- Escribí `docs/team/contracts/seo/00-palabras-clave-y-prioridades.md` (borrador, todo preliminar): clusters por intención, mapa palabra clave a URL sin canibalización, prioridades para una semana, tratamiento de valoraciones, guía de cumplimiento, slugs y 10 ideas de blog.

## Archivos
- Creado: `docs/team/contracts/seo/00-palabras-clave-y-prioridades.md`
- Creado: este handoff.
- No toqué código, git, AGENTS.md, CLAUDE.md, PLAN.md, DECISIONS.md ni DESCUBRIMIENTO.md.

## Decisiones propuestas (requieren aprobación del tech-lead)
1. Sin volúmenes de búsqueda reales: prioridades cualitativas. Estrategia inicial: marca + productos específicos + términos locales RM, no genéricos contra retailers.
2. **No emitir aggregateRating/review hasta tener reseñas reales y visibles.** Sugiero ajustar AGENTS.md ("valoraciones solo cuando existan reseñas reales"). Reseñas como fase posterior.
3. noindex en `/carrito`, `/checkout`, `/cuenta`, `/admin` mediante meta robots (no depender solo de Disallow en robots.txt). Dev bloqueado por completo.
4. Blog y contenido largo después del día uno; no indexar un `/blog` vacío.
5. Categorías con menos de 3 productos: evaluar noindex o fusionar (según planilla).

## Qué necesito de otros
- **tech-lead / Carlos**: planilla `productos_nutra_elements.xlsx`; dirección, comuna y horario del retiro en tienda, teléfono y correo (LocalBusiness); redes sociales y logo; acceso al DNS para verificar Search Console; decisión sobre reseñas; política de devoluciones/envío publicada; monto de envío gratis.
- **Carlos / profesional**: revisión sanitaria o legal de los textos. No pude confirmar el texto vigente del Reglamento Sanitario de los Alimentos (art. 114 y modificaciones); el documento no es asesoría legal.
- **firebase-architect**: campos del producto para slug único y estable, meta title/description opcionales, imágenes con alt y dimensiones, promedio y conteo de reseñas (futuro), estado agotado/descontinuado sin romper URL.
- **nextjs-frontend**: implementar los requisitos del apartado 4 del documento cuando el tech-lead lo apruebe; luego auditaré.

## Limitaciones
- No pude revisar tiendas especializadas chilenas de suplementos a fondo; pendiente antes de cerrar prioridades.
- Sin acceso a datos de volumen. Recalibrar con Search Console tras el lanzamiento.
