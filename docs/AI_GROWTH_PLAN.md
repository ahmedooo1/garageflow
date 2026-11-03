# GarageFlow : plan d'acquisition et de croissance

Objectif : signer les **cinq premiers garages payants**, avec le moins de travail manuel et de coût d'exploitation possible, sans jamais contacter
quelqu'un sans relecture humaine. Ce document fait l'état des lieux (phase 1), fixe les priorités et décrit ce qui est livré dans la branche
`claude/remote-control-bkgpep`.

## 1. État des lieux (audit du dépôt, 3 novembre 2026)

Tout ce qui suit a été vérifié dans le code. Rien n'a pu être vérifié sur le site en production : depuis l'environnement de développement, le
proxy refuse les connexions vers `garageflow.aaweb.fr`, l'API SIRENE et OpenStreetMap.

### Produit et architecture

| Sujet | Constat |
| --- | --- |
| Pile | Next.js 16 (App Router, server actions), React 19, Prisma 6, PostgreSQL, Tailwind 4. Une seule instance sur un VPS, image Docker construite par GitHub Actions et attestée (Sigstore). |
| Déploiement | Chaque push sur `master` lance la CI complète puis la bascule. Les migrations sont appliquées au démarrage du conteneur ; `scripts/verifier-migrations.mjs` refuse toute migration incompatible avec un retour arrière. Une sauvegarde `pg_dump` est faite avant chaque bascule. |
| Authentification | Sessions serveur (cookie httpOnly, jeton haché), bcrypt. Rôles garage `OWNER` / `RECEPTION` / `TECHNICIAN`, drapeau distinct `platformAdmin` pour la console `/admin`. |
| Isolation | Toutes les requêtes métier filtrent par `garageId`, avec des tests d'IDOR croisés. La console plateforme n'expose que des agrégats. |
| Facturation | Plans Atelier 59 € HT et Réseau 129 € HT (`src/lib/plans.ts`), essai 14 jours sans carte. Stripe Checkout et webhook écrits mais **jamais exécutés contre l'API** (README). Activation manuelle possible depuis `/admin`. |
| Emails | `nodemailer` en SMTP, ou journalisation. La configuration de production n'est pas visible depuis le dépôt. |
| Tâches planifiées | Aucune avant cette branche. |
| Audit | Table `AuditLog` sur les actions sensibles, réutilisée ici. |

### Site public et conversion

- Page d'accueil soignée et cohérente : parcours en 8 étapes, vraies captures du produit, tarifs issus de la même source que la facturation, FAQ.
  Une seule action principale, « Essayer 14 jours gratuitement », vers `/register`.
- **Aucun chemin pour un garage qui veut d'abord parler à quelqu'un** : pas de demande de démo ni de contact, hormis une adresse
  `contact@garageflow.fr` dans les pages légales (domaine différent de `aaweb.fr`, à vérifier qu'elle reçoit bien les messages).
- Aucune preuve sociale. C'est normal avant les premiers clients ; il ne faut surtout pas en inventer.
- Inscription courte (6 champs) et directe vers l'atelier. Pas de suivi de l'activation après inscription.
- Les mentions légales ne donnent ni raison sociale, ni adresse, ni hébergeur (signalé dans le README). **C'est bloquant pour la prospection** :
  un message commercial doit identifier clairement son expéditeur.

### Référencement

- Titre et description présents sur l'accueil et les pages légales.
- Manquaient : `robots.txt`, `sitemap.xml`, `metadataBase`, balises Open Graph et URL canonique. **Ajoutés dans cette branche.**

### Mesure

- Aucune mesure d'audience, aucune attribution des inscriptions, aucun indicateur d'activation ou de conversion. Seul le revenu mensuel
  (plan × abonnés actifs) était calculé dans `/admin`.

## 2. Priorités

Classées par effet attendu sur les cinq premiers clients, à coût égal.

| # | Changement | Pourquoi | Livré |
| --- | --- | --- | --- |
| 1 | Liste de garages réels et qualifiés à Elbeuf, Rouen, Le Havre | Sans liste, pas de prospection. SIRENE est public, gratuit et officiel. | Oui |
| 2 | Console de suivi (étapes, notes, relances, opposition) | Cinq clients se gagnent à la main ; il faut ne rien oublier. | Oui |
| 3 | Brouillons de messages personnalisés, approuvés un par un | Gagne du temps sans risque d'envoi en masse. | Oui |
| 4 | Formulaire « Demander une démonstration » | Un garagiste préfère souvent voir avant d'essayer. | Oui |
| 5 | Attribution des inscriptions et indicateurs réels | Savoir ce qui marche, sans rien inventer. | Oui |
| 6 | Identité légale de l'éditeur dans les mentions et les messages | Obligatoire avant tout envoi. | **À faire par vous** (variables d'environnement + pages légales) |
| 7 | Vérifier Stripe en mode test, ou prévoir la facturation manuelle | Le premier client doit pouvoir payer sans accroc. | À faire |
| 8 | Visite guidée interactive du produit | Utile, mais les captures réelles de l'accueil couvrent déjà l'essentiel. | Plus tard |
| 9 | Liste de contrôle d'activation dans l'application | Améliore le passage essai → payant. | Plus tard |

## 3. Ce qui est livré

### Phase 2 : découverte de prospects

- **Source** : API Recherche d'entreprises (DINUM, données SIRENE de l'INSEE, Licence Ouverte 2.0), sans clé. Filtre : code NAF **45.20A**
  (entretien et réparation de véhicules légers), établissements **actifs**, codes postaux des zones (`src/lib/growth/zones.ts`) :
  Elbeuf (76500, 76320, 76410), Rouen (76000, 76100), Le Havre (76600, 76610, 76620), et en option la métropole de Rouen.
- **Respect de la source** : une requête toutes les 400 ms (limite publiée : 7 par seconde), 4 pages de 25 résultats par zone et par exécution,
  nouvel essai sur 429, agent utilisateur identifié.
- **Minimisation** : nom, adresse, SIRET, NAF, tranche d'effectif, nombre d'établissements, date de création. Les **dirigeants ne sont jamais lus**.
  Les unités à diffusion restreinte (statut « P ») sont ignorées.
- **Traçabilité** : chaque prospect garde son URL de source (fiche annuaire-entreprises) et la date du relevé ; chaque email ou téléphone garde la
  page où il est publié. Une coordonnée sans source est refusée.
- **Dédoublonnage** : clé SIRET, sinon nom normalisé + code postal, sinon email. Un nouveau passage rafraîchit le registre sans jamais écraser une
  coordonnée saisie.
- **Autres entrées** : import CSV (colonne `source_url` obligatoire), saisie manuelle avec source, formulaire de démonstration.
- **Site web** : vérification de la seule page d'accueil (robots.txt respecté, 512 Ko et 8 s au plus, adresses internes refusées pour éviter le
  SSRF). On n'en garde que des signaux (site joignable, prise de rendez-vous en ligne, lien vers une plateforme) et l'email publié en `mailto:`.

### Phase 3 : qualification transparente

`src/lib/growth/scoring.ts`, sans modèle de langage : le même prospect donne toujours le même score.

| Signal | Points | Source |
| --- | --- | --- |
| NAF 45.20A | +25 | SIRENE |
| Dans une zone de lancement | +10 | SIRENE |
| 1 ou 2 établissements (indépendant) | +15 | SIRENE |
| Plus de 5 établissements | -15 | SIRENE |
| Nom d'un réseau national (Speedy, Norauto, Midas…) | -40, exclu | Nom SIRENE |
| Équipe de 1 à 9 salariés / 10 à 49 / 0 | +15 / +10 / +5 | SIRENE |
| Entreprise de plus de 2 ans | +5 | SIRENE |
| Site joignable / rendez-vous en ligne | +5 / +5 | Page d'accueil |
| Email professionnel avec source | +15 | Page citée |
| Téléphone avec source | +5 | Page citée |
| Démo demandée | +30 | Formulaire |

- Au-delà de 50 points, un prospect découvert passe « qualifié ».
- **Confiance** : élevée si l'identité est vérifiée, l'email sourcé et le site vérifié ; moyenne si deux de ces trois éléments sont réunis ; faible
  sinon.
- **Hypothèse** : rédigée à partir de ces seuls faits et toujours présentée comme « à vérifier ». Elle ne dit jamais rien du logiciel actuel du
  garage.

### Phase 4 : console commerciale

Les pages `/admin/prospects`, `/admin/prospects/[id]` et `/admin/croissance` sont réservées à `platformAdmin`, et testées comme telles.

- **Étapes** : découvert, qualifié, à relire, contacté, a répondu, démo planifiée, en essai, client, pas intéressé, ne pas contacter.
- **Suivi** : filtres (étape, zone, score, email, démo, relance due), notes, historique, date de relance, réponse reçue avec objection.
- **Liste d'opposition** : par email, domaine ou SIRET. Elle est consultée à la découverte, à l'import, à la rédaction et à l'envoi.
- **Export CSV** : protégé contre l'injection de formules, et journalisé.
- Les prospects ne sont jamais visibles d'un garage client. L'inscription d'un prospect le rattache automatiquement (même email, ou même domaine
  que son site) ; il passe ensuite « client » quand son abonnement devient actif.

### Phase 5 : assistant commercial

- **Modèles déterministes** en français (premier contact, invitation à une démo, relance unique) : toujours disponibles, sans aucun coût.
- **Rédaction assistée facultative** (`src/server/growth/ai.ts`), avec Claude via le SDK officiel :
  - le modèle ne reçoit que des **faits structurés** (registre, signaux booléens, hypothèse calculée), jamais le texte d'un site, ce qui
    empêche toute injection de consignes ;
  - sa sortie est validée (pas d'URL, pas d'email, pas d'affirmation sur l'outil actuel du garage, longueur bornée) ; en cas de rejet, on revient
    au modèle déterministe ;
  - le budget mensuel est vérifié avant chaque appel, sur le coût maximal possible ; chaque appel est journalisé dans `AiUsage` ;
  - le repli serveur `fallbacks: "default"` est activé : si le modèle principal refuse, l'API relance sur le modèle de repli recommandé.
- **Pied de message ajouté par le code**, quel que soit le rédacteur : identité de l'expéditeur, provenance des données (article 14 du RGPD),
  lien de désinscription en un clic (RFC 8058), lien vers la politique de confidentialité.
- **Approbation humaine obligatoire** : brouillon, puis approbation du texte exact (toute modification annule l'approbation), puis envoi.
- Par défaut, l'envoi se fait depuis votre messagerie (bouton « Ouvrir dans ma messagerie », puis « Marquer comme envoyé »). L'envoi SMTP depuis
  GarageFlow existe, désactivé par défaut (`OUTREACH_SEND_ENABLED`) ; il se fait message par message, avec une limite de 20 par 24 h et un
  verrou contre le double envoi.
- Une seule relance par prospect, 7 jours après le premier message. Aucun SMS, aucun appel, aucun réseau social.
- Une section « Prospection commerciale » a été ajoutée à la politique de confidentialité (`/confidentialite#prospection`) : base légale (intérêt
  légitime B2B), données, durée de conservation (3 ans), opposition.

### Phase 6 : conversion

- Section « Vingt minutes sur un vrai dossier » sur l'accueil, avec un formulaire de démonstration (champ piège contre les robots, limite de
  débit, notification interne).
- `/register?utm_source=…` enregistre la provenance de campagne sur le garage, sans identifiant individuel.
- `robots.txt`, `sitemap.xml`, `metadataBase`, Open Graph et URL canonique ajoutés.
- Aucune affirmation nouvelle sur le produit, sauf une : « en visio ou à l'atelier », qui suppose que vous pouvez vous déplacer. Retirez
  « à l'atelier » si ce n'est pas le cas (accueil et modèles de message).

### Phase 7 : indicateurs

`/admin/croissance`, calculé uniquement depuis la base. Les garages de l'équipe sont exclus, et un taux sans dénominateur s'affiche « - ».

- **Audience** : pages vues par jour, page et provenance. Aucun cookie, aucune IP stockée, Do Not Track et GPC respectés : dispensée de
  consentement selon les critères de la CNIL.
- **Produit** : inscriptions, activation (au moins un dossier), essai vers payant, abonnés, résiliations, revenu mensuel (même calcul que la
  console existante), provenance des inscriptions.
- **Ventes** : entonnoir par étape, sources, zones, messages envoyés, taux de réponse, démos demandées, prospects inscrits, dépense de la
  rédaction assistée.

### Phase 8 : automatisation

`POST /api/growth/cron?job=<tâche>[&dryRun=1]`, avec un jeton `Authorization: Bearer $GROWTH_CRON_SECRET`. La route est désactivée tant que le
secret n'est pas défini.

| Tâche | Période d'idempotence | Plafond par exécution |
| --- | --- | --- |
| `discovery` | semaine ISO | 4 pages × zone |
| `enrich` | jour | 15 sites |
| `score` | jour | - (déterministe) |
| `drafts` | jour | 10 brouillons, budget IA mensuel |
| `weekly-report` | semaine ISO | 1 email interne |

- **Idempotence** : une seule exécution réussie par période. Un échec est rejouable 3 fois, une exécution bloquée est reprise après 30 minutes.
- **Observabilité** : chaque exécution est enregistrée dans `GrowthJobRun` (statut, compteurs, erreur, nombre d'essais) et dans `AuditLog`.
- **Simulation** : `dryRun=1` n'écrit rien et ne contacte personne.
- **Arrêt d'urgence** : case dans la console ou `GROWTH_KILL_SWITCH=1`. Il bloque toutes les tâches et tous les envois.
- **Envois** : aucune tâche n'envoie de message à un prospect. La file de relecture de la console est la seule porte de sortie.

### Phase 9 : « agents »

Pas de cadre d'agents ni de n8n : cinq tâches déterministes suffisent et restent lisibles.

| Rôle | Où |
| --- | --- |
| Recherche | `discovery`, `enrich` |
| Qualification | `score` |
| Préparation commerciale | `drafts`, avec ou sans rédaction assistée |
| Croissance produit | indicateurs d'activation et d'attribution |
| Rapport | `weekly-report` |

Le seul appel à un modèle est une requête unique et bornée, sur des faits contrôlés. Un agent autonome n'apporterait ici que du coût et du risque.

## 4. Critères d'acceptation

| Critère | Vérification |
| --- | --- |
| Découvrir des garages réels et éligibles | `discovery` en simulation puis en réel sur la production ; chaque fiche renvoie vers annuaire-entreprises.data.gouv.fr. *Non exécuté contre l'API réelle depuis le développement (réseau bloqué) : premier test à faire après déploiement.* |
| Prospects qualifiés avec preuves | Chaque point du score cite un fait, une source et une date (test `tests/unit/growth.test.ts`). |
| Brouillons personnalisés en français | Modèles déterministes testés ; rédaction assistée facultative et budgétée. |
| Rien ne part sans approbation | Tests : envoi refusé sans approbation, approbation annulée par une modification, identité obligatoire, limite quotidienne, verrou de double envoi. |
| Opposition respectée durablement | Tests : désinscription en un clic, liste d'opposition consultée à la redécouverte, à l'import et à l'envoi. |
| Prospects invisibles des garages | Tests : actions refusées à un gérant de garage ; E2E : `/admin/prospects` redirige, l'export renvoie 403. |
| Suivi des réponses et des essais | Réponses consignées, rattachement automatique à l'inscription, passage en « client » à l'activation (test d'intégration). |
| Indicateurs réels | Calculés depuis la base, « - » sans données ; aucun chiffre saisi à la main. |
| Tâches sûres | Tests : idempotence, reprise après échec, simulation sans écriture, arrêt d'urgence. |

## 5. Coûts mensuels estimés

| Poste | Coût |
| --- | --- |
| API SIRENE, vérification des sites | 0 € (données publiques, serveur existant) |
| Base de données | négligeable (quelques milliers de lignes) |
| Envoi des messages | 0 € depuis votre messagerie ; sinon le SMTP déjà utilisé par l'application |
| Rédaction assistée (facultative) | Plafonnée par le budget de la console (10 $ par défaut). Avec `claude-opus-5-5` (4 $ / 20 $ par million de jetons, effort `low`), un brouillon court coûte de l'ordre de 1 à 4 centimes : environ 1 à 4 $ pour 100 brouillons. Le plafond se calcule sur le pire cas (4 000 jetons de sortie, soit 9 centimes par appel). |
| Nouveaux services | Aucun |

Total : **0 € sans rédaction assistée**, et au plus le budget fixé avec. Pour réduire encore ce coût, `GROWTH_AI_MODEL=claude-haiku-5-5`
(0,10 $ / 0,50 $ par million de jetons), au prix d'une rédaction moins fine.

## 6. Déploiement

Rien n'a été déployé. La branche n'est pas fusionnée. La procédure détaillée et vérifiée est dans [AI_GROWTH_LAUNCH_CHECKLIST.md](AI_GROWTH_LAUNCH_CHECKLIST.md).

1. **Relire et fusionner** la branche dans `master`. Le workflow de déploiement lance la CI, construit l'image, sauvegarde la base, puis applique
   la migration `20261103222021_growth_prospection` au démarrage. Cette migration ne fait qu'ajouter des tables, des types et une colonne
   `Garage.acquisitionSource` avec valeur par défaut ; elle reste compatible avec un retour arrière (vérifié en CI).
2. **Variables d'environnement** du service `app` sur le VPS (`/var/www/garageflow`). Si le `docker-compose.yml` de production liste les
   variables une par une, ajoutez-les aussi dans son bloc `environment:` :
   - obligatoires avant tout envoi : `OUTREACH_SENDER_NAME`, `OUTREACH_SENDER_COMPANY` (raison sociale), `OUTREACH_SENDER_ADDRESS` (adresse
     postale) ;
   - recommandées : `GROWTH_REPORT_TO` (votre email), `GROWTH_CRON_SECRET` (`openssl rand -hex 32`), `OUTREACH_REPLY_TO` ;
   - facultatives : `ANTHROPIC_API_KEY` (puis cocher « Rédaction assistée » dans la console), `OUTREACH_SEND_ENABLED=true`, `OUTREACH_FROM`,
     `GROWTH_DISCOVERY_ZONES`, `GROWTH_KILL_SWITCH`.
3. **Compléter les pages légales** (raison sociale, adresse, hébergeur) et vérifier que `contact@garageflow.fr` reçoit bien les messages.
4. **Premier essai à la main** dans `/admin/croissance` : « Simuler » la découverte, lire les compteurs, puis « Exécuter ». Ouvrir quelques fiches
   et vérifier les liens vers annuaire-entreprises.
5. **Tâches planifiées** : un petit script lit le secret dans un fichier lisible par le seul propriétaire, puis une ligne de crontab par tâche.

   ```sh
   # /usr/local/bin/garageflow-growth (chmod 700) ; secret dans /etc/garageflow-growth.secret (chmod 600)
   #!/bin/sh
   set -eu
   # Appel direct du conteneur (port local du script de déploiement) : pas de délai du proxy web.
   curl -fsS --max-time 600 -X POST -H "Authorization: Bearer $(cat /etc/garageflow-growth.secret)" \
     "http://127.0.0.1:3031/api/growth/cron?job=$1"
   ```

   ```cron
   # Heures UTC. Découverte le lundi, préparation quotidienne, rapport le lundi matin.
   17 5 * * 1   /usr/local/bin/garageflow-growth discovery
   37 5 * * *   /usr/local/bin/garageflow-growth enrich
   47 5 * * *   /usr/local/bin/garageflow-growth score
   57 5 * * *   /usr/local/bin/garageflow-growth drafts
   13 7 * * 1   /usr/local/bin/garageflow-growth weekly-report
   ```

6. **Routine conseillée** : chaque matin, ouvrir la file de relecture, compléter les emails des meilleurs prospects depuis leur site (avec la page
   source), approuver puis envoyer 5 à 10 messages. Consigner chaque réponse. Le rapport du lundi récapitule le tout.

## 7. Limites connues

- Les connecteurs SIRENE et site web suivent le format documenté et sont testés sur des réponses fictives. Ils n'ont pas été exécutés contre les
  services réels, faute d'accès réseau depuis le développement.
- SIRENE ne publie ni email ni téléphone. La plupart des prospects demanderont une recherche manuelle (site du garage, fiche Google), à saisir
  avec sa source. C'est voulu : aucune coordonnée n'est devinée.
- Protection SSRF : l'adresse est revérifiée au moment de la connexion (corrigé après la revue, voir la liste de lancement).
- La limite de débit est en mémoire (une instance), comme le reste de l'application.
- Les réponses aux messages ne sont pas lues automatiquement : vous les consignez dans la fiche.
- La conservation de 3 ans est annoncée dans la politique de confidentialité. Le rapport hebdomadaire compte les fiches à effacer et la fiche
  propose « Effacer ce prospect » ; l'effacement n'est pas automatique.
- Le rapport hebdomadaire et la notification de démo nécessitent `MAIL_TRANSPORT=smtp` en production.
