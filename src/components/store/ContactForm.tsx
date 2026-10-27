"use client";

// Formulario de /contacto. Con "firebase" llama a submitContactMessage (functions.md 3.5), cargando el SDK solo al
// enviar; con "demo" guarda el mensaje en localStorage para verlo en /admin/mensajes del mismo navegador (D-028).
import Link from "next/link";
import { useId, useRef, useState, type FormEvent } from "react";
import { Button } from "@/components/Button";
import type { DataSource } from "@/lib/data-source";
import { addDemoMessage } from "@/lib/contact/demo-store";
import { CONTACT_ERROR_MESSAGES, ContactSendError } from "@/lib/contact/types";
import { MESSAGE_MAX, validateContact, type ContactErrors, type ContactField, type ContactFormValues } from "@/lib/contact/validation";
import styles from "./contact.module.css";

const EMPTY: ContactFormValues = { name: "", email: "", phone: "", message: "" };
const ORDER: ContactField[] = ["name", "email", "phone", "message"];

type Status = { kind: "idle" } | { kind: "sending" } | { kind: "sent" } | { kind: "error"; message: string };

export function ContactForm({ dataSource }: { dataSource: DataSource }) {
  const id = useId();
  const [values, setValues] = useState<ContactFormValues>(EMPTY);
  const [errors, setErrors] = useState<ContactErrors>({});
  const [status, setStatus] = useState<Status>({ kind: "idle" });
  const formRef = useRef<HTMLFormElement>(null);
  const successRef = useRef<HTMLHeadingElement>(null);
  const honeypotRef = useRef<HTMLInputElement>(null);
  const sending = status.kind === "sending";

  const set = (field: ContactField) => (value: string) => {
    setValues((v) => ({ ...v, [field]: value }));
    // El error de un campo se borra al corregirlo.
    if (errors[field]) setErrors((e) => ({ ...e, [field]: undefined }));
  };

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (sending) return;
    const result = validateContact(values);
    if (!result.ok) {
      setErrors(result.errors);
      const first = ORDER.find((f) => result.errors[f]);
      if (first) formRef.current?.querySelector<HTMLElement>(`[name="${first}"]`)?.focus();
      return;
    }
    setErrors({});
    setStatus({ kind: "sending" });
    try {
      if (dataSource === "firebase") {
        const { submitContactFirebase } = await import("@/lib/contact/firebase-submit");
        await submitContactFirebase({ ...result.request, website: honeypotRef.current?.value ?? "" });
      } else if (!honeypotRef.current?.value) {
        addDemoMessage(window.localStorage, result.request);
      }
      setValues(EMPTY);
      setStatus({ kind: "sent" });
      requestAnimationFrame(() => successRef.current?.focus());
    } catch (error) {
      setStatus({ kind: "error", message: error instanceof ContactSendError ? error.message : CONTACT_ERROR_MESSAGES.INTERNAL });
    }
  }

  if (status.kind === "sent") {
    return (
      <div className={styles.success} role="status">
        <span className={styles.successIcon} aria-hidden="true">
          <svg viewBox="0 0 24 24" width="28" height="28" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M5 12.5 10 17l9-10" />
          </svg>
        </span>
        <h3 ref={successRef} tabIndex={-1}>
          ¡Gracias por escribirnos!
        </h3>
        <p>Recibimos tu mensaje y te responderemos al correo que indicaste lo antes posible.</p>
        <Button variant="outline" onClick={() => setStatus({ kind: "idle" })}>
          Enviar otro mensaje
        </Button>
      </div>
    );
  }

  const field = (name: ContactField) => ({
    id: `${id}-${name}`,
    name,
    value: values[name],
    disabled: sending,
    "aria-invalid": errors[name] ? true : undefined,
    "aria-describedby": [errors[name] ? `${id}-${name}-error` : "", name === "phone" ? `${id}-phone-hint` : "", name === "message" ? `${id}-message-count` : ""]
      .filter(Boolean)
      .join(" ") || undefined,
  });

  const errorText = (name: ContactField) =>
    errors[name] ? (
      <p id={`${id}-${name}-error`} className={styles.error}>
        {errors[name]}
      </p>
    ) : null;

  return (
    <form ref={formRef} className={styles.form} noValidate onSubmit={onSubmit} aria-busy={sending}>
      <div className={styles.row}>
        <div className={styles.field}>
          <label htmlFor={`${id}-name`}>
            Nombre completo <span className={styles.req} aria-hidden="true">*</span>
          </label>
          <input {...field("name")} type="text" autoComplete="name" maxLength={100} required onChange={(e) => set("name")(e.target.value)} />
          {errorText("name")}
        </div>
        <div className={styles.field}>
          <label htmlFor={`${id}-email`}>
            Correo electrónico <span className={styles.req} aria-hidden="true">*</span>
          </label>
          <input {...field("email")} type="email" autoComplete="email" inputMode="email" maxLength={254} required onChange={(e) => set("email")(e.target.value)} />
          {errorText("email")}
        </div>
      </div>

      <div className={styles.field}>
        <label htmlFor={`${id}-phone`}>
          Teléfono <span className={styles.optional}>(opcional)</span>
        </label>
        <input {...field("phone")} type="tel" autoComplete="tel" inputMode="tel" maxLength={30} placeholder="+56 9 1234 5678" onChange={(e) => set("phone")(e.target.value)} />
        <p id={`${id}-phone-hint`} className={styles.hint}>
          Solo si prefieres que te contactemos por teléfono o WhatsApp.
        </p>
        {errorText("phone")}
      </div>

      <div className={styles.field}>
        <label htmlFor={`${id}-message`}>
          Mensaje <span className={styles.req} aria-hidden="true">*</span>
        </label>
        <textarea {...field("message")} rows={6} maxLength={MESSAGE_MAX} required onChange={(e) => set("message")(e.target.value)} />
        <p id={`${id}-message-count`} className={styles.counter}>
          {values.message.length} / {MESSAGE_MAX}
        </p>
        {errorText("message")}
      </div>

      {/* Trampa para bots: invisible y fuera del orden de tabulación. */}
      <div className={styles.honeypot} aria-hidden="true">
        <label htmlFor={`${id}-website`}>No completar</label>
        <input ref={honeypotRef} id={`${id}-website`} name="website" type="text" tabIndex={-1} autoComplete="off" />
      </div>

      {status.kind === "error" ? (
        <p className={styles.alert} role="alert">
          {status.message}
        </p>
      ) : null}

      <div className={styles.submitRow}>
        <p className={styles.legal}>
          <span aria-hidden="true">* </span>Campos obligatorios. Usamos tus datos solo para responder tu mensaje (
          <Link href="/privacidad">política de privacidad</Link>).
        </p>
        <Button type="submit" size="lg" disabled={sending} className={styles.submit}>
          {sending ? "Enviando…" : "Enviar mensaje"}
        </Button>
      </div>
    </form>
  );
}
