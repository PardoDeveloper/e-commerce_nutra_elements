# Nutra Elements

## Qué es
E-Commerce de Suplementos Nutra Elements el cual necesita posicionamiento SEO, de manera que al buscar en el buscador de Google aparezca en las primeras opciones, necesito un Apartado adminitrador donde subir los productos y hacer el cambio de precios masivo mediante SKU y Precio, Necesito subir las imagenes por cada producto, necesito un panel de administracion donde pueda ver las metricas, quiero integrar como pasarela de pago Flow.

## Stack
- Frontend: Next.js con App Router (TypeScript estricto)
- Backend: Firebase — Authentication, Firestore (decidido, ver D-004), Cloud Storage, Cloud Functions y App Check
- Hosting: Firebase App Hosting
- Servicios de Google Cloud: Secret Manager y otros según se necesite
- Pagos: Flow (sandbox en dev, producción en prod), integrado mediante Cloud Functions. Credenciales en Secret Manager; en local, en `.env` (no versionado)
- Correos: el MVP no envía correos (D-008)
- Entornos: un solo proyecto de Firebase de trabajo, `nutraelements` (plan Blaze), por decisión de Carlos (D-030). Alias en .firebaserc: `prod` → `nutraelements`. `nutraelementsdev` y `nutraelementsprod` están sin uso. Rama de trabajo: develop; el sitio se publica desde main. Hasta el lanzamiento funciona como staging: noindex, Flow sandbox y sin dominio. **Cada despliegue a este proyecto requiere la confirmación explícita de Carlos sobre esa acción concreta**
- Región: `us-east4` para App Hosting, Firestore, Functions y Storage, tanto en dev como en prod (D-010)
- Renderizado: el catálogo y las páginas públicas son estáticos con ISR y revalidación bajo demanda; carrito, checkout y admin son dinámicos (D-022)

## Estructura del repositorio
- /src/app — páginas y rutas (App Router)
- /src/components — componentes reutilizables
- /src/lib — clientes de Firebase y utilidades
- /functions — Cloud Functions (TypeScript)
- firestore.rules, storage.rules, firestore.indexes.json
- firebase.json, .firebaserc, apphosting.yaml
- /docs/team — coordinación del equipo de agentes

## Comandos
- Levantar desarrollo: npm run dev
- Emuladores de Firebase: firebase emulators:start
- Tests: npm test
- Tests de reglas de seguridad: <comando, cuando exista>
- Build: npm run build
- Build de funciones: cd functions && npm run build
- Desarrollo y pruebas: siempre contra el Emulator Suite (dev en Spark no admite Functions, Storage ni App Hosting)
- Despliegue de reglas e índices a dev (solo Auth y Firestore): firebase deploy --project dev --only firestore (solo devops)
- Despliegue a producción: firebase deploy --project prod --only functions,firestore,storage y rollout de App Hosting desde main (solo devops, con confirmación explícita del usuario). Antes del lanzamiento, prod funciona como staging: noindex, Flow sandbox y sin dominio (D-021)

## Equipo de agentes
- tech-lead: planifica, decide, coordina y revisa. Es el único que delega trabajo.
- firebase-architect: modelo de datos, autenticación, reglas de seguridad, Cloud Functions y servicios de Google Cloud.
- nextjs-frontend: interfaz, experiencia de usuario e integración con Firebase.
- seo-specialist: define requisitos de SEO y audita las páginas públicas. No modifica código.
- qa-reviewer: revisa y aprueba los cambios antes de subirlos. No modifica código.
- devops: commits, pull requests y despliegues con Firebase CLI. Único que toca GitHub.
- organizador: ordena la bóveda de Obsidian. Solo lo llama el tech-lead.

## Flujo de trabajo
1. tech-lead planifica y define los contratos.
2. Si la tarea toca páginas públicas, seo-specialist escribe sus requisitos en docs/team/contracts/seo/.
3. firebase-architect → nextjs-frontend construyen, en ese orden de dependencias.
4. Si hubo páginas públicas, seo-specialist audita. Sin APROBADO no avanza.
5. qa-reviewer revisa, con prioridad en las reglas de seguridad. Sin APROBADO no se sube nada.
6. devops sube a develop y despliega al proyecto dev. Producción solo con confirmación del usuario.
7. tech-lead documenta en la bóveda mediante el organizador.

## Coordinación (docs/team)
- PLAN.md — tareas, dueño y estado. Revísalo antes de empezar.
- DECISIONS.md — decisiones técnicas y su porqué. No contradigas una decisión registrada sin hablarlo con el tech-lead.
- contracts/ — contratos acordados (modelo de datos y funciones). Son la fuente de verdad entre áreas.
- contracts/seo/ — requisitos de SEO por página.
- handoffs/ — el resumen que deja cada agente al terminar.

## Reglas para todos
1. Trabaja solo dentro de tu área. Si necesitas algo de otra, pídelo al tech-lead.
2. No cambies un contrato de docs/team/contracts/ sin aprobación del tech-lead.
3. Nunca escribas secretos en el código ni en archivos versionados. Usa Secret Manager, variables de entorno y .env.example. Solo las variables NEXT_PUBLIC_ pueden ser públicas.
4. Nunca dejes reglas de Firestore o Storage abiertas, ni siquiera temporalmente.
5. Nada llega a producción sin pasar por dev, con build y tests en verde, APROBADO de qa-reviewer (y de seo-specialist si hay páginas públicas) y confirmación explícita del usuario.
6. No ejecutes acciones destructivas ni toques el proyecto prod sin confirmación explícita del usuario.
7. Si algo no está claro, pregunta. No inventes requisitos.
8. No digas que algo funciona sin haberlo verificado.

## Convenciones
- Código y nombres de archivos en inglés; comentarios, commits y documentación en español.
- Commits con Conventional Commits: feat(checkout): agregar pago con Webpay.
- Ramas: main (producción), develop (desarrollo), feature/*, fix/*, hotfix/*.

## Páginas con SEO
- Público objetivo: Chile, español (es-CL)
- / (inicio)
- /productos (catálogo)
- /productos/[slug] (ficha de producto) — prioridad máxima: JSON-LD Product con precio y disponibilidad. Valoraciones (aggregateRating/review) solo cuando existan reseñas reales y visibles (D-014)
- /categorias/[slug] (vitaminas, magnesio, minerales, omega-3, belleza y bienestar; ver D-023)
- /blog y /blog/[slug] (guías y artículos)
- /nosotros
- /contacto
- /preguntas-frecuentes (JSON-LD FAQPage)

## GITHUB
https://github.com/PardoDeveloper/e-commerce_nutra_elements.git

Páginas que NO se indexan: /carrito, /checkout, /cuenta y todo lo que requiera iniciar sesión.

Contenido: los textos de productos y del blog no deben atribuir a los suplementos propiedades de curar, tratar o prevenir enfermedades. Respeta la normativa chilena sobre suplementos alimentarios y sus declaraciones de salud