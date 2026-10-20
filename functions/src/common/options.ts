import { setGlobalOptions } from "firebase-functions/v2";

// Región fijada una vez (D-010) y tope de instancias por defecto (contrato functions.md, sección 1).
// Cada función ajusta memoria, timeout y maxInstances por su cuenta.
export const REGION = "us-east4" as const;

setGlobalOptions({ region: REGION, maxInstances: 10 });
