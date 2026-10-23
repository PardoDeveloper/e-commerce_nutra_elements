// Garantiza que, con DATA_SOURCE=firebase, el login simulado no es accesible (D-031) y que con demo todo sigue igual.
import { readFileSync } from "node:fs";
import path from "node:path";
import { createElement, type ComponentType, type ReactElement, type ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, describe, expect, it, vi } from "vitest";
import { setActiveDataSource, type DataSource } from "@/lib/admin/mode";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace: () => undefined, push: () => undefined }),
  usePathname: () => "/admin/login",
}));

import { AdminProvider } from "./AdminProvider";
import { AdminShell, PRODUCTION_BANNER_TEXT, STAGING_BANNER_TEXT } from "./AdminShell";
import { LoginForm } from "./LoginForm";

afterEach(() => {
  setActiveDataSource("demo");
  vi.unstubAllEnvs();
});

// Mismo componente, con `children` opcional para poder pasarlo como argumento de createElement.
const Provider = AdminProvider as ComponentType<{ dataSource: DataSource; seed: null; children?: ReactNode }>;

function render(source: DataSource, child: ReactElement): string {
  return renderToStaticMarkup(createElement(Provider, { dataSource: source, seed: null }, child));
}

const login = () => createElement(LoginForm);
const shell = () => createElement(AdminShell, null, createElement("p", null, "contenido"));

describe("login con Firebase", () => {
  const html = render("firebase", login());

  it("muestra correo, contraseña y «Entrar con Google»", () => {
    expect(html).toContain("Correo electrónico");
    expect(html).toContain("Contraseña");
    expect(html).toContain("Entrar con Google");
    expect(html).toContain("Olvidé mi contraseña");
  });

  it("no hay login simulado ni registro público", () => {
    expect(html).not.toMatch(/Modo demostración/i);
    expect(html).not.toMatch(/Cualquier correo y contraseña/i);
    expect(html).not.toMatch(/crear cuenta|registr/i);
  });

  it("los componentes de Firebase no importan la sesión simulada", () => {
    const root = path.resolve(import.meta.dirname, "../..");
    for (const file of ["components/admin/FirebaseLoginForm.tsx", "lib/auth/admin-auth.ts", "lib/auth/admin-claim.ts", "lib/admin/firebase-service.ts"]) {
      const source = readFileSync(path.join(root, file), "utf8");
      expect(source, file).not.toMatch(/demoLogin|admin\/session|DemoLoginForm/);
    }
  });
});

describe("login con demo", () => {
  it("sigue siendo el simulado", () => {
    const html = render("demo", login());
    expect(html).toContain("Cualquier correo y contraseña ingresan");
    expect(html).not.toContain("Entrar con Google");
  });
});

describe("banner del admin", () => {
  it("con Firebase y NEXT_PUBLIC_FLOW_ENV=sandbox dice «Staging: Flow en sandbox» y no «Modo demostración»", () => {
    vi.stubEnv("NEXT_PUBLIC_FLOW_ENV", "sandbox");
    const html = render("firebase", shell());
    expect(STAGING_BANNER_TEXT).toBe("Staging: Flow en sandbox");
    expect(html).toContain("Staging: Flow en sandbox");
    expect(html).not.toMatch(/Modo demostración/);
  });

  it("con Firebase en producción avisa que los pagos son reales", () => {
    vi.stubEnv("NEXT_PUBLIC_FLOW_ENV", "production");
    const html = render("firebase", shell());
    expect(html).toContain(PRODUCTION_BANNER_TEXT);
    expect(html).not.toContain(STAGING_BANNER_TEXT);
  });

  it("con demo conserva el aviso de demostración", () => {
    expect(render("demo", shell())).toContain("Modo demostración");
  });
});
