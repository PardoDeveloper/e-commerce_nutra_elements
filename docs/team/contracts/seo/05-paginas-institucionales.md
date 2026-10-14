# SEO 05 - Páginas institucionales (`/nosotros`, `/contacto`, `/preguntas-frecuentes`)

Estado: propuesto, pendiente de aprobación del tech-lead. Autor: seo-specialist. Fecha: 2026-10-14.
Depende de: 00 y 06. Las tres son estáticas con ISR (D-022). Todo lo marcado PENDIENTE **no se inventa**: el dato se omite del HTML y del JSON-LD hasta que Carlos lo entregue.

Datos confirmados (fuente: DECISIONS.md, "Datos de negocio confirmados"):
- Dirección: Av. Concha y Toro 180, Puente Alto, Región Metropolitana, Chile.
- Retiro en tienda: lunes a viernes, 9:00 a 20:00.
- Despacho propio a toda la RM: $3.990. Envío gratis sobre un monto configurable: PENDIENTE (sin valor).
- Teléfono: PENDIENTE. Correo público: PENDIENTE (hoy sería una cuenta @gmail.com; Carlos decide si se muestra). Redes sociales: PENDIENTE. Código postal: PENDIENTE. Coordenadas: PENDIENTE.

---

## A. Nosotros (`/nosotros`)

| Campo | Valor |
|---|---|
| Palabra clave | nutra elements, marca propia de suplementos en cápsulas |
| title (<= 60) | `Quiénes somos \| Nutra Elements` (30) |
| meta description (<= 155) | `Conoce Nutra Elements, marca propia de suplementos alimentarios en cápsulas, con tienda para retiro en Puente Alto y despacho en toda la RM.` (140) |
| canonical | `https://nutraelements.cl/nosotros` |
| robots | `index, follow` (prelanzamiento: `noindex, nofollow`) |
| Open Graph / Twitter | como la home; imagen de marca |

Encabezados:
```
H1  Quiénes somos
  H2  Nuestra marca            (marca propia, cápsulas, catálogo de vitaminas, minerales, omega y funcionales)
  H2  Dónde estamos            (Puente Alto, retiro en tienda, horario; enlace a /contacto)
  H2  Cómo trabajamos          (despacho propio en la RM; sin sellos ni certificaciones que no existan)
```
- No afirmar "certificado", "aprobado por ISP/MINSAL", "premiado", "el mejor" ni cifras de clientes sin respaldo. Texto escrito por Carlos o validado por él.
- Longitud mínima útil: 200 a 350 palabras de contenido propio.

JSON-LD: `AboutPage` (opcional) + `BreadcrumbList` (obligatorio). `Organization` ya está en la home; aquí solo se referencia por `@id`.
```json
{
  "@context": "https://schema.org",
  "@graph": [
    {
      "@type": "AboutPage",
      "name": "Quiénes somos",
      "url": "https://nutraelements.cl/nosotros",
      "inLanguage": "es-CL",
      "about": { "@id": "https://nutraelements.cl/#organization" }
    },
    {
      "@type": "BreadcrumbList",
      "itemListElement": [
        { "@type": "ListItem", "position": 1, "name": "Inicio", "item": "https://nutraelements.cl/" },
        { "@type": "ListItem", "position": 2, "name": "Quiénes somos" }
      ]
    }
  ]
}
```
Enlaces internos: a `/productos`, a las 6 categorías, a `/contacto` ("Retiro en tienda en Puente Alto") y a `/preguntas-frecuentes`. Imágenes: foto real de la tienda o del equipo si existe (<= 150 KB, alt descriptivo: "Tienda Nutra Elements en Puente Alto"); sin fotos de stock que parezcan reales. Core Web Vitals: sin imágenes pesadas ni video incrustado (LCP < 2.5 s, CLS < 0.1).

---

## B. Contacto (`/contacto`)

Es la página de SEO local del negocio.

| Campo | Valor |
|---|---|
| Palabra clave | tienda de suplementos Puente Alto, retiro en tienda, contacto Nutra Elements |
| title (<= 60) | `Contacto y retiro en tienda en Puente Alto \| Nutra Elements` (59) |
| meta description (<= 155) | `Retira tu pedido en Av. Concha y Toro 180, Puente Alto, de lunes a viernes de 9:00 a 20:00, o contáctanos. Despacho a toda la RM por $3.990.` (140) |
| canonical | `https://nutraelements.cl/contacto` |
| robots | `index, follow` (prelanzamiento: `noindex, nofollow`) |
| Open Graph / Twitter | como la home |

Encabezados:
```
H1  Contacto y retiro en tienda
  H2  Retiro en tienda en Puente Alto     (dirección, horario lunes a viernes 9:00 a 20:00, cómo retirar: número de pedido NE-xxxxxx)
  H2  Despacho en la Región Metropolitana ($3.990; enlace a /preguntas-frecuentes)
  H2  Escríbenos                          (formulario o datos de contacto; los PENDIENTE no se muestran)
  H2  Cómo llegar                         (mapa incrustado diferido o enlace a Google Maps; no cargar el iframe de entrada)
```
- La dirección y el horario son **texto en el HTML** (no solo una imagen ni un iframe).
- Si hay formulario: no debe enviar datos a terceros desde un script de pago; los formularios solo mejoran la conversión, no el SEO.
- NAP (nombre, dirección, teléfono) idéntico al del pie, a Google Business Profile y al JSON-LD.

JSON-LD: `Store` (tipo de LocalBusiness) + `BreadcrumbList`.
Campos obligatorios de `Store`: `@type`, `@id`, `name`, `url`, `address` (`PostalAddress` con `streetAddress`, `addressLocality`, `addressRegion`, `addressCountry`), `openingHoursSpecification`. Recomendados: `image`. Condicionales, **solo con dato real**: `telephone`, `email`, `geo`, `sameAs`, `postalCode`, `priceRange`. Hoy: `telephone`, `email`, `sameAs`, `geo`, `postalCode` son PENDIENTE y se omiten.
```json
{
  "@context": "https://schema.org",
  "@graph": [
    {
      "@type": "Store",
      "@id": "https://nutraelements.cl/#store",
      "name": "Nutra Elements",
      "url": "https://nutraelements.cl/",
      "image": "https://nutraelements.cl/media/tienda.webp",
      "parentOrganization": { "@id": "https://nutraelements.cl/#organization" },
      "address": {
        "@type": "PostalAddress",
        "streetAddress": "Av. Concha y Toro 180",
        "addressLocality": "Puente Alto",
        "addressRegion": "Región Metropolitana de Santiago",
        "addressCountry": "CL"
      },
      "openingHoursSpecification": [
        {
          "@type": "OpeningHoursSpecification",
          "dayOfWeek": ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday"],
          "opens": "09:00",
          "closes": "20:00"
        }
      ],
      "areaServed": { "@type": "AdministrativeArea", "name": "Región Metropolitana de Santiago" }
    },
    {
      "@type": "BreadcrumbList",
      "itemListElement": [
        { "@type": "ListItem", "position": 1, "name": "Inicio", "item": "https://nutraelements.cl/" },
        { "@type": "ListItem", "position": 2, "name": "Contacto" }
      ]
    }
  ]
}
```
- `image` requiere una foto real (PENDIENTE); sin ella se omite.
- Si el punto de retiro **no atiende público para compras presenciales**, Carlos debe decirlo: cambia el texto ("punto de retiro de pedidos") y el uso de `Store`. Hoy se trata como tienda con retiro porque así lo declaró.
- Cuando existan teléfono, correo y redes, el seo-specialist actualiza este documento y se agregan `telephone`, `email`, `sameAs` (y `contactPoint` en `Organization` de la home).

Enlaces internos: a `/preguntas-frecuentes` (despacho, retiro), a `/productos`, a las categorías y a `/nosotros`. Imágenes: foto de fachada o tienda (800 px de ancho mínimo, <= 150 KB, alt "Fachada de la tienda Nutra Elements en Av. Concha y Toro 180, Puente Alto" solo si es cierto), mapa diferido. Core Web Vitals: el iframe del mapa con `loading="lazy"` o un enlace; reservar su altura para CLS.

---

## C. Preguntas frecuentes (`/preguntas-frecuentes`)

| Campo | Valor |
|---|---|
| Palabra clave | despacho, retiro en tienda, medios de pago y seguimiento de pedidos (logística; no ingredientes) |
| title (<= 60) | `Preguntas frecuentes de compra \| Nutra Elements` (47) |
| meta description (<= 155) | `Resuelve tus dudas sobre despacho en la RM, retiro en tienda en Puente Alto, medios de pago, stock y seguimiento de tu pedido en Nutra Elements.` (144) |
| canonical | `https://nutraelements.cl/preguntas-frecuentes` |
| robots | `index, follow` (prelanzamiento: `noindex, nofollow`) |

Encabezados:
```
H1  Preguntas frecuentes
  H2  Despacho              (H3 = cada pregunta)
  H2  Retiro en tienda
  H2  Pagos
  H2  Pedidos y seguimiento
  H2  Productos y uso responsable   (no es médico: leer el rótulo, consultar a un profesional)
```
- Las respuestas están **visibles en el HTML** (acordeón `<details>` o equivalente con el texto en el DOM inicial). Sin respuestas cargadas por JavaScript.
- Contenido sujeto a lo confirmado: despacho $3.990 a toda la RM; retiro en Av. Concha y Toro 180, Puente Alto, de lunes a viernes de 9:00 a 20:00; Flow y transferencia con confirmación manual; seguimiento con el número NE-xxxxxx en DispatchTrack. **No se inventan** plazos de entrega, política de devoluciones, correos de aviso (el MVP no envía correos, D-008) ni montos de envío gratis.
- Las preguntas sobre "para qué sirve" un producto no van aquí.

JSON-LD: `FAQPage` (lo pide AGENTS.md) + `BreadcrumbList`.
Nota realista: desde 2023 Google solo muestra resultados enriquecidos de FAQ para sitios gubernamentales y de salud reconocidos, por lo que **no se espera rich result**. Se mantiene porque AGENTS.md lo exige y es válido. Condición: el marcado debe reflejar exactamente las preguntas y respuestas visibles.
Campos obligatorios: `mainEntity` (lista de `Question` con `name` y `acceptedAnswer` con `@type: Answer` y `text`).
```json
{
  "@context": "https://schema.org",
  "@graph": [
    {
      "@type": "FAQPage",
      "mainEntity": [
        {
          "@type": "Question",
          "name": "¿Cuánto cuesta el despacho?",
          "acceptedAnswer": {
            "@type": "Answer",
            "text": "El despacho a todas las comunas de la Región Metropolitana cuesta $3.990."
          }
        },
        {
          "@type": "Question",
          "name": "¿Puedo retirar mi pedido en tienda?",
          "acceptedAnswer": {
            "@type": "Answer",
            "text": "Sí. Puedes retirar en Av. Concha y Toro 180, Puente Alto, de lunes a viernes de 9:00 a 20:00."
          }
        }
      ]
    },
    {
      "@type": "BreadcrumbList",
      "itemListElement": [
        { "@type": "ListItem", "position": 1, "name": "Inicio", "item": "https://nutraelements.cl/" },
        { "@type": "ListItem", "position": 2, "name": "Preguntas frecuentes" }
      ]
    }
  ]
}
```
(El ejemplo muestra 2 de las preguntas; el marcado incluye todas las visibles.) El texto del JSON-LD es texto plano.

Enlaces internos: a `/contacto` (retiro), `/productos`, las categorías y `/nosotros`. Imágenes: ninguna obligatoria. Core Web Vitals: página de texto; sin riesgos salvo fuentes y scripts de terceros.

---

## Criterios de aceptación (auditoría)
I-01 las tres páginas responden 200 con su H1 y contenido en el HTML de `curl`. I-02 title/description/canonical según plantillas. I-03 `/contacto` muestra la dirección y el horario reales en el HTML, y el JSON-LD `Store` los repite idénticos; no contiene teléfono, correo ni redes inventados. I-04 `FAQPage` coincide exacto con las preguntas visibles y no incluye información no confirmada. I-05 `/nosotros` no contiene sellos, certificaciones ni alegaciones. I-06 BreadcrumbList válido en las tres. I-07 las respuestas no están ocultas tras JavaScript. I-08 Lighthouse móvil en objetivo. Globales: 06 sección 11.
