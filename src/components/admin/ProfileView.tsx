"use client";

// Perfil del admin: datos de la sesión y cambio de la propia contraseña (contraseña actual, nueva y
// confirmación). Con "demo" no hay cuentas reales y el formulario no se muestra.
import { useId, useState, useSyncExternalStore, type FormEvent } from "react";
import { isDemoLoginAvailable } from "@/lib/admin/mode";
import { changeOwnPassword, getAuthSnapshot, getServerAuthSnapshot, subscribeAuth } from "@/lib/auth/admin-auth";
import { PASSWORD_MAX_LENGTH, PASSWORD_MIN_LENGTH, validatePasswordChange, type PasswordField } from "@/lib/auth/password";
import { useDataSource } from "./AdminProvider";
import ui from "./admin.module.css";

type Notice = { kind: "ok" | "error"; text: string } | null;

export function ProfileView() {
  const demo = isDemoLoginAvailable(useDataSource());
  return (
    <div className={ui.page}>
      <div>
        <h1>Mi perfil</h1>
        <p className={ui.lead}>Tu cuenta de administración.</p>
      </div>
      {demo ? (
        <p className={ui.alert} role="status">
          En el modo demostración la sesión es simulada: no hay una contraseña real que cambiar.
        </p>
      ) : (
        <>
          <AccountInfo />
          <ChangePasswordForm />
        </>
      )}
    </div>
  );
}

function AccountInfo() {
  const auth = useSyncExternalStore(subscribeAuth, getAuthSnapshot, getServerAuthSnapshot);
  if (auth.status !== "admin") return null;
  return (
    <section className={`${ui.card} ${ui.section}`} aria-label="Cuenta">
      <h2>Cuenta</h2>
      <p>
        Correo: <strong>{auth.email}</strong>
      </p>
    </section>
  );
}

function ChangePasswordForm() {
  const id = useId();
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [confirm, setConfirm] = useState("");
  const [invalidField, setInvalidField] = useState<PasswordField | null>(null);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<Notice>(null);

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    if (busy) return;
    setNotice(null);
    const input = { current, next, confirm };
    const invalid = validatePasswordChange(input);
    setInvalidField(invalid?.field ?? null);
    if (invalid) {
      setNotice({ kind: "error", text: invalid.message });
      document.getElementById(`${id}-${invalid.field}`)?.focus();
      return;
    }
    setBusy(true);
    const result = await changeOwnPassword(input);
    setBusy(false);
    if (result.ok) {
      setCurrent("");
      setNext("");
      setConfirm("");
      setNotice({ kind: "ok", text: result.message ?? "Contraseña actualizada." });
    } else {
      setNotice({ kind: "error", text: result.message ?? "No se pudo cambiar la contraseña." });
    }
  }

  const fields: readonly { key: PasswordField; label: string; value: string; set: (v: string) => void; autoComplete: string }[] = [
    { key: "current", label: "Contraseña actual", value: current, set: setCurrent, autoComplete: "current-password" },
    { key: "next", label: "Nueva contraseña", value: next, set: setNext, autoComplete: "new-password" },
    { key: "confirm", label: "Confirmar nueva contraseña", value: confirm, set: setConfirm, autoComplete: "new-password" },
  ];

  return (
    <section className={`${ui.card} ${ui.section}`} aria-labelledby={`${id}-title`}>
      <h2 id={`${id}-title`}>Cambiar contraseña</h2>
      <form className={ui.form} onSubmit={onSubmit} noValidate>
        <div className={ui.fields}>
          {fields.map((f) => (
            <div className={ui.field} key={f.key}>
              <label className={ui.label} htmlFor={`${id}-${f.key}`}>
                {f.label}
              </label>
              <input
                id={`${id}-${f.key}`}
                className={ui.input}
                type="password"
                autoComplete={f.autoComplete}
                maxLength={PASSWORD_MAX_LENGTH}
                value={f.value}
                disabled={busy}
                aria-invalid={invalidField === f.key || undefined}
                aria-describedby={f.key === "next" ? `${id}-next-help` : undefined}
                onChange={(e) => f.set(e.target.value)}
              />
              {f.key === "next" ? (
                <span id={`${id}-next-help`} className={ui.help}>
                  Al menos {PASSWORD_MIN_LENGTH} caracteres y distinta de la actual.
                </span>
              ) : null}
            </div>
          ))}
        </div>
        <div className={ui.actions}>
          <button type="submit" className={ui.btn} disabled={busy}>
            {busy ? "Guardando…" : "Cambiar contraseña"}
          </button>
        </div>
        <div aria-live="polite">
          {notice ? (
            <p className={`${ui.alert} ${notice.kind === "ok" ? ui.alertOk : ui.alertError}`} role={notice.kind === "error" ? "alert" : "status"}>
              {notice.text}
            </p>
          ) : null}
        </div>
      </form>
    </section>
  );
}
