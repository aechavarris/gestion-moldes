"use client";

import { useActionState, useState } from "react";
import { saveSheet, type FormState } from "@/lib/actions";
import { Field } from "@/components/ClientForm";
import { BARREL_ZONE_UNIT, DEFAULT_BARREL_ZONES, SHEET_GROUPS, SHEET_NUMBER_FIELDS, type SheetNumberKey } from "@/lib/sheetFields";

type ZoneRow = { key: number; label: string; temperature: string };
export type SheetValues = {
  title: string;
  material: string | null;
  notes: string | null;
  barrelZones: { label: string; temperature: number }[];
} & Record<SheetNumberKey, number | null>;

let nextKey = 0;
const zone = (label = "", temperature = ""): ZoneRow => ({ key: nextKey++, label, temperature });
/** Shows stored numbers with the decimal comma people type. */
const toInput = (value: number | null | undefined) => (value == null ? "" : String(value).replace(".", ","));

function NumberInput({ name, unit, defaultValue }: { name: string; unit: string; defaultValue: string }) {
  return (
    <div className="flex items-center gap-2">
      <input name={name} className="input" inputMode="decimal" defaultValue={defaultValue} />
      <span className="w-10 shrink-0 text-sm text-muted">{unit}</span>
    </div>
  );
}

export function SheetForm({ clientId, sheetId, initial }: { clientId: string; sheetId: string | null; initial?: SheetValues }) {
  const [state, action, pending] = useActionState<FormState, FormData>(saveSheet.bind(null, clientId, sheetId), {});
  const [zones, setZones] = useState<ZoneRow[]>(() =>
    initial?.barrelZones.length
      ? initial.barrelZones.map((z) => zone(z.label, toInput(z.temperature)))
      : DEFAULT_BARREL_ZONES.map((label) => zone(label)),
  );

  return (
    <form action={action} className="flex flex-col gap-4">
      <div className="card flex flex-col gap-3 p-4">
        <Field label="Nombre de la pieza *">
          <input name="title" className="input" required defaultValue={initial?.title} autoFocus={!sheetId} />
        </Field>
        <Field label="Material">
          <input name="material" className="input" defaultValue={initial?.material ?? ""} />
        </Field>
      </div>

      {SHEET_GROUPS.map((group) => (
        <fieldset key={group.key} className="card flex flex-col gap-3 p-4">
          <legend className="sr-only">{group.label}</legend>
          <h2 className="font-semibold">{group.label}</h2>
          {group.key === "temperatures" ? (
            <div className="flex flex-col gap-2">
              <span className="text-sm text-muted">Temperaturas del usillo</span>
              {zones.map((z, i) => (
                <div key={z.key} className="flex items-center gap-2">
                  <input name="zoneLabel" className="input" defaultValue={z.label} placeholder={`Zona ${i + 1}`} aria-label="Zona" />
                  <input
                    name="zoneTemperature"
                    className="input w-24 shrink-0"
                    inputMode="decimal"
                    defaultValue={z.temperature}
                    aria-label={`Temperatura ${z.label || `zona ${i + 1}`}`}
                  />
                  <span className="text-sm text-muted">{BARREL_ZONE_UNIT}</span>
                  <button
                    type="button"
                    className="btn-ghost px-3"
                    aria-label={`Quitar ${z.label || `zona ${i + 1}`}`}
                    onClick={() => setZones((current) => current.filter((x) => x.key !== z.key))}
                  >
                    ✕
                  </button>
                </div>
              ))}
              <button
                type="button"
                className="btn-ghost"
                onClick={() => setZones((current) => [...current, zone(`Zona ${current.length}`)])}
              >
                + Añadir zona
              </button>
            </div>
          ) : null}
          {SHEET_NUMBER_FIELDS.filter((field) => field.group === group.key).map((field) => (
            <Field key={field.key} label={field.label}>
              <NumberInput name={field.key} unit={field.unit} defaultValue={toInput(initial?.[field.key])} />
            </Field>
          ))}
        </fieldset>
      ))}

      <div className="card p-4">
        <Field label="Notas">
          <textarea name="notes" className="input min-h-32" defaultValue={initial?.notes ?? ""} />
        </Field>
      </div>

      {state.error ? <p className="text-danger">{state.error}</p> : null}
      <button className="btn-primary sticky bottom-4" disabled={pending}>
        {pending ? "Guardando…" : "Guardar ficha"}
      </button>
    </form>
  );
}
