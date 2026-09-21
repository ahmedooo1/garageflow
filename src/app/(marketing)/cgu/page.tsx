import type { Metadata } from "next";
import { LegalPage, LegalSection } from "../legal";

export const metadata: Metadata = {
  title: "Conditions générales d'utilisation",
  description: "Conditions générales d'utilisation et d'abonnement au service GarageFlow.",
};

export default function CguPage() {
  return (
    <LegalPage title="Conditions générales d'utilisation" updatedAt="21 septembre 2026">
      <LegalSection title="1. Objet">
        <p>
          Les présentes conditions régissent l&apos;accès au service GarageFlow (le « Service »), une application de gestion d&apos;atelier destinée aux
          professionnels de la réparation automobile. La création d&apos;un compte vaut acceptation sans réserve des présentes conditions.
        </p>
      </LegalSection>

      <LegalSection title="2. Compte et utilisateurs">
        <p>
          Le Service est réservé aux professionnels. Le garage désigne un gérant, responsable des comptes qu&apos;il crée pour son équipe et du respect
          des présentes conditions par ces derniers. Chaque utilisateur est responsable de la confidentialité de son mot de passe et doit signaler
          sans délai tout accès non autorisé.
        </p>
        <p>
          Le nombre de comptes actifs simultanés est limité selon le plan souscrit. Le garage peut désactiver un compte à tout moment pour en libérer un.
        </p>
      </LegalSection>

      <LegalSection title="3. Essai gratuit, abonnement et paiement">
        <p>
          Chaque nouveau garage bénéficie d&apos;une période d&apos;essai gratuite de 14 jours, sans carte bancaire, donnant accès à l&apos;ensemble des
          fonctionnalités. À l&apos;issue de cette période, la souscription d&apos;un abonnement est nécessaire pour continuer à créer et modifier des données.
        </p>
        <p>
          L&apos;abonnement est mensuel, sans engagement de durée, payable d&apos;avance. Les prix sont indiqués hors taxes ; la TVA applicable s&apos;y ajoute.
          La résiliation prend effet à la fin de la période en cours ; aucun remboursement au prorata n&apos;est pratiqué.
        </p>
        <p>
          En cas de défaut de paiement, l&apos;accès en écriture peut être suspendu après information du garage. L&apos;accès en lecture et l&apos;export des
          données restent possibles.
        </p>
      </LegalSection>

      <LegalSection title="4. Disponibilité et support">
        <p>
          L&apos;éditeur met en œuvre les moyens raisonnables pour assurer la disponibilité du Service, sans garantie d&apos;absence totale
          d&apos;interruption. Des opérations de maintenance peuvent intervenir, autant que possible en dehors des heures ouvrées. Le support est assuré
          par email aux jours et heures ouvrés.
        </p>
      </LegalSection>

      <LegalSection title="5. Données du garage">
        <p>
          Les données saisies dans le Service (clients, véhicules, dossiers, photos) restent la propriété du garage. L&apos;éditeur ne les exploite que
          pour fournir le Service et ne les revend en aucun cas. Le garage peut les exporter à tout moment depuis les paramètres, au format JSON.
        </p>
        <p>
          À la résiliation, les données sont conservées 60 jours pour permettre un export, puis supprimées. Une suppression immédiate peut être
          demandée par écrit.
        </p>
      </LegalSection>

      <LegalSection title="6. Obligations du garage">
        <p>
          Le garage s&apos;engage à n&apos;utiliser le Service que dans le cadre de son activité professionnelle et dans le respect de la loi. Il lui
          appartient notamment d&apos;informer ses propres clients du traitement de leurs données et de ne téléverser que des contenus dont il dispose
          des droits. Toute tentative d&apos;accès aux données d&apos;un autre garage entraîne la suspension immédiate du compte.
        </p>
      </LegalSection>

      <LegalSection title="7. Valeur des validations client">
        <p>
          Le Service enregistre les décisions des clients du garage (acceptation ou refus de travaux) en conservant leur date, leur heure et l&apos;adresse
          IP d&apos;origine. Ces éléments constituent un faisceau de preuves destiné à documenter l&apos;accord du client. Il appartient au garage
          d&apos;apprécier, selon sa situation, la nécessité de recueillir un accord écrit complémentaire.
        </p>
      </LegalSection>

      <LegalSection title="8. Responsabilité">
        <p>
          Le Service est un outil de gestion : il n&apos;établit aucun diagnostic et ne se substitue pas au jugement du professionnel. L&apos;éditeur ne
          saurait être tenu responsable des décisions techniques ou commerciales prises par le garage, ni des dommages indirects tels qu&apos;une perte
          d&apos;exploitation. Sa responsabilité est en tout état de cause plafonnée au montant des sommes versées au titre des douze derniers mois.
        </p>
      </LegalSection>

      <LegalSection title="9. Modification des conditions">
        <p>
          Les présentes conditions peuvent être modifiées. Toute modification substantielle est notifiée au garage au moins 30 jours avant son entrée
          en vigueur ; le garage peut alors résilier sans frais.
        </p>
      </LegalSection>

      <LegalSection title="10. Droit applicable">
        <p>
          Les présentes conditions sont soumises au droit français. À défaut de résolution amiable, tout litige relève de la compétence des tribunaux
          du ressort du siège de l&apos;éditeur.
        </p>
      </LegalSection>
    </LegalPage>
  );
}
