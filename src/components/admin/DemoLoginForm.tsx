"use client";

// Login SIMULADO (D-028): cualquier entrada ingresa. No hay autenticación real.
import { useRouter } from "next/navigation";
import { useId, useState, type FormEvent } from "react";
import { demoLogin } from "@/lib/admin/session";
import shell from "./AdminShell.module.css";
import ui from "./admin.module.css";

export function DemoLoginForm() {
  const router = useRouter();
  const id = useId();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");

  function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    demoLogin(email || "admin@demo");
    router.replace("/admin");
  }

  return (
    <div className={shell.loginCard}>
      <h1>Panel de administración</h1>
      <p className={`${ui.alert} ${ui.alertWarn}`}>
        <strong>Modo demostración: sin autenticación real.</strong> Cualquier correo y contraseña ingresan.
      </p>
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
            placeholder="admin@ejemplo.cl"
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
          />
        </div>
        <button type="submit" className={ui.btn}>
          Ingresar
        </button>
      </form>
    </div>
  );
}
