// Envío REAL del formulario de contacto: callable `submitContactMessage` (functions.md 3.5).
// Se importa de forma diferida desde el formulario: el SDK de Firebase no llega a la página estática.
import { httpsCallable } from "firebase/functions";
import { getFirebaseFunctions } from "@/lib/firebase/client";
import { CONTACT_ERROR_MESSAGES, ContactSendError } from "./types";
import type { ContactRequest } from "./validation";

export async function submitContactFirebase(request: ContactRequest): Promise<void> {
  try {
    await httpsCallable(getFirebaseFunctions(), "submitContactMessage", { timeout: 20_000 })(request);
  } catch (error) {
    const code = typeof error === "object" && error !== null ? String((error as { code?: unknown }).code ?? "").replace(/^functions\//, "") : "";
    if (code === "resource-exhausted") throw new ContactSendError(CONTACT_ERROR_MESSAGES.RATE_LIMITED, "RATE_LIMITED");
    if (code === "invalid-argument") throw new ContactSendError(CONTACT_ERROR_MESSAGES.INVALID_INPUT, "INVALID_INPUT");
    throw new ContactSendError(CONTACT_ERROR_MESSAGES.INTERNAL, "INTERNAL");
  }
}
