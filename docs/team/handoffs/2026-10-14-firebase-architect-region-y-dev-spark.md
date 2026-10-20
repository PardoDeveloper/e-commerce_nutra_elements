# Handoff firebase-architect: región (D-010) y dev en Spark (D-021), tarea 0.9

Fecha: 2026-10-14. Solo verificación y recomendación. No se creó ni modificó nada (ni recursos, ni APIs, ni git, ni archivos del repo salvo este handoff). No se abrió `.env`. Este handoff reemplaza por completo al de "ambientes-un-proyecto" (D-019, descartada).

## 0. Qué verifiqué y qué no

**Verificado (comandos de lectura y documentación oficial leída hoy, 2026-10-14):**
- `firebase --version` = 15.34.0. `gcloud` no está instalado.
- `firebase apphosting:backends:list --project nutraelements`: responde sin error y la lista está vacía. Es decir, la API de App Hosting ya está habilitada en prod (Blaze) y no hay backends.
- `firebase apphosting:backends:list --project nutraelementsdev`: falla pidiendo Blaze ("must be on the Blaze plan... firebaseapphosting.googleapis.com can't be enabled"). Confirma que App Hosting no funciona en Spark.
- `firebase firestore:locations --project nutraelements`: 403, la API de Firestore no está habilitada todavía en prod. No pude listar las ubicaciones por CLI; usé la documentación.
- `firebase projects:list`: existen `nutraelements`, `nutraelementsdev` y además `farmaciaestrella-620f7` (otro proyecto; no se tocó).
- `firebase apphosting:backends:create --help`: acepta `--primary-region`, `--root-dir`, `--runtime`, `--app`, `--service-account`. `firebase apphosting:rollouts:create <backendId> --git-branch|--git-commit` existe.
- Documentación oficial leída: App Hosting (about, get-started, costs, rollouts), Firestore locations, Storage locations, FAQ de cambios de Storage (sept 2024), Functions locations, planes de precios de Firebase.
- Hallazgo operativo: **sin `firebase.json` en la raíz, la CLI no resuelve los alias** de `.firebaserc` (`--project prod` dio "Project 'projects/prod' not found" y `firebase use` dijo "must be run from a Firebase project directory"). Con el ID real (`--project nutraelements`) funciona. Se resuelve solo al existir `firebase.json`; hay que crearlo antes de usar `--project dev|prod`.

**No verificado:**
- La lista de regiones de App Hosting vía API (`projects/*/locations`): no extraje el token de credenciales para no tocar secretos. La lista de la documentación es la fuente. Devops puede contrastarla con `firebase apphosting:backends:create --primary-region` (la CLI valida contra la API) o al crear el backend.
- Latencias Chile a EE. UU. (solo órdenes de magnitud de memoria), precios por región y todas las cifras de costo.
- Secret Manager y Cloud Scheduler en Spark: son APIs de Google Cloud que exigen cuenta de facturación; Spark no la tiene. Es inferencia, no lo probé (habilitar APIs está prohibido en esta tarea).
- Cuota gratuita de Cloud Scheduler (de memoria: 3 jobs por cuenta de facturación).

## 1. Región (D-010)

### Hechos verificados en la documentación
| Servicio | ¿Incluye `southamerica-west1` (Santiago)? |
|---|---|
| **App Hosting** | **No.** Regiones permitidas hoy: `us-central1`, `us-east4`, `us-east5`, `asia-east1`, `asia-southeast1`, `europe-west4`. Tampoco `southamerica-east1`. |
| Firestore (regional) | Sí, y también `southamerica-east1`, `us-east4`, `us-east5`. |
| Cloud Functions 2ª gen | Sí (precio Tier 2; solo 2ª gen). `us-east4` es Tier 1 (1ª y 2ª gen); `us-east5` Tier 1, solo 2ª gen. |
| Cloud Storage | Sí (cualquier ubicación de Cloud Storage). La cuota "Always Free" solo aplica a `us-central1`, `us-east1` y `us-west1`; el resto paga tarifa normal. |

Además: la región de Firestore y la del bucket no se pueden cambiar después. App Hosting sirve el contenido no cacheado desde su región primaria (el CDN cubre lo cacheado).

### Recomendación (una sola)
**`us-east4` (Virginia del Norte) para todo, en prod y en dev:** App Hosting, Firestore, Functions y el bucket de Storage.

Por qué:
- App Hosting no está en Santiago, así que el SSR correrá en EE. UU. igual. Poner Firestore en Santiago mientras el SSR está en Virginia haría que cada consulta del servidor cruce el continente (ida y vuelta de unos 120 a 160 ms, sin verificar) y las páginas con varias lecturas encadenadas serían las más lentas. Mantener servidor, datos y Functions en la misma región elimina ese salto.
- `us-east4` es la región de App Hosting geográficamente más cercana a Chile entre las permitidas (`us-east5` es la alternativa; no veo ventaja clara). Es Tier 1 en Functions (más barata que Santiago, Tier 2).
- Para el SEO, las fichas y categorías públicas deben ser estáticas o con ISR y salir del CDN; el origen solo se toca en la primera visita, en admin, carrito y checkout. Así se mitiga la distancia a Chile.
- Dev usa la misma región para medir la latencia real y evitar sorpresas.

Descartado: Firestore en Santiago con SSR en `us-east4` (más latencia en cada render del servidor), y Santiago para Functions/Storage con el resto en EE. UU. (partir la pila agrega latencia y costo de salida sin beneficio). Si Carlos prioriza residencia de datos en Chile (no es un requisito declarado), el costo es la latencia mencionada.

Pendiente para Carlos antes de crear nada: confirmar `us-east4`. Es irreversible para Firestore y Storage.

Efecto en código: las Functions fijan `region: "us-east4"` (`setGlobalOptions`). Cloud Scheduler se crea con la región de la función programada (sin verificar).

## 2. Dev en Spark (D-021)

### Qué se puede y qué no en `nutraelementsdev` (Spark)
| Servicio | En Spark | Fuente |
|---|---|---|
| Authentication | Sí (casi todas las opciones; SMS/telefonía no). Email y Google sirven. | Docs de planes |
| Firestore | Sí, con cuota diaria gratuita (50.000 lecturas y 20.000 escrituras por día; 1 GiB). Una base (default). | Docs de planes |
| Storage | **No.** Desde el cambio de 2024, Cloud Storage for Firebase no soporta proyectos Spark: sin acceso en consola, y las llamadas dan 402/403, también en buckets nuevos. Hace falta Blaze. | FAQ de Storage, leída hoy |
| Cloud Functions | **No se pueden desplegar** (ni nuevas ni existentes). | Docs de planes |
| App Hosting | **No.** Verificado en vivo: la CLI exige Blaze para habilitar su API. | Comando de lectura de hoy |
| Secret Manager | **No** en la práctica: requiere cuenta de facturación (inferencia, sin probar). | Sin verificar |
| Cloud Scheduler | **No** en la práctica, mismo motivo (y solo lo usan Functions programadas). | Sin verificar |
| App Check | Sí, figura entre los servicios sin costo en Spark. Pero solo sirve si hay algo que proteger en la nube (Firestore sí). | Docs de planes |
| Emulator Suite | Sí, sin límite: Auth, Firestore, Storage, Functions y Hosting corren en local. | AGENTS.md / CLI |

Conclusión: en Spark, dev en la nube se reduce a Auth y Firestore. No hay Storage (ni siquiera para las imágenes del admin), ni Functions, ni App Hosting, ni secretos. Todo lo demás solo existe en el emulador.

### Prueba de punta a punta con Flow sandbox
Flow llama a `urlConfirmation` desde sus servidores, así que debe ser una URL pública HTTPS que llegue a `flowConfirm`. Además `urlReturn` redirige al navegador del comprador (esa sí puede ser localhost, porque el navegador es el de Carlos).

**(a) Dev a Blaze + alerta de presupuesto baja**
- Se despliegan Functions y el backend de App Hosting en `nutraelementsdev`; las credenciales sandbox van a Secret Manager; el webhook de Flow apunta a la URL real de la Function de dev. Prueba exactamente el mismo camino que prod (SSR real, App Check real, Storage real, secretos reales).
- Sin túnel, con URL estable (no hay que reconfigurar nada en Flow entre pruebas), y los dev y qa pueden repetirlo.
- Costo estimado, sin verificar: 0 a 3 USD/mes con `minInstances: 0`, `maxInstances` bajo y sin tráfico. La mayor parte del uso cae en las cuotas gratuitas; lo que sí se paga es pequeño (Artifact Registry y Cloud Build por cada rollout, algún secreto sobre los 6 gratuitos, Storage fuera de la cuota Always Free). Riesgo: Blaze no corta el gasto, solo avisa; se mitiga con presupuesto bajo, `maxInstances`, y sin datos reales en dev.

**(b) Spark + Emulator Suite + túnel temporal**
- El emulador de Functions corre en local y un túnel (Cloudflare Tunnel o ngrok, no instalados ni verificados) expone `flowConfirm` con una URL pública; la función manda esa URL en `urlConfirmation`. Costo 0.
- Pero: la URL del túnel cambia (en planes gratis) y hay que inyectarla cada vez; los secretos viven en `.env` local; **no hay Storage ni App Hosting en la nube**, así que no se prueba subida de imágenes real, SSR real, App Check real ni el despliegue de Functions (donde se descubren los errores de permisos, región y secretos); y el flujo solo funciona con la máquina de Carlos encendida. Prod sería el primer lugar donde corre la pila real.

### Recomendación (una sola): (a)
Pasar `nutraelementsdev` a Blaze, con presupuesto de 5 USD/mes y alertas al 50, 90 y 100 por ciento (más una alerta a 1 USD), `maxInstances` bajo y sin datos reales. Razones: Storage tampoco existe en Spark, así que (b) deja sin probar medio MVP (imágenes del admin y el despliegue de Functions) y sostiene el pago con un túnel frágil; el riesgo de que prod sea el primer despliegue real de la pila es mayor que unos pocos USD. Costo adicional estimado 0 a 3 USD/mes (sin verificar), dentro del presupuesto de 20 USD si dev y prod comparten la cuenta de facturación (las cuotas gratuitas de App Hosting se agregan por cuenta de facturación, según la documentación de costos). El Emulator Suite sigue siendo el entorno de trabajo diario; dev en la nube es para integración.

Con dos proyectos, Auth queda aislado: ya no rige mi restricción anterior de no crear usuarios de prueba. Se pueden crear clientes de prueba en dev.

## 3. Pasos de infraestructura tras la aprobación (NO ejecutados)

Orden y responsable. D = devops; C = Carlos (consola o terminal propia).

0. **Previo, C:** aprobar región `us-east4` y la opción (a) de dev; ajustar D-010 y D-021 (lo hace el tech-lead).
1. **C:** pasar `nutraelementsdev` a Blaze (consola, Facturación) y vincular la cuenta de facturación (idealmente la misma de prod).
2. **C:** crear en la consola de Google Cloud los presupuestos y alertas: dev 5 USD (alertas 20, 50, 90, 100 por ciento) y prod según el presupuesto de 20 USD (25, 50, 90, 100 por ciento). Es solo aviso, no corta. Opcional: topes de instancias en Cloud Run vía `maxInstances`.
3. **tech-lead/devops:** crear `firebase.json` (necesario para resolver los alias) con `firestore`, `storage`, `functions`, `apphosting` y `emulators`; y `firestore.rules`, `storage.rules`, `firestore.indexes.json`. (Lo escribe firebase-architect cuando el tech-lead lo delegue.)
4. **D, Firestore:** `firebase firestore:databases:create "(default)" --location us-east4 --project dev` y lo mismo con `--project prod`. En modo Native. **Irreversible: solo con la región confirmada. Prod, con confirmación de Carlos.** Luego desplegar reglas e índices: dev primero, `--only firestore`.
5. **C o D, Storage:** inicializar el bucket por defecto en la consola de Firebase (Storage, Comenzar) en `us-east4`, en dev y prod. Primero con reglas que deniegan todo; luego `firebase deploy --only storage`. **Irreversible por región.** Se hace en consola porque el flujo de creación del bucket por defecto es de la consola.
6. **C, GitHub:** en la consola de Firebase (App Hosting, "Comenzar"), instalar y autorizar la app de GitHub de Firebase sobre `PardoDeveloper/e-commerce_nutra_elements`. Es el único paso que exige iniciar sesión en GitHub y autorizar permisos; no lo puede hacer devops sin Carlos. Aplica a ambos proyectos.
7. **D (o C en consola), backends:**
   - dev: backend (por ejemplo `nutra-web`) en `nutraelementsdev`, región `us-east4`, rama activa `develop`, rollouts automáticos activados.
   - prod: backend `nutra-web` en `nutraelements`, rama activa `main`, **rollouts automáticos desactivados** (la documentación confirma que se pueden desactivar). Los despliegues a prod se hacen con `firebase apphosting:rollouts:create nutra-web --git-branch main --project prod` solo con confirmación de Carlos.
   - Con dos proyectos separados ya no hay `apphosting.dev.yaml` obligatorio: cada proyecto tiene su propio backend. El mismo `apphosting.yaml` sirve; las variables distintas (clave de App Check, Flow sandbox o producción) pueden ir en un `apphosting.<ambiente>.yaml` asociado al backend (cómo se asocia: no verificado; devops lo comprueba al crear el backend).
8. **C, Secret Manager (Flow):** Carlos carga los secretos desde su terminal, sin pegarlos en el chat: `firebase functions:secrets:set FLOW_API_KEY --project dev` y `FLOW_SECRET_KEY` (sandbox) en dev; las de producción en prod. Con proyectos separados el nombre del secreto es el mismo en ambos y ya no necesita sufijo. Devops concede acceso al backend (`firebase apphosting:secrets:grantaccess`) y a las Functions.
9. **D, Auth:** habilitar los proveedores (email y, si aplica, Google) en cada proyecto; dominios autorizados (`*.hosted.app` en dev; el dominio real en prod). El claim `admin: true` se asigna con un script de devops (prod con confirmación).
10. **D, App Check:** registrar la app web y reCAPTCHA (v3 o Enterprise) por proyecto; tokens de depuración solo en dev; activar enforcement en Firestore, Storage y Functions primero en modo monitoreo y luego exigido. En prod se exige antes del lanzamiento.
11. **D, Functions:** primer despliegue de Functions a dev (`--only functions`), luego prod con confirmación. Se necesita el plan Blaze (ya activo en prod; dev tras el paso 1).
12. **C, dominio:** apuntar `nutraelements.cl` (o el dominio final) al backend de prod cuando se publique (DNS en su registrador).
13. **D, GitHub:** protección de la rama `main` (el repo es público; verificar qué ofrece el plan gratuito).

Lo que hace Carlos sí o sí: paso 1 (facturación), 2 (presupuestos, también puede hacerlos devops con permisos si Carlos los otorga), 6 (autorizar GitHub), 8 (secretos), 12 (DNS).

## 4. Texto propuesto para AGENTS.md, sección Comandos

Reemplazar la línea "Despliegue a desarrollo" por:

```
- Despliegue de reglas, índices y funciones a dev: firebase deploy --project dev --only firestore,storage,functions (solo devops)
- Despliegue de la app a dev: push a la rama develop (rollout automático del backend nutra-web en nutraelementsdev)
- Producción (solo devops, con confirmación explícita de Carlos, tras dev, tests en verde y APROBADO de qa-reviewer):
  - Reglas, índices y funciones: firebase deploy --project prod --only firestore,storage,functions
  - La app: firebase apphosting:rollouts:create nutra-web --git-branch main --project prod (el backend de prod tiene los rollouts automáticos desactivados; un push a main no despliega)
- Alias: dev = nutraelementsdev (Blaze, con presupuesto bajo) y prod = nutraelements (Blaze). Siempre pasar --project; nunca usar el proyecto por defecto para producción. Los alias solo se resuelven con firebase.json presente en la raíz.
- Emuladores (trabajo diario y tests de reglas): firebase emulators:start
- Flow sandbox en local: túnel temporal hacia el emulador de Functions solo si no se usa dev en la nube
```

Notas: el nombre `nutra-web` es una propuesta (el tech-lead puede cambiarlo). Los comandos de prod nunca se ejecutan sin confirmación; los de dev conviene probarlos primero con `--dry-run` si aplica. Aviso: `.firebaserc` hoy tiene `default` apuntando a dev, que está bien; no cambiarlo a prod.

## 5. Qué necesito de otros agentes
- tech-lead: pedir a Carlos las dos aprobaciones (región `us-east4` y dev en Blaze); registrar los cambios en D-010 y D-021; actualizar AGENTS.md (comandos y la línea "Entornos"); decidir el nombre del backend.
- tech-lead: cambiar la regla de pruebas de Auth (con proyectos separados sí se pueden crear usuarios de prueba en dev) y quitar de mis contratos futuros `assertEnv` por base con nombre; la separación ahora es por proyecto. Mantendré una verificación mínima de `FLOW_BASE_URL` (sandbox en dev, producción en prod) por variable de entorno.
- devops: ejecutar los pasos 3 a 13 tras la aprobación; probar la asociación de `apphosting.<ambiente>.yaml` y el rollout manual; confirmar las regiones de App Hosting con la CLI al crear el backend.
- nextjs-frontend: ISR o generación estática en fichas y categorías para que el CDN cubra la distancia a Chile; noindex en dev (la URL `*.hosted.app` de dev no debe indexarse).
- Carlos: ver las preguntas del paso 0.
