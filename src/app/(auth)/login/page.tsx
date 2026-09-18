import type { Metadata } from "next";
import Link from "next/link";
import { LoginForm } from "./login-form";

export const metadata: Metadata = { title: "Connexion" };

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ next?: string; reset?: string }> }) {
  const sp = await searchParams;
  return (
    <>
      <h1 className="text-2xl font-extrabold text-ink">Connexion</h1>
      <p className="mt-1 mb-6 text-sm text-muted">Accédez à l&apos;atelier de votre garage.</p>
      <LoginForm next={sp.next} resetDone={sp.reset === "1"} />
      <p className="mt-6 text-center text-sm text-muted">
        Nouveau garage ?{" "}
        <Link href="/register" className="font-semibold text-accent hover:underline">
          Créer un compte
        </Link>
      </p>
    </>
  );
}
