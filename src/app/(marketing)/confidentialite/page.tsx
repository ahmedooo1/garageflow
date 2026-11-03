import type { Metadata } from "next";
import { LegalPage, LegalSection } from "../legal";

export const metadata: Metadata = {
  title: "Politique de confidentialité",
  description: "Traitement des données personnelles dans GarageFlow : finalités, durées de conservation, sous-traitance et droits.",
};

export default function PrivacyPage() {
  return (
    <LegalPage title="Politique de confidentialité" updatedAt="3 novembre 2026">
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

      <LegalSection title="Prospection commerciale auprès des garages" id="prospection">
        <p>
          L&apos;éditeur de GarageFlow contacte des garages de réparation automobile pour leur présenter le service. Il est responsable de ce
          traitement, fondé sur son intérêt légitime à faire connaître une offre destinée à ces professionnels.
        </p>
        <ul className="list-disc space-y-1.5 pl-5">
          <li>
            <strong>Données utilisées</strong> : nom et adresse de l&apos;établissement, SIRET, code d&apos;activité, tranche d&apos;effectif et nombre
            d&apos;établissements (base SIRENE de l&apos;INSEE, données publiques), site web, adresse email et téléphone professionnels publiés par le
            garage lui-même, ou fournis par lui via le formulaire de démonstration. La source de chaque information est conservée. Les noms des
            dirigeants ne sont pas collectés.
          </li>
          <li>
            <strong>Usage</strong> : qualifier l&apos;intérêt possible du service pour le garage et lui écrire. Chaque message est relu et envoyé
            individuellement par une personne ; aucun envoi en masse, aucun appel automatisé.
          </li>
          <li>
            <strong>Durée</strong> : trois ans au plus après le dernier échange. En cas d&apos;opposition, seul l&apos;identifiant nécessaire au respect
            de cette opposition (email ou SIRET) est conservé.
          </li>
          <li>
            <strong>Opposition</strong> : chaque message comporte un lien de désinscription qui prend effet immédiatement. Vous pouvez aussi répondre
            « stop » ou écrire à <span className="font-semibold">contact@garageflow.fr</span>.
          </li>
        </ul>
      </LegalSection>

      <LegalSection title="Mesure d'audience" id="audience">
        <p>
          Le site public compte les pages vues par jour, par page et par provenance (lien de campagne ou site d&apos;origine). Ce comptage ne dépose
          aucun cookie, n&apos;enregistre ni adresse IP ni identifiant, et respecte les réglages « Do Not Track » et « Global Privacy Control ».
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
          GarageFlow n&apos;utilise ni cookie publicitaire, ni traceur d&apos;audience tiers ; la mesure d&apos;audience décrite ci-dessus fonctionne sans cookie. Un unique cookie strictement nécessaire conserve la session
          de l&apos;utilisateur connecté ; il ne requiert pas de consentement préalable et disparaît à la déconnexion.
        </p>
      </LegalSection>
    </LegalPage>
  );
}
