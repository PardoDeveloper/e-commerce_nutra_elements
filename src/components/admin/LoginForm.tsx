"use client";

// Elige el formulario de acceso según la fuente de datos. El login SIMULADO solo existe con "demo":
// con "firebase" ni siquiera se renderiza (D-031). Ver mode.ts.
import { isDemoLoginAvailable } from "@/lib/admin/mode";
import { useDataSource } from "./AdminProvider";
import { DemoLoginForm } from "./DemoLoginForm";
import { FirebaseLoginForm } from "./FirebaseLoginForm";

export function LoginForm() {
  const source = useDataSource();
  return isDemoLoginAvailable(source) ? <DemoLoginForm /> : <FirebaseLoginForm />;
}
