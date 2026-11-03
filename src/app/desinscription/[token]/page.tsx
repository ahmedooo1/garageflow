import type { Metadata } from "next";
import Link from "next/link";
import { Logo } from "@/components/logo";
import { verifyUnsubscribeToken } from "@/server/growth/outreach";

export const metadata: Metadata = { title: "Ne plus recevoir nos messages", robots: { index: false, follow: false } };
export const dynamic = "force-dynamic";

/**
 * Page de désinscription. L'ouverture du lien ne modifie rien (les antivirus
 * de messagerie ouvrent les liens) : la confirmation se fait par un bouton.
 * La page n'affiche aucune donnée sur le destinataire.
 */
export default async function UnsubscribePage({ params, searchParams }: { params: Promise<{ token: string }>; searchParams: Promise<{ ok?: string; erreur?: string }> }) {
  const { token } = await params;
  const { ok, erreur } = await searchParams;
  const valid = verifyUnsubscribeToken(token) !== null;

  return (
    <div className="min-h-dvh bg-canvas">
      <div className="bg-steel-900 px-4 py-4 text-white">
        <div className="mx-auto max-w-xl">
          <Logo light compact />
        </div>
      </div>
      <main className="mx-auto max-w-xl px-4 py-10">
        <div className="card p-6">
          {!valid || erreur ? (
            <>
              <h1 className="text-xl font-extrabold">Lien invalide</h1>
              <p className="mt-2 text-muted">
                Ce lien n&apos;est pas reconnu. Pour ne plus recevoir de message, répondez simplement « stop » au message reçu : votre demande sera traitée
                manuellement.
              </p>
            </>
          ) : ok ? (
            <>
              <h1 className="text-xl font-extrabold">C&apos;est noté</h1>
              <p className="mt-2 text-muted">
                Vous ne recevrez plus de message de prospection de GarageFlow. Seul l&apos;identifiant nécessaire au respect de votre demande est conservé.
              </p>
            </>
          ) : (
            <>
              <h1 className="text-xl font-extrabold">Ne plus recevoir nos messages</h1>
              <p className="mt-2 text-muted">Confirmez et nous ne vous écrirons plus. Votre demande est prise en compte immédiatement.</p>
              <form method="post" action={`/api/desinscription/${encodeURIComponent(token)}?form=1`} className="mt-5">
                <button type="submit" className="btn btn-dark btn-block">
                  Confirmer la désinscription
                </button>
              </form>
            </>
          )}
          <p className="mt-6 text-sm text-muted">
            <Link href="/confidentialite#prospection" className="underline underline-offset-4">
              Vos données et vos droits
            </Link>
          </p>
        </div>
      </main>
    </div>
  );
}
