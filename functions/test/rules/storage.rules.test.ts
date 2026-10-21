// Tests de las reglas de Storage (storage.rules) contra el emulador.
// SIN EJECUTAR por D-026 (no hay emuladores todavía). Requieren: npm run test:rules con emuladores activos.
import { afterAll, beforeAll, beforeEach, describe, it } from "vitest";
import { assertFails, assertSucceeds, type RulesTestEnvironment } from "@firebase/rules-unit-testing";
import { NON_ADMIN_PROFILES, contextFor, createEnv, type Profile } from "./helpers.js";

let env: RulesTestEnvironment;

const MIB = 1024 * 1024;
const storage = (profile: Profile) => contextFor(env, profile).storage();
// UploadTask es "thenable" pero no una Promise: se envuelve para assertSucceeds/assertFails.
const putFile = async (ref: ReturnType<ReturnType<typeof storage>["ref"]>, size: number, contentType: string): Promise<void> => {
  await ref.put(new Uint8Array(size), { contentType });
};

const OK_PATH = "products/2427831/k3f9a1b2c3.webp";

beforeAll(async () => {
  env = await createEnv("storage");
});

afterAll(async () => {
  await env.cleanup();
});

beforeEach(async () => {
  await env.clearStorage();
  await env.withSecurityRulesDisabled(async (ctx) => {
    await putFile(ctx.storage().ref(OK_PATH), 100, "image/webp");
    await putFile(ctx.storage().ref("categories/magnesio/k3f9a1b2c3.webp"), 100, "image/webp");
    await putFile(ctx.storage().ref("private/secreto.txt"), 10, "text/plain");
  });
});

describe("lectura", () => {
  it.each(["anonymous", "user", "admin"] as Profile[])("%s lee imágenes de productos y categorías", async (profile) => {
    await assertSucceeds(storage(profile).ref(OK_PATH).getMetadata());
    await assertSucceeds(storage(profile).ref("categories/magnesio/k3f9a1b2c3.webp").getMetadata());
  });

  // Las reglas del admin solo permiten `get` en estas rutas (no hay `list` para nadie), así que el admin tampoco lista.
  it.each(["anonymous", "user", "admin"] as Profile[])("%s no puede listar archivos de products/{sku}/ ni categories/{slug}/", async (profile) => {
    await assertFails(storage(profile).ref("products/2427831").list());
    await assertFails(storage(profile).ref("categories/magnesio").list());
  });

  it.each(["anonymous", "user", "admin"] as Profile[])("%s no lee rutas no declaradas", async (profile) => {
    await assertFails(storage(profile).ref("private/secreto.txt").getMetadata());
    await assertFails(storage(profile).ref("orders/NE-000001/comprobante.webp").getMetadata());
    await assertFails(storage(profile).ref("imports/planilla.xls").getMetadata());
  });
});

describe.each(NON_ADMIN_PROFILES)("escritura como %s (sin claim admin)", (profile) => {
  it("no sube imágenes de productos ni de categorías", async () => {
    await assertFails(putFile(storage(profile).ref("products/2427831/nueva12345.webp"), 100, "image/webp"));
    await assertFails(putFile(storage(profile).ref("categories/magnesio/nueva12345.webp"), 100, "image/webp"));
  });

  it("no sobrescribe ni borra una imagen existente", async () => {
    await assertFails(putFile(storage(profile).ref(OK_PATH), 100, "image/webp"));
    await assertFails(storage(profile).ref(OK_PATH).delete());
  });
});

describe("escritura como admin", () => {
  const upload = (path: string, size: number, contentType: string) =>
    putFile(storage("admin").ref(path), size, contentType);

  it("sube una imagen WebP válida a products/{sku}/{file}", async () => {
    await assertSucceeds(upload("products/2427831/nueva12345.webp", 500 * 1024, "image/webp"));
  });

  it("acepta también JPEG y PNG", async () => {
    await assertSucceeds(upload("products/2427831/foto12345.jpg", 1000, "image/jpeg"));
    await assertSucceeds(upload("products/2427831/foto12346.png", 1000, "image/png"));
  });

  it("acepta exactamente 2 MiB y rechaza 2 MiB + 1 byte", async () => {
    await assertSucceeds(upload("products/2427831/exacto1234.webp", 2 * MIB, "image/webp"));
    await assertFails(upload("products/2427831/grande1234.webp", 2 * MIB + 1, "image/webp"));
  });

  it("rechaza tipos que no son imagen permitida", async () => {
    await assertFails(upload("products/2427831/svg123456.webp", 100, "image/svg+xml"));
    await assertFails(upload("products/2427831/gif123456.webp", 100, "image/gif"));
    await assertFails(upload("products/2427831/pdf123456.webp", 100, "application/pdf"));
    await assertFails(upload("products/2427831/text12345.webp", 100, "text/html"));
    await assertFails(upload("products/2427831/octet1234.webp", 100, "application/octet-stream"));
  });

  it("rechaza nombres de archivo fuera del patrón", async () => {
    await assertFails(upload("products/2427831/corto.webp", 100, "image/webp")); // < 8 caracteres
    await assertFails(upload("products/2427831/imagen12345.svg", 100, "image/webp"));
    await assertFails(upload("products/2427831/imagen12345.exe", 100, "image/webp"));
    await assertFails(upload("products/2427831/sin-extension12345", 100, "image/webp"));
    await assertFails(upload("products/2427831/con espacio1.webp", 100, "image/webp"));
    await assertFails(upload(`products/2427831/${"a".repeat(41)}.webp`, 100, "image/webp"));
  });

  it("rechaza SKU fuera del patrón y rutas anidadas", async () => {
    await assertFails(upload(`products/${"9".repeat(33)}/nueva12345.webp`, 100, "image/webp"));
    await assertFails(upload("products/2427831/sub/nueva12345.webp", 100, "image/webp"));
    await assertFails(upload("products/nueva12345.webp", 100, "image/webp"));
  });

  it("sube a categories/{slug}/{file} con slug válido y rechaza uno inválido", async () => {
    await assertSucceeds(upload("categories/omega-3/nueva12345.webp", 100, "image/webp"));
    await assertFails(upload("categories/Omega 3/nueva12345.webp", 100, "image/webp"));
  });

  it("rechaza rutas no declaradas", async () => {
    await assertFails(upload("private/otro.webp", 100, "image/webp"));
    await assertFails(upload("orders/NE-000001/foto12345.webp", 100, "image/webp"));
    await assertFails(upload("imports/planilla.xls", 100, "application/vnd.ms-excel"));
    await assertFails(upload("nueva12345.webp", 100, "image/webp"));
  });

  it("borra imágenes de productos y categorías, pero no rutas no declaradas", async () => {
    await assertSucceeds(storage("admin").ref(OK_PATH).delete());
    await assertSucceeds(storage("admin").ref("categories/magnesio/k3f9a1b2c3.webp").delete());
    await assertFails(storage("admin").ref("private/secreto.txt").delete());
  });

  it("no sobrescribe (update) una imagen existente: los archivos son inmutables", async () => {
    await assertFails(upload(OK_PATH, 100, "image/webp"));
    await assertFails(upload("categories/magnesio/k3f9a1b2c3.webp", 100, "image/webp"));
  });

  it("un token con admin como cadena no es admin", async () => {
    const ctx = env.authenticatedContext("user-3", { admin: "true" });
    await assertFails(putFile(ctx.storage().ref("products/2427831/nueva12345.webp"), 100, "image/webp"));
  });
});
