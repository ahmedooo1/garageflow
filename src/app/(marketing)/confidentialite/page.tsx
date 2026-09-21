import type { Metadata } from "next";
import { LegalPage, LegalSection } from "../legal";

export const metadata: Metadata = {
  title: "Politique de confidentialité",
  description: "Traitement des données personnelles dans GarageFlow : finalités, durées de conservation, sous-traitance et droits.",
};

export default function PrivacyPage() {
  return (
    <LegalPage title="Politique de confidentialité" updatedAt="21 septembre 2026">
      <LegalSection title="Qui traite quoi">
        <p>
          Deux rôles coexistent. Pour les comptes des utilisateurs du garage (nom, email, rôle, journaux de connexion), l&apos;éditeur de GarageFlow est
          responsable de traitement. Pour les données des clients du garage (coordonnées, véhicules, dossiers, photos), le garage est responsable de
          traitement et l&apos;éditeur agit comme sous-traitant, uniquement sur instruction du garage.
        </p>
      </LegalSection>

      <LegalSection title="Données traitées et finalités">
        <ul className="list-disc space-y-1.5 pl-5">
          <li><strong>Comptes utilisateurs</strong> : nom, prénom, email, rôle, mot de passe haché. Finalité : authentification et gestion des accès.</li>
          <li><strong>Clients du garage</strong> : nom, téléphone, email, adresse, notes. Finalité : suivi des interventions et contact.</li>
          <li><strong>Véhicules et dossiers</strong> : immatriculation, numéro de série, kilométrage, diagnostics, photos, travaux et décisions. Finalité : exécution et traçabilité de la prestation.</li>
          <li><strong>Validations client</strong> : date, heure et adresse IP de la réponse. Finalité : preuve de l&apos;accord donné sur les travaux.</li>
          <li><strong>Journaux techniques</strong> : connexions, actions sensibles, tentatives échouées. Finalité : sécurité et détection d&apos;abus.</li>
        </ul>
      </LegalSection>

      <LegalSection title="Bases légales">
        <p>
          Le traitement des comptes utilisateurs repose sur l&apos;exécution du contrat d&apos;abonnement. Le traitement des données des clients du garage
          repose sur l&apos;exécution du contrat de réparation et sur l&apos;intérêt légitime du garage à conserver une traçabilité de ses interventions.
          Les journaux de sécurité reposent sur l&apos;intérêt légitime à protéger le service.
        </p>
      </LegalSection>

      <LegalSection title="Durées de conservation">
        <ul className="list-disc space-y-1.5 pl-5">
          <li>Données des dossiers : pendant la relation commerciale, puis 5 ans, durée usuelle de conservation des preuves d&apos;intervention.</li>
          <li>Comptes utilisateurs : jusqu&apos;à la résiliation, puis 60 jours pour permettre un export.</li>
          <li>Liens de validation client : détruits à expiration ; seule la décision enregistrée est conservée.</li>
          <li>Journaux techniques : 12 mois.</li>
        </ul>
      </LegalSection>

      <LegalSection title="Destinataires et sous-traitants">
        <p>
          Les données ne sont ni vendues, ni louées, ni utilisées à des fins publicitaires. Elles sont accessibles au seul garage concerné : le
          cloisonnement entre garages est appliqué à chaque requête et vérifié par des tests automatisés. L&apos;équipe GarageFlow n&apos;accède aux
          données d&apos;un garage que sur demande de celui-ci, dans le cadre du support.
        </p>
        <p>
          Sous-traitants techniques : hébergeur de l&apos;application et de la base de données, service de stockage des photos, prestataire d&apos;envoi
          d&apos;emails et, le cas échéant, prestataire de paiement pour la facturation. Tous sont situés dans l&apos;Union européenne ou présentent des
          garanties équivalentes.
        </p>
      </LegalSection>

      <LegalSection title="Sécurité">
        <p>
          Mots de passe hachés (bcrypt), sessions serveur à jeton haché, liens de validation à jeton aléatoire de 256 bits stocké haché et expirant,
          accès aux photos par URL signée de courte durée, limitation du nombre de tentatives de connexion, journal d&apos;audit des actions sensibles et
          chiffrement des échanges en HTTPS.
        </p>
      </LegalSection>

      <LegalSection title="Vos droits">
        <p>
          Toute personne dispose d&apos;un droit d&apos;accès, de rectification, d&apos;effacement, de limitation, d&apos;opposition et de portabilité.
          Le client d&apos;un garage exerce ses droits directement auprès de ce garage, qui décide des suites à donner. Un utilisateur du service peut
          écrire à <span className="font-semibold">contact@garageflow.fr</span>.
        </p>
        <p>
          Le garage dispose d&apos;un export complet de ses données au format JSON, disponible à tout moment depuis les paramètres, y compris après la
          fin de son abonnement.
        </p>
        <p>
          En cas de désaccord persistant, une réclamation peut être adressée à la Commission nationale de l&apos;informatique et des libertés (CNIL).
        </p>
      </LegalSection>

      <LegalSection title="Cookies">
        <p>
          GarageFlow n&apos;utilise ni cookie publicitaire, ni traceur d&apos;audience tiers. Un unique cookie strictement nécessaire conserve la session
          de l&apos;utilisateur connecté ; il ne requiert pas de consentement préalable et disparaît à la déconnexion.
        </p>
      </LegalSection>
    </LegalPage>
  );
}
