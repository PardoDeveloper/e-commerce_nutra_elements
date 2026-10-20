# Handoff - seo-specialist - Requisitos por página (2026-10-14)

## Qué hice
- Leí AGENTS.md, DESCUBRIMIENTO.md, DECISIONS.md, mi borrador y mi handoff anterior. No abrí `.env` ni el `.xls`.
- Reescribí `contracts/seo/00-palabras-clave-y-prioridades.md` (v2) para el catálogo real: 33 productos en cápsulas, sin proteínas ni creatina.
- Creé los requisitos por página: `01-inicio.md`, `02-catalogo.md`, `03-categoria.md`, `04-ficha-producto.md`, `05-paginas-institucionales.md` y `06-tecnico-global.md` (incluye criterios de aceptación G-01 a G-25).
- No hice búsquedas web nuevas ni validé JSON-LD con herramientas externas: no hay sitio que auditar todavía.

## Decisiones propuestas (requieren aprobación del tech-lead)
1. Seis categorías: `vitaminas`, `magnesio`, `minerales`, `omega-3`, `belleza`, `bienestar`. Magnesio separado de minerales (4 formas químicas). Si `minerales` queda con menos de 3 SKU: noindex o fusionar en `bienestar`.
2. Una ficha por SKU, canonical autorreferente, enlaces cruzados entre tamaños y bloque propio por SKU. Plan B (canonical al tamaño principal) solo si Search Console muestra duplicados.
3. Dos variables: `SITE_URL` y `SITE_INDEXABLE` (por defecto false). En prod antes del lanzamiento todo es noindex + `Disallow: /`; un solo interruptor al lanzar (D-021).
4. robots.txt no bloquea `/carrito` ni `/checkout` (para que se lea el noindex); sí `/admin` y `/api/`.
5. Sin paginación en el MVP (33 SKU en una página). Revalidación de respaldo propuesta: 3600 s.
6. Textos de producto revisados por un profesional antes de publicar; riesgo alto en Ultra Light/Relax/Lax, cranberry, melena de león y cúrcuma. Ultra Lax: validar su situación sanitaria.
7. FAQPage se mantiene por AGENTS.md, aunque Google ya no muestra ese rich result a sitios comerciales.
8. Perfil de Google Business Profile como palanca principal del SEO local (lo crea Carlos o su jefa).

## Qué necesito de otros
- **tech-lead**: actualizar el ejemplo de categorías de AGENTS.md (hoy dice proteínas, creatina); decidir sobre `/retiro-en-tienda` (recomiendo no crearla), `minerales`, y el `revalidate` de respaldo; confirmar el mapeo SKU a categoría tras la importación.
- **Carlos**: teléfono, correo público, redes, logo, fotos reales de producto y tienda, política de devoluciones, monto de envío gratis, confirmar si el punto de retiro atiende público, acceso a DNS y Search Console. Todo esto está como PENDIENTE y no se inventó.
- **firebase-architect**: campos `slug`, `slugHistory`, `familyId`, `category`, `seoTitle`, `seoDescription`, imágenes con alt y dimensiones, `updatedAt`, `published`; revalidación bajo demanda.
- **nextjs-frontend**: implementar 01 a 06; luego audito.
- **devops**: dominio sin `www`, HTTPS, interruptor de lanzamiento con confirmación de Carlos, purga de caché.

## Archivos
Creados o modificados solo en `docs/team/contracts/seo/` (00 reescrito, 01 a 06 nuevos) y este handoff. No toqué código, git, AGENTS.md, PLAN.md, DECISIONS.md ni DESCUBRIMIENTO.md.

## Limitaciones
- Prioridades cualitativas, sin volúmenes de búsqueda.
- Normativa sanitaria sin confirmar en su texto vigente; no es asesoría legal.
- Longitudes de title y description medidas con script en las plantillas; las generadas con datos reales se miden en la auditoría.
- Sin verificar: rich results, TTFB desde Chile, comportamiento del CDN de App Hosting con ISR.
