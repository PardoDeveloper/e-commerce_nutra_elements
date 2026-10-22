# Handoff nextjs-frontend: banner en la home (2026-10-21)

## Qué se hizo
- `public/banner.jpeg` (1565x629) se integra en el hero de `/` con `next/image`: `priority`, `sizes="100vw"`, `quality={75}`, `width=1565 height=629`, alt "Nutra Elements: productos naturales premium. Hojas verdes, mortero y frascos de vidrio ámbar."
- El H1 (único), el párrafo y los CTA siguen como HTML real, **debajo** de la imagen, dentro de la misma tarjeta (fondo degradado de tokens). Contenido SEO 01 sin cambios.
- Next sirve WebP/AVIF por defecto; no hizo falta tocar `next.config.ts` (verificado: `/_next/image` devuelve `image/webp`).

## Solución móvil
- Desde 640 px: proporción original `aspect-ratio: 1565/629`, imagen completa.
- Bajo 640 px: `aspect-ratio: 16/10` con `object-fit: cover; object-position: left center`. Se recorta solo la escena derecha; el logo y el lema (hasta ~45 % del ancho) quedan completos y más grandes que con la imagen entera (a 360 px entera el logo medía ~80 px). Se descartó superponer texto sobre la imagen: tapa el logo y complica el contraste.
- Layout: no se usó fondo superpuesto; el banner es el borde superior de la tarjeta (`overflow: hidden`, radio de token).

## Archivos
- `src/app/page.tsx`
- `src/components/store/store.module.css` (`.hero`, `.heroImage`, `.heroBody`; solo CSS del módulo, sin tocar globals.css)

## Verificación
- lint OK, 313 tests OK, build OK. `next start` en 3457: home 200, 1 H1, img con alt, width/height y preload `as=image`.
- Capturas Edge headless a 1280 y 768/360 revisadas: logo y lema completos.

## Sin verificar
- Edge headless no baja de ~500 px de ventana, así que la captura de 360 px sale recortada a la derecha; el desborde real a 360 no se midió (el CSS usa width:100% y no hay anchos fijos).
- 1024 px sin captura. LCP real no medido (Lighthouse).
- El `<img>` no muestra `fetchpriority="high"` en el HTML; sí lleva preload.

## Propuesta (no hecha)
- No usar el banner en otras páginas. Podría servir como imagen `og:image` de la home tras recortarla a 1200x630 (decisión del seo-specialist/tech-lead).

---

# Ajuste posterior: solo imagen y botón (2026-10-21)

Petición de Carlos: "Deja la imagen con el botón de ver catálogo, quita el texto."

## Qué cambió
- Se eliminaron de verdad el párrafo y los CTA secundarios ("Retiro en tienda en Puente Alto" y el antiguo "Ver todo el catálogo" del hero). El hero queda con la imagen y un único botón "Ver catálogo" (`/productos`, componente `Button` size lg).
- El H1 sigue en el HTML, único, con clase `srOnly` (position absolute 1px, `clip-path: inset(50%)`, `white-space: nowrap`; sin `display:none`). Texto: "Nutra Elements: suplementos en cápsulas de marca propia" (el del contrato, con la marca delante para coincidir con lo que muestra la imagen).
- Botón debajo de la imagen, centrado, dentro de la tarjeta, con `padding: var(--space-3) var(--space-4)`. Se descartó ponerlo sobre la imagen: el logo y el lema ocupan el centro y en móvil la imagen está recortada, así que cualquier posición podría tapar algo. Debajo es la opción más limpia y no depende del tamaño.
- Se eliminaron los CSS sin uso (`.heroBody`, `.hero h1`, `.hero p`).
- `fetchPriority="high"` junto con `priority`: compatible en Next 16 sin warnings en build; el `<img>` ya lo emite.

## Para el tech-lead / seo-specialist
- El contrato `contracts/seo/01-inicio.md` pide un texto introductorio de 40 a 80 palabras bajo el H1 (con "Puente Alto", "RM", "retiro en tienda"). Por instrucción de Carlos ya no existe. Esas menciones siguen en las secciones "Despacho en la RM y retiro en tienda en Puente Alto" y "Por qué Nutra Elements", pero conviene que el seo-specialist confirme o actualice el contrato. No lo modifiqué.

## Verificación
- lint OK, 313 tests OK, build OK.
- `next start` en 3461 (cerrado): home 200, `grep -c "<h1"` = 1 (con clase srOnly), img con alt y `fetchPriority="high"`, un solo "Ver catálogo" en el hero.
- Capturas Edge headless a 1280, 768 y 360 revisadas: logo y lema completos, botón visible y sin tapar nada. A 360 la ventana mínima de Edge recorta a la derecha, así que no se midió el ancho real.

---

# Ajuste 3: botón sobre la imagen y banner más bajo (2026-10-21)

Petición de Carlos: botón "Ver catálogo" dentro de la imagen y menos altura.

## Qué cambió (solo `src/app/page.tsx` y `src/components/store/store.module.css`)
- `.hero` con `position: relative`; `.heroActions` absoluto sobre la imagen. El `Button` pasa de `size="lg"` a `md` (alto 44 px = `--tap-min`), verde de marca con texto blanco (AA), sombra sutil, foco visible heredado de `Button`. Fuente y padding horizontal con `clamp()` según el ancho.
- Altura por `aspect-ratio` + `object-fit: cover` (la imagen no se tocó):
  - desde 640 px: `1565/505` (~3,1:1), `object-position: left 77%`, `max-height: 420px`;
  - bajo 640 px: `2/1`, `object-position: left center`.
- Posición del botón: desde 1024 px, centrado en el eje del logo (`left: 28%`) y a `bottom: 4%`, justo debajo del swoosh del lema. Bajo 1024 px va abajo a la derecha (sobre mortero y mesa), porque la franja bajo el lema queda demasiado baja para un botón de 44 px (a 768 casi tocaba "Premium").
- Se mantiene: un solo `<h1>` `srOnly`, `next/image` con `priority`, `fetchPriority="high"`, `sizes="100vw"`, alt descriptivo, sin más texto visible.

## Recorte de la imagen (a 3,1:1)
- Alto original 629 px; visible 505 px: se recorta 124 px = **19,7 %** (~15 % arriba, ~5 % abajo). Logo (18 %-80 % del alto) y lema completos; el borde superior de las hojas queda a ~16 px de la imagen original sobre el logo.
- En móvil 2:1 no hay recorte vertical (a 360 px la imagen escala por altura y se recorta solo a la derecha, ~20 % del ancho).
- Cuanto más angosto el contenedor, menos recorte vertical sirve: no se probó 3,5:1 porque con 3,4:1 el botón ya no cabía bajo el lema sin tapar el swoosh (probé 3,2:1: el botón rozaba el swoosh).

## Alturas medidas (capturas, iframe del ancho indicado)
| Ancho | Antes | Después | Reducción |
|---|---|---|---|
| 1280 (contenedor 1168) | ~469 px (2,49:1) | 377 px | -20 % |
| 1024 (contenedor 976) | ~392 px | 315 px | -20 % |
| 768 (contenedor 720) | 289 px | 232 px | -20 % |
| 360 (contenedor 328) | 205 px (16:10) | 164 px | -20 % |

El `max-height` de 420 px no llega a aplicar con el contenedor actual (máx. 377 px); es solo salvaguarda. No se llegó a 340-380 px estrictos porque más recorte obliga a cortar el lema.

## Verificación
- lint OK, 313 tests OK, build OK.
- `next start` en 3581 (cerrado): home 200; 1 `<h1>`; 1 "Ver catálogo" y 1 enlace dentro de `.hero`; `fetchPriority="high"` presente.
- Capturas Edge headless a 1280, 1024, 768 y 360 px (iframe del ancho exacto dentro de una ventana de 1300 px, así que 360 y 768 son reales) revisadas: logo, lema y botón sin solaparse, sin desborde, la sección "Compra por categoría" sigue con su espaciado normal.

## Sin verificar
- Desborde horizontal medido con `scrollWidth`: no se midió numéricamente; solo visual (las capturas no muestran barras ni cortes).
- Anchos intermedios (p. ej. 640-700 y 1023-1100 px) y 1920+ sin captura.
- Navegación por teclado/foco del botón no probada en navegador (usa el foco de `Button`).
- En móvil y tablet el botón tapa parte de la escena decorativa (frascos), no texto ni logo.
