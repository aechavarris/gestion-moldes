"use client";

import { useActionState } from "react";
import { login, setupFirstUser, type FormState } from "@/lib/actions";

export function LoginForm({ next }: { next: string }) {
  const [state, action, pending] = useActionState<FormState, FormData>(login, {});
  return (
    <form action={action} className="card flex flex-col gap-3 p-4">
      <input type="hidden" name="next" value={next} />
      <input name="username" className="input" placeholder="Usuario" autoComplete="username" autoCapitalize="none" required autoFocus />
      <input name="password" type="password" className="input" placeholder="Contraseña" autoComplete="current-password" required />
      {state.error ? <p className="text-danger">{state.error}</p> : null}
      <button className="btn-primary" disabled={pending}>
        Entrar
      </button>
    </form>
  );
}

export function UserFields() {
  return (
    <>
      <input name="displayName" className="input" placeholder="Nombre (p. ej. Carlos)" required />
      <input name="username" className="input" placeholder="Usuario para entrar" autoComplete="username" autoCapitalize="none" required />
      <input name="password" type="password" className="input" placeholder="Contraseña (mín. 8)" autoComplete="new-password" required minLength={8} />
    </>
  );
}

export function SetupForm() {
  const [state, action, pending] = useActionState<FormState, FormData>(setupFirstUser, {});
  return (
    <form action={action} className="card flex flex-col gap-3 p-4">
      <p className="text-sm text-muted">Primera vez: crea tu usuario. Después podrás añadir a tus compañeros.</p>
      <UserFields />
      {state.error ? <p className="text-danger">{state.error}</p> : null}
      <button className="btn-primary" disabled={pending}>
        Crear usuario
      </button>
    </form>
  );
}
