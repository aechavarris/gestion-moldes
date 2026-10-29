import { db } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { deleteUser } from "@/lib/actions";
import { Header, Main } from "@/components/Header";
import { ConfirmButton } from "@/components/ConfirmButton";
import { ChangePasswordForm, NewUserForm } from "./UserForms";

export const dynamic = "force-dynamic";

export default async function UsersPage() {
  const me = await requireUser();
  const users = await db.user.findMany({ orderBy: { displayName: "asc" }, select: { id: true, username: true, displayName: true } });

  return (
    <>
      <Header title="Usuarios" back={{ href: "/", label: "Clientes" }} />
      <Main>
        <ul className="card divide-y divide-border">
          {users.map((user) => (
            <li key={user.id} className="flex items-center justify-between gap-3 px-4 py-3">
              <span>
                <span className="font-medium">{user.displayName}</span> <span className="text-sm text-muted">@{user.username}</span>
                {user.id === me.id ? <span className="text-sm text-muted"> (tú)</span> : null}
              </span>
              {user.id !== me.id ? (
                <form action={deleteUser.bind(null, user.id)}>
                  <ConfirmButton message={`¿Eliminar a ${user.displayName}? Ya no podrá entrar.`}>Eliminar</ConfirmButton>
                </form>
              ) : null}
            </li>
          ))}
        </ul>
        <h2 className="font-semibold">Añadir compañero</h2>
        <NewUserForm />
        <h2 className="font-semibold">Cambiar mi contraseña</h2>
        <ChangePasswordForm />
      </Main>
    </>
  );
}
