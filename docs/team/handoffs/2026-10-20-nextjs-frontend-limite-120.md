# Handoff nextjs-frontend: límite orderStatusPerIpPer10Min 30 a 120 (D-032)

- `src/lib/admin/firebase-mappers.ts`: `DEFAULT_LIMITS.orderStatusPerIpPer10Min` pasa de 30 a 120. Es el único lugar con el valor (el seed lo reutiliza vía `DEFAULT_LIMITS`).
- `src/lib/admin/firebase-seed.test.ts`: verifica que el valor sea 120 y que `flowConfirmPerIpPer10Min` no esté en los defaults del panel.
- Ajustes no muestra ni edita `limits`: solo los conserva al guardar, así que no hay rango que ajustar.
- `flowConfirmPerIpPer10Min` no aparece en el panel.
- Verificación: lint sin errores, 313 tests en 32 archivos pasan, build correcto.
- Pendiente de otros agentes: nada.
