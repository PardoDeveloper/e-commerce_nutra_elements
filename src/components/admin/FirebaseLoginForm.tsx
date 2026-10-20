"use client";

// Login real del admin (D-031): correo y contraseña, o Google. Sin registro público: aquí no hay "crear cuenta".
// Después de entrar se verifica el claim `admin` (claimAdmin + getIdToken(true)); sin él se cierra la sesión.
import { useId, useState, useSyncExternalStore, type FormEvent } from "react";
import {
  getAuthSnapshot,
  getServerAuthSnapshot,
  requestPasswordReset,
  signInWithEmail,
  signInWithGoogle,
  subscribeAuth,
} from "@/lib/auth/admin-auth";
import { RESET_SENT_MESSAGE } from "@/lib/auth/messages";
import shell from "./AdminShell.module.css";
import ui from "./admin.module.css";

type Message = { kind: "ok" | "error"; text: string } | null;

export function FirebaseLoginForm() {
  const id = useId();
  const auth = useSyncExternalStore(subscribeAuth, getAuthSnapshot, getServerAuthSnapshot);
  const [mode, setMode] = useState<"login" | "reset">("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<Message>(null);

  const verifying = auth.status === "verifying";
  const disabled = busy || verifying;
  // El aviso del almacén (sin permisos, redirect fallido) se muestra si no hay un mensaje local más reciente.
  const notice = auth.status === "signed-out" ? auth.notice : null;
  const shown: Message = message ?? (notice ? { kind: "error", text: notice.text } : null);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (disabled) return;
    setMessage(null);
    if (email.trim() === "" || password === "") {
      setMessage({ kind: "error", text: "Escribe tu correo y tu contraseña." });
      return;
    }
    setBusy(true);
    const result = await signInWithEmail(email, password);
    setBusy(false);
    if (!result.ok) setMessage({ kind: "error", text: result.message });
    else setPassword("");
  }

  async function onGoogle() {
    if (disabled) return;
    setMessage(null);
    setBusy(true);
    const result = await signInWithGoogle();
    setBusy(false);
    if (!result.ok) setMessage({ kind: "error", text: result.message });
  }

  async function onReset(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (disabled) return;
    setMessage(null);
    if (email.trim() === "") {
      setMessage({ kind: "error", text: "Escribe tu correo electrónico." });
      return;
    }
    setBusy(true);
    const result = await requestPasswordReset(email);
    setBusy(false);
    setMessage(result.ok ? { kind: "ok", text: RESET_SENT_MESSAGE } : { kind: "error", text: result.message });
  }

  const status = (
    <div aria-live="polite">
      {verifying ? <p className={ui.alert}>Verificando permisos de administrador…</p> : null}
      {shown ? (
        <p className={`${ui.alert} ${shown.kind === "ok" ? ui.alertOk : ui.alertError}`} role={shown.kind === "error" ? "alert" : "status"}>
          {shown.text}
        </p>
      ) : null}
    </div>
  );

  if (mode === "reset") {
    return (
      <div className={shell.loginCard}>
        <h1>Recuperar contraseña</h1>
        <p className={ui.help}>Escribe tu correo y te enviaremos un enlace para crear una contraseña nueva.</p>
        <form className={ui.form} onSubmit={onReset} noValidate>
          <div className={ui.field}>
            <label className={ui.label} htmlFor={`${id}-email`}>
              Correo electrónico
            </label>
            <input
              id={`${id}-email`}
              className={ui.input}
              type="email"
              autoComplete="username"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              disabled={disabled}
            />
          </div>
          {status}
          <button type="submit" className={ui.btn} disabled={disabled}>
            {busy ? "Enviando…" : "Enviar enlace"}
          </button>
          <button
            type="button"
            className={`${ui.btn} ${ui.btnOutline}`}
            disabled={disabled}
            onClick={() => {
              setMode("login");
              setMessage(null);
            }}
          >
            Volver a iniciar sesión
          </button>
        </form>
      </div>
    );
  }

  return (
    <div className={shell.loginCard}>
      <h1>Panel de administración</h1>
      <p className={ui.help}>Acceso solo para administradores autorizados.</p>
      <form className={ui.form} onSubmit={onSubmit} noValidate>
        <div className={ui.field}>
          <label className={ui.label} htmlFor={`${id}-email`}>
            Correo electrónico
          </label>
          <input
            id={`${id}-email`}
            className={ui.input}
            type="email"
            autoComplete="username"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            disabled={disabled}
          />
        </div>
        <div className={ui.field}>
          <label className={ui.label} htmlFor={`${id}-password`}>
            Contraseña
          </label>
          <input
            id={`${id}-password`}
            className={ui.input}
            type="password"
            autoComplete="current-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            disabled={disabled}
          />
        </div>
        {status}
        <button type="submit" className={ui.btn} disabled={disabled}>
          {busy || verifying ? "Ingresando…" : "Ingresar"}
        </button>
        <button type="button" className={`${ui.btn} ${ui.btnOutline}`} disabled={disabled} onClick={() => void onGoogle()}>
          Entrar con Google
        </button>
        <button
          type="button"
          className={`${ui.btn} ${ui.btnOutline}`}
          disabled={disabled}
          onClick={() => {
            setMode("reset");
            setMessage(null);
          }}
        >
          Olvidé mi contraseña
        </button>
      </form>
    </div>
  );
}
