import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import { LoginForm, SetupForm } from "./LoginForm";

export const dynamic = "force-dynamic";

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ next?: string }> }) {
  if (await getCurrentUser()) redirect("/");
  const { next } = await searchParams;
  // A fresh install has no accounts: the first visitor (already inside the VPN) creates one.
  const firstRun = (await db.user.count()) === 0;
  return (
    <main className="mx-auto flex min-h-dvh max-w-sm flex-col justify-center gap-6 px-4">
      <h1 className="text-center text-2xl font-semibold">Fichas técnicas</h1>
      {firstRun ? <SetupForm /> : <LoginForm next={next ?? "/"} />}
    </main>
  );
}
