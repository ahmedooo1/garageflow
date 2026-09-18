import type { Metadata } from "next";
import Link from "next/link";
import { RegisterForm } from "./register-form";

export const metadata: Metadata = { title: "Créer un garage" };

export default function RegisterPage() {
  return (
    <>
      <h1 className="text-2xl font-extrabold text-ink">Créer votre garage</h1>
      <p className="mt-1 mb-6 text-sm text-muted">Vous serez le gérant du compte et pourrez ensuite ajouter votre équipe.</p>
      <RegisterForm />
      <p className="mt-6 text-center text-sm text-muted">
        Déjà un compte ?{" "}
        <Link href="/login" className="font-semibold text-accent hover:underline">
          Se connecter
        </Link>
      </p>
    </>
  );
}
