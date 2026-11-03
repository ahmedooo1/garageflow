import type { Metadata } from "next";
import Link from "next/link";
import { RegisterForm } from "./register-form";

export const metadata: Metadata = { title: "Créer un garage" };

export default async function RegisterPage({ searchParams }: { searchParams: Promise<{ utm_source?: string; ref?: string }> }) {
  const params = await searchParams;
  // Provenance de campagne seulement (ex. « prospection »), nettoyée côté serveur.
  const source = String(params.utm_source ?? params.ref ?? "").slice(0, 100);
  return (
    <>
      <h1 className="text-2xl font-extrabold text-ink">Créer votre garage</h1>
      <p className="mt-1 mb-6 text-sm text-muted">Vous serez le gérant du compte et pourrez ensuite ajouter votre équipe.</p>
      <RegisterForm source={source} />
      <p className="mt-6 text-center text-sm text-muted">
        Déjà un compte ?{" "}
        <Link href="/login" className="font-semibold text-accent hover:underline">
          Se connecter
        </Link>
      </p>
    </>
  );
}
