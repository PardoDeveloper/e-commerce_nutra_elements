"use client";

import { useId, useState, type FormEvent } from "react";
import { isTestBank } from "@/lib/bank";
import { buildInitialCategories } from "@/lib/admin/firebase-seed";
import { errorMessage } from "@/lib/admin/errors";
import type { AdminSettings } from "@/lib/admin/types";
import { useAdminService, useAdminState } from "./AdminProvider";
import { FlowCredentialsSettings } from "./FlowCredentialsSettings";
import { ResetDemoCatalog } from "./ResetDemoCatalog";
import ui from "./admin.module.css";
import { sim } from "@/lib/admin/mode";

type Notice = { kind: "ok" | "error"; text: string } | null;

export function SettingsView() {
  const { settings, settingsMissing, settingsPrivateMissing, initialCategoriesExisting } = useAdminState();
  const needsSettings = settingsMissing === true || settingsPrivateMissing === true;
  const needsCategories = initialCategoriesExisting !== undefined && initialCategoriesExisting < INITIAL_CATEGORIES_TOTAL;
  return (
    <>
      {needsSettings ? (
        <p className={`${ui.alert} ${ui.alertWarn}`} role="status">
          Los ajustes aún no existen en Firestore: se muestran los valores iniciales del contrato. Usa «Crear ajustes iniciales» para guardarlos.
        </p>
      ) : null}
      {needsSettings || needsCategories ? <SeedInitialData needsSettings={needsSettings} needsCategories={needsCategories} /> : null}
      {/* La clave remonta el formulario al crear los ajustes iniciales, para mostrar los valores guardados. */}
      <SettingsForm key={needsSettings ? "missing" : "ready"} initial={settings} />
    </>
  );
}

const INITIAL_CATEGORIES_TOTAL = buildInitialCategories().length;

/** Botones de sembrado (solo Firebase): crean únicamente lo que falta, sin pisar nada. */
function SeedInitialData({ needsSettings, needsCategories }: { needsSettings: boolean; needsCategories: boolean }) {
  const service = useAdminService();
  const [busy, setBusy] = useState<"settings" | "categories" | null>(null);
  const [notice, setNotice] = useState<Notice>(null);

  async function run(kind: "settings" | "categories") {
    setBusy(kind);
    setNotice(null);
    try {
      if (kind === "settings") {
        const result = await service.seedInitialSettings?.();
        setNotice({ kind: "ok", text: result && result.created.length > 0 ? "Ajustes iniciales creados." : "Los ajustes ya existían: no se cambió nada." });
      } else {
        const result = await service.seedInitialCategories?.();
        setNotice({ kind: "ok", text: result && result.created.length > 0 ? `Categorías creadas: ${result.created.length}.` : "Las categorías ya existían: no se cambió nada." });
      }
    } catch (e) {
      setNotice({ kind: "error", text: errorMessage(e) });
    } finally {
      setBusy(null);
    }
  }

  if (!service.seedInitialSettings || !service.seedInitialCategories) return null;
  return (
    <section className={`${ui.card} ${ui.section}`} aria-label="Datos iniciales">
      <h2>Datos iniciales</h2>
      <p className={ui.help}>
        Crean solo lo que falta (comunas de la Región Metropolitana, despacho de $3.990, retiro en tienda, reservas y las 6 categorías). Nunca reemplazan datos existentes. Los datos bancarios iniciales son de prueba: edítalos abajo.
      </p>
      <div className={ui.actions}>
        {needsSettings ? (
          <button type="button" className={ui.btn} disabled={busy !== null} onClick={() => void run("settings")}>
            {busy === "settings" ? "Creando…" : "Crear ajustes iniciales"}
          </button>
        ) : null}
        {needsCategories ? (
          <button type="button" className={ui.btn} disabled={busy !== null} onClick={() => void run("categories")}>
            {busy === "categories" ? "Creando…" : "Crear categorías iniciales"}
          </button>
        ) : null}
      </div>
      <div aria-live="polite">
        {notice ? (
          <p className={`${ui.alert} ${notice.kind === "ok" ? ui.alertOk : ui.alertError}`} role={notice.kind === "error" ? "alert" : "status"}>
            {notice.text}
          </p>
        ) : null}
      </div>
    </section>
  );
}

const toInt = (text: string): number => (text.trim() === "" ? Number.NaN : Number(text.replace(/[$.\s]/g, "")));

function SettingsForm({ initial }: { initial: AdminSettings }) {
  const service = useAdminService();
  const id = useId();
  const [shippingFee, setShippingFee] = useState(String(initial.shippingFee));
  const [threshold, setThreshold] = useState(initial.freeShippingThreshold === null ? "" : String(initial.freeShippingThreshold));
  const [pickupEnabled, setPickupEnabled] = useState(initial.pickup.enabled);
  const [pickupAddress, setPickupAddress] = useState(initial.pickup.address);
  const [pickupHours, setPickupHours] = useState(initial.pickup.hours);
  const [maxQty, setMaxQty] = useState(String(initial.maxQtyPerItem));
  const [bank, setBank] = useState(initial.bank);
  const [flowMinutes, setFlowMinutes] = useState(String(initial.reservationMinutes.flow));
  const [transferHours, setTransferHours] = useState(String(initial.reservationMinutes.transfer / 60));
  const [notice, setNotice] = useState<Notice>(null);

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    setNotice(null);
    const next: AdminSettings = {
      shippingFee: toInt(shippingFee),
      // Vacío = envío gratis desactivado.
      freeShippingThreshold: threshold.trim() === "" ? null : toInt(threshold),
      pickup: { enabled: pickupEnabled, address: pickupAddress.trim(), hours: pickupHours.trim() },
      maxQtyPerItem: toInt(maxQty),
      reservationMinutes: { flow: toInt(flowMinutes), transfer: Math.round(Number(transferHours) * 60) },
      bank: { ...bank, contactEmail: bank.contactEmail?.trim() || undefined },
    };
    try {
      await service.saveSettings(next);
      setNotice({ kind: "ok", text: sim("Ajustes guardados (simulado). Se pierden al recargar la página.") });
    } catch (e) {
      setNotice({ kind: "error", text: errorMessage(e) });
    }
  }

  const setBankField = (key: keyof AdminSettings["bank"]) => (value: string) => setBank((b) => ({ ...b, [key]: value }));

  return (
    <div className={ui.page}>
      <div>
        <h1>Ajustes</h1>
        <p className={ui.lead}>Despacho, retiro en tienda, datos bancarios y tiempos de reserva.</p>
      </div>
      <form className={ui.form} onSubmit={onSubmit} noValidate>
        <fieldset className={ui.group}>
          <legend>Despacho</legend>
          <div className={ui.fields}>
            <div className={ui.field}>
              <label className={ui.label} htmlFor={`${id}-fee`}>
                Costo de despacho en la Región Metropolitana (CLP)
              </label>
              <input id={`${id}-fee`} className={ui.input} inputMode="numeric" value={shippingFee} onChange={(e) => setShippingFee(e.target.value)} />
              <span className={ui.help}>Entre 0 y 100.000. Es el mismo para todas las comunas.</span>
            </div>
            <div className={ui.field}>
              <label className={ui.label} htmlFor={`${id}-free`}>
                Envío gratis desde (CLP)
              </label>
              <input
                id={`${id}-free`}
                className={ui.input}
                inputMode="numeric"
                value={threshold}
                onChange={(e) => setThreshold(e.target.value)}
                aria-describedby={`${id}-free-help`}
              />
              <span id={`${id}-free-help`} className={ui.help}>
                Déjalo vacío para desactivar el envío gratis. Se compara con el subtotal ya con descuentos (igual o mayor).
              </span>
            </div>
            <div className={ui.field}>
              <label className={ui.label} htmlFor={`${id}-max`}>
                Máximo de unidades por producto
              </label>
              <input id={`${id}-max`} className={ui.input} inputMode="numeric" value={maxQty} onChange={(e) => setMaxQty(e.target.value)} />
            </div>
          </div>
        </fieldset>

        <fieldset className={ui.group}>
          <legend>Retiro en tienda</legend>
          <div className={ui.checkRow}>
            <input id={`${id}-pickup`} type="checkbox" checked={pickupEnabled} onChange={(e) => setPickupEnabled(e.target.checked)} />
            <label htmlFor={`${id}-pickup`}>Ofrecer retiro en tienda</label>
          </div>
          <div className={ui.fields}>
            <div className={ui.field}>
              <label className={ui.label} htmlFor={`${id}-addr`}>
                Dirección
              </label>
              <input id={`${id}-addr`} className={ui.input} maxLength={200} value={pickupAddress} onChange={(e) => setPickupAddress(e.target.value)} />
            </div>
            <div className={ui.field}>
              <label className={ui.label} htmlFor={`${id}-hours`}>
                Horario
              </label>
              <input id={`${id}-hours`} className={ui.input} maxLength={200} value={pickupHours} onChange={(e) => setPickupHours(e.target.value)} />
            </div>
          </div>
        </fieldset>

        <fieldset className={ui.group}>
          <legend>Datos bancarios para transferencias</legend>
          {isTestBank(bank) ? (
            <p className={ui.alert}>Son datos de prueba hasta que se entreguen los reales. Se muestran solo a quien paga por transferencia.</p>
          ) : (
            <p className={ui.help}>Se muestran solo a quien paga por transferencia.</p>
          )}
          <div className={ui.fields}>
            {(
              [
                ["bankName", "Banco"],
                ["accountType", "Tipo de cuenta"],
                ["accountNumber", "Número de cuenta"],
                ["holderName", "Titular"],
                ["holderRut", "RUT del titular"],
                ["contactEmail", "Correo de contacto (opcional)"],
              ] as const
            ).map(([key, label]) => (
              <div className={ui.field} key={key}>
                <label className={ui.label} htmlFor={`${id}-bank-${key}`}>
                  {label}
                </label>
                <input
                  id={`${id}-bank-${key}`}
                  className={ui.input}
                  maxLength={100}
                  value={bank[key] ?? ""}
                  onChange={(e) => setBankField(key)(e.target.value)}
                />
              </div>
            ))}
          </div>
        </fieldset>

        <fieldset className={ui.group}>
          <legend>Reserva de stock</legend>
          <p className={ui.help}>Tiempo que se reserva el stock mientras el pedido espera el pago.</p>
          <div className={ui.fields}>
            <div className={ui.field}>
              <label className={ui.label} htmlFor={`${id}-flow`}>
                Pago con Flow (minutos)
              </label>
              <input id={`${id}-flow`} className={ui.input} inputMode="numeric" value={flowMinutes} onChange={(e) => setFlowMinutes(e.target.value)} />
              <span className={ui.help}>Entre 5 y 240 minutos.</span>
            </div>
            <div className={ui.field}>
              <label className={ui.label} htmlFor={`${id}-transfer`}>
                Transferencia (horas)
              </label>
              <input id={`${id}-transfer`} className={ui.input} inputMode="decimal" value={transferHours} onChange={(e) => setTransferHours(e.target.value)} />
              <span className={ui.help}>Entre 1 y 168 horas (7 días).</span>
            </div>
          </div>
        </fieldset>

        <div className={ui.actions}>
          <button type="submit" className={ui.btn}>
            Guardar ajustes
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
      <FlowCredentialsSettings />
      <ResetDemoCatalog />
    </div>
  );
}
