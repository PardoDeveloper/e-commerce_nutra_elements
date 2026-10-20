# QA: reglas e índices para prod (qa-reviewer, 2026-10-19)

Volcado por el tech-lead: qa-reviewer no tiene herramienta de escritura.

## Veredicto: APROBADO (revisión estática; sin bloqueantes)

- `firestore.rules`: compiló correctamente (`firebase deploy --only firestore --project dev --dry-run`).
  - **Efecto no previsto:** ese dry-run habilitó la API de Firestore y **creó `(default)` en nutraelementsdev** (us-east4, 2026-10-19T14:41Z). Verificado por el tech-lead.
- `storage.rules`: revisión manual; se compilará en el deploy (D-031).
- `firestore.indexes.json`: JSON válido; 10 índices coherentes con data-model v1.2; TTL correcto.
- Cumple las 7 prioridades: nada abierto; dinero y datos personales sin escritura del cliente; productos protegidos (solo contenido, `updatedAt == request.time`); `list` exige filtros; Storage solo admin, ≤ 2 MiB y tipos de imagen; sintaxis; índices.

## Mejoras (no bloquean)
1. **IMPORTANTE:** `functions/test/rules/firestore.rules.test.ts` líneas 293–297. Los casos `["deletedAt", null]` y `["deletedBy", null]` fallarían en el emulador: escriben el mismo valor y la regla los permite. Hay que probarlos sobre `P-DELETED` o quitarlos.
2. **IMPORTANTE:** `storage.rules` líneas 27 y 36. `allow read` incluye `list`; debe ser `allow get: if true;`.
3. **Sugerencia:** `request.auth.token.get('admin', false) == true`.
4. **Sugerencia:** confirmar que la Function de publicación valide cada imagen.
5. **Sugerencia:** `orderNumberStart` solo inicializa el contador y nunca lo reduce.
6. **Prueba manual tras el deploy (D-031):**
   - Un anónimo no lee `orders` ni `settings/private`.
   - La lista de `products` solo funciona con los 3 filtros.
   - Un usuario de Google sin claim no escribe en `categories` ni en Storage.
   - Un producto sin `deletedAt` no es público.
