import type { Metadata } from "next";
import Link from "next/link";
import { ForgotForm } from "./forgot-form";

export const metadata: Metadata = { title: "Mot de passe oublié" };

export default function ForgotPasswordPage() {
  return (
    <>
      <h1 className="text-2xl font-extrabold text-ink">Mot de passe oublié</h1>
      <p className="mt-1 mb-6 text-sm text-muted">Indiquez votre email : si un compte existe, un lien de réinitialisation vous sera envoyé.</p>
      <ForgotForm />
      <p className="mt-6 text-center text-sm">
        <Link href="/login" className="font-semibold text-muted hover:text-ink">
          ← Retour à la connexion
        </Link>
      </p>
    </>
  );
}
