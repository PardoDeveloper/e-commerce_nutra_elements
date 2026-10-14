# SEO 00 - Palabras clave y prioridades (BORRADOR PRELIMINAR)

Estado: **borrador hasta aprobación del tech-lead**. Autor: seo-specialist. Fecha: 2026-10-14.
Todo lo de este documento es **preliminar** hasta recibir `productos_nutra_elements.xlsx` (catálogo real, categorías, ingredientes y formatos).

## 0. Cómo leer las prioridades

- **No tengo datos reales de volumen de búsqueda** (no hay acceso a Google Keyword Planner ni Search Console, y el sitio aún no existe). Por eso uso prioridad **cualitativa (alta, media, baja)**, basada en intención comercial, cercanía a la compra y competencia observada. No hay cifras inventadas.
- Cuando haya datos (Search Console tras el lanzamiento, o Keyword Planner con cuenta de Google Ads), se recalibra. Sin Google Analytics (decisión de negocio), Search Console será la única fuente de datos de búsqueda.
- Marca nueva (Nutra Elements, marca propia, sin historia): competir por términos genéricos como "proteína whey" contra Falabella, Lider, Paris y Mercado Libre es de largo plazo. A corto plazo rinden más las búsquedas **específicas por producto, formato y local (RM)**, y la marca.

## 1. Lo observado en los resultados (WebSearch, Chile)

Búsquedas hechas: "comprar proteína whey Chile suplementos tienda despacho Santiago", "comprar creatina monohidrato Chile". Limitación: la herramienta es de búsqueda general (no geolocalizada a Chile), así que es una muestra orientativa, no una medición.

- Los resultados transaccionales los dominan **grandes retailers y marketplaces**: Lider.cl, Falabella, Paris.cl y Mercado Libre Chile. Aparecen páginas de categoría y fichas con precio, despacho gratis y reseñas.
- Los listados destacan señales de compra: precio en CLP, "despacho gratis a Santiago", formato (1 kg, 300 g, N porciones), sabor, y calificación. Esto indica qué debe verse en title, descripción y JSON-LD de nuestras fichas: precio, formato, porciones, despacho RM.
- Se vio marca de terceros (Zein, Ultimate Nutrition, Suplidaily, Primetech, Briahlabs, Düa Labs). No analicé tiendas especializadas chilenas en profundidad; **pendiente** revisar competidores especializados (tiendas dedicadas a suplementos) antes de cerrar prioridades.
- Oportunidad: nadie en la muestra se posiciona por "marca propia + origen/calidad + retiro en tienda en Santiago". Es nuestro diferenciador local.

## 2. Clusters de palabras clave (preliminares)

Convención: `[X]` = reemplazar por producto/ingrediente real de la planilla. Prioridad = alta/media/baja cualitativa.

### 2.1 Transaccional (comprar)
Prioridad general: **alta para variantes locales y de producto específico**, media para genéricas.

| Término | Variantes chilenas/locales | Prioridad |
|---|---|---|
| comprar creatina | comprar creatina Chile, comprar creatina Santiago, creatina monohidrato precio Chile, creatina despacho RM | alta |
| proteína whey | proteína whey Chile, comprar proteína whey Santiago, whey protein precio Chile, proteína whey despacho a domicilio RM | alta |
| comprar colágeno | colágeno hidrolizado Chile, comprar colágeno en polvo Santiago | media |
| comprar omega 3 | omega 3 Chile, comprar omega 3 Santiago | media |
| comprar vitaminas | vitamina D3 Chile, vitamina C comprar Chile, multivitamínico Chile | media |
| minerales | magnesio Chile comprar, zinc comprar Chile | media |
| preentreno | preentreno Chile, comprar pre workout Santiago | media |
| tienda | tienda de suplementos Santiago, suplementos con retiro en tienda Santiago, suplementos online Chile | media (alta localmente) |
| ofertas | ofertas suplementos Chile, suplementos en oferta | baja a media (depende de promociones) |

### 2.2 Comercial (comparar/elegir)
Prioridad: **media**; buen terreno para categorías y guías con enlaces a producto.

- mejor creatina Chile, mejor proteína whey Chile, whey vs isolate, creatina monohidrato vs creatina HCl, qué colágeno elegir, magnesio citrato vs glicinato, precio por porción, suplementos de marca chilena.
- Se trabajan en `/blog` y en el texto de categoría (no en fichas).

### 2.3 Informacional (cómo/qué es)
Prioridad: **baja a media al lanzamiento** (competidores fuertes en contenido, retorno lento); se hace después del día uno.

- qué es la creatina, cómo tomar proteína whey, para qué sirve el omega 3 (ver sección 6: formularlo sin atribuir efectos terapéuticos), diferencia entre proteína whey e isolate, cuánta proteína necesito al día, qué es el colágeno hidrolizado.

### 2.4 Marca
Prioridad: **alta** (es lo más fácil de ganar y lo que protege el nombre).

- nutra elements, nutraelements, nutraelements.cl, nutra elements Chile, nutra elements opiniones (solo si hay reseñas reales), nutra elements creatina / proteína / [producto].
- Acción: la home y /nosotros deben ser la mejor respuesta a la búsqueda de marca; schema Organization con `sameAs` de redes (cuando existan).

## 3. Mapa palabra clave a URL (sin canibalización)

Regla: **una intención principal por URL**. Una palabra clave principal no se repite entre URLs. Las fichas apuntan a "producto + formato"; las categorías al término genérico; el blog a informacional/comparativo.

| URL | Palabra clave principal | Secundarias | Intención |
|---|---|---|---|
| `/` | nutra elements (marca) + "suplementos alimentarios Chile" | tienda de suplementos Santiago, suplementos marca propia, despacho RM, retiro en tienda | marca + transaccional amplia |
| `/productos` | catálogo de suplementos Nutra Elements | todos los suplementos, comprar suplementos online Chile | navegación; **evitar competir con la home**: title distinto, foco en "catálogo completo" |
| `/categorias/proteinas` | proteína whey Chile | comprar proteína Santiago, proteína en polvo | transaccional |
| `/categorias/creatina` | comprar creatina Chile | creatina monohidrato, creatina Santiago | transaccional |
| `/categorias/vitaminas` | vitaminas Chile | vitamina D3, vitamina C, multivitamínico | transaccional |
| `/categorias/minerales` | minerales suplementos Chile | magnesio, zinc | transaccional |
| `/categorias/colageno` | colágeno hidrolizado Chile | colágeno en polvo | transaccional |
| `/categorias/omega-3` | omega 3 Chile | aceite de pescado, EPA DHA | transaccional |
| `/categorias/preentrenos` | preentreno Chile | pre workout | transaccional |
| `/productos/[slug]` | "[producto] [formato] Nutra Elements" (p. ej. "creatina monohidrato 300 g Nutra Elements") | sabor, porciones, precio, despacho RM | transaccional por producto |
| `/blog` | guías de suplementación (índice) | blog de suplementos Chile | informacional, índice |
| `/blog/[slug]` | una consulta informacional por artículo (sección 7) | long tail | informacional/comercial |
| `/nosotros` | quiénes son Nutra Elements / marca propia | calidad, origen, tienda en [comuna] | marca |
| `/contacto` | contacto Nutra Elements | dirección, horario, retiro en tienda, mapa | marca/local (LocalBusiness) |
| `/preguntas-frecuentes` | preguntas frecuentes de compra: envío RM, retiro, pagos, seguimiento | despacho $3.990, Flow, transferencia, DispatchTrack | soporte (FAQPage) |

Reglas anti-canibalización:
1. Las fichas **no** apuntan a "comprar creatina" a secas; eso es de la categoría. La ficha usa nombre + formato + marca.
2. Los artículos del blog enlazan a la categoría con anchor del término genérico; no replican su keyword principal.
3. FAQ solo habla de logística/compra, no de beneficios de ingredientes.
4. Si una categoría tiene pocos productos (< 3), valorar `noindex,follow` o fusionar, para no dejar páginas delgadas. Decidir con la planilla.
5. Filtros, orden y paginación (`?orden=`, `?pagina=`): canonical a la URL base sin parámetros de orden/filtro; paginación con URLs rastreables y canonical a sí misma.

## 4. Prioridades para lanzar en una semana

### Imprescindible el día uno (bloqueantes si faltan)
1. **Renderizado en servidor**: fichas, categorías, home, catálogo, nosotros, contacto y FAQ como Server Components o SSG/ISR. Una ficha que solo renderiza en el navegador es BLOQUEANTE.
2. **Metadata** con `generateMetadata`: title (<= ~60), description (<= ~155), canonical absoluta con `https://nutraelements.cl`, Open Graph y Twitter Card con imagen.
3. **sitemap.ts** (productos y categorías activos, lastmod real; sin URLs privadas) y **robots.ts**.
4. **robots/noindex por entorno**: dev bloquea todo (robots Disallow: / + `noindex`); producción indexable.
5. **noindex** (meta robots y cabecera) en `/carrito`, `/checkout`, `/cuenta` y `/admin` (y bloqueado en robots donde corresponda; ojo: bloquear en robots.txt impide leer el noindex, así que usar `noindex` en la página y **no** depender solo de Disallow para estas rutas).
6. **JSON-LD**: `Product` + `Offer` (precio CLP, `availability`, `priceCurrency: "CLP"`, `url`, `priceValidUntil` si hay oferta) y `BreadcrumbList` en fichas y categorías; `Organization` en home; `LocalBusiness` (o `Store`) en /contacto y/o home **solo cuando se confirme dirección y horario** del retiro en tienda; `FAQPage` en /preguntas-frecuentes.
7. **Locale es-CL**: `<html lang="es-CL">`, `og:locale = es_CL`. hreflang: con un solo idioma/país basta una autorreferencia opcional (`es-CL` y `x-default`); no es crítico, no inventar versiones que no existen.
8. **404 real** (status 404) y 301 para cualquier URL que cambie de slug.
9. **Imágenes y Core Web Vitals**: `next/image`, formatos modernos, dimensiones explícitas (CLS < 0.1), la imagen principal de la ficha con `priority` (LCP < 2.5 s), `alt` descriptivo, fuentes con `next/font`, sin scripts de terceros innecesarios (INP < 200 ms). Las fotos de producto subidas por admin deben redimensionarse/optimizarse (riesgo de imágenes pesadas).
10. **Títulos y descripciones únicos** por página generados con plantilla desde los datos del producto.
11. Verificar el sitio en **Search Console** (DNS de nutraelements.cl pendiente; es dependencia) y enviar el sitemap.

### Puede esperar (post-lanzamiento)
- Blog (índice y artículos) y contenidos largos; en el lanzamiento basta una página `/blog` con 2 o 3 artículos si hay tiempo, o dejarla fuera del sitemap hasta tener contenido real (evitar página vacía indexable).
- Textos extensos de categoría (basta un párrafo introductorio de 80 a 150 palabras al inicio).
- Enlazado interno avanzado, productos relacionados por intención, reseñas.
- Schema `HowTo`/`Article` más rico, `VideoObject`, hubs temáticos.
- Redacción optimizada de las ~70 fichas: al día uno, plantillas con datos reales; afinar después según Search Console.

### Objetivos de rendimiento
LCP < 2.5 s, INP < 200 ms, CLS < 0.1, medidos en móvil. Riesgos: imágenes de producto pesadas, fuentes, scripts de pasarela cargados en páginas públicas (cargar Flow solo en checkout), widgets de terceros.

## 5. Valoraciones (aggregateRating) en el JSON-LD

Situación: AGENTS.md pide `aggregateRating`, pero **no hay sistema de reseñas**.

Recomendación:
1. **Día uno: no incluir `aggregateRating` ni `review`.** Un `Product` con `offers` válido ya es elegible para resultados de comerciante/producto. Inventar valoraciones (o ponerlas "de mentira") viola las directrices de Google sobre datos estructurados y puede generar acción manual; además es engañoso para el consumidor.
2. Directrices que aplican: el marcado debe reflejar contenido **visible en la página** para el usuario; las reseñas deben ser reales, de clientes, y no escritas por el propio negocio; no usar valoraciones de otros sitios copiadas sin permiso; reseñas "autoservicio" en `Organization`/`LocalBusiness` no dan estrellas.
3. **Fase posterior**: construir un sistema de reseñas (solo clientes con pedido entregado, moderación sin censurar lo negativo, una reseña por pedido y producto). Cuando exista al menos algunas reseñas reales visibles en la ficha, generar `aggregateRating` (`ratingValue`, `reviewCount` o `ratingCount`, `bestRating`) calculado **desde los datos reales**, y `review` individuales visibles.
4. Pedir a firebase-architect que el modelo de producto prevea campos calculados (promedio y cantidad) para que el frontend los incluya solo si `reviewCount > 0`. Es condicional en código: si no hay reseñas, el campo no se emite.
5. Propuesta de ajuste a AGENTS.md (para que decida el tech-lead): cambiar "valoraciones" por "valoraciones, solo cuando existan reseñas reales".

## 6. Cumplimiento del contenido (guía breve)

**Aviso: esto no es asesoría legal.** Es una guía de redacción prudente basada en el Reglamento Sanitario de los Alimentos (D.S. 977/1996, MINSAL; art. 114 sobre declaraciones de propiedades saludables, que deben tener respaldo científico reconocido) y en la restricción de AGENTS.md. Mi búsqueda no pudo confirmar el texto consolidado vigente ni modificaciones recientes: **recomiendo validar los textos con un profesional (químico farmacéutico, nutricionista o abogado) y revisar leychile.cl y el SEREMI de Salud / ISP**, además de confirmar los registros/autorizaciones sanitarias de cada producto y que el rótulo real coincida con lo publicado.

### Evitar siempre
- Curar, tratar, prevenir, "combate", "elimina", "revierte", "alivia" (enfermedades o síntomas): diabetes, hipertensión, colesterol alto, cáncer, artritis, depresión, ansiedad, insomnio, osteoporosis, COVID, etc.
- Sustituir medicamentos o tratamientos ("reemplaza", "en vez de tu medicamento").
- Promesas de resultados ("baja X kilos en 7 días", "aumenta masa muscular garantizado").
- "Aprobado por el ISP/MINSAL", "certificado" o sellos que no tengamos.
- Testimonios o "antes y después" que sugieran efectos médicos.
- Dirigirse a niños con mensajes de rendimiento o dietas.
- Afirmaciones comparativas sin respaldo ("el mejor", "el más puro") sin evidencia.

### Usar
- Descripciones factuales de la composición y del formato: "Creatina monohidrato en polvo, 300 g, 60 porciones".
- Declaraciones nutricionales solo si coinciden con el rótulo y la tabla nutricional (por ejemplo, "aporta X g de proteína por porción").
- Fórmulas prudentes y neutras: "suplemento alimentario", "complemento de la alimentación", "pensado para personas que entrenan", "forma parte de una alimentación variada y equilibrada".
- Recomendación de consultar a un profesional de la salud, embarazo y lactancia, no superar la porción recomendada, "no es un medicamento".
- Lo que dice el rótulo aprobado (ingredientes, alérgenos, modo de uso, advertencias), copiado fielmente.
- Para ingredientes con función conocida, usar solo lo permitido por el rótulo o la normativa y con validación profesional previa; si hay duda, describir el producto, no el efecto.

| En vez de | Escribir |
|---|---|
| "El omega 3 previene enfermedades del corazón" | "Aceite de pescado con EPA y DHA, 60 cápsulas. Suplemento alimentario." |
| "El colágeno cura las articulaciones" | "Colágeno hidrolizado en polvo, sabor neutro, 30 porciones." |
| "Vitamina D para no enfermarte" | "Vitamina D3 en cápsulas; complemento de una alimentación variada." |

## 7. Slugs

### Categorías (provisorias, ajustar a la planilla)
`proteinas`, `creatina`, `vitaminas`, `minerales`, `colageno`, `omega-3`, `preentrenos`, y opcionales según catálogo: `aminoacidos`, `quemadores`... (**ojo**: "quemadores de grasa" invita a declaraciones problemáticas; preferir `control-de-peso` solo si el catálogo lo requiere y con redacción neutra), `energia-y-rendimiento`, `packs-y-ofertas`.
Reglas: minúsculas, sin tildes ni ñ (`colageno`, no `colágeno`), guiones, singular/plural consistente (plural para familias, `creatina` por uso común), sin stop words, estables (cambiar un slug exige 301).

### Productos
Formato: `/productos/[tipo-producto]-[variante-clave]-[formato]` en minúsculas, sin SKU visible ni marca repetida, ejemplos: `creatina-monohidrato-300g`, `proteina-whey-chocolate-1kg`, `colageno-hidrolizado-limon-30-porciones`, `omega-3-60-capsulas`.
- Único, generado desde el nombre; si choca, añadir sabor o formato (no números aleatorios).
- Una vez publicado no cambia aunque cambie el precio o stock; si el producto se descontinúa, mantener la ficha con estado "agotado" o 301 a su categoría.
- El SKU va en el JSON-LD (`sku`), no en la URL.

## 8. Ideas de blog (informacionales, cumplen la normativa)

Todos con enfoque educativo y neutro; sin prometer efectos de salud; con aviso de consultar a un profesional. Prioridad post-lanzamiento.

1. Qué es la creatina monohidrato y cómo se usa como suplemento (formato, porciones, modo de uso según rótulo).
2. Proteína whey, isolate y concentrada: diferencias de composición y cómo leer la tabla nutricional.
3. Cómo elegir un suplemento: guía para leer rótulos y qué mirar (ingredientes, porciones, alérgenos).
4. Cómo calcular el precio por porción de un suplemento (comparación útil, genera enlaces a categorías).
5. Qué es el colágeno hidrolizado y qué contiene (descripción del ingrediente, sin atribuirle efectos terapéuticos).
6. Omega 3, EPA y DHA: qué son y en qué alimentos se encuentran.
7. Magnesio y zinc: formas químicas comunes (citrato, glicinato, etc.) y cómo se presentan en los productos.
8. Preentrenos: ingredientes habituales, cafeína por porción y por qué leer las advertencias.
9. Guía de compra en Santiago: despacho RM, retiro en tienda y seguimiento del pedido (apoya SEO local y marca).
10. Alimentación variada y suplementos: por qué un suplemento complementa, no reemplaza, una dieta equilibrada.

Cada artículo: un H1, JSON-LD `Article` (autor y fecha reales), `BreadcrumbList`, enlace a la categoría relevante y revisión de cumplimiento antes de publicar. Como el admin escribe los artículos, entregarle esta guía de la sección 6 en el editor (aviso o checklist).

## 9. Pendientes para cerrar este documento

- Planilla `productos_nutra_elements.xlsx` (categorías, nombres, formatos, ingredientes, tabla nutricional).
- Dirección, comuna y horario de retiro en tienda; teléfono y correo (para LocalBusiness/Organization).
- Redes sociales de la marca (`sameAs`) y logo en alta resolución.
- Acceso al DNS de nutraelements.cl para verificar Search Console.
- Confirmación del tech-lead sobre la política de reseñas (sección 5).
- Política de devoluciones y de envío publicada (campos `hasMerchantReturnPolicy` y `shippingDetails` del Offer: despacho $3.990 en RM; gratis sobre monto por definir).
- Revisión sanitaria/legal de los textos (sección 6).

## Fuentes consultadas (WebSearch)
- Resultados de Lider.cl, Falabella, Paris.cl y Mercado Libre Chile para whey y creatina (pág. de listados).
- Resolución MINSAL 2017 y notas sobre el art. 114 del Reglamento Sanitario de los Alimentos (resultados parciales; no se confirmó la versión vigente).
