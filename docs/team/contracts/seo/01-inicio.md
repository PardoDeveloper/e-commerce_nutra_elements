# SEO 01 - Inicio (`/`)

Estado: propuesto, pendiente de aprobación del tech-lead. Autor: seo-specialist. Fecha: 2026-10-14.
Depende de: 00 (palabras clave) y 06 (reglas globales: canonical, robots por entorno, lang, Organization).

## Objetivo y búsqueda
- Principal: **nutra elements** (marca) y **suplementos en cápsulas**.
- Secundarias: retiro en tienda Puente Alto, despacho RM, vitaminas, magnesio, omega 3.
- Intención: marca + transaccional amplia + local. La home reparte tráfico hacia categorías; no compite con `/productos` (title distinto).

## Renderizado
Estática con ISR (D-022). Revalidación bajo demanda cuando el admin cambie productos destacados, precios o stock mostrados en home. Fallback por tiempo: ver 06 sección 10.

## Metadata

| Campo | Valor |
|---|---|
| title (<= 60) | `Nutra Elements \| Suplementos en cápsulas, Puente Alto y RM` (58) |
| meta description (<= 155) | `Vitaminas, minerales, omega 3 y más en cápsulas, de marca propia. Despacho a toda la RM por $3.990 y retiro en tienda en Puente Alto.` (133) |
| canonical | `https://nutraelements.cl/` (siempre con barra final solo en la raíz; sin parámetros) |
| robots | `index, follow, max-image-preview:large` en producción lanzada. Antes del lanzamiento: `noindex, nofollow` (D-021, ver 06) |
| Open Graph | `og:type=website`, `og:site_name=Nutra Elements`, `og:locale=es_CL`, `og:url`=canonical, `og:title`=title, `og:description`=description, `og:image` 1200x630 (imagen de marca, PENDIENTE: requiere logo/arte) con `og:image:alt` |
| Twitter Card | `summary_large_image`; sin `twitter:site` (no hay cuenta, PENDIENTE) |
| hreflang | no se emite (un solo idioma/país) |

Reglas del title: sin precio (por ISR podría desfasarse), marca al inicio solo en la home; en el resto va al final.

## H1 y estructura de encabezados

```
H1  Suplementos en cápsulas de marca propia
  H2  Compra por categoría            (6 tarjetas, cada una enlaza a /categorias/[slug]; H3 = nombre de la categoría)
  H2  Productos destacados            (solo los marcados en el admin, hasta 12; sin marcados, la sección no se muestra; H3 = nombre del producto; D-043, D-045)
  H2  Despacho en la RM y retiro en tienda en Puente Alto
        (texto: $3.990 a toda la RM, retiro en Av. Concha y Toro 180, lunes a viernes de 9:00 a 20:00)
  H2  Por qué Nutra Elements           (marca propia, cápsulas; sin alegaciones de salud ni sellos que no existan)
```
- Un solo H1. No usar la palabra "mejor". El H1 no repite el title literal.
- El texto introductorio bajo el H1 (40 a 80 palabras) menciona de forma natural "Puente Alto", "RM" y "retiro en tienda" una vez cada uno.
- Sin texto de salud: cumplir 00 sección 7.

## JSON-LD

Organization y WebSite (obligatorios). `Store` va en `/contacto` (ver 05); la home solo referencia al mismo origen por `@id`.

Campos obligatorios de `Organization`: `@context`, `@type`, `@id`, `name`, `url`, `logo`. Opcionales: `sameAs` (solo con redes reales), `contactPoint` (solo con teléfono o correo públicos reales). **No se inventan**: mientras estén PENDIENTE, el campo **se omite** del JSON-LD (no se deja vacío ni con texto "PENDIENTE").

Ejemplo exacto. `logo` es PENDIENTE (no hay archivo aún): la URL del ejemplo es ilustrativa y, hasta tener el logo real, el bloque se emite sin la línea `logo` (sigue siendo un Organization válido).

```json
{
  "@context": "https://schema.org",
  "@graph": [
    {
      "@type": "Organization",
      "@id": "https://nutraelements.cl/#organization",
      "name": "Nutra Elements",
      "url": "https://nutraelements.cl/",
      "logo": "https://nutraelements.cl/logo.png"
    },
    {
      "@type": "WebSite",
      "@id": "https://nutraelements.cl/#website",
      "url": "https://nutraelements.cl/",
      "name": "Nutra Elements",
      "inLanguage": "es-CL",
      "publisher": { "@id": "https://nutraelements.cl/#organization" }
    }
  ]
}
```
- Sin `SearchAction` (no hay buscador en el MVP).
- La URL base sale de la variable de entorno del sitio (06 sección 2), no está escrita fija en el código.
- Las URL del JSON-LD son absolutas.
- Se emite con `JSON.stringify` y se reemplaza `<` por `<` dentro del `<script type="application/ld+json">`.

## BreadcrumbList
No aplica en la home (es la raíz). No emitirlo.

## Enlaces internos
- 6 enlaces a categorías, con anchor = nombre de la categoría ("Vitaminas", "Magnesio", "Minerales", "Omega 3", "Belleza", "Bienestar").
- Enlace a `/productos` ("Ver todo el catálogo").
- Enlaces a 8 a 12 fichas destacadas (anchor = nombre + cantidad de cápsulas).
- Enlaces a `/nosotros`, `/contacto` (anchor "Retiro en tienda en Puente Alto") y `/preguntas-frecuentes`.
- Todos son `<a href>` reales renderizados en el HTML inicial (no botones con `onClick`).
- Pie global: dirección, horario y enlaces a páginas institucionales (06).

## Imágenes
| Imagen | Tamaño fuente | alt | Notas |
|---|---|---|---|
| Hero (si hay) | mínimo 1600x900, WebP/AVIF | descriptivo, p. ej. "Frascos de suplementos Nutra Elements" | única imagen `priority`; es el candidato a LCP; dimensiones explícitas |
| Tarjeta de categoría | 600x600 | "Categoría vitaminas: frascos de vitaminas Nutra Elements" | `loading=lazy` |
| Producto destacado | 800x800 | "[Nombre] [N] cápsulas Nutra Elements" | las primeras 4 visibles sin `priority`; lazy desde la quinta |
- Texto alternativo sin "imagen de" ni relleno de palabras clave. Imágenes decorativas con `alt=""`.
- Peso objetivo: hero <= 200 KB, tarjetas <= 80 KB (tras optimización de `next/image`).

## Core Web Vitals (móvil)
LCP < 2.5 s, INP < 200 ms, CLS < 0.1. Riesgos específicos:
- Imagen hero sin dimensiones o sin `priority`.
- Carrusel o slider con JavaScript pesado (evitar; preferir CSS).
- Cargar Firebase SDK, Flow o analítica en la home. El SDK de cliente no debe cargarse en páginas públicas salvo lo mínimo para el carrito.
- Fuentes: `next/font`, máximo 2 familias o pesos limitados, `display: swap`.
- Bloques que cargan tarde (precios, stock) sin reservar su espacio.

## Criterios de aceptación (auditoría)
H-01 `curl` de `/` devuelve 200 con el H1, enlaces a categorías y productos en el HTML. H-02 title y description exactos a la plantilla, dentro de longitud. H-03 canonical absoluta correcta. H-04 robots coincide con el entorno. H-05 JSON-LD válido (Organization y WebSite) sin campos inventados. H-06 un solo H1. H-07 alt en todas las imágenes de contenido. H-08 LCP/INP/CLS dentro de objetivo en Lighthouse móvil. H-09 sin alegaciones de salud (00 sección 7). Los criterios globales están en 06 sección 11.
