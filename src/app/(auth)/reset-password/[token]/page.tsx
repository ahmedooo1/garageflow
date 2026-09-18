import type { Metadata } from "next";
import { ResetForm } from "./reset-form";

export const metadata: Metadata = { title: "Nouveau mot de passe" };

export default async function ResetPasswordPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  return (
    <>
      <h1 className="text-2xl font-extrabold text-ink">Nouveau mot de passe</h1>
      <p className="mt-1 mb-6 text-sm text-muted">Choisissez un nouveau mot de passe. Toutes vos sessions seront déconnectées.</p>
      <ResetForm token={token} />
    </>
  );
}
