import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { initializeTestEnvironment, type RulesTestEnvironment } from "@firebase/rules-unit-testing";
import firebase from "firebase/compat/app";
import "firebase/compat/firestore";
import "firebase/compat/storage";

// Proyecto "demo-": el emulador nunca toca un proyecto real.
export const PROJECT_ID = "demo-nutra-rules";

// Los tests se ejecutan con cwd = functions/ (npm run test:rules); las reglas viven en la raíz del repo.
const repoRoot = resolve(process.cwd(), "..");

export function readRules(file: "firestore.rules" | "storage.rules"): string {
  return readFileSync(resolve(repoRoot, file), "utf8");
}

export async function createEnv(service: "firestore" | "storage"): Promise<RulesTestEnvironment> {
  return initializeTestEnvironment({
    projectId: PROJECT_ID,
    ...(service === "firestore"
      ? { firestore: { rules: readRules("firestore.rules") } }
      : { storage: { rules: readRules("storage.rules") } }),
  });
}

export type Profile = "anonymous" | "user" | "userAdminFalse" | "admin";

// Tres perfiles sin privilegios (equivalentes entre sí) y el admin.
export function contextFor(env: RulesTestEnvironment, profile: Profile) {
  switch (profile) {
    case "anonymous":
      return env.unauthenticatedContext();
    case "user":
      return env.authenticatedContext("user-1");
    case "userAdminFalse":
      return env.authenticatedContext("user-2", { admin: false });
    case "admin":
      return env.authenticatedContext("admin-1", { admin: true });
  }
}

export const NON_ADMIN_PROFILES: Profile[] = ["anonymous", "user", "userAdminFalse"];

export const FieldValue = firebase.firestore.FieldValue;
export const Timestamp = firebase.firestore.Timestamp;
export const serverNow = () => FieldValue.serverTimestamp();
export const clientNow = () => Timestamp.now();
