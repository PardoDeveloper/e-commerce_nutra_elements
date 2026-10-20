# P2 — Tienda pública con SEO (nextjs-frontend)

Lee primero `_comun-prototipo.md` y los contratos de docs/team/contracts/seo/ (00 a 06): son la fuente de verdad de title, description, H1, canonical, breadcrumbs, JSON-LD y enlazado interno.

## Páginas
Todas estáticas o con ISR (`revalidate` de 3600 s) y `generateStaticParams`.
1. `/` (home): hero con CTA, las 6 categorías, destacados y beneficios (retiro en Puente Alto, despacho en la RM a $3.990, Flow o transferencia). JSON-LD Organization y WebSite, sin teléfono, correo, redes ni logo (D-023).
2. `/productos`: catálogo con filtro por categoría y `?q=`, sin paginación. La búsqueda no debe romper el ISR del catálogo base.
3. `/categorias/[slug]`: las 6 categorías, con intro, productos, breadcrumbs y las reglas de indexación del contrato 03.
4. `/productos/[slug]` (prioridad máxima):
   - Contenido: imagen (`ProductImage`), nombre, precio y descuento, disponible o agotado, cantidad con `AddToCartButton`, descripción, relacionados y enlaces a las otras presentaciones de la familia.
   - JSON-LD: Product con precio en CLP, `availability` y `sku`; `gtin` solo si es válido; **sin `aggregateRating` ni `review`**. Además, BreadcrumbList.
5. `/nosotros`; `/contacto` (dirección, horario y enlace a Google Maps; el formulario solo muestra "Prototipo"); y `/preguntas-frecuentes` con JSON-LD FAQPage (despacho en la RM, retiro, Flow y transferencia, número NE-xxxxxx, cambios).
6. `/terminos`, `/privacidad` y `/cambios-y-devoluciones`: borradores para Chile, con el aviso "Borrador: pendiente de revisión legal".
7. `sitemap.ts` con todas las rutas públicas, respetando `SITE_INDEXABLE`.
- Línea Ultra, cranberry, melena de león y cúrcuma: solo descripción neutra.

## Tus archivos
`src/app/page.tsx`, `src/app/{productos,categorias,nosotros,contacto,preguntas-frecuentes,terminos,privacidad,cambios-y-devoluciones}/**`, `src/app/sitemap.ts`, `src/components/store/**` y `src/lib/seo/**`.

## Terminado cuando
- Lint, test y build en verde; pega la tabla de rutas.
- curl con `next start` devuelve 200 en todas las páginas.
- El JSON-LD Product de una ficha se parsea con node y no trae `aggregateRating`.
- Hay FAQPage en las preguntas frecuentes y cada página tiene un solo H1 y canonical.
- Hiciste grep de "cura|trata|previene|enfermedad|sana" en tus textos y lo revisaste.
- Handoff: docs/team/handoffs/2026-10-15-nextjs-frontend-p2-tienda.md, con el cumplimiento de cada contrato SEO y lo que quedó sin verificar.
