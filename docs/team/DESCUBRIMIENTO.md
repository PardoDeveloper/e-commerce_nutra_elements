# Descubrimiento del negocio — Nutra Elements

Respuestas de Carlos del 2026-10-14. Es la fuente de verdad de los requisitos de negocio hasta que se apruebe el MVP.
**Aquí no van credenciales.** Las de Flow van en Secret Manager y nunca en archivos.

## Catálogo
- Al lanzar, unos 70 productos; como máximo 150 a futuro.
- Una sola marca, Nutra Elements, de línea propia.
- El detalle de productos, categorías y variantes viene en `productos_nutra_elements.xlsx`, **aún no entregada**. Hay que importarla.
- Una sola bodega.
- Se necesitan ofertas y promociones.

## Precios y descuentos
- Descuento manual por producto, en porcentaje o monto fijo.
- Descuento masivo: seleccionar varios productos con checkbox y aplicarles un porcentaje o un monto fijo.
- Envío gratis sobre cierto monto (**monto por definir**).
- No se pidieron cupones.

## Envíos
- Cobertura solo en la Región Metropolitana, con despacho propio.
- Tarifa única de $3.990 CLP.
- También hay retiro en tienda (**dirección y horario por definir**).

## Pagos
- Flow: confirmado. Hay credenciales de sandbox, que van en Secret Manager.
- Transferencia bancaria, con confirmación manual del admin.

## Clientes
- Se puede comprar como invitado.
- Registro deseable ("estaría genial"), con nombre, apellido, correo, teléfono, comuna y dirección, más historial de pedidos.
- Seguimiento: el número de pedido se usa en **DispatchTrack**. Hay que decirle al cliente que puede seguir su pedido con ese número. Por ahora no hay integración por API.

## Administración
- Todos los usuarios del admin son administradores. Hay un solo rol.
- Carga masiva desde Excel: (SKU, PRECIO) y (SKU, STOCK).
- Métricas: productos más vendidos, ticket promedio y productos sin stock. **Sin Google Analytics.**
- El admin escribe los artículos del blog.

## Pedidos
- Estados logísticos: En preparación → Listo para retirar (retiro) o En ruta (despacho) → Entregado.
- Correos al cliente: resumen de compra, "Listo para retirar" y "En ruta".
- Boleta y factura: se emiten manualmente en Control Farma. A futuro, integración por API.

## Dominio, plazo y presupuesto
- Dominio: nutraelements.cl. Las credenciales del DNS están pendientes.
- Plazo: **la próxima semana**.
- Presupuesto de Firebase: máximo 20 USD/mes, con crecimiento esperado más adelante.

## Hechos verificados del entorno (2026-10-14)
- Sesión de Firebase activa: carlos.pardo.b78@gmail.com.
- Proyectos accesibles: `nutraelements` y `farmaciaestrella-620f7` (este último es de otro proyecto y no se toca). **No existen** `nutra-elements-dev` ni `nutra-elements-prod`.
- firebase-tools 15.34.0 instalado globalmente. gh instalado, con sesión de PardoDeveloper (fuera del PATH de Git Bash: "/c/Program Files/GitHub CLI/gh.exe").

## Respuestas de la segunda ronda (2026-10-14)
- MVP aprobado por Carlos: las cuentas de cliente y el blog quedan para después del lanzamiento.
- Envío: $3.990 a **todas** las comunas de la RM. Envío gratis sobre un monto configurable desde el admin (**valor por definir**).
- Retiro en tienda: **Av. Concha y Toro 180, Puente Alto**, de 9:00 a 20:00. Falta confirmar los días de atención.
- Datos bancarios: de prueba por ahora. Carlos entregará los reales.
- Correo: se enviará desde una cuenta **@gmail.com** de la empresa (no hay correo del dominio). La jefa administra el DNS de nutraelements.cl y las credenciales llegan mañana.
- Firebase: **un solo proyecto, `nutraelements`**. Los ambientes se separan por ramas de git (develop y main), no por proyectos.
- GitHub: repo `PardoDeveloper/e-commerce_nutra_elements` (declarado en AGENTS.md). Hoy está **público** y vacío.

## Planilla de productos (productos_nutra_elements.xlsx.xls)
- Es un .xls antiguo (PHPExcel), con una hoja `ARTICULO` y **33 productos**.
- Columnas: ID, NOMBRE, CODIGO_BARRA, STOCK_ACTUAL, PRECIO_VENTA_PUBLICO, ACTIVO, LABORATORIO.
- ID y CODIGO_BARRA son únicos. Todos tienen ACTIVO=SI y LABORATORIO=NUTRA ELEMENTS.
- Precios entre $5.990 y $18.990.
- Anomalías: VITAMINA B12 X 90 tiene stock **-5**, y CITRATO DE MAGNESIO X 120 tiene el stock **vacío**.
- Algunos códigos de barra empiezan con 978 (rango de ISBN de libros), por lo que podrían no ser GTIN válidos.
- **Faltan**: categoría, descripción, imágenes y slug. Hay que completarlos en el admin.
- Varios productos son el mismo en distinto tamaño (30, 60, 90 o 120 cápsulas). Cada uno tiene su propio ID, así que cada uno será un producto separado.
- Son vitaminas, minerales y funcionales en cápsulas. **No hay proteínas ni creatina**, así que el borrador de SEO hay que ajustarlo.
