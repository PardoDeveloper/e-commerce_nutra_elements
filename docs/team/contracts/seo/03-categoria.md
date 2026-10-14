# SEO 03 - Categoría (`/categorias/[slug]`)

Estado: propuesto, pendiente de aprobación del tech-lead. Autor: seo-specialist. Fecha: 2026-10-14.
Depende de: 00 (sección 2: categorías y SKU) y 06.

Slugs definitivos propuestos: `vitaminas`, `magnesio`, `minerales`, `omega-3`, `belleza`, `bienestar`.

## Renderizado
Estática con ISR (D-022): `generateStaticParams` con las categorías que tengan productos publicados. Revalidación bajo demanda de la categoría cuando cambie cualquiera de sus productos. Un slug inexistente o categoría sin productos publicados responde **404 real** (`notFound()`). Fallback por tiempo: 06 sección 10.

## Plantillas de metadata

| Campo | Plantilla |
|---|---|
| title (<= 60) | `{Frase de categoría} \| Nutra Elements` |
| meta description (<= 155) | `Compra {descripción corta de la categoría} de Nutra Elements. Despacho en la RM y retiro en tienda en Puente Alto.` (la descripción incluye los productos que existen, sin alegaciones) |
| canonical | `https://nutraelements.cl/categorias/{slug}` |
| robots | `index, follow, max-image-preview:large`; `noindex,follow` si la categoría tiene menos de 3 productos publicados (regla de contenido delgado, 00 sección 2). Prelanzamiento: `noindex, nofollow` |
| Open Graph / Twitter | igual que la home; imagen: la de un producto de la categoría (relación 1200x630 recortada) o la de marca |

Valores exactos por categoría (comprobar longitud en cada publicación; ejemplos medidos):

| Slug | title | meta description |
|---|---|---|
| `vitaminas` | `Vitaminas en cápsulas: B12, C, D y más \| Nutra Elements` (55) | `Compra vitaminas en cápsulas de Nutra Elements: B12, B-Complex, C, D, E y multivitamínico. Despacho en la RM y retiro en tienda en Puente Alto.` (143) |
| `magnesio` | `Magnesio en cápsulas: citrato y más \| Nutra Elements` (52) | `Citrato, bisglicinato, cloruro y triple quelado de magnesio en cápsulas, de Nutra Elements. Despacho en la RM y retiro en tienda en Puente Alto.` (144) |
| `minerales` | `Zinc y citrato de potasio en cápsulas \| Nutra Elements` | `Zinc y citrato de potasio en cápsulas de Nutra Elements, en distintos formatos. Despacho en la RM y retiro en tienda en Puente Alto.` |
| `omega-3` | `Omega 3 y Omega 369 en cápsulas \| Nutra Elements` | `Omega 3 y Omega 369 en cápsulas de Nutra Elements, en distintos formatos. Despacho en la RM y retiro en tienda en Puente Alto.` |
| `belleza` | `Colágeno y biotina en cápsulas \| Nutra Elements` | `Colágeno 500 mg y biotina en cápsulas de Nutra Elements. Suplementos alimentarios. Despacho en la RM y retiro en tienda en Puente Alto.` |
| `bienestar` | `Suplementos funcionales en cápsulas \| Nutra Elements` | `Spirulina, melena de león, cúrcuma con pimienta, cranberry y más en cápsulas de Nutra Elements. Despacho en la RM y retiro en tienda en Puente Alto.` |

Los títulos no mencionan los nombres Ultra Light, Ultra Relax ni Ultra Lax (00 sección 7). Las descripciones no contienen alegaciones.

## H1 y estructura de encabezados

```
H1  {Nombre visible de la categoría}          (p. ej. "Magnesio")
  (intro 80 a 150 palabras, factual: qué productos hay, formatos, cantidades de cápsulas, nota "suplemento alimentario")
  H2  Productos de {categoría}
      H3  {Nombre de cada familia o producto con su cantidad}   (en las tarjetas)
  H2  Formatos disponibles     (solo si hay varias familias: explica por forma/cantidad sin alegaciones)
  H2  Despacho y retiro        (1 párrafo corto: $3.990 RM y retiro en Puente Alto; enlaza a /preguntas-frecuentes)
```
- Un solo H1. El H1 es el término de la categoría, no repite el title.
- La intro es texto de servidor, no oculta tras "ver más". No más de ~150 palabras: es suficiente para evitar página delgada sin riesgo regulatorio.
- La categoría `magnesio` puede describir diferencias de **presentación** (citrato, bisglicinato, cloruro, triple quelado) como formas químicas, sin atribuir efectos.

## JSON-LD
`BreadcrumbList` (obligatorio) + `CollectionPage` con `ItemList` (recomendado).

```json
{
  "@context": "https://schema.org",
  "@graph": [
    {
      "@type": "BreadcrumbList",
      "itemListElement": [
        { "@type": "ListItem", "position": 1, "name": "Inicio", "item": "https://nutraelements.cl/" },
        { "@type": "ListItem", "position": 2, "name": "Catálogo", "item": "https://nutraelements.cl/productos" },
        { "@type": "ListItem", "position": 3, "name": "Magnesio" }
      ]
    },
    {
      "@type": "CollectionPage",
      "name": "Magnesio",
      "url": "https://nutraelements.cl/categorias/magnesio",
      "inLanguage": "es-CL",
      "mainEntity": {
        "@type": "ItemList",
        "itemListElement": [
          { "@type": "ListItem", "position": 1, "url": "https://nutraelements.cl/productos/citrato-de-magnesio-120-capsulas" }
        ]
      }
    }
  ]
}
```
Campos obligatorios: `BreadcrumbList.itemListElement[].position/name` (y `item` absoluto salvo en el último); `CollectionPage.name/url`. El `ItemList` incluye solo productos publicados de esa categoría, en el orden visible. Slugs del ejemplo ilustrativos. Sin `Product` anidado y sin `aggregateRating` (D-014).

## Enlaces internos
- Migas visibles: Inicio > Catálogo > {Categoría}.
- Cada tarjeta enlaza a su ficha (anchor = nombre + cantidad de cápsulas).
- Enlaces a **categorías hermanas** al pie ("Ver también": máximo 3), con anchor = nombre de la categoría.
- Enlace a `/preguntas-frecuentes` desde "Despacho y retiro".
- Enlaces a la categoría desde: home, catálogo, migas de las fichas.
- Nunca enlazar con parámetros.

## Filtros, orden, paginación
Igual que 02-catalogo: sin paginación en el MVP; si hay parámetros, canonical a la URL base y `noindex,follow`.

## Imágenes
- Tarjetas: 800x800 fuente, alt = "[Nombre] [N] cápsulas Nutra Elements", lazy salvo las primeras 4.
- Sin hero obligatorio. Si lo hay, `priority`, dimensiones explícitas y alt descriptivo de la categoría ("Vitaminas en cápsulas Nutra Elements").

## Core Web Vitals (móvil)
LCP < 2.5 s (la primera fila de tarjetas es el candidato a LCP: preload de su imagen), INP < 200 ms, CLS < 0.1. Mismos riesgos y reglas que 02-catalogo.

## Criterios de aceptación (auditoría)
K-01 las 6 URLs responden 200 y las que no tengan productos responden 404. K-02 todas las fichas de la categoría aparecen como enlaces en el HTML. K-03 title/description/canonical según plantilla y dentro de longitud. K-04 una categoría con menos de 3 productos publicados lleva `noindex,follow` y no está en el sitemap. K-05 intro presente en el HTML (no cargada por JavaScript). K-06 BreadcrumbList coherente con las migas visibles; ItemList sin productos despublicados. K-07 un H1. K-08 sin alegaciones (00 sección 7). K-09 Lighthouse móvil en objetivo. Globales: 06 sección 11.
