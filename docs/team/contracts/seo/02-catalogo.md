# SEO 02 - Catálogo (`/productos`)

Estado: propuesto, pendiente de aprobación del tech-lead. Autor: seo-specialist. Fecha: 2026-10-14.
Depende de: 00 y 06.

## Objetivo y búsqueda
- Principal: **catálogo de suplementos en cápsulas** (navegación).
- Secundarias: todos los productos Nutra Elements, comprar suplementos online Chile.
- No debe competir con la home (title y H1 distintos) ni con las categorías (no apunta a "magnesio" ni "vitaminas" como términos principales).

## Renderizado
Estática con ISR (D-022); revalidación bajo demanda cuando se publique, despublique o cambie un producto (también precio y stock mostrados). Fallback por tiempo: 06 sección 10.

## Paginación, filtros y orden
- Con 33 SKU (hasta unos 150 a futuro), **no paginar en el MVP**: las 33 tarjetas van en el HTML inicial de una sola página. Si el catálogo supera 48 productos, pasar a paginación con URLs rastreables `/productos?pagina=2` (canonical a sí misma, `rel=prev/next` no es necesario) y avisar al seo-specialist.
- Filtrar por categoría y ordenar por precio o nombre: se resuelve en el cliente **sin cambiar la URL indexable**. Si se usan parámetros (`?orden=`, `?categoria=`), la canonical apunta a `https://nutraelements.cl/productos` y la página lleva `noindex,follow`.
- El filtro por categoría no sustituye los enlaces a `/categorias/[slug]`; esos enlaces (HTML real) deben estar presentes.
- La búsqueda interna, si existiera, va en una URL con `noindex` y no aparece en el sitemap (no está en el MVP).

## Metadata

| Campo | Valor |
|---|---|
| title (<= 60) | `Catálogo de suplementos en cápsulas \| Nutra Elements` (52) |
| meta description (<= 155) | `Los {n} productos Nutra Elements: vitaminas, magnesio, minerales, omega 3, colágeno y más. Despacho RM $3.990 y retiro en tienda en Puente Alto.` (143 con n=33) |
| canonical | `https://nutraelements.cl/productos` |
| robots | `index, follow, max-image-preview:large` (lanzado). Prelanzamiento: `noindex, nofollow` (06) |
| Open Graph / Twitter | igual que la home con title/description/URL propios; imagen de marca 1200x630 |

`{n}` = cantidad de productos publicados, calculada al generar; si cambia, la descripción sigue dentro de 155.

## H1 y estructura de encabezados

```
H1  Catálogo de suplementos Nutra Elements
  (intro 30 a 60 palabras: cápsulas, marca propia, despacho RM, retiro en Puente Alto)
  H2  Vitaminas        (agrupa las tarjetas de la categoría; enlace "Ver vitaminas" a /categorias/vitaminas)
  H2  Magnesio
  H2  Minerales
  H2  Omega 3
  H2  Belleza
  H2  Bienestar
      H3 = nombre del producto en cada tarjeta
```
- Las tarjetas se agrupan por categoría para dar estructura y enlaces internos. El orden dentro de la categoría agrupa los tamaños de la misma familia contiguos.
- Un solo H1.

## JSON-LD
`BreadcrumbList` (obligatorio) y `CollectionPage` con `ItemList` (recomendado).

Campos obligatorios de `BreadcrumbList`: `itemListElement` con `ListItem` (`position`, `name`, `item` absoluta; el último puede omitir `item`). Campos de `ItemList`: `itemListElement` con `ListItem` (`position`, `url`).

```json
{
  "@context": "https://schema.org",
  "@graph": [
    {
      "@type": "BreadcrumbList",
      "itemListElement": [
        { "@type": "ListItem", "position": 1, "name": "Inicio", "item": "https://nutraelements.cl/" },
        { "@type": "ListItem", "position": 2, "name": "Catálogo" }
      ]
    },
    {
      "@type": "CollectionPage",
      "name": "Catálogo de suplementos Nutra Elements",
      "url": "https://nutraelements.cl/productos",
      "inLanguage": "es-CL",
      "mainEntity": {
        "@type": "ItemList",
        "itemListElement": [
          { "@type": "ListItem", "position": 1, "url": "https://nutraelements.cl/productos/vitamina-c-1000-mg-90-capsulas" },
          { "@type": "ListItem", "position": 2, "url": "https://nutraelements.cl/productos/citrato-de-magnesio-120-capsulas" }
        ]
      }
    }
  ]
}
```
(Los slugs del ejemplo son ilustrativos. El `ItemList` lista solo productos publicados, en el mismo orden visible.) No incluir `Product` dentro del `ItemList` de la lista (los `Product` van en cada ficha).

## Enlaces internos
- Cada tarjeta enlaza a su ficha con anchor = nombre + cantidad ("Vitamina C 1000 mg 90 cápsulas"); un único enlace por tarjeta (imagen y título comparten el mismo `<a>` o el enlace de la imagen lleva `aria-hidden`/`tabindex=-1`).
- Seis enlaces de encabezado a `/categorias/[slug]`.
- Breadcrumb visible: Inicio > Catálogo.
- Los productos sin stock **siguen listados** con etiqueta "Agotado".

## Imágenes
- Tarjeta: fuente 800x800, mostrada a ~300 px; `next/image` con `sizes` correcto (p. ej. `(min-width: 1024px) 25vw, 50vw`).
- alt = "[Nombre] [N] cápsulas Nutra Elements" (el mismo de la ficha, sin "foto de").
- Las primeras 4 a 6 tarjetas sin lazy; el resto `loading="lazy"`. Ninguna `priority` salvo la primera tarjeta si es el LCP real (verificar en auditoría).
- Dimensiones explícitas (`width`/`height` o `fill` con contenedor de relación fija) para CLS < 0.1.

## Core Web Vitals (móvil)
- LCP < 2.5 s: HTML estático desde el CDN; la imagen LCP precargada.
- INP < 200 ms: filtros/orden ligeros; no hidratar 33 tarjetas con lógica pesada. Preferir componentes de servidor para las tarjetas y un componente cliente pequeño para el botón "Agregar".
- CLS < 0.1: tarjetas de altura reservada; etiquetas de precio y "Agotado" sin saltos.
- No cargar Flow ni Firebase Auth en esta página.

## Criterios de aceptación (auditoría)
C-01 las 33 fichas (o las publicadas) aparecen como `<a href>` en el HTML de `curl`. C-02 title/description/canonical exactos. C-03 los parámetros `?orden=`/`?categoria=` devuelven canonical a `/productos` y `noindex`. C-04 solo hay productos publicados (ni despublicados ni en borrador). C-05 BreadcrumbList y ItemList válidos y coherentes con lo visible. C-06 un H1 y H2 por categoría. C-07 imágenes con alt y dimensiones; solo las primeras con prioridad. C-08 Lighthouse móvil en objetivo. Más criterios globales en 06 sección 11.
