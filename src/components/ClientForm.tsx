"use client";

import { useActionState } from "react";
import { saveClient, type FormState } from "@/lib/actions";

type ClientValues = { name: string; contact: string | null; phone: string | null; email: string | null; notes: string | null };

export function ClientForm({ id, initial }: { id: string | null; initial?: ClientValues }) {
  const [state, action, pending] = useActionState<FormState, FormData>(saveClient.bind(null, id), {});
  return (
    <form action={action} className="card flex flex-col gap-3 p-4">
      <Field label="Nombre *">
        <input name="name" className="input" required defaultValue={initial?.name} autoFocus={!id} />
      </Field>
      <Field label="Persona de contacto">
        <input name="contact" className="input" defaultValue={initial?.contact ?? ""} />
      </Field>
      <Field label="Teléfono">
        <input name="phone" className="input" type="tel" defaultValue={initial?.phone ?? ""} />
      </Field>
      <Field label="Email">
        <input name="email" className="input" type="email" defaultValue={initial?.email ?? ""} />
      </Field>
      <Field label="Notas">
        <textarea name="notes" className="input min-h-24" defaultValue={initial?.notes ?? ""} />
      </Field>
      {state.error ? <p className="text-danger">{state.error}</p> : null}
      <button className="btn-primary" disabled={pending}>
        {pending ? "Guardando…" : "Guardar cliente"}
      </button>
    </form>
  );
}

export function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="flex flex-col gap-1">
      <span className="text-sm text-muted">{label}</span>
      {children}
    </label>
  );
}
