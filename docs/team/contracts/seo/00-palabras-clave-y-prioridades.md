# SEO 00 - Palabras clave, categorías y cumplimiento

Estado: **v2, pendiente de aprobación del tech-lead** (reemplaza el borrador v1 del 2026-10-14, que asumía proteínas y creatina). Autor: seo-specialist. Fecha: 2026-10-14.
Base: catálogo real de 33 productos de marca propia, todos en cápsulas (DESCUBRIMIENTO.md, "Planilla de productos"), D-010, D-014, D-016, D-021 y D-022.

## 0. Cómo leer las prioridades

- **No hay datos reales de volumen de búsqueda** (sin Keyword Planner ni Search Console; el sitio no existe). Las prioridades son **cualitativas** (alta, media, baja): cercanía a la compra, especificidad y competencia esperada. No hay cifras inventadas.
- En esta v2 **no hice búsquedas nuevas** en la web. Las observaciones de v1 (retailers grandes dominan "whey" y "creatina") ya no aplican al catálogo. Para magnesio, vitaminas, omega 3 y colágeno es **esperable** que dominen retailers, farmacias y marketplaces; **sin verificar**. Pendiente revisar los resultados reales antes de cerrar prioridades.
- Marca nueva y sin historia: a corto plazo rinden más las búsquedas **de marca, de producto específico (forma química, dosis, cantidad de cápsulas) y locales (Puente Alto, sur de Santiago, RM)** que los términos genéricos.
- Tras el lanzamiento, Search Console será la única fuente de datos de búsqueda (sin Google Analytics, D-012). Recalibrar con ella.

## 1. Catálogo real y familias de producto

33 SKU (SKU = columna ID de la planilla, D-016) agrupados en **familias**: un mismo producto en distintos tamaños (30, 60, 90 o 120 cápsulas), cada tamaño con su SKU.

| Familia | Categoría primaria |
|---|---|
| Vitamina B12, Vitamina B-Complex, Vitamina C 1000 mg, Vitamina D 800 UI, Vitamina E 400 UI, Vit Total (multivitamínico) | vitaminas |
| Citrato de magnesio, Magnesio triple quelado, Cloruro de magnesio, Bisglicinato de magnesio | magnesio |
| Zinc, Citrato de potasio | minerales |
| Omega 3, Omega 369 | omega-3 |
| Colágeno 500 mg, Biotina | belleza |
| Spirulina, Melena de león, Cúrcuma con pimienta, Cranberry con vitaminas C y E, Ultra Light, Ultra Relax, Ultra Lax | bienestar |

Nota: la planilla no trae la lista SKU por SKU en este documento (no abrí el .xls a propósito). **El mapeo SKU a categoría se hace por NOMBRE de la planilla con la tabla de arriba**; los tamaños de cada familia los asigna el admin al importar (campo `category`). Si algún nombre de la planilla no cabe en una familia de la tabla, el tech-lead decide y me avisa.

## 2. Categorías definitivas (propuesta)

Seis categorías, cada una con una intención de búsqueda propia. Un producto pertenece a **una sola categoría primaria** (evita URLs duplicadas y migas de pan ambiguas).

| Slug | Nombre visible (H1) | Palabra clave principal | Qué incluye |
|---|---|---|---|
| `vitaminas` | Vitaminas | vitaminas en cápsulas | B12, B-Complex, C 1000 mg, D 800 UI, E 400 UI, Vit Total (todos los tamaños) |
| `magnesio` | Magnesio | magnesio en cápsulas / comprar magnesio | Citrato, triple quelado, cloruro, bisglicinato (todos los tamaños) |
| `minerales` | Minerales | zinc en cápsulas | Zinc y citrato de potasio (todos los tamaños) |
| `omega-3` | Omega 3 | omega 3 en cápsulas | Omega 3 y Omega 369 |
| `belleza` | Belleza | colágeno y biotina en cápsulas | Colágeno 500 mg y Biotina |
| `bienestar` | Bienestar | suplementos funcionales en cápsulas | Spirulina, Melena de león, Cúrcuma con pimienta, Cranberry con vitaminas C y E, línea Ultra |

Justificación:
- **Magnesio separado de minerales.** Hay cuatro formas químicas (citrato, triple quelado, cloruro, bisglicinato), cada una con varios tamaños: es la familia más grande y con la intención más clara ("magnesio" más forma). Mezclada con zinc y potasio quedaría diluida y su categoría no podría posicionar "magnesio". `minerales` queda como categoría más pequeña (zinc y citrato de potasio).
- **Riesgo de contenido delgado en `minerales`.** Si tras importar quedan menos de 3 SKU publicados, aplicar `noindex,follow` a esa categoría y mantener los productos visibles solo desde `/productos` hasta que crezca. La alternativa es fusionarla en `bienestar`. Decide el tech-lead tras la importación.
- **`belleza` y `bienestar`** son nombres de uso común y no contienen alegaciones de salud. Se evitan a propósito `control-de-peso`, `sueno`, `digestion`, `defensas` y similares: invitan a declaraciones problemáticas (sección 7).
- **La línea Ultra no tiene categoría propia.** Va en `bienestar` y no se crea `/categorias/ultra`: una página de "Ultra" concentraría en una URL los tres textos de mayor riesgo regulatorio.
- Reglas de slug: minúsculas, sin tildes ni ñ, guiones, estables. Cambiar un slug exige 301 (ver 06).
- Cambios respecto de AGENTS.md: sus ejemplos de categoría (proteínas, vitaminas, creatina) quedan obsoletos. **Pido al tech-lead actualizar el ejemplo en AGENTS.md** (yo no lo toco).

## 3. Clusters de palabras clave (catálogo real)

Prioridad cualitativa. Todas con variantes en español de Chile.

### 3.1 Marca (prioridad alta, lo más fácil de ganar)
nutra elements, nutraelements, nutraelements.cl, nutra elements Chile, nutra elements [producto] (p. ej. "nutra elements magnesio"). `nutra elements opiniones` solo si existen reseñas reales (D-014).
Acción: la home es la mejor respuesta a la búsqueda de marca; `/nosotros` la refuerza.

### 3.2 Transaccional por producto y forma (prioridad alta)
Es donde una marca nueva puede entrar. Se capturan con las **fichas** (una por SKU, ver sección 5).

| Familia | Términos |
|---|---|
| Magnesio | citrato de magnesio cápsulas, bisglicinato de magnesio, magnesio triple quelado, cloruro de magnesio cápsulas, comprar magnesio Chile |
| Vitaminas | vitamina B12 cápsulas, vitamina C 1000 mg, vitamina D 800 UI, vitamina E 400 UI, complejo B / B-Complex, multivitamínico cápsulas |
| Minerales | zinc cápsulas, citrato de potasio cápsulas |
| Omega | omega 3 cápsulas, omega 369 cápsulas |
| Belleza | colágeno 500 mg cápsulas, biotina cápsulas |
| Funcionales | spirulina cápsulas, melena de león cápsulas (hongo Hericium), cúrcuma con pimienta cápsulas, cranberry cápsulas |
| Ultra | solo por nombre de producto ("Ultra Light Nutra Elements", etc.). **No** posicionar términos con alegaciones (ver 7) |

Con variante de cantidad ("... 90 cápsulas", "... 120 cápsulas") para las fichas por tamaño.

### 3.3 Transaccional por categoría (prioridad media)
vitaminas en cápsulas, magnesio, omega 3, colágeno, biotina, suplementos naturales. Genéricos: competencia fuerte de retailers y farmacias; se trabajan con `/categorias/*` pero sin expectativa de corto plazo.

### 3.4 Local (prioridad alta para el negocio, competencia menor)
Dirección real: Av. Concha y Toro 180, Puente Alto. Retiro lunes a viernes 9:00 a 20:00. Despacho propio a toda la RM por $3.990.

| Término | Dónde se trabaja |
|---|---|
| tienda de suplementos Puente Alto, suplementos Puente Alto, vitaminas Puente Alto | `/contacto` (principal), home (secundario) |
| retiro en tienda suplementos / retiro en tienda Puente Alto | `/contacto` (sección "Retiro en tienda"), `/preguntas-frecuentes`, home (franja informativa) |
| suplementos sur de Santiago, vitaminas zona sur Santiago | home y `/nosotros` (menciones naturales, sin repetir) |
| despacho suplementos Región Metropolitana / RM, suplementos a domicilio Santiago | home, `/preguntas-frecuentes` |

Reglas locales:
1. **Nada de páginas por comuna** (doorway pages). Se cubre con home, `/contacto` y FAQ.
2. Dirección, horario y (cuando exista) teléfono se muestran **idénticos** (nombre, dirección, teléfono) en el pie de todas las páginas, en `/contacto` y en el JSON-LD.
3. Palanca local de mayor impacto, fuera del código: **perfil de Google Business Profile** con esa dirección y horario (requiere verificación de Google). **Lo debe crear Carlos o su jefa**; sin él, el SEO local queda muy limitado.
4. **Decisión pendiente (tech-lead):** ¿crear una página `/retiro-en-tienda`? No está en la lista de páginas de AGENTS.md. Mi recomendación para el MVP es **no** crearla y usar la sección en `/contacto`; evaluar después según Search Console.

### 3.5 Comercial e informacional (prioridad baja al lanzamiento)
magnesio citrato vs bisglicinato, cuál vitamina D elegir, qué es la melena de león, etc. Son temas de **blog**, que no existe en el MVP (D-015). Se retoman cuando haya blog; ver sección 8.

## 4. Mapa palabra clave a URL (sin canibalización)

Regla: **una intención principal por URL**.

| URL | Palabra clave principal | Secundarias | Intención |
|---|---|---|---|
| `/` | nutra elements + suplementos en cápsulas | despacho RM, retiro en tienda Puente Alto, marca propia | marca + transaccional amplia + local |
| `/productos` | catálogo de suplementos en cápsulas | todos los productos Nutra Elements | navegación; title distinto del de la home |
| `/categorias/vitaminas` | vitaminas en cápsulas | B12, C, D, E, B-Complex, multivitamínico | transaccional |
| `/categorias/magnesio` | magnesio en cápsulas | citrato, bisglicinato, triple quelado, cloruro | transaccional |
| `/categorias/minerales` | zinc en cápsulas | citrato de potasio | transaccional |
| `/categorias/omega-3` | omega 3 en cápsulas | omega 369 | transaccional |
| `/categorias/belleza` | colágeno y biotina en cápsulas | colágeno 500 mg | transaccional |
| `/categorias/bienestar` | suplementos funcionales en cápsulas | spirulina, melena de león, cúrcuma, cranberry | transaccional |
| `/productos/[slug]` | "[nombre producto] [N] cápsulas" | forma química, dosis, marca | transaccional por SKU |
| `/nosotros` | qué es Nutra Elements, marca propia | calidad, Puente Alto | marca |
| `/contacto` | tienda de suplementos Puente Alto, retiro en tienda | horario, dirección, contacto | local + marca |
| `/preguntas-frecuentes` | preguntas de compra: despacho, retiro, pagos, seguimiento | $3.990, Flow, DispatchTrack | soporte |

Reglas anti-canibalización:
1. Las fichas apuntan a **producto + forma + cantidad** ("Citrato de magnesio 120 cápsulas"); el término genérico ("magnesio") es de la categoría.
2. Cada familia de producto compite consigo misma en sus tamaños. Ver sección 5 para el tratamiento.
3. FAQ solo trata logística y compra, no beneficios de ingredientes.
4. Filtros, orden y búsqueda interna no generan URLs indexables (ver 02-catalogo).

## 5. Tamaños de un mismo producto: contenido duplicado

Contexto: cada tamaño (30, 60, 90, 120 cápsulas) es un SKU y un producto separado en Firestore (DESCUBRIMIENTO.md y D-016).

**Decisión propuesta: una ficha por SKU, cada una con canonical a sí misma, más enlaces cruzados entre los tamaños de la familia.**

Por qué:
- Es coherente con el modelo de datos (SKU = producto = URL) y evita inventar una entidad "familia" en Firestore para el MVP.
- Cada tamaño tiene precio, stock y `Offer` distintos. Un JSON-LD `Product` con precio y disponibilidad solo es correcto si la URL corresponde a ese SKU.
- Canonicalizar todos los tamaños a uno solo ocultaría de Google los otros precios y disponibilidades, y rompería la búsqueda por tamaño ("... 120 cápsulas").

Cómo evitar el contenido duplicado (el riesgo real es el texto casi idéntico entre tamaños):
1. **Diferenciar lo que cambia**: title, H1, meta description, slug, `name` del JSON-LD y `alt` de la imagen **incluyen la cantidad** de cápsulas.
2. Cada ficha incluye un **bloque propio por SKU**: cantidad de cápsulas, duración estimada del frasco según la dosis del rótulo (solo si el rótulo da una dosis diaria y se calcula con ella), y su propio stock.
3. La descripción larga y compartida de la familia es aceptable, pero **no más de la mitad del texto visible** de la ficha. El resto es específico del SKU y de datos estructurados (tabla "Información del producto").
4. Sección **"Otros formatos de este producto"** en cada ficha: enlaces a los demás tamaños (anchor: nombre + cantidad). Requiere que el admin marque la familia: **campo `familyId` (o `family`) por producto**; yo lo pido al firebase-architect.
5. Fichas de tamaños sin stock siguen publicadas con `OutOfStock` (no se des-indexan).
6. **Plan B, solo si Search Console lo exige**: si aparece "Duplicada: Google eligió una versión canónica diferente" de forma masiva, definir un **tamaño principal** por familia (el más vendido) y poner en los demás `canonical` al principal. Es un cambio de configuración, no de arquitectura. No se hace de antemano.
7. No usar `ProductGroup` ni `hasVariant` en el MVP: están pensados para variantes dentro de **una** página. Cada ficha lleva su propio `Product`.

Slug de ficha: `[nombre-normalizado]-[N]-capsulas`, p. ej. `vitamina-c-1000-mg-90-capsulas`, `citrato-de-magnesio-120-capsulas`. Ver 04-ficha-producto.

## 6. Prioridades del lanzamiento (resumen)

Lo imprescindible el día uno (el detalle está en 01 a 06):
1. Renderizado estático con ISR de todas las páginas públicas (D-022). Una ficha que solo renderiza en el navegador es BLOQUEANTE.
2. `generateMetadata` con title, description, canonical absoluta, Open Graph y Twitter Card.
3. `sitemap.ts` y `robots.ts` por entorno; **noindex en todo prod hasta el lanzamiento (D-021)**.
4. noindex en `/carrito`, `/checkout`, `/cuenta` y `/admin` (D-014).
5. JSON-LD: `Product`+`Offer` (sin `aggregateRating`, D-014), `BreadcrumbList`, `Organization`, `Store` con la dirección real y `FAQPage`.
6. `lang="es-CL"`, 404 real y redirecciones 301 por cambio de slug.
7. Imágenes optimizadas y Core Web Vitals en móvil.
8. Verificar el dominio en Search Console y enviar el sitemap (depende del DNS de la jefa de Carlos).

Puede esperar: blog, textos largos de categoría, reseñas, enlazado avanzado.

## 7. Cumplimiento del contenido (productos de mayor riesgo)

**Aviso: no es asesoría legal.** Guía de redacción prudente basada en AGENTS.md ("los textos no deben atribuir a los suplementos propiedades de curar, tratar o prevenir enfermedades") y en el Reglamento Sanitario de los Alimentos (D.S. 977/1996, MINSAL; sus reglas sobre propiedades saludables). No pude confirmar el texto vigente ni cambios recientes. **Antes de publicar, los textos de cada ficha deben ser revisados por un profesional** (químico farmacéutico, nutricionista o abogado), y el texto debe coincidir con el rótulo y la autorización sanitaria de cada producto. Solicito al tech-lead que la revisión sea requisito previo de publicación.

### 7.1 Reglas generales
- Evitar siempre: curar, tratar, prevenir, combatir, eliminar, revertir, aliviar; nombrar enfermedades o síntomas clínicos; sustituir medicamentos; promesas de resultado; "aprobado por ISP/MINSAL" o sellos que no existan; testimonios con efectos médicos; "el mejor", "el más puro" sin respaldo.
- Usar: composición y formato factuales; lo que dice el rótulo (ingredientes, porción, modo de uso, advertencias, alérgenos) copiado fielmente; "suplemento alimentario", "complemento de una alimentación variada y equilibrada"; consultar a un profesional de la salud, embarazo y lactancia, no superar la porción recomendada, "no es un medicamento".
- **Los nombres de producto no se reescriben para SEO**: se usa el nombre del rótulo. Pero **los textos nuevos (title, meta, descripción, alt, FAQ) no pueden agregar alegaciones que el nombre insinúa**.
- No dirigirse a niños con mensajes de rendimiento o dietas.

### 7.2 Productos de riesgo alto

#### Ultra Light
Riesgo: el nombre ya sugiere control de peso. Cualquier texto sobre bajar de peso, apetito, grasa o "detox" lo convierte en una alegación no autorizada.
- NO decir: "quema grasa", "te ayuda a bajar de peso", "adelgazante", "reduce el apetito", "elimina toxinas", "baja X kilos".
- SÍ decir: "Suplemento alimentario en cápsulas. Contiene: [ingredientes del rótulo]. Presentación de [N] cápsulas. Modo de uso: [según rótulo]. Se recomienda consultar a un profesional de la salud. No es un medicamento."
- No usar imágenes de antes y después ni siluetas.

#### Ultra Relax
Riesgo: sugiere acción sobre estrés, ansiedad o sueño (condiciones de salud).
- NO decir: "para el insomnio", "combate la ansiedad", "te ayuda a dormir mejor", "calma el estrés", "reemplaza tus ansiolíticos".
- SÍ decir: "Suplemento alimentario en cápsulas que contiene [ingredientes del rótulo]. Presentación de [N] cápsulas. Tomar según lo indicado en el rótulo. Si estás en tratamiento médico, consulta a tu médico antes de usarlo."
- Si el rótulo autoriza una función de algún ingrediente, citarla textualmente y solo con validación profesional.

#### Ultra Lax
Riesgo: "laxante" y "estreñimiento" apuntan a una condición y pueden entrar en el terreno de los medicamentos. Si el producto no está autorizado como alimento, **no debería venderse como suplemento**: validar su situación sanitaria antes de publicar.
- NO decir: "laxante", "cura el estreñimiento", "limpia el colon", "desintoxica", "efecto purgante".
- SÍ decir: "Suplemento alimentario en cápsulas. Contiene: [ingredientes del rótulo]. Presentación de [N] cápsulas. Modo de uso y advertencias según rótulo, incluida la recomendación de consultar a un profesional si hay molestias."
- No posicionar palabras clave como "laxante natural" ni "para el estreñimiento".

#### Cranberry con vitaminas C y E
Riesgo: el uso popular del cranberry se asocia a infecciones urinarias (una enfermedad). "Antioxidante" para las vitaminas C y E es una alegación de función que debe coincidir con lo autorizado.
- NO decir: "previene y trata la infección urinaria", "cistitis", "limpia las vías urinarias", "protege tus riñones".
- SÍ decir: "Cranberry (arándano rojo) con vitaminas C y E, en cápsulas de [N]. Suplemento alimentario; complemento de una alimentación variada." La función de las vitaminas solo si el rótulo la declara textualmente.

#### Melena de león
Riesgo: se promociona con alegaciones cognitivas y neurológicas.
- NO decir: "mejora la memoria", "neuroprotector", "previene el Alzheimer", "aumenta la concentración", "regenera nervios".
- SÍ decir: "Melena de león (Hericium erinaceus), hongo comestible, en cápsulas de [N]. Suplemento alimentario. Presentación, modo de uso y advertencias según rótulo." (Si el rótulo declara extracto o polvo y la dosis por porción, indicarlo.)

#### Cúrcuma con pimienta
Riesgo: se asocia a antiinflamatorio, dolor articular y cáncer.
- NO decir: "antiinflamatorio", "alivia el dolor de articulaciones", "previene el cáncer", "reemplaza el ibuprofeno".
- SÍ decir: "Cúrcuma con pimienta negra, en cápsulas de [N]. Suplemento alimentario. Modo de uso y advertencias según rótulo; consultar a un profesional si tomas anticoagulantes u otros medicamentos."

### 7.3 Riesgo medio (revisar igual)
- **Colágeno 500 mg y Biotina**: no prometer "piel, pelo y uñas perfectos" ni "antiedad". Describir la presentación y el contenido.
- **Spirulina**: evitar "superalimento que desintoxica", "cura anemia". Describir como alga en cápsulas.
- **Omega 3 y 369**: no decir "protege el corazón" ni "baja el colesterol". Indicar contenido por porción (EPA y DHA si el rótulo los detalla).
- **Vitaminas y minerales (B12, C, D, E, B-Complex, Vit Total, magnesio, zinc, potasio)**: no decir "refuerza las defensas", "evita resfríos", "para la fatiga". Declaraciones nutricionales ("aporta X mg por porción") solo si coinciden con el rótulo.
- **Citrato de potasio**: evitar toda referencia a presión arterial o cálculos renales. Revisar la advertencia del rótulo.

### 7.4 Reglas de redacción para el equipo
- Cualquier texto con duda se reduce a descripción factual.
- No copiar textos de competidores ni de fabricantes extranjeros: suelen traer alegaciones no admitidas en Chile y generan contenido duplicado.
- Registrar en la ficha, cuando se pueda, la fecha de revisión del texto.

## 8. Contenido futuro (blog, después del MVP)

Sin blog en el MVP (D-015). No indexar ni publicar un `/blog` vacío (D-014). Cuando exista, ideas compatibles con el catálogo y con la sección 7: formas del magnesio (citrato, bisglicinato, cloruro, triple quelado) como composición, cómo leer el rótulo de un suplemento, cómo comparar precio por cápsula entre tamaños, guía de compra en Puente Alto con retiro y despacho RM, qué es la spirulina o la melena de león como ingrediente (sin efectos). Cada artículo: un H1, `Article` con autor y fecha reales, `BreadcrumbList`, enlace a la categoría y revisión de cumplimiento.

## 9. Valoraciones

Sin `aggregateRating` ni `review` mientras no existan reseñas reales y visibles (D-014; AGENTS.md ya lo refleja). Cuando existan, solo si `reviewCount > 0`, calculado desde datos reales y visible en la ficha.

## 10. Pendientes para cerrar este documento

- Lista final SKU por SKU con su familia y tamaño (la fija el import; la categoría la confirma el tech-lead).
- Revisión sanitaria o legal de los textos, y situación sanitaria de Ultra Lax.
- Teléfono, correo público y redes sociales (hoy PENDIENTE, no se inventan).
- Logo en alta resolución.
- Acceso al DNS de nutraelements.cl para Search Console.
- Perfil de Google Business Profile.
- Política de devoluciones publicada y monto de envío gratis (afectan `Offer`, ver 04).
- Decisión sobre `minerales` si queda con menos de 3 SKU, y sobre `/retiro-en-tienda`.
