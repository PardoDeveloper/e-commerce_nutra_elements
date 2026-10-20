// Firestore para el SERVIDOR de Next.js (D-031): SDK de cliente en su variante "lite" (REST, sin
// websockets ni IndexedDB, no depende de `window`). Lee con las reglas públicas, sin credenciales
// de administrador. NUNCA el Admin SDK. No se mezcla con client.ts (navegador, admin/checkout).
import { getApps, initializeApp, type FirebaseApp } from "firebase/app";
import { connectFirestoreEmulator, getFirestore, type Firestore } from "firebase/firestore/lite";
import { EMULATOR_HOST, EMULATOR_PORTS, getFirebaseConfig, shouldUseEmulators } from "./config";

const SERVER_APP_NAME = "ne-public-server";

let cached: Firestore | undefined;

function getServerApp(): FirebaseApp {
  const existing = getApps().find((a) => a.name === SERVER_APP_NAME);
  if (existing) return existing;
  const config = getFirebaseConfig();
  if (!config.projectId || !config.apiKey) {
    throw new Error(
      "Faltan NEXT_PUBLIC_FIREBASE_PROJECT_ID o NEXT_PUBLIC_FIREBASE_API_KEY: no se puede leer Firestore (DATA_SOURCE=firebase).",
    );
  }
  return initializeApp(config, SERVER_APP_NAME);
}

/** Firestore (lite) para Server Components, route handlers y generateStaticParams. */
export function getServerFirestore(): Firestore {
  if (cached) return cached;
  const db = getFirestore(getServerApp());
  if (shouldUseEmulators()) connectFirestoreEmulator(db, EMULATOR_HOST, EMULATOR_PORTS.firestore);
  cached = db;
  return db;
}

/** URL pública de un archivo de Storage (las reglas permiten lectura pública de products/ y categories/). */
export function storagePublicUrl(path: string, bucket: string | undefined = getFirebaseConfig().storageBucket): string | undefined {
  if (!bucket || !/^(products|categories)\/[A-Za-z0-9_-]+\/[A-Za-z0-9_-]+\.(jpg|jpeg|png|webp)$/.test(path)) return undefined;
  const origin = shouldUseEmulators()
    ? `http://${EMULATOR_HOST}:${EMULATOR_PORTS.storage}`
    : "https://firebasestorage.googleapis.com";
  return `${origin}/v0/b/${bucket}/o/${encodeURIComponent(path)}?alt=media`;
}
