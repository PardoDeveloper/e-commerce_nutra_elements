# QA: frontend tras las correcciones B-1 y B-2 (qa-reviewer, 2026-10-19)

Volcado por el tech-lead: qa-reviewer no tiene herramienta de escritura.

## Veredicto: APROBADO (sin bloqueantes)
- Evidencia: lint OK, 308 tests y build OK.
- **B-1 cerrado:** `apphosting.yaml` es correcto; `resolveDataSource` es único y falla cerrado; no hay otros lectores de `DATA_SOURCE`; la persistencia demo queda desactivada en la nube.
- **B-2 cerrado:** el umbral demo se ignora fuera del modo demo, con tests.
- **Sembrado:** transacción que no pisa documentos existentes y que cumple las reglas (revisión estática).

## Hallazgos
1. **Sugerencia:** el RUT de prueba "11.111.111-1" en `firebase-seed.ts:34` es válido; usar un valor evidentemente falso.
2. **IMPORTANTE:** el aviso de datos de prueba en `SettingsView.tsx:191` aparece siempre. Debe mostrarse solo mientras el banco sea el de prueba. Riesgo: que un cliente vea los datos de prueba al pagar por transferencia. → Checklist de lanzamiento, y el checkout no debe ofrecer transferencia mientras el banco sea el de prueba.
3. **Sugerencia:** `INITIAL_CATEGORIES_TOTAL` está duplicado.
