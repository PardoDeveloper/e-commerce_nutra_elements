import type { SecretManagerServiceClient } from "@google-cloud/secret-manager";
import { SecretStoreError, type FlowSecretName, type SecretStore } from "./credentials.js";

// Implementación real de `SecretStore` sobre Secret Manager (D-035). La cuenta de servicio de
// Functions necesita, sobre FLOW_API_KEY y FLOW_SECRET_KEY: `roles/secretmanager.secretAccessor`
// (leer) y `roles/secretmanager.secretVersionManager` (agregar versiones y ver su fecha).

// Códigos gRPC de google-gax.
const NOT_FOUND = 5;
const PERMISSION_DENIED = 7;
const FAILED_PRECONDITION = 9;

const codeOf = (err: unknown): unknown => (typeof err === "object" && err !== null ? (err as { code?: unknown }).code : undefined);

/** Sin versión habilitada (secreto inexistente, sin versiones o la última deshabilitada). */
const isMissing = (err: unknown): boolean => codeOf(err) === NOT_FOUND || codeOf(err) === FAILED_PRECONDITION;

function translate(err: unknown): unknown {
  if (codeOf(err) === NOT_FOUND) return new SecretStoreError("not_found");
  if (codeOf(err) === PERMISSION_DENIED) return new SecretStoreError("permission_denied");
  return err;
}

export function createSecretManagerStore(projectId: string): SecretStore {
  // Import diferido: la librería (gRPC) es pesada y cargarla al iniciar el módulo alarga el análisis del
  // despliegue, que tiene un límite de 10 s. Solo se carga la primera vez que se usa.
  let client: Promise<SecretManagerServiceClient> | undefined;
  const loadClient = () =>
    (client ??= import("@google-cloud/secret-manager").then((m) => new m.SecretManagerServiceClient()).catch((err: unknown) => {
      client = undefined;
      throw err;
    }));
  const sm = loadClient;
  const secretPath = (name: FlowSecretName) => `projects/${projectId}/secrets/${name}`;

  return {
    async accessLatest(name) {
      try {
        const [version] = await (await sm()).accessSecretVersion({ name: `${secretPath(name)}/versions/latest` });
        const data = version.payload?.data;
        const value = data === null || data === undefined ? "" : Buffer.from(data).toString("utf8");
        return value.length > 0 ? value : undefined;
      } catch (err) {
        if (isMissing(err)) return undefined;
        throw translate(err);
      }
    },

    async latestCreatedAt(name) {
      try {
        const [version] = await (await sm()).getSecretVersion({ name: `${secretPath(name)}/versions/latest` });
        if (version.state !== "ENABLED") return null;
        const seconds = Number(version.createTime?.seconds ?? 0);
        return seconds > 0 ? new Date(seconds * 1000).toISOString() : null;
      } catch (err) {
        if (isMissing(err)) return null;
        throw translate(err);
      }
    },

    async addVersion(name, value) {
      try {
        await (await sm()).addSecretVersion({ parent: secretPath(name), payload: { data: Buffer.from(value, "utf8") } });
      } catch (err) {
        throw translate(err);
      }
    },
  };
}
