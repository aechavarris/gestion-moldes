/**
 * The injection-moulding parameters of a technical sheet. Forms, the detail page and validation are all built from this
 * list, so renaming a label or changing a unit is a one-line edit here (the `key` is the database column and must stay).
 */
export const SHEET_GROUPS = [
  { key: "temperatures", label: "Temperaturas" },
  { key: "injection", label: "Inyección" },
  { key: "charge", label: "Carga" },
  { key: "times", label: "Tiempos" },
  { key: "clamp", label: "Cierre" },
] as const;

export type SheetGroup = (typeof SHEET_GROUPS)[number]["key"];

export const SHEET_NUMBER_FIELDS = [
  { key: "moldTemperature", label: "Temperatura del molde", unit: "°C", group: "temperatures" },
  { key: "firstPressure", label: "Primera presión", unit: "bar", group: "injection" },
  { key: "secondPressure", label: "Segunda presión", unit: "bar", group: "injection" },
  { key: "switchoverPosition", label: "Cambio de cota", unit: "mm", group: "injection" },
  { key: "chargePosition", label: "Carga de material", unit: "mm", group: "charge" },
  { key: "chargePressure", label: "Presión de carga", unit: "bar", group: "charge" },
  { key: "chargeSpeed", label: "Velocidad de carga", unit: "%", group: "charge" },
  { key: "decompression", label: "Descompresión", unit: "mm", group: "charge" },
  { key: "coolingTime", label: "Tiempo de enfriamiento", unit: "s", group: "times" },
  { key: "nozzleHoldTime", label: "Tiempo de retención de la punta", unit: "s", group: "times" },
  { key: "clampForce", label: "Fuerza de cierre", unit: "kN", group: "clamp" },
] as const satisfies readonly { key: string; label: string; unit: string; group: SheetGroup }[];

export type SheetNumberKey = (typeof SHEET_NUMBER_FIELDS)[number]["key"];

/** Barrel (usillo) heating zones: a variable list, since every machine has a different number of zones. */
export const BARREL_ZONE_UNIT = "°C";
export const DEFAULT_BARREL_ZONES = ["Boquilla", "Zona 1", "Zona 2", "Zona 3", "Zona 4"];

export const MAX_PHOTOS_PER_SHEET = 20;
