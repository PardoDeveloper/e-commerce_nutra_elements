# Handoff nextjs-frontend: P1 base del prototipo (D-028)

Fecha: 2026-10-14. Estado: terminado, pendiente de revisión. Sin git, sin Firebase, sin emuladores.

## Lo que quedó
Marca, tokens, layout global (header y footer), capa de datos mock, catálogo de la demo desde el xls, componentes compartidos y carrito del cliente. La home es provisoria (prueba visual).

## Reglas de uso para los siguientes agentes
- `<main>` ya NO tiene contenedor: envuelve el contenido de cada página en `<Container>`.
- Estilos: CSS plano. `globals.css` = tokens + base + utilidades; cada componente tiene su `*.module.css`. Para una página nueva, crea tu propio `*.module.css` junto a ella (evita editar `globals.css` en paralelo, solo agrega tokens si hace falta).
- Todo color, espacio y tamaño sale de las variables `--...` de `globals.css`. Nada suelto.
- Las páginas importan datos SOLO de `@/lib/data`. Esa capa es de servidor: no la importes en Client Components (los tipos sí, con `import type`).
- Los links del footer a /terminos, /privacidad, /cambios-y-devoluciones, /nosotros, /contacto, /preguntas-frecuentes, /productos y /categorias/[slug] hoy dan 404 hasta que se construyan.

## Marca (`public/brand/`)
- `scripts/build-brand.mjs` (`npm run brand:build`) usa `sharp` (ya viene con Next, no se instaló nada) y recorta el margen blanco de `img/elements.png` y `img/elements_2.png`. Los originales no se tocaron.
- Genera: `logo-icon.png` (184x160), `logo-icon.webp` (367x320), `logo-text.png` (450x120), y `src/app/icon.png` (512) y `src/app/apple-icon.png` (180), que Next sirve como favicon. Tienen fondo blanco (no transparente); en fondos de color, ponerlos sobre una base blanca (el footer lo hace).
- Header: ícono a la izquierda y texto al lado, un solo enlace a "/" con `aria-label`; `next/image` con `priority`.

## Tokens (`src/app/globals.css`)
Tomados del logo con muestreo de píxeles.

| Token | Valor | Uso |
|---|---|---|
| `--color-primary` | #048144 (verde del logo) | botones, enlaces. 4,9:1 sobre blanco |
| `--color-primary-hover` / `-soft` | #036a38 / #e7f4ec | hover / fondos suaves |
| `--color-navy` | #002848 (texto del logo) | títulos, footer |
| `--color-navy-hover` / `-soft` | #0a3a63 / #e8eef5 | |
| `--color-gold` | #a87840 (dorado del logo) | solo decorativo o texto grande (3,7:1) |
| `--color-gold-text` | #8a6130 | dorado para texto pequeño (5,5:1) |
| `--color-gold-soft` | #f8f1e5 | fondos, badge de descuento |
| `--color-bg`, `--color-bg-soft` | #fff, #f7f8f6 | fondos |
| `--color-border`, `-strong` | #e1e6e2, #c3ccc5 | bordes |
| `--color-text`, `--color-text-muted` | #17232e, #4a5864 | texto (14:1 y 7:1) |
| `--color-danger` / `-soft` | #b42318 / #fdecea | errores, sin stock |
| `--color-warning-soft/-text` | #fff4d6 / #7a4d00 | avisos (p. ej. modo demostración) |
| `--color-focus` | #0b57d0 | foco visible (3 px) |

Tipografía: Inter (`--font-body`) y Cormorant Garamond 600/700 vía `next/font` (`--font-heading`, solo titulares h1 a h4). Escala `--text-xs` a `--text-4xl` (las dos mayores son fluidas). Espacios `--space-1..6`, radios `--radius-sm/md/lg/pill`, `--shadow-sm/md`, `--tap-min` (44 px), `--content-max`, `--content-narrow`, `--header-h`.
Utilidades globales: `.visually-hidden`, `.skip-link` (ya en el layout), `.product-grid` (2/3/4 columnas), `.category-grid` (2/3/6), `.prose`, `.section`, `.section--soft`.
Contraste calculado a mano; no se pasó herramienta automática.

## Capa de datos (`src/lib/data/`)
Import: `import { getProducts } from "@/lib/data"` (tipos: `import type { Product } from "@/lib/data"`).

```ts
getCategories(): Promise<Category[]>                 // 6, ordenadas por `order`
getCategory(slug: string): Promise<Category | null>
getProducts(o?: { category?: string; q?: string; limit?: number }): Promise<Product[]>  // orden por nombre; q sin tildes
getProduct(slug: string): Promise<Product | null>
getRelatedProducts(sku: string, limit = 4): Promise<Product[]>  // primero misma familia, luego misma categoría
getPublicSettings(): Promise<PublicSettings>
```
- `Product`: `sku, name, slug, description|null, shortDescription|null, categoryId, images[], price, discount|null, finalPrice, inStock, format, unitsPerPack, family, seo`. NO trae `stock` ni `reserved` (solo `inStock`) ni `sourceName`, `barcode`.
- `Category`: `slug, name, description, order, seo`. `PublicSettings`: `shippingFee 3990, freeShippingThreshold null, communes (52 de la RM), pickup {enabled, address, hours}, maxQtyPerItem 10`.
- `mock.ts` es la única implementación y lleva el comentario de que se reemplaza por Firestore (solo cambia el export de `index.ts`). Lee `src/data/catalog.local.json` si existe; si no, `catalog.fixture.json`. Las funciones son `async` para que el cambio a Firestore no toque las páginas.
- `description` es null en la demo y `shortDescription` es un texto neutro generado ("X. Suplemento alimentario en cápsulas."). Las páginas deben tolerar `description === null`. Las páginas de producto deben redactar su texto sin declaraciones de salud.
- Hay 2 productos con descuento solo en el fixture. El catálogo real no tiene descuentos (no se inventaron precios).

## Catálogo de la demo
- `npm run demo:catalog` (`scripts/build-demo-catalog.mjs`) lee `productos_nutra_elements.xls` (raíz) y escribe `src/data/catalog.local.json`. Toma solo ID (sku, D-016), nombre, precio y `inStock` (stock > 0; negativo o vacío = false, D-018). Nunca guarda la cantidad (hay un test para eso).
- `.gitignore`: `src/data/*.local.json`. `git check-ignore -v src/data/catalog.local.json` -> `.gitignore:66:src/data/*.local.json`.
- SheetJS: `xlsx@0.20.3` desde `https://cdn.sheetjs.com/xlsx-0.20.3/xlsx-0.20.3.tgz` (devDependency; 0.20.3 es la última según https://cdn.sheetjs.com/xlsx.lst). firebase-architect puede reutilizarla en 2B.6.
- Las reglas viven en `src/lib/data/catalog-rules.ts` (con tests): nombre para mostrar, slug, familia, unidades y `CATEGORY_RULES` (tabla ordenada de palabras clave; la primera coincidencia gana). El script lo importa directo: Node 24 ejecuta TypeScript, y emite un aviso inocuo `MODULE_TYPELESS_PACKAGE_JSON`.
- Los nombres salen como "Vitamina B12 x 90 cápsulas" (se normaliza "x"; "Vit" se expande a "Vitamina"; "Citrato Potasio" a "Citrato de Potasio"). El slug no lleva la "x" (`vitamina-b12-90-capsulas`).
- Fixture: 9 productos ficticios `DEMO-001..009`, cubren las 6 categorías, uno sin stock y dos con descuento.

### Mapeo de categorías (33 productos)
| Categoría | Reglas (palabras clave) | Productos |
|---|---|---|
| minerales | zinc, potasio (antes que "ultra") | 3 |
| bienestar | ultra, spirulina, melena, curcuma, cranberry | 8 |
| magnesio | magnesio | 6 |
| omega-3 | omega | 3 |
| belleza | colageno, biotina | 3 |
| vitaminas | vitamina, "vit ", b-complex, b12 | 10 |

Decisión a confirmar: "Ultra Zinc" cae en minerales (no en bienestar) porque la tabla de familias del contrato data-model 2.2 pone zinc en minerales y la línea Ultra lista solo Light, Relax y Lax. Así minerales queda con 3 SKU (el contrato exige 3 como mínimo para indexar la categoría). Si Carlos prefiere Ultra Zinc en bienestar, mover la regla `ultra` por encima de la de minerales. "Cranberry + Vit C + Vit E" va en bienestar según D-023. Ninguna fila quedó sin regla.

## Carrito (`src/lib/cart/`, solo cliente)
No requiere Provider: es un store externo (`useSyncExternalStore`) persistido en localStorage (`ne.cart.v1`), sincronizado entre pestañas. En el servidor y en la primera hidratación el carrito sale vacío (sin desajustes); `hydrated` indica cuándo ya es real.

```ts
import { useCart, cartActions, toOrderItems, type CartLine } from "@/lib/cart";
const { lines, count, subtotal, hydrated, add, remove, setQuantity, clear } = useCart();
add(item: { sku, name, slug, categoryId, unitPrice, finalPrice }, qty = 1)  // fusiona SKU duplicados (D-027), máx. 10 por SKU, 20 líneas
remove(sku); setQuantity(sku, qty)  // qty < 1 quita la línea
toOrderItems(lines) // [{ sku, qty }]: lo único que debe enviar el checkout (D-005)
```
- `CartLine = { sku, name, slug, categoryId, unitPrice, finalPrice, qty }`. Los precios son snapshot SOLO para mostrar; `subtotal` también. El servidor recalcula.
- `cartActions` (add/remove/setQuantity/clear) funciona sin hook, p. ej. en un handler al confirmar el pedido (`cartActions.clear()`).
- La lógica pura (sin React) está en `logic.ts`, con tests. El máximo por SKU usa 10 fijo; para usar `settings.maxQtyPerItem` hay que pasar `max` a las funciones puras (pendiente si importa).

## Componentes (`src/components/`)
| Componente | Firma / uso |
|---|---|
| `Container` | `{ as?, size?: "default"\|"narrow", className?, id? }` |
| `SectionHeading` | `{ title, subtitle?, level?: 1\|2\|3 (=2), align?, action?, id? }` |
| `Button` | `{ variant?: "primary"\|"secondary"\|"outline"\|"ghost", size?: "md"\|"lg", fullWidth? }`. Con `href` es un `Link`; sin `href` es `<button type="button">` y acepta atributos de botón |
| `Price` | `{ price, finalPrice?, size?: "md"\|"lg" }` -> `$12.990`; con `finalPrice < price` muestra el precio de lista tachado y badge `-15%`; texto oculto para lectores de pantalla |
| `StockBadge` | `{ inStock }` (texto + ícono) |
| `Breadcrumbs` | `{ items: { label, href? }[] }`, último con `aria-current="page"`. No emite JSON-LD BreadcrumbList (lo hace la página) |
| `CategoryCard` | `{ category: {slug, name}, productCount? }` |
| `ProductImage` | `{ name, categoryId?, alt?, className? }`: SVG de frasco con etiqueta; color según la categoría. Cuadrado: el contenedor define el ancho. Sustituir por `next/image` cuando haya fotos (`product.images[0]`) |
| `ProductCard` | `{ product, categoryName?, hideAddToCart? }`: usar dentro de `<ul className="product-grid"><li>`. Todo el bloque es clicable hacia `/productos/[slug]` |
| `AddToCartButton` (cliente) | `{ product, qty?, size?, fullWidth?, variant?, label? }`: agrega al carrito, anuncia con `aria-live`, deshabilitado sin stock. Úsalo también en la ficha |
| `layout/SiteHeader`, `SiteFooter`, `MainNav`, `CartLink` | ya montados en `app/layout.tsx` |

Header: logo, Productos y las 6 categorías, buscador (formulario GET a `/productos?q=`, funciona sin JS), carrito con contador y menú móvil (botón con `aria-expanded`/`aria-controls`, cierra con Escape y al elegir un enlace). Barra en línea desde 1100 px. Footer: retiro (dato de `getPublicSettings`), enlaces informativos y legales, categorías y medios de pago (Flow y Transferencia bancaria). Enlace "Saltar al contenido". El layout no importa el SDK de Firebase.

## Decisiones
- Estilos con CSS Modules más tokens globales (cero dependencias, sin Tailwind).
- Titulares en serif (Cormorant Garamond) por coherencia con el logo; cuerpo en Inter.
- Carrito como store externo en vez de Context: sin Provider ni desajuste de hidratación.
- Botón de la tarjeta dice "Agregar" (a 360 px "Agregar al carrito" ocupaba 3 líneas); el nombre accesible sí incluye el producto.
- No se usó `server-only` (no está instalado y rompería los tests); la capa de datos usa `node:fs`, así que cualquier import desde un Client Component falla en el build.
- `AGENTS.md` no se tocó (no se ejecutó `next dev`).

## Verificación (ejecutada)
- `npm run lint`: sin errores. `npm test`: 5 archivos, 25 tests en verde (carrito, formato CLP, reglas del catálogo, capa mock, interruptor de sitio). `npm run build`: OK; rutas `/`, `/_not-found`, `/icon.png`, `/apple-icon.png`, `/robots.txt`, `/sitemap.xml`, todas estáticas.
- `next start -p 3472`: `/` responde 200 con el enlace del logo ("Nutra Elements, ir al inicio"), el `<footer>` con "Av. Concha y Toro 180, Puente Alto", los 6 enlaces de categoría y los medios de pago; `/brand/logo-text.png` 200; `/icon.png` 200. Servidor cerrado.
- Captura con Edge headless a 1280 px y en un iframe de 360 px: header, categorías, tarjetas y footer se ven correctos, sin desborde horizontal.
- `git status --short -uall` no muestra `catalog.local.json`, `.env`, `.next` ni el xls; los JSON no contienen la clave `stock`.

## Sin verificar
- Menú móvil abierto, cierre con Escape, buscador y contador del carrito en el navegador (no hay herramienta de interacción; solo tipos, lint y la captura estática). Probar a mano: agregar productos, recargar, abrir y cerrar el menú.
- Auditoría de accesibilidad con herramienta (axe/Lighthouse), contraste medido solo por cálculo, y lectura con lector de pantalla.
- Pantalla a 768 px, el aspecto de las tarjetas con descuento (solo fixture) y sin stock.
- Aviso del build de Next sobre `.env`/`.env.local`: no se leyeron.
- El script `demo:catalog` depende de que Node ejecute `.ts` (Node 24 OK); en versiones anteriores a 22.18 falla.

## Pedidos al tech-lead
- Confirmar con Carlos "Ultra Zinc" en minerales.
- `img/` está sin versionar; `public/brand/*` y los dos íconos de `src/app/` son los que usa el sitio. Devops debe decidir si los originales de `img/` se versionan (el repo es público).
- Antes de producción: reemplazar `mock.ts` por Firestore, quitar el texto neutro generado de `shortDescription` y revisar con un profesional los textos de Ultra, cranberry, melena de león y cúrcuma (D-023).
