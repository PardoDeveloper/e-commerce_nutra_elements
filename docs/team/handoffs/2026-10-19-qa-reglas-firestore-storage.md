# QA: reglas de Firestore y Storage, indices y firebase.json (despliegue a nutraelements)

Fecha: 2026-10-19. Revisor: qa-reviewer. Alcance: firestore.rules, storage.rules, firestore.indexes.json, firebase.json y tests de reglas, contra data-model v1.2 (secciones 3, 4 y 5).

## Veredicto: APROBADO para desplegar reglas, indices y reglas de Storage a nutraelements (con condiciones C1 a C3)

Sin hallazgos criticos ni altos. Las reglas coinciden con la matriz del contrato y deniegan todo por defecto. La condicion principal: los tests de reglas nunca se han ejecutado (sin Java ni emuladores, D-026).

## Evidencia ejecutada (en functions/)
- npm run build: sin errores. npm run lint: sin errores.
- npm test (unitarios): 16 archivos, 441 tests, todos en verde.
- npm run typecheck:rules: sin errores (prueba que los tests de reglas compilan, no que pasen).
- firestore.indexes.json y firebase.json: JSON valido (node -e). 10 indices y 2 fieldOverrides.
- git check-ignore: .env, .env.local, el .xls, src/data/*.local.json, functions/.env.* y functions/.secret.local estan ignorados. No hay .xls, .env, claves ni cuentas de servicio versionados.

## Hallazgos

### Critico: ninguno
### Alto: ninguno

### Medio
M1. Riesgo de entorno: Firestore o Storage de nutraelements pueden haberse creado en modo de prueba (abiertos, vencen a los 30 dias). No verificable desde aqui. Al desplegar estas reglas se sobrescriben. Correccion: devops despliega primero solo reglas (firestore y storage) y confirma en la consola que ya no hay una regla de modo de prueba con request.time. Hasta entonces el proyecto se considera abierto. Responsable: devops.

M2. Tests de reglas sin ejecutar (95 casos en firestore.rules.test.ts y storage.rules.test.ts). Riesgo: (a) reglas demasiado estrictas (consultas publicas que fallan por no probar los filtros published, active y deletedAt == null, o un update de admin rechazado): rompe funcionalidad, no seguridad; (b) reglas demasiado permisivas: improbable segun la lectura, pero no demostrado. Un error de sintaxis hace fallar el despliegue; no deja las reglas abiertas. Correccion: ejecutar npm run test:rules con Java y emuladores antes del lanzamiento. Responsable: firebase-architect y devops, con autorizacion del tech-lead.

M3. apphosting.yaml:57 (aun sin versionar) contiene NEXT_PUBLIC_FIREBASE_API_KEY, una clave web de Firebase (prefijo AIza). Es un identificador publico por diseno, no una filtracion. Conviene restringirla en Google Cloud (referrers HTTP y solo las APIs necesarias) y activar App Check. No se imprime su valor. Responsable: devops.

### Bajo
B1. storage.rules:28 y :37 permiten update ademas de create. El contrato dice que el nombre es inmutable (cache de un ano); un admin podria sobrescribir un archivo y dejar la cache obsoleta. Correccion: dejar solo create y delete. El test "no sobrescribe ni borra una imagen existente" solo cubre a no admin. Responsable: firebase-architect.

B2. firestore.rules:79: images solo valida lista de hasta 8 elementos; el contenido lo valida la Function de publicacion. Un admin podria guardar una ruta arbitraria. Riesgo bajo (solo admin); el frontend debe tratar images como no confiable (remotePatterns). Responsable: nextjs-frontend.

B3. firestore.rules:69-71: en un producto sin publicar, el admin puede dejar slug en null. La Function de publicacion debe exigirlo. Impacto bajo; falta test.

B4. firestore.rules:87-89: un producto sin el campo deletedAt no es legible por el publico (falla cerrado, correcto). Verificado que functions/src/catalog/writes.ts:36 siempre escribe deletedAt: null. Datos sembrados a mano necesitan migracion.

B5. Indices: coinciden exactamente con la seccion 5 del contrato. Dos son opcionales segun el propio contrato (published+stock y deletedAt+name); son baratos, no bloquean. Los fieldOverrides TTL de idempotencyKeys.expiresAt y rateLimits.expiresAt estan declarados con ttl: true; su sintaxis no se verifico contra la nube: confirmar en el primer despliegue que la politica TTL quedo activa.

B6. firebase.json: sin problemas (sin hosting abierto, emuladores en localhost, reglas e indices referenciados).

## Revision de Firestore frente a la matriz (coincide)
- isAdmin() (linea 17): request.auth != null y token.get('admin', false) == true. Compara contra booleano; la cadena "true" no pasa (hay test).
- products: lectura publica solo con published, active y deletedAt == null; create y delete en false. update: admin, affectedKeys dentro de la lista de contenido (excluye precio, descuento, stock, published, active, sku, deletedAt, deletedBy), updatedAt == request.time y validacion de tipos.
- categories: lectura publica solo published; admin crea y edita con validacion completa; slug y createdAt inmutables; sin borrado.
- orders (datos personales): solo lectura admin, ninguna escritura. counters, idempotencyKeys y rateLimits: cerrados del todo.
- settings/public: get abierto, list false, escritura admin validada. settings/private (datos bancarios): solo admin. Otros documentos de settings caen en el comodin final.
- metrics/**, imports, paymentEvents: lectura admin, escritura false.
- Comodin final con allow read, write: if false.
- Sin escalada: un usuario autenticado sin el claim equivale a anonimo; no hay coleccion de usuarios escribible.
- Observacion: el admin lee orders con RUT, correo, telefono y direccion; es lo que pide el contrato.

## Storage (coincide con la seccion 4)
Lectura publica solo de products/{sku}/{file} y categories/{slug}/{file} (get, sin list). Escritura solo admin, maximo 2 MiB, image/jpeg, png y webp (sin SVG), nombre con patron estricto; rutas anidadas no coinciden. Todo lo demas denegado. Limite conocido: el contentType lo declara el cliente y las reglas no inspeccionan el contenido; mitigado por ser solo admin.

## Cobertura de tests (por lectura; no ejecutados)
Cubren los casos peligrosos: escritura de orders, counters, metrics, imports, paymentEvents y claves; precio, stock, deletedAt y deletedBy; claim como cadena; escalada escribiendo users/*; consultas sin filtros; list de orders y settings; Storage por tipo, tamano exacto, nombre, SKU, rutas y borrado. Faltan tests para B1 y B3.

## Condiciones para desplegar
- C1. Desplegar primero las reglas y verificar en la consola que reemplazaron cualquier regla de modo de prueba (M1).
- C2. Los indices pueden ir junto con las reglas; verificar el TTL despues (B5).
- C3. Ejecutar npm run test:rules cuando haya Java y emuladores, antes del lanzamiento (M2). No declarar "reglas probadas" antes de eso.

Entrega al tech-lead: APROBADO con condiciones C1 a C3.
