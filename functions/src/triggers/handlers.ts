import { onDocumentWritten } from "firebase-functions/v2/firestore";
import { defineSecret, defineString } from "firebase-functions/params";
import * as logger from "firebase-functions/logger";
import { sendRevalidation } from "./revalidate.js";
import { categoryRevalidation, productRevalidation, settingsRevalidation, type DocData } from "./routes.js";

// Triggers de revalidación ISR (contrato functions.md, sección 8.1). Ninguno escribe en Firestore.
// Región: la global (us-east4), igual que la base de datos.

const revalidateSecret = defineSecret("REVALIDATE_SECRET");
const siteUrl = defineString("SITE_URL", { default: "" });

const triggerOptions = {
  secrets: [revalidateSecret],
  memory: "256MiB" as const,
  // Cubre los 3 intentos de 5 s más las esperas (~19 s) con margen.
  timeoutSeconds: 40,
  maxInstances: 3,
  // Sin reintento de la plataforma: el reintento acotado es interno y el resto lo corrige el vencimiento de ISR.
  retry: false,
};

async function run(source: string, plan: ReturnType<typeof settingsRevalidation>): Promise<void> {
  if (!plan) {
    logger.debug("Sin cambios visibles: no se revalida", { source });
    return;
  }
  await sendRevalidation(siteUrl.value(), revalidateSecret.value(), plan, source);
}

export const onProductWritten = onDocumentWritten({ ...triggerOptions, document: "products/{sku}" }, async (event) => {
  const before = event.data?.before.data() as DocData;
  const after = event.data?.after.data() as DocData;
  await run(`products/${event.params.sku}`, productRevalidation(before, after));
});

export const onCategoryWritten = onDocumentWritten(
  { ...triggerOptions, document: "categories/{categoryId}" },
  async (event) => {
    const before = event.data?.before.data() as DocData;
    const after = event.data?.after.data() as DocData;
    await run(`categories/${event.params.categoryId}`, categoryRevalidation(event.params.categoryId, before, after));
  },
);

export const onSettingsPublicWritten = onDocumentWritten({ ...triggerOptions, document: "settings/public" }, async (event) => {
  const before = event.data?.before.data() as DocData;
  const after = event.data?.after.data() as DocData;
  await run("settings/public", settingsRevalidation(before, after));
});
