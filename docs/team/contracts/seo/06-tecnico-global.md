# SEO 06 - Requisitos técnicos globales

Estado: propuesto, pendiente de aprobación del tech-lead. Autor: seo-specialist. Fecha: 2026-10-14.
Aplica a todas las páginas públicas (01 a 05). Referencias: D-010, D-014, D-021, D-022, AGENTS.md. Stack B: Next.js (App Router) en Firebase App Hosting (`us-east4`).

## 1. Idioma y configuración regional
- `<html lang="es-CL">` en todas las páginas. `og:locale = es_CL`. `inLanguage: "es-CL"` en el JSON-LD de página.
- Moneda: CLP, sin decimales, formato visible `$12.990`. En JSON-LD el precio es número (`12990`).
- hreflang: **no se emite** (un solo idioma y país). No inventar versiones.

## 2. URL base y entornos (D-021)
Una variable de entorno de servidor define el origen del sitio y el modo de indexación; no se escribe fija en el código.

| Variable (propuesta) | Valores |
|---|---|
| `SITE_URL` | `https://nutraelements.cl` en producción lanzada. En staging o local, el origen real de ese entorno (p. ej. `http://localhost:3000`) |
| `SITE_INDEXABLE` | `true` solo en producción lanzada. `false` en todo lo demás (por defecto) |

Matriz:

| Entorno | robots meta y cabecera | robots.txt | sitemap.xml | canonical |
|---|---|---|---|---|
| Local / emuladores (no hay URL de dev) | `noindex, nofollow` | `Disallow: /` | vacío o 404 | al origen local |
| **Producción antes del lanzamiento** (`nutraelements`, sin dominio, Flow sandbox) | `noindex, nofollow` en todas las páginas, **sin excepción** | `Disallow: /` | vacío o 404 | al origen real de ese despliegue |
| **Producción lanzada** (tras la prueba de humo y la confirmación de Carlos) | `index, follow` en las públicas; `noindex` en las privadas | reglas de la sección 4 | completo | `https://nutraelements.cl/...` |

- Se emite `noindex` **tanto** como `<meta name="robots">` (vía `metadata.robots`) como cabecera `X-Robots-Tag: noindex, nofollow` (vía `headers()` en `next.config` o middleware), para cubrir también imágenes y archivos.
- **El cambio a producción lanzada es un único interruptor** (`SITE_INDEXABLE=true`, con `SITE_URL` final) que ejecuta devops con confirmación de Carlos (D-021). Este contrato exige que sea un solo punto de cambio, y que olvidarlo falle de forma segura (quedar en noindex).
- La auditoría de lanzamiento verifica el paso: que el paso del interruptor quite el noindex y el `Disallow: /`, y que el `canonical` apunte al dominio final.
- Mientras `SITE_INDEXABLE=false`, el sitio no debe enviar el sitemap a Search Console.

## 3. Renderizado, ISR y SEO (D-022)
- Páginas públicas = estáticas con ISR (App Router, Server Components): `/`, `/productos`, `/categorias/[slug]`, `/productos/[slug]`, `/nosotros`, `/contacto`, `/preguntas-frecuentes`. `generateStaticParams` para fichas y categorías. El contenido SEO (H1, texto, enlaces, precio, JSON-LD, metadata) debe estar en el HTML de la respuesta, sin depender de JavaScript. Una página pública que solo renderiza en el navegador es **BLOQUEANTE**.
- `generateMetadata` en las páginas dinámicas (fichas y categorías); `metadata` estático en las demás. Las plantillas de title y description de 01 a 05.
- Revalidación bajo demanda cuando el admin cambia un producto, precio, stock o descuento: `revalidatePath`/`revalidateTag` para la ficha, su categoría, `/productos`, la home y el sitemap. La llamada vive en el servidor (Function o Server Action protegida por el claim `admin`), nunca en el cliente sin autenticar.
- Fallback por tiempo: propongo `revalidate = 3600` (1 hora) en fichas y categorías, por si falla una revalidación bajo demanda; el tech-lead lo confirma.
- Consecuencia SEO a vigilar: el precio y el stock del HTML y del JSON-LD pueden retrasarse unos segundos; el cobro lo recalcula el servidor (D-005). El JSON-LD y el HTML visible de una misma versión **no pueden discrepar**: ambos salen del mismo dato en la misma renderización.
- `/carrito`, `/checkout`, `/admin` (y `/cuenta` si existiera): dinámicos, con `noindex`; no entran al sitemap ni a la caché pública del CDN. Evitar que la sesión o `Set-Cookie` impidan cachear las páginas públicas (las públicas no leen cookies ni cabeceras de sesión; si lo hacen, dejan de ser estáticas).
- La caché del CDN de App Hosting (dominio) no debe servir una versión **noindex** del prelanzamiento tras el cambio a producción lanzada. Tras el interruptor, devops purga/redespliega y SEO verifica con `curl` (ver 11).

## 4. robots.txt (`app/robots.ts`)
Producción lanzada:
```
User-agent: *
Allow: /
Disallow: /admin/
Disallow: /api/

Sitemap: https://nutraelements.cl/sitemap.xml
```
- No poner `Disallow` en `/carrito`, `/checkout` ni `/cuenta`: bloquear en robots.txt impide que Google lea el `noindex` de esas páginas. Su exclusión se hace con `noindex` (sección 5). `/admin` y `/api/` sí se bloquean (no están enlazados públicamente y requieren sesión) y además llevan `noindex`.
- No bloquear `/_next/static/`, ni imágenes ni CSS/JS (Google necesita renderizarlos).
- Antes del lanzamiento: `User-agent: *` + `Disallow: /` y sin línea `Sitemap`.

## 5. Páginas que no se indexan (D-014, D-021)
| Ruta | Mecanismo |
|---|---|
| `/carrito`, `/checkout`, `/cuenta` y subrutas (incluida la página de confirmación del pedido) | `robots: { index: false, follow: false }` + `X-Robots-Tag: noindex`; excluidas del sitemap; sin enlaces rastreables desde el cuerpo de las páginas públicas |
| `/admin` y subrutas | lo mismo, además `Disallow` en robots.txt |
| Parámetros de filtro, orden y búsqueda | canonical a la URL base y `noindex,follow` (02, 03) |
| Todo el sitio en prod antes del lanzamiento | sección 2 |
| `/blog` | no existe en el MVP (D-015); no crear página vacía indexable (D-014) |

## 6. sitemap.xml (`app/sitemap.ts`)
- Solo en producción lanzada. Contiene **únicamente URL publicadas, indexables y con respuesta 200**:
  - `/`, `/productos`, `/nosotros`, `/contacto`, `/preguntas-frecuentes`.
  - `/categorias/[slug]` de las categorías con productos publicados y sin `noindex` (es decir, >= 3 productos).
  - `/productos/[slug]` de todos los productos publicados (con o sin stock).
- **Nunca** incluye: productos en borrador o despublicados, `/carrito`, `/checkout`, `/cuenta`, `/admin`, URLs con parámetros, páginas de prelanzamiento.
- `lastModified` = fecha real de la última modificación del contenido (`updatedAt` del producto/categoría). Las páginas sin fecha real omiten el campo. No usar "hoy" en todas las URL.
- URL absolutas con el dominio de `SITE_URL`. Sin `changefreq` ni `priority` (Google los ignora).
- El sitemap se actualiza con la misma revalidación bajo demanda que las fichas (sección 3).
- Con 33 a 150 productos, un solo archivo basta (límite 50.000 URL).

## 7. Redirecciones y errores
- **404 real**: una ruta inexistente devuelve estado HTTP **404** con página `app/not-found.tsx` (no 200 "soft 404"): title `Página no encontrada | Nutra Elements` (37), `noindex`, enlaces a `/productos` y a las 6 categorías y enlace a inicio. Sin enlaces rotos.
- Producto o categoría despublicado, borrador o inexistente: 404 (no redirige a la home).
- **301** cuando cambie un slug de producto o categoría: se guarda el historial de slugs (pedido al firebase-architect) y se redirige de forma permanente al nuevo. Producto retirado para siempre: 301 a su categoría (o 410 si Carlos lo prefiere). Las redirecciones estáticas conocidas van en `redirects()` de `next.config`; las dinámicas por historial, en el servidor.
- Una sola versión canónica del sitio: HTTPS obligatorio, sin `www` (redirigir `www.nutraelements.cl` a `nutraelements.cl` con 301; lo configura devops en el dominio) y barra final consistente (sin barra final salvo en la raíz; `trailingSlash: false`). Mayúsculas en la URL: 301 a minúsculas.
- Sin cadenas de redirección (máximo un salto).
- Página de error 500 (`error.tsx`/`global-error.tsx`) sin datos sensibles y con `noindex`.

## 8. Datos estructurados globales
Reglas para todo JSON-LD:
- Formato JSON-LD en `<script type="application/ld+json">` dentro del HTML de servidor. Se serializa con `JSON.stringify` y se escapa `<` como `<`.
- Todo dato marcado debe estar **visible** en la página (precio, nombre, disponibilidad, dirección, horario, preguntas).
- Sin `aggregateRating`, `review`, `ratingValue` ni estrellas mientras no existan reseñas reales y visibles (D-014).
- No incluir datos PENDIENTE (teléfono, correo, redes, logo, política de devoluciones): se omiten.
- URL absolutas y una sola entidad `Organization` (`@id` `https://nutraelements.cl/#organization`) y una sola `Store` (`#store`), referenciadas por `@id`.

### Organization
Ver 01-inicio (home): `name`, `url`, `logo` (PENDIENTE hasta tener archivo), `sameAs` (PENDIENTE), `contactPoint` (PENDIENTE).

### LocalBusiness (`Store`) con la dirección real
Ver 05-B (`/contacto`). Datos confirmados: Av. Concha y Toro 180, Puente Alto, RM, CL; lunes a viernes 09:00 a 20:00. **Teléfono, correo, redes, geo y código postal: PENDIENTE** (se omiten, no se inventan). Estos datos también se muestran, idénticos, en el pie de todas las páginas.

### BreadcrumbList
En todas las páginas excepto la home (01 a 05). Coincide con las migas visibles.

## 9. Open Graph, Twitter y recursos de marca
- Cada página: `og:title`, `og:description`, `og:url`, `og:type`, `og:site_name`, `og:locale`, `og:image` con `og:image:alt`, y `twitter:card=summary_large_image`.
- Imagen por defecto de marca 1200x630 (<= 300 KB): **PENDIENTE** (requiere logo y arte). Mientras no exista, se usa la imagen del producto o no se emite `og:image` en institucionales; no se usan imágenes de stock engañosas.
- `twitter:site` y `sameAs`: **PENDIENTE** (sin redes confirmadas).
- Favicon e iconos (`app/icon`, `apple-icon`): PENDIENTE (logo).

## 10. Core Web Vitals, imágenes y rendimiento (global)
Objetivos en móvil (Lighthouse y, tras el lanzamiento, Search Console): LCP < 2.5 s, INP < 200 ms, CLS < 0.1.
- Imágenes: `next/image` con `width`/`height` o `fill` en contenedor de relación fija; `sizes` correcto; `priority` solo en la imagen LCP; lazy en el resto; fuente de producto cuadrada >= 1200 px, comprimida en el admin antes de subir (04). `alt` en todo contenido; vacío en decorativas.
- Fuentes: `next/font`, máximo 2 familias, `display: swap`.
- JavaScript: Server Components por defecto; componentes cliente solo donde haya interacción. No incluir el SDK de Firebase Auth/Firestore ni scripts de Flow en páginas públicas salvo lo mínimo del carrito; Flow solo en `/checkout`.
- Sin Google Analytics ni etiquetas de terceros (D-012). Cualquier script nuevo de terceros requiere revisión del SEO.
- HTTP: compresión (Brotli/gzip) y caché larga de assets estáticos con nombre con hash (la da App Hosting/CDN; verificar). Cache-Control de las páginas ISR coherente con la revalidación.
- Banners o avisos (cookies) que aparezcan tarde no deben mover el contenido (CLS).
- La latencia desde `us-east4` es el riesgo principal de TTFB para un público chileno (D-010): se compensa con páginas estáticas desde el CDN. Medir TTFB real de `/productos/[slug]` desde Chile en la primera auditoría (si es posible; sin verificar).

## 11. Criterios de aceptación de la auditoría
Veredicto: **APROBADO** solo si no queda ningún BLOQUEANTE. Clasificación: BLOQUEANTE, IMPORTANTE, SUGERENCIA. La auditoría se hace en local con `next build && next start` contra los emuladores (D-021), con `curl` sobre el HTML y Lighthouse móvil.

### BLOQUEANTES (cualquiera rechaza)
G-01 Una página pública no entrega su contenido principal en el HTML (H1, texto, precio, enlaces, JSON-LD).
G-02 `noindex` ausente en `/carrito`, `/checkout`, `/cuenta`, `/admin` o en el sitio completo cuando `SITE_INDEXABLE=false` (D-014, D-021); o presente en las públicas cuando es `true`.
G-03 Aparece `aggregateRating`, `review` o estrellas sin reseñas reales (D-014).
G-04 Una ficha sin `Product`+`Offer` válidos (`price`, `priceCurrency`, `availability`, `sku`, `image`, `name`) o con precio/disponibilidad distintos del HTML visible.
G-05 Se publican teléfono, correo, redes, GTIN, logo, política de devoluciones o cualquier dato inventado o no confirmado.
G-06 La dirección y el horario del JSON-LD no son los confirmados (Av. Concha y Toro 180, Puente Alto; lunes a viernes 9:00 a 20:00).
G-07 Ruta inexistente o despublicada responde 200 en lugar de 404; el sitemap incluye URL privadas, de borrador o con noindex.
G-08 canonical ausente o apuntando a otro dominio/origen que el correspondiente al entorno; `noindex` y `canonical` contradictorios en producción lanzada.
G-09 Texto con alegaciones de salud prohibidas (00 sección 7), especialmente Ultra Light/Relax/Lax, cranberry, melena de león o cúrcuma.
G-10 Title o H1 duplicados entre fichas de distinto tamaño (00 sección 5).

### IMPORTANTES
G-11 title > 60 o description > 155 caracteres, vacíos, o sin plantilla. G-12 más de un H1 o jerarquía rota. G-13 `lang` distinto de `es-CL`. G-14 imágenes de contenido sin alt o sin dimensiones. G-15 LCP >= 2.5 s, INP >= 200 ms o CLS >= 0.1 en Lighthouse móvil. G-16 falta BreadcrumbList en páginas que lo requieren. G-17 no hay enlaces `<a href>` rastreables a fichas y categorías. G-18 falta OG/Twitter con imagen. G-19 robots.txt bloquea `/_next/` o recursos necesarios, o bloquea `/carrito` impidiendo leer el noindex. G-20 `www` o barra final generan contenido duplicado. G-21 el sitemap omite una ficha publicada.

### SUGERENCIAS
G-22 mejoras de texto de categorías e internal linking; G-23 imágenes más livianas; G-24 vocabulario local adicional; G-25 `shippingDetails` y `hasMerchantReturnPolicy` cuando existan los datos.

### Método
1. `curl -sS -D- <url>` para estado HTTP, cabeceras (`X-Robots-Tag`, `Cache-Control`) y HTML.
2. Extraer title, description, canonical, robots, H1/H2, enlaces y bloques `ld+json`; validar el JSON.
3. Probar cada JSON-LD en la Prueba de resultados enriquecidos o validator de schema.org (si hay red; si no, validación manual de campos y se declara como limitación).
4. Lighthouse móvil en home, catálogo, una categoría, dos fichas (tamaños distintos de una familia) y contacto.
5. Probar el interruptor de entornos: `SITE_INDEXABLE=false` y `true`.
6. Probar 404, un slug cambiado (301) y una ficha despublicada.
7. Revisión de textos contra 00 sección 7 antes de aprobar.
8. Todo lo no verificado (p. ej. rich results, TTFB desde Chile, comportamiento real del CDN) se declara como **no verificado**.

## 12. Dependencias y pedidos a otros agentes
- **firebase-architect**: campos del producto `slug` (único, estable), `slugHistory`, `familyId`, `category`, `seoTitle?`, `seoDescription?`, `images[] {url, alt, width, height}`, `updatedAt`, `published`, `barcode` y, a futuro, promedio y cantidad de reseñas. Revalidación bajo demanda en las Functions de administración.
- **nextjs-frontend**: implementar 01 a 06; `robots.ts`, `sitemap.ts`, `not-found.tsx`, helper único de JSON-LD, variable `SITE_INDEXABLE`.
- **devops**: dominio sin `www`, redirección HTTPS, interruptor del lanzamiento con confirmación de Carlos, purga de caché tras el cambio.
- **Carlos**: teléfono, correo público, redes, logo, fotos reales, política de devoluciones, monto de envío gratis, Google Business Profile y acceso a Search Console.
