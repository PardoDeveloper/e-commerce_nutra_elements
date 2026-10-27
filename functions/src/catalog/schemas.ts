import { z } from "zod";
import { appError, fieldsFromZodError } from "../common/errors.js";
import { MAX_PRICE, MAX_STOCK, SKU_PATTERN, type Cell } from "./cells.js";
import { catalogError } from "./errors.js";

// Validación de entrada de los callables del catálogo (functions.md 1 y 5). Campos desconocidos
// del request se rechazan (`strictObject`); dentro de cada fila de la hoja se ignoran las columnas
// extra (el cliente puede mandar más columnas de las que usamos).

export const MAX_BATCH_ROWS = 1000;
export const MAX_DISCOUNT_SKUS = 150;
export const MAX_DELETE_SKUS = 200;

// eslint-disable-next-line no-control-regex
const CONTROL_CHARS = /[\u0000-\u001F\u007F-\u009F]/;

/** Texto recortado, con largo en caracteres y sin caracteres de control. */
function text(min: number, max: number) {
  return z
    .string()
    .trim()
    .min(min)
    .max(max)
    .refine((v) => !CONTROL_CHARS.test(v), { message: "Contiene caracteres no permitidos" });
}

/** Celda cruda: texto (≤ 500), número finito o vacío. Ausente equivale a vacío. */
const cell = z.union([z.string().max(500), z.number(), z.null()]).optional();

export const catalogRowSchema = z.object({
  ID: cell,
  NOMBRE: cell,
  CODIGO_BARRA: cell,
  STOCK_ACTUAL: cell,
  PRECIO_VENTA_PUBLICO: cell,
  ACTIVO: cell,
  LABORATORIO: cell,
});
export const priceRowSchema = z.object({ SKU: cell, PRECIO: cell });
export const stockRowSchema = z.object({ SKU: cell, STOCK: cell });

const skuString = z.string().max(100);

const optionsShape = {
  dryRun: z.boolean().optional(),
  fileName: text(0, 200).optional(),
};

export const discountSchema = z
  .union([
    z.null(),
    z.strictObject({
      type: z.enum(["percent", "fixed"]),
      value: z.number().int().safe(),
    }),
  ])
  .refine(
    (d) => d === null || (d.type === "percent" ? d.value >= 1 && d.value <= 99 : d.value >= 1 && d.value <= MAX_PRICE),
    { message: "Descuento no válido" },
  );

export interface ListRequest<TItem, TExtra> {
  items: TItem[];
  dryRun: boolean;
  fileName: string | null;
  extra: TExtra;
}

interface ListOptions<TItem, TShape extends z.ZodRawShape> {
  key: "rows" | "skus";
  item: z.ZodType<TItem>;
  max: number;
  extra: TShape;
}

/**
 * Valida un request de lote en tres pasos: (1) forma del objeto (campos desconocidos, `dryRun`,
 * `fileName`, parámetros extra); (2) tamaño de la lista (`EMPTY_BATCH`, `TOO_MANY_ROWS`);
 * (3) cada elemento. Los errores no repiten los valores recibidos.
 */
export function parseListRequest<TItem, TShape extends z.ZodRawShape>(
  data: unknown,
  opts: ListOptions<TItem, TShape>,
): ListRequest<TItem, z.output<z.ZodObject<TShape>>> {
  const shape: z.ZodRawShape = { ...opts.extra, ...optionsShape, [opts.key]: z.array(z.unknown()) };
  const head = z.strictObject(shape).safeParse(data);
  if (!head.success) throw appError("INVALID_INPUT", { fields: fieldsFromZodError(head.error) });
  const body = head.data as Record<string, unknown>;

  const list = body[opts.key] as unknown[];
  if (list.length === 0) throw catalogError("EMPTY_BATCH");
  if (list.length > opts.max) throw catalogError("TOO_MANY_ROWS");

  const parsed = z.array(opts.item).safeParse(list);
  if (!parsed.success) {
    const fields = fieldsFromZodError(parsed.error).map((f) => ({ path: `${opts.key}.${f.path}`, message: f.message }));
    throw appError("INVALID_INPUT", { fields });
  }
  const extra = Object.fromEntries(Object.keys(opts.extra).map((k) => [k, body[k]])) as z.output<z.ZodObject<TShape>>;
  return {
    items: parsed.data,
    dryRun: body["dryRun"] === true,
    fileName: typeof body["fileName"] === "string" && body["fileName"].length > 0 ? body["fileName"] : null,
    extra,
  };
}

export const skuListItem = skuString;

// ---------- Productos individuales ----------

export const createProductSchema = z.strictObject({
  sku: z.string().regex(SKU_PATTERN),
  name: text(1, 120),
  price: z.number().int().safe().min(1).max(MAX_PRICE),
  stock: z.number().int().safe().min(0).max(MAX_STOCK),
  barcode: text(0, 32).optional(),
});
export type CreateProductRequest = z.output<typeof createProductSchema>;

export const updateCommerceSchema = z.strictObject({
  sku: z.string().regex(SKU_PATTERN),
  // Se aceptan como celda para reutilizar las reglas de las importaciones ("12.990", vacío, etc.).
  price: cell,
  stock: cell,
  // Comisión en CLP por unidad vendida; null la borra.
  commissionPerUnit: z.number().int().min(0).max(MAX_PRICE).nullable().optional(),
});
export type UpdateCommerceRequest = { sku: string; price?: Cell | undefined; stock?: Cell | undefined; commissionPerUnit?: number | null | undefined };

export function parseSingle<T>(schema: z.ZodType<T>, data: unknown): T {
  const result = schema.safeParse(data);
  if (!result.success) throw appError("INVALID_INPUT", { fields: fieldsFromZodError(result.error) });
  return result.data;
}
