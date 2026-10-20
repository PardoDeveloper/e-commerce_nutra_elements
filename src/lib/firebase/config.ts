import type { FirebaseOptions } from "firebase/app";

// Next.js solo sustituye las NEXT_PUBLIC_* cuando se escriben de forma literal,
// por eso cada variable se referencia por su nombre completo.
export function getFirebaseConfig(): FirebaseOptions {
  return {
    apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
    authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
    projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
    storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
    appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID,
    messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
  };
}

export const FUNCTIONS_REGION = "us-east4"; // D-010

export const shouldUseEmulators = (): boolean =>
  process.env.NEXT_PUBLIC_USE_EMULATORS === "true";

// Puertos de firebase.json
export const EMULATOR_HOST = "127.0.0.1";
export const EMULATOR_PORTS = {
  auth: 9099,
  firestore: 8080,
  storage: 9199,
  functions: 5001,
} as const;
