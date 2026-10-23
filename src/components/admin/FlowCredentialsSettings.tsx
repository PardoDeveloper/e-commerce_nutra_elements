"use client";

import { useEffect, useId, useState, type FormEvent } from "react";
import { errorMessage } from "@/lib/admin/errors";
import type { FlowCredentialsStatus, FlowCredentialStatus } from "@/lib/admin/types";
import { useAdminService } from "./AdminProvider";
import ui from "./admin.module.css";

type Notice = { kind: "ok" | "error"; text: string } | null;

const dateFormat = new Intl.DateTimeFormat("es-CL", { dateStyle: "medium", timeStyle: "short", timeZone: "America/Santiago" });

function describe(status: FlowCredentialStatus, hint?: string | null): string {
  if (!status.configured) return "Sin configurar";
  const when = status.updatedAt ? ` · actualizada el ${dateFormat.format(new Date(status.updatedAt))}` : "";
  return `${hint ? `Configurada (termina en ${hint})` : "Configurada"}${when}`;
}

/**
 * Credenciales de Flow (D-035). Solo existe con Firebase: las guarda una Cloud Function solo-admin en
 * Secret Manager. Los campos son de solo escritura: nunca se muestran los valores guardados.
 */
export function FlowCredentialsSettings() {
  const service = useAdminService();
  const id = useId();
  const [status, setStatus] = useState<FlowCredentialsStatus | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [apiKey, setApiKey] = useState("");
  const [secretKey, setSecretKey] = useState("");
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<Notice>(null);

  useEffect(() => {
    if (!service.getFlowCredentialsStatus) return;
    let alive = true;
    service.getFlowCredentialsStatus().then(
      (s) => alive && setStatus(s),
      (e: unknown) => alive && setLoadError(errorMessage(e)),
    );
    return () => {
      alive = false;
    };
  }, [service]);

  if (!service.getFlowCredentialsStatus || !service.setFlowCredentials) return null;
  const save = service.setFlowCredentials;

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    setNotice(null);
    if (apiKey.trim() === "" && secretKey.trim() === "") {
      setNotice({ kind: "error", text: "Escribe al menos una credencial." });
      return;
    }
    setBusy(true);
    try {
      setStatus(await save({ apiKey, secretKey }));
      setLoadError(null);
      setApiKey("");
      setSecretKey("");
      setNotice({ kind: "ok", text: "Credenciales guardadas. Los pagos las usan en un máximo de un minuto." });
    } catch (e) {
      setNotice({ kind: "error", text: errorMessage(e) });
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className={`${ui.card} ${ui.section}`} aria-labelledby={`${id}-title`}>
      <h2 id={`${id}-title`}>Credenciales de Flow</h2>
      <p className={ui.help}>
        Se guardan cifradas en Secret Manager y nunca se vuelven a mostrar. Deja un campo vacío para no cambiar esa credencial. Deben ser las
        del mismo ambiente que el sitio (sandbox mientras el sitio esté en pruebas).
      </p>
      {loadError ? (
        <p className={`${ui.alert} ${ui.alertError}`} role="alert">
          No se pudo leer el estado: {loadError}
        </p>
      ) : null}
      <form className={ui.form} onSubmit={onSubmit} noValidate autoComplete="off">
        <div className={ui.fields}>
          <div className={ui.field}>
            <label className={ui.label} htmlFor={`${id}-api`}>
              API Key
            </label>
            <input
              id={`${id}-api`}
              className={ui.input}
              type="password"
              autoComplete="new-password"
              spellCheck={false}
              maxLength={200}
              value={apiKey}
              onChange={(e) => setApiKey(e.target.value)}
              aria-describedby={`${id}-api-help`}
            />
            <span id={`${id}-api-help`} className={ui.help}>
              {status ? describe(status.apiKey, status.apiKey.hint) : "Cargando estado…"}
            </span>
          </div>
          <div className={ui.field}>
            <label className={ui.label} htmlFor={`${id}-secret`}>
              Secret Key
            </label>
            <input
              id={`${id}-secret`}
              className={ui.input}
              type="password"
              autoComplete="new-password"
              spellCheck={false}
              maxLength={200}
              value={secretKey}
              onChange={(e) => setSecretKey(e.target.value)}
              aria-describedby={`${id}-secret-help`}
            />
            <span id={`${id}-secret-help`} className={ui.help}>
              {status ? describe(status.secretKey) : "Cargando estado…"}
            </span>
          </div>
        </div>
        <div className={ui.actions}>
          <button type="submit" className={ui.btn} disabled={busy}>
            {busy ? "Guardando…" : "Guardar credenciales"}
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
