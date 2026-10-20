// Datos bancarios de prueba sembrados por «Crear ajustes iniciales». Funciones puras, aptas para servidor y navegador.
import type { DataSource } from "@/lib/data-source";

/** Banco sembrado como dato de prueba (data-model 2.5). Compartido entre el seed, Ajustes y el checkout. */
export const TEST_BANK_NAME = "BANCO DE PRUEBA";

/** RUT evidentemente falso: `holderRut` solo exige texto de 1 a 100 caracteres (validBank), no se valida como RUT. */
export const TEST_BANK_HOLDER_RUT = "PRUEBA-0";

/** ¿Es el banco sembrado de prueba? Ignora mayúsculas y espacios en los bordes. */
export function isTestBank(bank: { bankName?: string | null } | null | undefined): boolean {
  return (bank?.bankName ?? "").trim().toUpperCase() === TEST_BANK_NAME;
}

/**
 * ¿Se ofrece «Transferencia» en el checkout? En modo demo siempre (datos de prueba del mock).
 * Con firebase solo si hay datos bancarios reales: sin datos o con el banco de prueba, no.
 */
export function isTransferOffered(source: DataSource, bank: { bankName?: string | null } | null | undefined): boolean {
  if (source === "demo") return true;
  if (!bank || !(bank.bankName ?? "").trim()) return false;
  return !isTestBank(bank);
}
