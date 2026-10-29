// SDK de cliente de Firebase. Importar SOLO desde Client Components y solo donde
// se necesite (carrito, checkout, admin): no debe llegar a las páginas públicas
// estáticas (contrato SEO 06, sección 10). El Admin SDK nunca va aquí.
import { getApp, getApps, initializeApp, type FirebaseApp } from "firebase/app";
import { getToken as getAppCheckToken, initializeAppCheck, ReCaptchaEnterpriseProvider, type AppCheck } from "firebase/app-check";
import { connectAuthEmulator, getAuth, type Auth } from "firebase/auth";
import { connectFirestoreEmulator, getFirestore, type Firestore } from "firebase/firestore";
import { connectFunctionsEmulator, getFunctions, httpsCallable, type Functions } from "firebase/functions";
import { connectStorageEmulator, getStorage, type FirebaseStorage } from "firebase/storage";
import {
  EMULATOR_HOST,
  EMULATOR_PORTS,
  FUNCTIONS_REGION,
  getFirebaseConfig,
  shouldUseEmulators,
} from "./config";
import { withTokenRetry } from "./token-retry";

declare global {
  // Token de depuración de App Check (solo desarrollo)
  var FIREBASE_APPCHECK_DEBUG_TOKEN: string | boolean | undefined;
}

// Se guardan en globalThis para que HMR no reinicialice ni reconecte a los emuladores.
interface FirebaseState {
  app?: FirebaseApp;
  auth?: Auth;
  db?: Firestore;
  storage?: FirebaseStorage;
  functions?: Functions;
  appCheck?: AppCheck;
}
const globalState = globalThis as typeof globalThis & { __neFirebase?: FirebaseState };
const state: FirebaseState = (globalState.__neFirebase ??= {});

function assertBrowser(): void {
  if (typeof window === "undefined") {
    throw new Error("El SDK de cliente de Firebase solo puede usarse en el navegador.");
  }
}

/** Inicializa App Check solo si existe la clave del sitio. */
function setupAppCheck(app: FirebaseApp): void {
  const siteKey = process.env.NEXT_PUBLIC_APPCHECK_SITE_KEY;
  if (!siteKey) return;
  if (process.env.NODE_ENV !== "production") {
    // En desarrollo se usa el token de depuración (registrado en la consola);
    // sin valor, el SDK genera uno y lo imprime en la consola del navegador.
    globalThis.FIREBASE_APPCHECK_DEBUG_TOKEN =
      process.env.NEXT_PUBLIC_APPCHECK_DEBUG_TOKEN || true;
  }
  state.appCheck = initializeAppCheck(app, {
    provider: new ReCaptchaEnterpriseProvider(siteKey),
    isTokenAutoRefreshEnabled: true,
  });
}

export function getFirebaseApp(): FirebaseApp {
  assertBrowser();
  if (state.app) return state.app;
  const existing = getApps().length > 0;
  const app = existing ? getApp() : initializeApp(getFirebaseConfig());
  if (!existing) setupAppCheck(app);
  state.app = app;
  return app;
}

export function getFirebaseAuth(): Auth {
  if (state.auth) return state.auth;
  const auth = getAuth(getFirebaseApp());
  if (shouldUseEmulators()) {
    connectAuthEmulator(auth, `http://${EMULATOR_HOST}:${EMULATOR_PORTS.auth}`, {
      disableWarnings: true,
    });
  }
  state.auth = auth;
  return auth;
}

export function getFirebaseDb(): Firestore {
  if (state.db) return state.db;
  const db = getFirestore(getFirebaseApp());
  if (shouldUseEmulators()) {
    connectFirestoreEmulator(db, EMULATOR_HOST, EMULATOR_PORTS.firestore);
  }
  state.db = db;
  return db;
}

export function getFirebaseStorage(): FirebaseStorage {
  if (state.storage) return state.storage;
  const storage = getStorage(getFirebaseApp());
  if (shouldUseEmulators()) {
    connectStorageEmulator(storage, EMULATOR_HOST, EMULATOR_PORTS.storage);
  }
  state.storage = storage;
  return storage;
}

/** Cloud Functions callable, siempre en us-east4 (D-010). */
export function getFirebaseFunctions(): Functions {
  if (state.functions) return state.functions;
  const functions = getFunctions(getFirebaseApp(), FUNCTIONS_REGION);
  if (shouldUseEmulators()) {
    connectFunctionsEmulator(functions, EMULATOR_HOST, EMULATOR_PORTS.functions);
  }
  state.functions = functions;
  return functions;
}

/** Fuerza tokens nuevos de App Check y de sesión (el SDK de Functions toma después los renovados). */
async function refreshFirebaseTokens(): Promise<void> {
  getFirebaseApp();
  if (state.appCheck) await getAppCheckToken(state.appCheck, true);
  await getFirebaseAuth().currentUser?.getIdToken(true);
}

/**
 * Invoca una callable y devuelve `data`. Si el servidor rechaza un token vencido (App Check o
 * sesión) antes de ejecutar la función, renueva los tokens y reintenta una vez.
 */
export function callFunction(name: string, data: unknown, timeout: number): Promise<unknown> {
  const callable = httpsCallable(getFirebaseFunctions(), name, { timeout });
  return withTokenRetry(async () => (await callable(data)).data, refreshFirebaseTokens);
}
