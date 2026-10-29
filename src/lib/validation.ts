import { z } from "zod";
import { SHEET_NUMBER_FIELDS, type SheetNumberKey } from "@/lib/sheetFields";

/** Empty form fields arrive as "", store them as NULL. */
const optionalText = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .transform((value) => (value === "" ? null : value));

/** Accepts the Spanish decimal comma typed on phone keyboards ("4,5"). */
const decimal = z
  .string()
  .trim()
  .transform((value) => Number(value.replace(",", ".")))
  .pipe(z.number({ error: "Número no válido" }).finite("Número no válido"));

const optionalDecimal = z
  .string()
  .trim()
  .transform((value, ctx) => {
    if (value === "") return null;
    const number = Number(value.replace(",", "."));
    if (!Number.isFinite(number)) {
      ctx.addIssue({ code: "custom", message: `"${value}" no es un número` });
      return z.NEVER;
    }
    return number;
  });

export const clientSchema = z.object({
  name: z.string().trim().min(1, "El nombre es obligatorio").max(120),
  contact: optionalText(120),
  phone: optionalText(40),
  email: optionalText(160),
  notes: optionalText(4000),
});

const numberFields = Object.fromEntries(SHEET_NUMBER_FIELDS.map((field) => [field.key, optionalDecimal])) as Record<
  SheetNumberKey,
  typeof optionalDecimal
>;

export const sheetSchema = z.object({
  title: z.string().trim().min(1, "El nombre de la pieza es obligatorio").max(160),
  material: optionalText(160),
  notes: optionalText(8000),
  ...numberFields,
  barrelZones: z.array(z.object({ label: z.string().trim().min(1).max(40), temperature: decimal })).max(20),
});

export type SheetInput = z.infer<typeof sheetSchema>;

const text = (form: FormData, name: string) => String(form.get(name) ?? "");

/**
 * Barrel zones come as parallel `zoneLabel`/`zoneTemperature` fields. Zones without a temperature are dropped, so the
 * pre-filled zone names of a new sheet do not have to be deleted by hand when the machine has fewer zones.
 */
export function readSheetForm(form: FormData) {
  const labels = form.getAll("zoneLabel").map(String);
  const temperatures = form.getAll("zoneTemperature").map(String);
  const barrelZones = labels
    .map((label, i) => ({ label: label.trim() || `Zona ${i + 1}`, temperature: temperatures[i] ?? "" }))
    .filter((zone) => zone.temperature.trim() !== "");
  return sheetSchema.safeParse({
    title: text(form, "title"),
    material: text(form, "material"),
    notes: text(form, "notes"),
    ...Object.fromEntries(SHEET_NUMBER_FIELDS.map((field) => [field.key, text(form, field.key)])),
    barrelZones,
  });
}

export function readClientForm(form: FormData) {
  return clientSchema.safeParse({
    name: text(form, "name"),
    contact: text(form, "contact"),
    phone: text(form, "phone"),
    email: text(form, "email"),
    notes: text(form, "notes"),
  });
}

export const userSchema = z.object({
  username: z
    .string()
    .trim()
    .toLowerCase()
    .regex(/^[a-z0-9._-]{3,32}$/, "Usuario: 3-32 letras, números, punto, guion o guion bajo"),
  displayName: z.string().trim().min(1, "El nombre es obligatorio").max(60),
  password: z.string().min(8, "La contraseña necesita al menos 8 caracteres").max(200),
});

export function firstError(error: z.ZodError) {
  return error.issues[0]?.message ?? "Datos no válidos";
}
