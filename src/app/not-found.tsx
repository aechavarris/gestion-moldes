import Link from "next/link";

export default function NotFound() {
  return (
    <main className="mx-auto flex min-h-dvh max-w-sm flex-col items-center justify-center gap-4 px-4">
      <p className="text-muted">No existe esta página.</p>
      <Link href="/" className="btn-primary">
        Ir a clientes
      </Link>
    </main>
  );
}
