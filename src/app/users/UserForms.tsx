"use client";

import { useActionState, useEffect, useRef } from "react";
import { changePassword, createUser, type FormState } from "@/lib/actions";
import { UserFields } from "@/app/login/LoginForm";

function Result({ state }: { state: FormState }) {
  if (state.error) return <p className="text-danger">{state.error}</p>;
  if (state.ok) return <p className="text-accent">{state.ok}</p>;
  return null;
}

/** Clears the form after a successful submit so the password is not left on screen. */
function useResetOnOk(state: FormState) {
  const form = useRef<HTMLFormElement>(null);
  useEffect(() => {
    if (state.ok) form.current?.reset();
  }, [state]);
  return form;
}

export function NewUserForm() {
  const [state, action, pending] = useActionState<FormState, FormData>(createUser, {});
  const form = useResetOnOk(state);
  return (
    <form ref={form} action={action} className="card flex flex-col gap-3 p-4">
      <UserFields />
      <Result state={state} />
      <button className="btn-primary" disabled={pending}>
        Crear usuario
      </button>
    </form>
  );
}

export function ChangePasswordForm() {
  const [state, action, pending] = useActionState<FormState, FormData>(changePassword, {});
  const form = useResetOnOk(state);
  return (
    <form ref={form} action={action} className="card flex flex-col gap-3 p-4">
      <input name="current" type="password" className="input" placeholder="Contraseña actual" autoComplete="current-password" required />
      <input name="password" type="password" className="input" placeholder="Nueva contraseña (mín. 8)" autoComplete="new-password" required minLength={8} />
      <Result state={state} />
      <button className="btn-ghost" disabled={pending}>
        Cambiar contraseña
      </button>
    </form>
  );
}
