# Handoff nextjs-frontend: P2 tienda pública con SEO (D-028)

Fecha: 2026-10-15. Estado: terminado, pendiente de revisión. Sin git, sin Firebase, sin emuladores. No se ejecutó `next dev` (AGENTS.md sin cambios).

## Qué se construyó
- Páginas (todas estáticas con `revalidate = 3600`; fichas y categorías con `generateStaticParams` y `dynamicParams`): `/`, `/productos`, `/categorias/[slug]` (6), `/productos/[slug]` (33), `/nosotros`, `/contacto`, `/preguntas-frecuentes`, `/terminos`, `/privacidad`, `/cambios-y-devoluciones` (con el aviso "Borrador: pendiente de revisión legal").
- `src/app/sitemap.ts`: ocho rutas fijas, categorías con 3 o más productos y las fichas. Vacío si `SITE_INDEXABLE` no es `"true"` (47 URL con el interruptor en true).
- `src/lib/seo/`: `metadata.ts` (`pageMetadata`, `robotsFor`, `absoluteUrl`, `displayName`, plantillas), `jsonld.ts` (Organization, WebSite, BreadcrumbList, CollectionPage, Product y Offer, validación GTIN-13), `content.ts` (textos de categorías, FAQ, dirección), `seo.test.ts` (6 tests).
- `src/components/store/`: `JsonLd`, `ProductPurchase` (cliente: cantidad más `AddToCartButton`), `CatalogBrowser` (cliente: filtro y `?q=`), `LegalPage`, `store.module.css`.
- Cambios en archivos compartidos: ninguno.

## Decisiones
- Búsqueda sin romper el ISR: `/productos` no lee `searchParams`. El HTML estático trae el catálogo completo agrupado por categoría. `CatalogBrowser` (Suspense más `useSearchParams`) reemplaza esa vista por los resultados cuando la URL trae `?q=` o `?categoria=`. El buscador del header (GET `/productos?q=`) funciona sin JS en el sentido de que carga la página, pero el filtrado necesita JS.
- Nombre para mostrar: los datos traen "Citrato de Magnesio x 120 cápsulas". Las páginas nuevas usan `displayName()` (sin la "x") en H1, title y migas, como pide el contrato 04. `ProductCard`, que es de la base, sigue mostrando `product.name` con la "x".
- La ficha omite `image` en el JSON-LD mientras no haya imágenes reales con URL absoluta (no se usan placeholders). `gtin13` no se emite, porque la capa pública no expone `barcode`. `shippingDetails` sí se emite, con la tarifa de `getPublicSettings`.
- Organization sin `logo` (D-023), aunque `public/brand/` ya tiene logos. Para añadirlo basta una línea en `organizationNode()`, si Carlos lo aprueba.
- Textos de producto: se usa la descripción neutra derivada del nombre, más "suplemento alimentario" y una advertencia genérica. Ultra, cranberry, melena de león y cúrcuma solo llevan descripción neutra. Revisar el grep de textos: la única coincidencia de "trata" es "Por tratarse de suplementos alimentarios..." (cambios y devoluciones), que no es una declaración de salud.
- Las intros de categoría (contrato 03) son texto estático escrito por mí en `content.ts`; deben pasar por revisión de Carlos o de un profesional, igual que las páginas legales (borradores míos, no asesoría legal). La regla "productos abiertos no admiten devolución" en cambios y devoluciones es una suposición mía y debe confirmarla Carlos.

## Cumplimiento de los contratos SEO
- 01 Inicio: title (58) y description (133) exactos; un H1 "Suplementos en cápsulas de marca propia"; H2 de categorías, destacados (8), despacho y retiro, y por qué Nutra Elements; Organization y WebSite en `@graph`, sin BreadcrumbList; enlaces a 6 categorías, catálogo, nosotros, contacto y FAQ. Sin hero con imagen, así que no hay imagen LCP.
- 02 Catálogo: title (52) y description (143, con n=33) según plantilla; 33 enlaces a fichas en el HTML; H2 por categoría con enlace "Ver ...", BreadcrumbList y CollectionPage con ItemList en el orden visible. Los agotados siguen listados.
- 03 Categoría: title y description por slug exactos; H1, intro de servidor, H2 de productos, formatos, despacho y retiro; "Ver también" (3); 404 real si el slug no existe o no tiene productos; `noindex,follow` y fuera del sitemap si hay menos de 3 productos. Ninguna categoría actual cae bajo ese umbral (minerales tiene 3).
- 04 Ficha: title `{Nombre} {N} cápsulas | Nutra Elements`, description de plantilla (sin precio), canonical autorreferente, Product con Offer (CLP, `availability`, `sku`, `brand`, `itemCondition`) y BreadcrumbList, sin `aggregateRating` ni `review`; H2 de descripción, información, modo de uso, otros formatos (familia, máx. 6), despacho y relacionados; sin sección "Beneficios". Verificado que el precio y la disponibilidad del JSON-LD salen del mismo dato que el HTML y que la ficha agotada sigue en 200 con OutOfStock.
- 05 Institucionales: nosotros (AboutPage), contacto (Store con la dirección y el horario confirmados, sin teléfono, correo, redes ni geo) y FAQ (FAQPage generado del mismo arreglo que las respuestas visibles en `<details>`), cada una con BreadcrumbList.
- 06 Global: canonical absoluto desde `SITE_URL`; robots por entorno (`noindex, nofollow` meta más cabecera existente de `next.config`); `lang="es-CL"` del layout; `og:locale`, `og:type`, `og:url`, `og:title` y `og:description`; `twitter:card`. Un solo H1 por página (verificado con curl).

## Verificación (ejecutada)
- `npm run lint` sin problemas (proyecto completo), `npm test` 15 archivos y 171 tests en verde, `npm run build` OK.
- `next start`: 200 en las 19 URL probadas (home, catálogo, `?q=magnesio`, 6 categorías, 2 fichas, 6 institucionales/legales, sitemap, robots); 404 en `/categorias/nada` y `/productos/no-existe`.
- Con `SITE_INDEXABLE=true` y `SITE_URL=https://nutraelements.cl`: robots `index, follow, max-image-preview:large`, canonical al dominio final, sin `X-Robots-Tag`, robots.txt con `Allow` y `Sitemap`, y 47 URL en el sitemap. Después se reconstruyó con el valor por defecto.

## Sin verificar o con limitaciones
- Lighthouse, Core Web Vitals y la Prueba de resultados enriquecidos (solo se parseó el JSON-LD con node). Navegador: el filtro y `?q=`, el selector de cantidad y el aspecto a 360, 768 y 1280 px no se probaron de forma interactiva.
- `?q=` y `?categoria=` en cliente: la `noindex,follow` se añade con una `<meta name="robots">` renderizada en el cliente y la canonical queda en `/productos`. No hay forma de variar la metadata por query en una página estática. Para cubrirlo en el servidor hace falta una regla `headers()` con `has: query` en `next.config.ts` (lo toca otro agente). Se pide al tech-lead.
- La canonical de la home sale sin barra final (`https://nutraelements.cl`), porque Next normaliza el origen; es equivalente.
- Sin imágenes: `og:image`, `image` del Product y fotos reales quedan PENDIENTE (imágenes de producto, imagen de marca 1200x630, foto de la tienda).
- Dos builds simultáneos de agentes distintos en el mismo `.next` pueden fallar de forma intermitente; me ocurrió una vez y se resolvió al repetir.

## Pedidos al tech-lead
- Regla `X-Robots-Tag` por query en `next.config.ts` para `/productos?q=` y `?categoria=` (ver arriba).
- Confirmar con Carlos: logo en Organization, textos de las categorías, cambios y devoluciones (productos abiertos), y revisión legal de los tres borradores.
- Cuando exista Firestore: `Product.barcode` (para `gtin13`), `updatedAt` (para `lastModified` del sitemap) y URL absolutas de imágenes.
