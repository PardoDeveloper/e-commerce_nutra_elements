# SEO 04 - Ficha de producto (`/productos/[slug]`)

Estado: propuesto, pendiente de aprobación del tech-lead. Autor: seo-specialist. Fecha: 2026-10-14.
Prioridad máxima del sitio. Depende de: 00 (secciones 5 y 7) y 06. Una ficha por SKU (cada tamaño es un producto, D-016).

## Renderizado
- Estática con ISR (D-022): `generateStaticParams` con los productos publicados; los slugs nuevos se generan bajo demanda (`dynamicParams` activo) y se revalidan bajo demanda al cambiar precio, stock, descuento, texto o imágenes.
- Un slug inexistente, borrador o **despublicado** responde **404 real**. Un producto sin stock sigue publicado (OutOfStock).
- El precio y la disponibilidad pueden tener unos segundos de retraso (D-022). El servidor recalcula el cobro (D-005). **El JSON-LD debe mostrar el mismo precio y disponibilidad que el HTML visible** de la misma versión de la página.
- Todo el contenido SEO (nombre, texto, precio, JSON-LD) está en el HTML inicial.

## Slug
Formato `[nombre-normalizado]-[N]-capsulas`; minúsculas, sin tildes ni ñ, sin SKU, sin marca. Ejemplos: `vitamina-c-1000-mg-90-capsulas`, `citrato-de-magnesio-120-capsulas`, `omega-3-60-capsulas`.
- Único y generado desde el nombre editado en el admin; si choca, se desambigua con la forma o dosis, no con números aleatorios.
- Estable una vez publicado. Si cambia, 301 del slug antiguo al nuevo (06 sección 7). Si el producto se retira para siempre, 301 a su categoría.

## Metadata

| Campo | Plantilla |
|---|---|
| title (<= 60) | `{Nombre} {N} cápsulas \| Nutra Elements` (ejemplo: `Vitamina C 1000 mg 90 cápsulas \| Nutra Elements`, 47). Si excede 60, quitar "\| Nutra Elements". Si el nombre ya trae las cápsulas, no repetirlo |
| meta description (<= 155) | `{Nombre} en frasco de {N} cápsulas, de Nutra Elements. Suplemento alimentario. Despacho en la RM o retiro en tienda en Puente Alto.` (ejemplo con "Citrato de magnesio" y 120: 142) |
| canonical | `https://nutraelements.cl/productos/{slug}` (autorreferente, también en cada tamaño; ver 00 sección 5) |
| robots | `index, follow, max-image-preview:large`; prelanzamiento `noindex, nofollow` |
| Open Graph | `og:type=website` (Next no emite `product`; no es necesario), `og:title`, `og:description`, `og:url`, `og:locale=es_CL`, `og:image` = primera imagen del producto (mínimo 1200x630 o cuadrada 1200x1200), con `og:image:alt` |
| Twitter Card | `summary_large_image` |

- La **description** no incluye precio (podría desfasarse por ISR) ni alegaciones.
- Las fichas de tamaños distintos **no** comparten title ni description (incluyen la cantidad).
- Título del producto: usar el nombre del rótulo/admin, no un "nombre SEO" con alegaciones.
- Campos opcionales en admin que **sobrescriben** la plantilla: `seoTitle` y `seoDescription`; si existen, se validan longitud y revisión de cumplimiento (00 sección 7). Se lo pido al firebase-architect (ver handoff).

## H1 y estructura de encabezados

```
H1  {Nombre} {N} cápsulas                      (el mismo que alimenta el title; ej.: "Citrato de magnesio 120 cápsulas")
  (bloque de compra: precio, estado de stock, selector de cantidad, botón agregar; sin precio por cápsula, D-043)
  H2  Descripción                               (texto de la familia + bloque propio del SKU; 80 a 200 palabras)
  H2  Información del producto                  (ingredientes, porción, cantidad de cápsulas, alérgenos; copiado del rótulo)
  H2  Modo de uso y advertencias                (copiado del rótulo)
  H2  Otros formatos de este producto           (enlaces a los demás tamaños de la familia; solo si hay)
  H2  Despacho y retiro                         (resumen de $3.990 RM y retiro Puente Alto; enlace a FAQ)
  H2  Productos relacionados                    (3 a 4, misma categoría; H3 = nombre)
```
- Un solo H1. No hay H2 con alegaciones ("Beneficios", "Para qué sirve", "Propiedades") salvo que el profesional lo autorice texto por texto. **Evitar "Beneficios" como título de sección** (00 sección 7).
- Bloque propio por SKU (anti-duplicado, 00 sección 5): cantidad de cápsulas, duración estimada según la dosis del rótulo (si hay), stock visible.
- Un `FAQPage` en la ficha **no se emite**.

## JSON-LD

Se emite `Product` (con `Offer`) y `BreadcrumbList`. **Sin `aggregateRating` ni `review` (D-014)** mientras no haya reseñas reales y visibles; tampoco "valoración 5 estrellas" visual.

Campos obligatorios de `Product`: `@type`, `name`, `image` (al menos una URL absoluta), `description`, `sku`, `brand`, `offers`.
Campos obligatorios de `Offer`: `@type`, `url`, `priceCurrency` (`"CLP"`), `price` (número con punto, sin separador de miles ni símbolo), `availability` (URL schema.org), `itemCondition`.
Campos condicionales:
- `gtin13`: **solo** si `barcode` tiene 13 dígitos y pasa la validación del dígito verificador (algunos códigos con prefijo 978 pueden no ser GTIN reales, D-016). Si no valida, se omite; nunca se inventa. `mpn` no se emite.
- `priceValidUntil`: solo si el descuento tiene fecha de término real; si no, se omite.
- `shippingDetails`: `OfferShippingDetails` con la tarifa de $3.990 a la RM (ejemplo abajo). Si se define envío gratis sobre un monto, **PENDIENTE** (monto por definir): no se incluye hasta que exista el valor.
- `hasMerchantReturnPolicy`: **PENDIENTE** (no hay política de devoluciones publicada). No se emite hasta que exista y sea visible en el sitio.
- Descuento: `price` es el precio **actual con descuento**; el tachado no se declara en el MVP (si se desea, `priceSpecification` con `priceType` `StrikethroughPrice`, solo cuando el precio anterior sea real).

`availability`: `https://schema.org/InStock` si el stock publicado > 0; `https://schema.org/OutOfStock` si es 0. No usar `LimitedAvailability` ni `PreOrder` en el MVP. Stock negativo o vacío de la planilla ya se toma como 0 (D-018).

Ejemplo (ilustrativo, valores de muestra; el precio, nombre, SKU y slug salen de los datos):

```json
{
  "@context": "https://schema.org",
  "@graph": [
    {
      "@type": "Product",
      "@id": "https://nutraelements.cl/productos/citrato-de-magnesio-120-capsulas#product",
      "name": "Citrato de magnesio 120 cápsulas",
      "description": "Citrato de magnesio en frasco de 120 cápsulas. Suplemento alimentario.",
      "image": [
        "https://nutraelements.cl/media/citrato-de-magnesio-120-capsulas-1.webp"
      ],
      "sku": "0000000",
      "brand": { "@type": "Brand", "name": "Nutra Elements" },
      "category": "Magnesio",
      "offers": {
        "@type": "Offer",
        "url": "https://nutraelements.cl/productos/citrato-de-magnesio-120-capsulas",
        "priceCurrency": "CLP",
        "price": 12990,
        "availability": "https://schema.org/InStock",
        "itemCondition": "https://schema.org/NewCondition",
        "seller": { "@id": "https://nutraelements.cl/#organization" },
        "shippingDetails": {
          "@type": "OfferShippingDetails",
          "shippingRate": { "@type": "MonetaryAmount", "value": 3990, "currency": "CLP" },
          "shippingDestination": {
            "@type": "DefinedRegion",
            "addressCountry": "CL",
            "addressRegion": "RM"
          }
        }
      }
    },
    {
      "@type": "BreadcrumbList",
      "itemListElement": [
        { "@type": "ListItem", "position": 1, "name": "Inicio", "item": "https://nutraelements.cl/" },
        { "@type": "ListItem", "position": 2, "name": "Catálogo", "item": "https://nutraelements.cl/productos" },
        { "@type": "ListItem", "position": 3, "name": "Magnesio", "item": "https://nutraelements.cl/categorias/magnesio" },
        { "@type": "ListItem", "position": 4, "name": "Citrato de magnesio 120 cápsulas" }
      ]
    }
  ]
}
```
- `sku` = ID de la planilla (D-016), como cadena.
- `description` del JSON-LD = texto plano de la ficha, sin HTML ni alegaciones.
- `image` son URL absolutas de imágenes reales del producto (no logos ni placeholders); si no hay imagen aún, el producto **no se publica**.
- `shippingDetails` es opcional y puede omitirse si el equipo no logra mantenerlo coherente con el checkout; si se emite, la tarifa debe coincidir con la que cobra el servidor ($3.990 a la RM).
- Los valores `RM` de `addressRegion` y la forma de `shippingDestination` se validan con la Prueba de resultados enriquecidos de Google en la auditoría; si da advertencia, se simplifica.
- `BreadcrumbList` usa la **categoría primaria** del producto. Las migas visibles coinciden con él.
- La ruta incluye la categoría solo en el JSON-LD y en las migas, **no en la URL** (`/productos/[slug]`).

## Enlaces internos
- Migas visibles: Inicio > Catálogo > {Categoría} > {Producto} (igual que en 03-categoria).
- Sección "Otros formatos de este producto": enlaces a los demás tamaños de la familia (anchor = "{Nombre} {N} cápsulas"), no más de 6.
- Productos relacionados: 3 a 4 de la misma categoría; anchor = nombre + cantidad.
- Enlace a `/categorias/{categoría}` y a `/preguntas-frecuentes` (despacho y retiro).
- No enlazar a `/carrito` ni `/checkout` con enlaces rastreables en el cuerpo (el botón "Agregar" es un `button`).

## Imágenes
| Imagen | Requisitos |
|---|---|
| Principal | cuadrada, fuente mínima 1200x1200 px (ideal 1600), fondo neutro; WebP o JPEG; `priority` (es el candidato a LCP); dimensiones explícitas; `alt` = "{Nombre} {N} cápsulas Nutra Elements, frasco" |
| Adicionales (hasta 5) | misma relación; `alt` distinto y descriptivo ("..., tabla nutricional", "..., vista lateral"); lazy |
| Miniaturas | 120 px, `alt` igual al de la imagen grande o vacío si es redundante |
| Open Graph | primera imagen del producto; mínimo 1200x630 |

- Peso objetivo tras `next/image`: principal <= 120 KB en móvil, <= 250 KB en escritorio.
- Requisito para el admin: al subir, el cliente redimensiona a un máximo de 1600 px y comprime (WebP, calidad ~80) **antes** de subir a Storage; se rechaza cualquier archivo > 1 MB tras la compresión. El nombre de archivo es el slug.
- La imagen se sirve desde un dominio permitido en `next.config` (`remotePatterns` del bucket de Storage). Verificar que el CDN de App Hosting cachea las variantes.
- Un producto sin imagen no se publica; sin alt, tampoco.

## Core Web Vitals (móvil)
LCP < 2.5 s, INP < 200 ms, CLS < 0.1.
- LCP: la imagen principal con `priority`; HTML estático; sin texto bloqueado por fuentes (`next/font`).
- INP: el selector de cantidad y "Agregar" son componentes cliente pequeños; no cargar el SDK de Firestore/Auth en el bundle de la ficha salvo lo indispensable para el carrito (preferir carrito en `localStorage`; ver nota para el frontend).
- CLS: reservar espacio para la galería, el precio y el estado de stock; el estado "Agotado" no debe empujar el contenido.
- Riesgos: galería con librería pesada, scripts de Flow fuera del checkout, imágenes sin tamaño, reseñas o widgets de terceros.

## Criterios de aceptación (auditoría)
P-01 `curl` de una ficha devuelve 200 con H1, precio, descripción y JSON-LD en el HTML. P-02 title/description/canonical/robots según plantilla. P-03 un solo H1; sin H2 "Beneficios" ni alegaciones. P-04 JSON-LD de Product válido en la Prueba de resultados enriquecidos, con `offers.price`, `priceCurrency`, `availability`, `sku`, `brand`, `image`. P-05 el `price` y `availability` del JSON-LD coinciden con lo visible. P-06 **no existe** `aggregateRating`, `review` ni estrellas (D-014). P-07 `gtin13` solo si valida. P-08 BreadcrumbList coincide con las migas. P-09 las fichas de tamaños de una misma familia tienen title, H1, description y slug distintos y se enlazan entre sí. P-10 un slug inexistente o despublicado devuelve 404. P-11 un producto sin stock sigue 200 con `OutOfStock`. P-12 imagen principal con alt, dimensiones, `priority` y peso dentro de objetivo. P-13 Lighthouse móvil en objetivo. P-14 texto revisado contra 00 sección 7 (Ultra, cranberry, melena de león, cúrcuma). Globales: 06 sección 11.
