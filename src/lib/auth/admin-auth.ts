// Sesión real del admin con Firebase Auth (D-011 y D-031). SOLO cliente.
//
// Estado observable (para useSyncExternalStore) con el ciclo:
//   loading -> signed-out | verifying -> admin
// Tras iniciar sesión (correo/contraseña o Google) se verifica el claim `admin` (ver admin-claim.ts).
// Sin el claim se cierra la sesión y se deja un aviso. No hay registro público.
import {
  GoogleAuthProvider,
  getRedirectResult,
  onAuthStateChanged,
  sendPasswordResetEmail,
  signInWithEmailAndPassword,
  signInWithPopup,
  signInWithRedirect,
  signOut,
  type User,
} from "firebase/auth";
import { httpsCallable } from "firebase/functions";
import { getFirebaseAuth, getFirebaseFunctions } from "@/lib/firebase/client";
import { ensureAdmin, type AdminCheck } from "./admin-claim";
import { authErrorMessage, errorCode, isSilentResetError, RESET_SENT_MESSAGE } from "./messages";

export interface AuthNotice {
  kind: "denied" | "error";
  text: string;
}

export type AuthState =
  | { status: "loading" }
  | { status: "signed-out"; notice: AuthNotice | null }
  | { status: "verifying"; email: string }
  | { status: "admin"; email: string; uid: string };

export type ActionResult = { ok: true; redirecting?: boolean } | { ok: false; message: string };

const LOADING: AuthState = { status: "loading" };
let state: AuthState = LOADING;
const listeners = new Set<() => void>();
let started = false;
const verifications = new Map<string, Promise<AdminCheck>>();

function setState(next: AuthState): void {
  state = next;
  listeners.forEach((l) => l());
}

// ---------- Observable ----------

export function getAuthSnapshot(): AuthState {
  return state;
}

/** En el servidor aún no se conoce la sesión: "cargando". */
export function getServerAuthSnapshot(): AuthState {
  return LOADING;
}

export function subscribeAuth(listener: () => void): () => void {
  listeners.add(listener);
  start();
  return () => void listeners.delete(listener);
}

// ---------- Verificación del claim ----------

async function readClaim(user: User, refresh: boolean): Promise<boolean> {
  if (refresh) await user.getIdToken(true);
  const result = await user.getIdTokenResult();
  return result.claims.admin === true;
}

/** Una sola verificación en curso por usuario: la comparten el login y el listener de Auth. */
function verifyUser(user: User): Promise<AdminCheck> {
  const running = verifications.get(user.uid);
  if (running) return running;
  setState({ status: "verifying", email: user.email ?? "" });
  const promise = (async (): Promise<AdminCheck> => {
    const check = await ensureAdmin({
      hasAdminClaim: (refresh) => readClaim(user, refresh),
      claimAdmin: async () => (await httpsCallable(getFirebaseFunctions(), "claimAdmin")({})).data,
    });
    if (check.ok) {
      setState({ status: "admin", email: user.email ?? "", uid: user.uid });
    } else {
      // Sin permisos (o sin poder verificarlos): se cierra la sesión y se informa en el login.
      await signOut(getFirebaseAuth()).catch(() => undefined);
      setState({ status: "signed-out", notice: { kind: check.reason === "not-admin" ? "denied" : "error", text: check.message } });
    }
    return check;
  })().finally(() => verifications.delete(user.uid));
  verifications.set(user.uid, promise);
  return promise;
}

// ---------- Inicio ----------

function start(): void {
  if (started || typeof window === "undefined") return;
  started = true;
  try {
    const auth = getFirebaseAuth();
    onAuthStateChanged(
      auth,
      (user) => {
        if (!user) {
          if (state.status !== "signed-out") setState({ status: "signed-out", notice: null });
          return;
        }
        if (state.status === "admin" && state.uid === user.uid) return;
        void verifyUser(user);
      },
      (error) => setState({ status: "signed-out", notice: { kind: "error", text: authErrorMessage(error) } }),
    );
    // Respaldo con redirect: si el navegador volvió de Google con un error, se muestra.
    void getRedirectResult(auth).catch((error: unknown) =>
      setState({ status: "signed-out", notice: { kind: "error", text: authErrorMessage(error) } }),
    );
  } catch (error) {
    // Configuración de Firebase inválida o ausente.
    setState({ status: "signed-out", notice: { kind: "error", text: authErrorMessage(error) } });
  }
}

// ---------- Acciones ----------

async function finish(user: User): Promise<ActionResult> {
  const check = await verifyUser(user);
  return check.ok ? { ok: true } : { ok: false, message: check.message };
}

export async function signInWithEmail(email: string, password: string): Promise<ActionResult> {
  try {
    const credential = await signInWithEmailAndPassword(getFirebaseAuth(), email.trim(), password);
    return await finish(credential.user);
  } catch (error) {
    return { ok: false, message: authErrorMessage(error) };
  }
}

/** Popup de Google; si el navegador lo bloquea o no lo soporta, redirect como respaldo. */
export async function signInWithGoogle(): Promise<ActionResult> {
  const auth = getFirebaseAuth();
  const provider = new GoogleAuthProvider();
  provider.setCustomParameters({ prompt: "select_account" });
  try {
    const credential = await signInWithPopup(auth, provider);
    return await finish(credential.user);
  } catch (error) {
    const code = errorCode(error);
    if (code === "auth/popup-blocked" || code === "auth/operation-not-supported-in-this-environment") {
      try {
        await signInWithRedirect(auth, provider);
        return { ok: true, redirecting: true };
      } catch (redirectError) {
        return { ok: false, message: authErrorMessage(redirectError) };
      }
    }
    return { ok: false, message: authErrorMessage(error) };
  }
}

/** Siempre responde lo mismo exista o no el correo; solo informa errores que no lo revelan. */
export async function requestPasswordReset(email: string): Promise<ActionResult> {
  try {
    await sendPasswordResetEmail(getFirebaseAuth(), email.trim());
    return { ok: true };
  } catch (error) {
    if (isSilentResetError(error)) return { ok: true };
    return { ok: false, message: authErrorMessage(error) };
  }
}

export { RESET_SENT_MESSAGE };

export async function signOutAdmin(): Promise<void> {
  await signOut(getFirebaseAuth());
  setState({ status: "signed-out", notice: null });
}
