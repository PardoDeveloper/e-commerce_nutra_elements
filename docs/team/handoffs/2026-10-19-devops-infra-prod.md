# Handoff devops — infraestructura base en prod (`nutraelements`) — 2026-10-19

Estado: PARCIAL. Se creó la app web y se configuró el entorno local. Firestore, Storage y Auth quedaron pendientes porque la API de Firestore no está habilitada y firebase-tools 15.34 no puede habilitarla. No hay `gcloud` instalado. No se desplegó nada, no hubo commits ni push, y no se tocó dev.

## Lo creado

### App web `nutra-web` en `nutraelements`
- Comando: `firebase apps:create web nutra-web --project prod`
- appId: `1:48808849043:web:f3249fc13c0b0cf86b6766`
- Evidencia: `firebase apps:list --project prod` muestra 1 app (nutra-web, WEB). El sitio de Hosting `nutraelements` ya existía.

### Configuración local (no versionada)
- `.env.local` anterior (dev) renombrado a `.env.dev.local.bak`.
- `.env.local` nuevo con valores de prod. Variables (solo nombres):
  - `NEXT_PUBLIC_FIREBASE_API_KEY`
  - `NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN`
  - `NEXT_PUBLIC_FIREBASE_PROJECT_ID`
  - `NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET`
  - `NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID`
  - `NEXT_PUBLIC_FIREBASE_APP_ID`
- El `PROJECT_ID` es `nutraelements`. Ninguna variable quedó vacía.
- `git check-ignore -v` confirma que ambos archivos están cubiertos por `.env.*` (.gitignore, línea 3). `git status --short` solo muestra `.env.example` (ya modificado antes de esta tarea).
- Aviso: el valor de `NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET` lo devuelve el sdkconfig aunque el bucket no exista todavía. Hay que confirmarlo cuando se cree.
- Aviso: con este `.env.local`, `npm run dev` apunta a la nube de prod. Si se usan los emuladores, la app debe conectarse a ellos con la bandera que ya use el código. Revisar con nextjs-frontend.

## Lo que NO se pudo hacer por CLI

### Causa común
`firebase firestore:databases:create "(default)" --location us-east4 --project prod` falló con HTTP 403: `Cloud Firestore API has not been used in project nutraelements before or it is disabled`. El mismo error salió en `firestore:locations` y `databases:list`. firebase-tools no tiene un comando para habilitar APIs. Podría hacerse llamando a la API REST con el token guardado de la CLI, pero eso implica extraer credenciales y no lo hice. La ubicación us-east4 no se usó en ninguna creación.

### 1. Firestore (ubicación IRREVERSIBLE)
Opción A, por consola:
1. Abrir https://console.firebase.google.com/project/nutraelements/firestore
2. Clic en **Crear base de datos** (Build > Firestore Database > Create database).
3. ID de base de datos: `(default)`. Edición: **Standard**.
4. Ubicación: elegir **us-east4 (Northern Virginia)**. No elegir una multirregión (nam5, etc.). Verificar dos veces, porque no se puede cambiar.
5. Modo: **Producción** (reglas que niegan todo). No elegir modo de prueba.
6. Clic en **Crear**.

Opción B, por CLI:
1. Habilitar la API en https://console.developers.google.com/apis/api/firestore.googleapis.com/overview?project=nutraelements y esperar unos minutos.
2. Pasar el comando a devops. Luego este crea la base con `firebase firestore:databases:create "(default)" --location us-east4 --project prod` y la verifica con `firebase firestore:databases:get "(default)" --project prod`.
3. Nota: crearla por CLI no despliega reglas. Quedarían las reglas por defecto que el servicio asigne. Hay que revisar que no sean abiertas.

Verificación posterior: Firestore > pestaña **Reglas** debe mostrar `allow read, write: if false;`. Después desplegar las reglas reales, tras el APROBADO de QA.

### 2. Storage (bucket por defecto en us-east4)
No existe comando en firebase-tools 15.34 para crear el bucket. `firebase deploy` solo lo lee y falla si no existe. La vía por API (`firebasestorage.googleapis.com` `defaultBucket.create`) necesita un token y no la usé.
1. Abrir https://console.firebase.google.com/project/nutraelements/storage
2. Clic en **Comenzar** (Build > Storage > Get started).
3. Aceptar el cambio de plan si lo pide. El proyecto ya está en Blaze.
4. Modo: **Producción**.
5. Ubicación: **us-east4**. Si el asistente solo ofrece "nam5" o ubicaciones sin us-east4, detenerse y avisar al tech-lead.
6. Clic en **Listo**.

Después, copiar el nombre del bucket mostrado y comprobar que coincide con `NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET` de `.env.local`.

### 3. Authentication
Firebase Auth todavía no se ha inicializado. Si Auth está sin configurar, la consola pide **Comenzar** antes de mostrar proveedores.

Consola:
1. Abrir https://console.firebase.google.com/project/nutraelements/authentication y clic en **Comenzar** (Build > Authentication > Get started).
2. Pestaña **Método de acceso** (Sign-in method) > **Correo electrónico/contraseña** > activar el primer interruptor. Dejar desactivado "Vínculo de correo (sin contraseña)". Guardar.
3. **Agregar proveedor nuevo** > **Google** > activar. Elegir el **correo de asistencia del proyecto** (obligatorio, por ejemplo carlos.pardo.b78@gmail.com) y el nombre público del proyecto. Guardar.
4. Pestaña **Configuración** > **Dominios autorizados**: dejar `localhost` y los dominios de `nutraelements`. Agregar el dominio de App Hosting cuando exista. No agregar nutraelements.cl todavía (D-021, D-031).
5. No crear usuarios.

Alternativa declarativa. firebase-tools 15.34 admite una sección `auth` en `firebase.json` (esquema `AuthConfig`) y `firebase deploy --only auth` (usa `provisionFirebaseApp`). Parece ser experimental. No la agregué a `firebase.json` porque falta el correo de soporte que debe aprobar Carlos, y porque ese archivo es compartido con el alias dev (un deploy sin `--only` lo aplicaría ahí). Bloque propuesto, sin desplegar:
```json
"auth": {
  "providers": {
    "emailPassword": true,
    "googleSignIn": {
      "oAuthBrandDisplayName": "Nutra Elements",
      "supportEmail": "<correo de soporte a definir por Carlos>"
    }
  }
}
```
Se desplegaría con `firebase deploy --project prod --only auth`, solo con confirmación de Carlos. Pendiente de validar en un entorno donde se pueda probar.

## Cómo revertir
- App web: `firebase apps:delete` no existe como comando estable en esta versión. Se elimina en consola: Configuración del proyecto > General > Tus apps > nutra-web > **Eliminar esta app**. No hay datos asociados.
- `.env.local`: restaurar con `mv .env.dev.local.bak .env.local` (sobrescribe el de prod).
- Firestore, cuando exista: la base se puede borrar (con protección de eliminación desactivada), pero la ubicación us-east4 es **irreversible** para el proyecto. Cambiarla exigiría otro proyecto.
- Storage, cuando exista: el bucket por defecto se puede borrar vacío. La ubicación tampoco es modificable.
- Auth: desactivar el proveedor en Authentication > Método de acceso.

## Pedidos al tech-lead
1. Que Carlos haga los pasos de consola 1, 2 y 3 (o habilite la API de Firestore para la opción B).
2. Que Carlos defina el correo de soporte de Google Sign-In.
3. Cuando esté listo, avisar a devops para verificar (`firestore:databases:get`, estado del bucket y proveedores).
4. Revisar con nextjs-frontend que `.env.local` apuntando a prod no interfiera con el uso de emuladores.
