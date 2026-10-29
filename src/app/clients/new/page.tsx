import { requireUser } from "@/lib/auth";
import { Header, Main } from "@/components/Header";
import { ClientForm } from "@/components/ClientForm";

export default async function NewClientPage() {
  await requireUser();
  return (
    <>
      <Header title="Nuevo cliente" back={{ href: "/", label: "Clientes" }} />
      <Main>
        <ClientForm id={null} />
      </Main>
    </>
  );
}
