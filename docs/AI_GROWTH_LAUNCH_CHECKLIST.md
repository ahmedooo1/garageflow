# GarageFlow : liste de lancement du moteur de prospection

Branche `claude/remote-control-bkgpep`, état au 4 novembre 2026. Seul le correctif de sécurité `/admin` est en production (`0fa7a7e`).
La prospection n'a été ni fusionnée, ni déployée, et aucun message n'a été envoyé.

**Légende**
- **PASS** : vérifié par une exécution réelle, décrite dans la colonne « Preuve ».
- **FAIL** : vérifié et non conforme, ou bloquant tant que l'action indiquée n'est pas faite.
- **UNVERIFIED** : impossible à vérifier depuis l'environnement de développement (réseau, accès serveur, avis juridique). C'est une hypothèse,
  avec la commande ou la question qui permet de trancher.

Le poste de développement n'accède ni à `garageflow.aaweb.fr` ni à l'API SIRENE (refus de la politique réseau). Ces deux contrôles passent
donc par des runners GitHub, en lecture seule et sans secret : workflows « Vérification des accès (production) » et « Validation SIRENE ».

## 0. Fuite de données sur /admin : corrigée en production

| Élément | Statut | Preuve |
| --- | --- | --- |
| Faille sur l'ancien `master` (`e2dcf1f`) | Corrigée | Le corps de la redirection 307 et la charge RSC de `/admin` contenaient la page entière (revenu mensuel, garages, emails). |
| Correctif en production | **PASS** | PR [ahmedooo1/garageflow#1](https://github.com/ahmedooo1/garageflow/pull/1), commit `0fa7a7e`, déployé le 4 novembre à 01:42 UTC (run 41754677511) : CI et E2E verts, image attestée, sauvegarde `avant-0fa7a7e….dump`, « succès » journalisé par le VPS, `/` et `/login` à 200. |
| Bilan de santé sur le nouveau conteneur | **PASS** | `deploy/garageflow-deploy.sh` recrée le conteneur avec le nouveau tag, puis attend `/` et `/login` sur `127.0.0.1:3031`. La connexion refusée à 01:42:50, suivie du succès à 01:42:53, correspond au démarrage du nouveau conteneur. Limite : le script ne compare pas la version servie au SHA attendu. La preuve vient de la ligne suivante. |
| Visiteur anonyme, site en ligne | **PASS** | Run 41759869138 : **24/24** contrôles (`/admin`, `/admin?q=`, 9 pages `/app`, en document et en RSC, sans suivre les redirections ; `/api/export` 401, `/api/upload` 403, `/api/files` 403, webhook Stripe 400). Sur l'ancien code, le même script relevait 8 fuites : c'est donc bien le correctif qui est servi. |
| Compte garage sans rôle plateforme, site en ligne | **UNVERIFIED** | Aucun compte de test. Couvert en CI (E2E et intégration, y compris l'accès d'un garage aux données d'un autre). Pour le vérifier en ligne : créer un compte garage de test, puis mettre `GF_TEST_GARAGE_EMAIL` et `GF_TEST_GARAGE_PASSWORD` dans l'environnement GitHub `verification-acces` et relancer le workflow. |
| Administrateur plateforme, `/admin` utilisable | **UNVERIFIED** | Même procédure avec `GF_ADMIN_EMAIL` et `GF_ADMIN_PASSWORD`, ou vérification manuelle dans le navigateur. Le workflow masque le cookie, ne l'écrit que dans un fichier du runner et ferme la session à la fin (vérifié en local : aucune session de connexion restante). |
| Couche de données de la prospection | **PASS** | Même règle étendue (`e253851`) : lecture des fiches, brouillons, exclusions et exécutions, et chaque modification depuis la console, exigent un administrateur actif relu en base. Le test échoue si le contrôle est retiré. |

## 1. Qualité et tests

| Élément | Statut | Preuve |
| --- | --- | --- |
| Tests unitaires et d'intégration (base PostgreSQL réelle) | **PASS** | `pnpm test` : **18 fichiers, 152 tests passés, 0 échec**, après fusion du correctif de sécurité. |
| Tests de bout en bout (Playwright) | **PASS** | `pnpm exec playwright test` : **19/19 passés** (dont les 5 tests d'accès du correctif). |
| Lint, typecheck, build | **PASS** | `pnpm lint`, `pnpm typecheck` et `pnpm build` sans erreur. |
| Défauts trouvés par la revue, corrigés et couverts par un test | **PASS** | Fuite `/admin` ; DNS rebinding ; groupes robots.txt mal lus ; désinscription limitée à l'adresse courante ; doublons entre sources ; client résilié remis « en essai » ; abonnement Stripe `incomplete` qui bloquait l'essai ; prix codés en dur. Chaque test a échoué avant correction, ou couvre un cas qui n'était pas testé. |

## 2. Base de données et migration

| Élément | Statut | Preuve |
| --- | --- | --- |
| Migration additive (tables, types, une colonne avec défaut) | **PASS** | `node scripts/verifier-migrations.mjs` : « Migrations compatibles avec un retour arrière ». |
| Aucun écart entre la migration et `schema.prisma` | **PASS** | `prisma migrate diff --from-url <base migrée> --to-schema-datamodel prisma/schema.prisma --exit-code` : « No difference detected ». |
| Retour arrière : l'ancienne version (`e2dcf1f`) sur le nouveau schéma | **PASS** | Sur une base migrée puis remplie (seed) : `prisma migrate deploy` de l'ancienne image (sa commande de démarrage) se termine sans erreur, sur le code de sortie 0 ; ses **60 tests passent** ; son build répond 200 sur `/`, `/login`, `/register` et `/cgu`. |
| Durée de la migration en production | **UNVERIFIED** | Création de tables vides et `ADD COLUMN … DEFAULT ''` sur `Garage` (instantané sous PostgreSQL 11 et plus). Version de PostgreSQL de production non vue : le script de déploiement utilise `docker compose exec db`, l'image `postgres:16-alpine` est une hypothèse. |
| Sauvegarde avant bascule | **PASS** (script) | `deploy/garageflow-deploy.sh` fait un `pg_dump -Fc` avant chaque bascule et refuse de continuer s'il échoue. Non observé en production. |

## 3. Sécurité

| Élément | Statut | Preuve |
| --- | --- | --- |
| Pages `/admin` (garages, prospects, croissance) | **PASS** | Voir section 0 ; vérifié avec un vrai navigateur et en lisant le corps brut des réponses. |
| Actions serveur de prospection réservées à `platformAdmin` | **PASS** | `tests/integration/growth-access.test.ts` : 10 actions refusées à un gérant de garage et sans session, aucune écriture. |
| Export CSV des prospects | **PASS** | E2E : 403 pour un compte garage. Cellules protégées contre l'injection de formules ; chaque export est journalisé. |
| Isolation des garages (existant) | **PASS** | `tenant-isolation.test.ts` et E2E « un garage ne voit pas les dossiers d'un autre » passent. Les tables de prospection n'ont aucun lien vers les données métier des garages. |
| Déclencheur `/api/growth/cron` | **PASS** | `growth-cron.test.ts` : 404 sans secret ou avec un secret de moins de 32 caractères ; 401 si le jeton est absent ou faux, sans rien exécuter ; 400 pour une tâche inconnue ; une seule exécution par période. |
| Prospection autonome sans envoi | **PASS** | `growth-autonomy.test.ts` : les cinq tâches, chaque jour pendant 14 jours simulés, **avec l'envoi activé** (`OUTREACH_SEND_ENABLED=true`). Des brouillons sont prêts à relire et le rapport interne part, mais aucun message n'est approuvé ni envoyé à un prospect. Seule l'action « Envoyer » de la console, sur un brouillon approuvé par un administrateur, envoie. |
| SSRF lors de la vérification des sites | **PASS** (pile locale) | `website-connector.test.ts`, sur de vraies sockets : `localhost` refusé ; nom public qui se résout en adresse interne **au moment de la connexion** refusé ; redirection vers une IP interne refusée ; ports non standards et identifiants dans l'URL refusés ; certificat TLS auto-signé refusé. |
| SSRF sur l'Internet réel | **UNVERIFIED** | Aucun accès réseau depuis le développement. Le code est le même ; à observer lors du premier essai réel (section 9.4). |
| Injection de consignes depuis un site web | **PASS** | Par construction : le texte d'un site n'est ni stocké ni transmis au modèle. Seuls des booléens et des adresses `mailto:` ou `tel:` en sont extraits (test : une consigne cachée dans la page n'a aucun effet). |
| Budget de la rédaction assistée | **PASS** | Tests : sans clé, aucun appel et repli sur le modèle de message ; au-delà du budget, aucun appel. Le plafond est calculé sur le pire cas avant chaque appel. Des appels lancés en même temps peuvent dépasser le budget d'un appel chacun (environ 9 centimes) ; c'est accepté. |
| Appel réel à l'API Claude | **UNVERIFIED** | Pas de clé dans cet environnement. Paramètres conformes au SDK `@anthropic-ai/sdk` 1.4.0 (typecheck), avec le repli serveur `fallbacks: "default"`. À tester avec un seul brouillon après avoir mis la clé. |
| Limitation de débit derrière nginx | **UNVERIFIED** | Préexistant : l'IP est lue dans le premier élément de `X-Forwarded-For`. Si nginx **ajoute** l'IP à un en-tête fourni par le client au lieu de le remplacer, ces limites se contournent (connexion, inscription, démo). À vérifier : `grep -n "X-Forwarded-For\|X-Real-IP" /etc/nginx/sites-enabled/*`. |
| Attribution des inscriptions | Limite connue | L'email n'est pas vérifié à l'inscription : quelqu'un pourrait s'inscrire avec l'email d'un prospect pour le faire passer « en essai ». Sans fuite de données ; l'erreur serait visible dans l'historique de la fiche. |

## 4. Connecteur SIRENE

| Élément | Statut | Preuve |
| --- | --- | --- |
| Réponse réelle de l'API | **PASS** | Workflow « Validation SIRENE », run 41761169576 (4 novembre) : statut 200, `missingFields: []` dans les quatre zones. |
| Hypothèses de format | **PASS** | Plusieurs codes postaux séparés par des virgules acceptés (`horsZone: 0` partout) ; `activite_principale=45.20A` et `etat_administratif=A` acceptés ; `per_page=25` accepté ; tous les champs lus présents (`siret`, `code_postal`, `activite_principale`, `etat_administratif`, `liste_enseignes`, `tranche_effectif_salarie`…). |
| Volume | **PASS** | Établissements 45.20A actifs : Elbeuf 109, Rouen 128, métropole de Rouen 260, Le Havre 184. Une page de 25 entreprises donne 15 à 23 établissements retenus. La découverte reste plafonnée à 100 fiches par zone et par exécution. |
| Pertinence de la cible | **PASS** (corrigé) | Constat sur les vraies réponses : le code 45.20A regroupe aussi le lavage (Elephant Bleu, car wash), le nettoyage, le vitrage (pare-brise) et des chaînes de 12 à 52 établissements. C'était la majorité des échantillons. Ces entreprises ne sont plus enregistrées du tout (motifs `horsCible` et `reseau`), et sont disqualifiées si elles arrivent par import ou saisie. Test sur les noms réellement relevés. Contrôle sur l'API réelle après correctif (run 41762160999) : `horsCible` 6, 8, 5 et 6, `reseau` 0, 0, 1 et 0 (Elbeuf, Rouen, métropole, Le Havre) ; les échantillons sont des garages et carrosseries. Bruit résiduel, laissé à la relecture humaine : noms peu explicites (« Lavauplex »), entrepreneurs individuels sous leur propre nom (voir section 6). |
| Détection d'un changement de format | **PASS** | Un champ attendu absent apparaît dans `missingFields`, et la découverte n'importe rien à l'aveugle. Le workflow échoue dans ce cas : à relancer avant d'activer la planification, puis après tout changement du connecteur (il se relance seul à chaque modification de ces fichiers). |
| Essai sans écriture | **PASS** | `pnpm exec tsx scripts/sirene-dry-run.ts --raw elbeuf 1` : ni base, ni écriture. |

## 5. Connecteur « site web »

| Élément | Statut | Preuve |
| --- | --- | --- |
| robots.txt (RFC 9309) | **PASS** | Groupes à plusieurs agents, groupe propre à notre agent prioritaire, règle la plus longue, `Allow` gagnant à égalité, motifs `*` et `$`. 404 : exploration autorisée ; 5xx ou erreur réseau : on s'abstient. |
| Redirections | **PASS** | Trois redirections au plus, chacune revérifiée ; URL finale gardée comme source ; boucle abandonnée. |
| Délais | **PASS** | Un serveur muet est abandonné en moins de 5 s en test (8 s en production). |
| Taille | **PASS** | Page de 4 Mo : seuls les 512 premiers Ko sont lus. |
| Contenu non HTML | **PASS** | Un PDF est ignoré. |
| Agent identifié | **PASS** | `GarageFlow-prospection/1.0 (+<APP_URL>/confidentialite#prospection)`. |
| Comportement sur de vrais sites de garages | **UNVERIFIED** | À observer sur 5 sites au premier essai (section 9.4). |

## 6. RGPD et CNIL

Ce qui est en place a été testé. Ce qui relève d'une décision juridique est marqué **UNVERIFIED** : à confirmer par un juriste ou par vous.

| Élément | Statut | Preuve ou question |
| --- | --- | --- |
| Information à la première communication (art. 14) : identité, source des données, droits, opposition | **PASS** | Pied de message ajouté par le code ; tests sur le contenu. |
| Opposition en un clic, définitive | **PASS** | Tests : désinscription idempotente qui exclut toutes les adresses écrites ; garage retrouvé plus tard dans SIRENE non recréé. L'ouverture du lien ne modifie rien : il faut confirmer d'un bouton, car les antivirus de messagerie ouvrent les liens. |
| Droit à l'effacement | **PASS** | « Effacer ce prospect » : la fiche, l'historique et les brouillons sont supprimés ; l'email et le SIRET restent en opposition ; le journal ne contient aucune donnée personnelle (test). |
| Minimisation | **PASS** | Dirigeants jamais lus ; diffusions restreintes ignorées ; le modèle ne reçoit plus le nom du contact (la formule de politesse est ajoutée par le code). |
| Conservation de 3 ans | **PASS** (comptage) | Le rapport hebdomadaire compte les fiches arrivées au terme ; l'effacement reste manuel (décision volontaire : aucune suppression automatique de données de production). |
| Mesure d'audience sans cookie ni IP | **PASS** (technique) | Aucun cookie, aucun stockage local, aucune IP enregistrée ; DNT et GPC respectés. Le dispositif n'accède pas au terminal, donc l'article 82 de la loi Informatique et Libertés ne devrait pas s'appliquer : **UNVERIFIED** juridiquement. |
| Base légale : intérêt légitime, prospection B2B par email sans consentement préalable, pour une offre liée à l'activité du destinataire | **UNVERIFIED** | Position de la CNIL pour la prospection entre professionnels. À confirmer pour votre situation. |
| Adresses nominatives d'entrepreneurs individuels (`prenom.nom@…`) | **UNVERIFIED** | La règle B2B s'applique en principe aux adresses professionnelles. À confirmer avec un juriste ; en attendant, privilégier les adresses génériques (`contact@`, `atelier@`). |
| Identité de l'éditeur dans les mentions légales | **FAIL** | Les pages légales n'indiquent ni raison sociale, ni adresse, ni hébergeur (déjà signalé dans le README). C'est requis avant toute prospection. **Je n'ai rien inventé** : à compléter par vous. |
| Registre des traitements (art. 30) | **UNVERIFIED** | Ajouter « prospection commerciale B2B » et « mesure d'audience » à votre registre. |
| Sous-traitants | **UNVERIFIED** | Si la rédaction assistée est activée, Anthropic reçoit des faits sur l'entreprise (nom, ville, effectif). Le nom d'un entrepreneur individuel peut être une donnée personnelle : à mentionner dans la politique de confidentialité, et à vérifier contractuellement. Idem pour le prestataire SMTP. |
| Adresse de contact `contact@garageflow.fr` | **UNVERIFIED** | Le site est servi sur `aaweb.fr`. La possession de `garageflow.fr` et la réception de ce courrier ne sont pas vérifiables d'ici, alors que les messages et la politique de confidentialité y renvoient. |

## 7. Production : domaine, identité, emails, tarifs

| Élément | Statut | Preuve ou commande |
| --- | --- | --- |
| Domaine de production `garageflow.aaweb.fr` | **PASS** (dépôt) | `deploy.yml` vérifie `https://garageflow.aaweb.fr` et `/login` après chaque déploiement. Joignabilité non observée d'ici. |
| `APP_URL` de production en `https://garageflow.aaweb.fr` | **UNVERIFIED** | Indispensable : les liens de désinscription en dépendent. L'approbation d'un message est désormais **refusée** en production si `APP_URL` n'est pas en https. Vérifier : `docker compose exec -T app printenv APP_URL`. |
| `MAIL_TRANSPORT=smtp` en production | **UNVERIFIED** | Le `docker-compose.yml` du dépôt force `MAIL_TRANSPORT: log`. Si celui du serveur en est une copie, **aucun email transactionnel ne part**, y compris les liens de validation envoyés aux clients des garages et la réinitialisation de mot de passe. Vérifier : `docker compose exec -T app printenv MAIL_TRANSPORT`. |
| SPF, DKIM, DMARC du domaine d'envoi | **UNVERIFIED** | Indispensable pour arriver en boîte de réception. Vérifier : `dig +short TXT <domaine>`, `dig +short TXT _dmarc.<domaine>`, `dig +short TXT <sélecteur>._domainkey.<domaine>`. L'en-tête de désinscription en un clic n'est pris en compte que s'il est signé DKIM. |
| Expéditeur qui accepte les réponses | **PASS** (contrôle) | L'envoi SMTP est refusé depuis une adresse no-reply ou sans adresse de réponse. Par défaut, vous envoyez depuis votre propre messagerie. |
| Identité de l'expéditeur (`OUTREACH_SENDER_*`) | **FAIL** | Non définie. L'approbation est bloquée tant que le nom, la raison sociale et l'adresse postale manquent (test). Le SIREN est facultatif (`OUTREACH_SENDER_SIREN`). |
| Prix cohérents partout | **PASS** | 59 € HT et 129 € HT, essai de 14 jours : une seule source (`src/lib/plans.ts`) pour l'accueil, la console, les modèles de message et la consigne de rédaction assistée (les valeurs codées en dur ont été retirées). |
| TVA dans Stripe Checkout | **UNVERIFIED** (décision) | Le code ne configure aucune taxe (`automatic_tax` ou taux de TVA). Le client paie exactement le montant du prix Stripe. Si le prix Stripe vaut 59,00 € et que vous facturez la TVA, vous encaissez 59 € TTC, soit 49,17 € HT, alors que le site annonce « 59 € HT ». À décider : prix TTC de 70,80 €, taux de TVA 20 % en mode exclusif, ou franchise en base (« TVA non applicable, art. 293 B du CGI » sur la facture). |
| Mention « à l'atelier » | **UNVERIFIED** | L'accueil et les modèles proposent une démo « en visio ou à l'atelier ». À retirer si vous ne vous déplacez pas. |

### 7.1 Variables d'environnement du service `app`

Liste exhaustive des variables lues par la prospection (relevée dans le code). Les autres variables de l'application ne changent pas.

| Variable | Obligatoire | Valeur ou règle | Effet si absente |
| --- | --- | --- | --- |
| `APP_URL` | Oui | `https://garageflow.aaweb.fr` | Liens de désinscription faux ; l'approbation est refusée hors https. |
| `GROWTH_CRON_SECRET` | Pour la planification | 64 caractères hexadécimaux (`openssl rand -hex 32`) | `/api/growth/cron` répond 404 : aucune tâche planifiée ne tourne. |
| `GROWTH_DISCOVERY_ZONES` | Non | `elbeuf,rouen,rouen-metropole,le-havre` | Toutes les zones connues. Commencer par `elbeuf`. |
| `GROWTH_REPORT_TO` | Recommandé | Votre adresse | Pas de rapport hebdomadaire ni d'alerte de demande de démo. |
| `OUTREACH_SENDER_NAME`, `OUTREACH_SENDER_COMPANY`, `OUTREACH_SENDER_ADDRESS` | Oui, avant toute approbation | Vos données réelles (mentions obligatoires) | L'approbation d'un brouillon est bloquée. |
| `OUTREACH_SENDER_SIREN` | Non | SIREN de l'éditeur | Absent du pied de message. |
| `OUTREACH_REPLY_TO` | Pour l'envoi depuis GarageFlow | Adresse qui lit les réponses | Envoi SMTP refusé. |
| `OUTREACH_SEND_ENABLED` | Non | `false` au lancement | Valeur `true` : le bouton « Envoyer » devient actif, toujours après approbation humaine. Sinon, envoi depuis votre messagerie puis « Marquer comme envoyé ». |
| `OUTREACH_FROM` | Si `OUTREACH_SEND_ENABLED=true` | `Prénom <adresse@domaine>` | Repli sur `MAIL_FROM`. |
| `MAIL_TRANSPORT`, `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASSWORD`, `MAIL_FROM` | Pour le rapport et l'envoi | `smtp` en production | Avec `log`, aucun email ne part, y compris les emails transactionnels existants. |
| `ANTHROPIC_API_KEY` | Non | Plus tard | Rédaction par modèle de message, sans appel externe. |
| `GROWTH_AI_MODEL` | Non | Vide (modèle par défaut du code) | Modèle par défaut. |
| `GROWTH_KILL_SWITCH` | Non | `1` pour tout arrêter | Arrêt d'urgence indépendant de la base : chaque tâche est enregistrée « ignorée ». |

Contrôle sans rien afficher, sur le VPS :

```sh
cd /var/www/garageflow
for v in APP_URL GROWTH_CRON_SECRET GROWTH_REPORT_TO OUTREACH_SENDER_NAME OUTREACH_SENDER_COMPANY OUTREACH_SENDER_ADDRESS MAIL_TRANSPORT; do
  docker compose exec -T app sh -c "[ -n \"\${$v:-}\" ]" && echo "$v définie" || echo "$v ABSENTE"; done
docker compose exec -T app printenv APP_URL MAIL_TRANSPORT GROWTH_DISCOVERY_ZONES OUTREACH_SEND_ENABLED   # valeurs non secrètes
```

## 8. Parcours commercial complet

| Étape | Statut | Preuve |
| --- | --- | --- |
| Découverte → fiche sourcée → qualification | **PASS** | `growth-workflow.test.ts` : simulation sans écriture, puis fiche créée, liée à annuaire-entreprises et qualifiée. |
| Site vérifié → email publié relevé avec sa source → confiance élevée | **PASS** | Même test, sur une vraie pile HTTP locale. |
| Brouillon français préparé par la tâche, sans envoi | **PASS** | Même test : « Bonjour, », identité, désinscription ; étape « à relire ». |
| Approbation humaine → envoi manuel → « contacté » | **PASS** | Même test, plus les tests d'approbation (modification qui annule, double envoi, limite quotidienne, une seule relance). |
| Réponse consignée → démo planifiée | **PASS** | Même test. |
| Inscription depuis le lien → rattachement au prospect et à la campagne | **PASS** | Même test : `garageId` lié, étape « en essai », provenance `prospection`. |
| Activation, puis abonnement → « client » | **PASS** | Même test : premier dossier créé, activation manuelle, synchronisation le lendemain. |
| Indicateurs et rapport hebdomadaire | **PASS** | Même test : entonnoir, messages envoyés, taux de réponse, provenance et texte du rapport. |
| Le même parcours avec SIRENE, des sites et Stripe réels | **UNVERIFIED** | Sections 4, 5 et 9.3. |

## 9. Procédures

### 9.1 Correctif de sécurité seul, vers `master`

Fait : PR [ahmedooo1/garageflow#1](https://github.com/ahmedooo1/garageflow/pull/1), en production depuis le 4 novembre (section 0).
Contrôle à tout moment : workflow « Vérification des accès (production) », lancé depuis l'onglet Actions (bouton « Run workflow » une fois le
fichier sur `master`, ou à chaque modification du fichier sur cette branche).

### 9.2 Avant la fusion de la branche de prospection

Sur le VPS (lecture seule, sauf la sauvegarde manuelle) :

```sh
cd /var/www/garageflow
# Comment l'application reçoit ses variables (liste explicite ou env_file) ?
grep -n "environment:\|env_file\|MAIL_TRANSPORT\|APP_URL" docker-compose.yml
docker compose exec -T app printenv APP_URL MAIL_TRANSPORT MAIL_FROM
# Sauvegarde manuelle en plus de celle du script de déploiement :
docker compose exec -T db pg_dump -U garageflow -Fc garageflow > backups/manuel-avant-croissance-$(date +%F).dump
ls -lh backups | tail -3
df -h /    # le script exige environ 4 Go libres
```

Puis ajouter au service `app` (dans `environment:` si le fichier liste les variables une par une) :

- `OUTREACH_SENDER_NAME`, `OUTREACH_SENDER_COMPANY`, `OUTREACH_SENDER_ADDRESS` (vos données réelles), et `OUTREACH_SENDER_SIREN` si vous le
  souhaitez ;
- `OUTREACH_REPLY_TO`, `GROWTH_REPORT_TO` ;
- `GROWTH_CRON_SECRET` (`umask 077; printf 'GROWTH_CRON_SECRET=%s\n' "$(openssl rand -hex 32)" >> .env`, jamais affiché ; le script
  d'installation de la section 9.5 le reprend de là) ;
- plus tard seulement : `ANTHROPIC_API_KEY`, `OUTREACH_SEND_ENABLED=true` et `OUTREACH_FROM`.

Compléter aussi les mentions légales (raison sociale, adresse, hébergeur) dans `src/app/(marketing)/cgu/page.tsx` et la politique de
confidentialité, puis faire relire.

### 9.3 Déploiement

```sh
# Pull request claude/remote-control-bkgpep → master, relue puis fusionnée.
# Le workflow lance la CI complète (lint, typecheck, tests, build, E2E), construit et atteste l'image,
# puis le VPS sauvegarde la base, démarre la nouvelle image (migration au démarrage), vérifie / et /login,
# et revient seul à l'image précédente si elles ne répondent pas.
```

Contrôles juste après :

```sh
for p in / /login /register /cgu /confidentialite /robots.txt /sitemap.xml; do
  printf "%s %s\n" "$p" "$(curl -s -o /dev/null -w '%{http_code}' https://garageflow.aaweb.fr$p)"; done     # tous 200
curl -s https://garageflow.aaweb.fr/robots.txt | grep "Disallow: /admin/"
curl -s https://garageflow.aaweb.fr/sitemap.xml | grep -o "<loc>https://garageflow.aaweb.fr[^<]*" | wc -l       # 4
curl -s -o /dev/null -w "%{http_code}\n" -X POST "https://garageflow.aaweb.fr/api/growth/cron?job=score"     # 401 (404 sans secret)
for p in /admin /admin/prospects /admin/croissance; do
  curl -s -o /tmp/a.html -w "$p %{http_code} " https://garageflow.aaweb.fr$p; grep -c "Revenu mensuel\|Prospects" /tmp/a.html; done  # 307, puis 0
# Sur le VPS :
docker compose exec -T db psql -U garageflow -d garageflow -c \
  "select migration_name, finished_at from _prisma_migrations order by finished_at desc limit 3;"
tail -n 20 deploy.log
```

Puis, dans le navigateur, avec votre compte plateforme :

1. `/admin/croissance`, carte « Configuration du serveur » : `APP_URL` en `https://garageflow.aaweb.fr`, `MAIL_TRANSPORT` en `smtp`, domaine
   d'envoi attendu.
2. Remplir le formulaire de démo de l'accueil avec votre propre adresse : la fiche apparaît dans `/admin/prospects`, et la notification arrive
   sur `GROWTH_REPORT_TO`.
3. Ouvrir `/desinscription/<jeton>` depuis un brouillon de test : la page s'affiche sans rien modifier.

### 9.4 Essai à blanc en production, puis premier essai réel, sans envoi

Après le déploiement de la prospection (accord explicite requis), sur le VPS :

```sh
cd /chemin/vers/une/copie/du/depot && git pull
sudo sh deploy/croissance/installer.sh          # installe et vérifie, sans rien planifier
sudo -u garageflow-growth garageflow-growth discovery --dry-run | head -c 4000
```

Attendu pour chaque zone de `GROWTH_DISCOVERY_ZONES` : `missingFields: []`, des `horsCible` et `reseau` non nuls, et un échantillon de vrais
garages, sans lavage ni chaîne. La simulation n'écrit qu'une ligne d'exécution. Puis :

1. Console, `/admin/croissance` : la simulation apparaît dans « Exécutions récentes ».
2. Découverte réelle, une seule zone (`GROWTH_DISCOVERY_ZONES=elbeuf`) : `sudo -u garageflow-growth garageflow-growth discovery`. Ouvrir
   trois fiches et comparer chaque fait à la fiche annuaire.
3. Renseigner le site de cinq garages, puis « Vérifier le site maintenant » : contrôler les signaux et l'email relevé.
4. `sudo -u garageflow-growth garageflow-growth score`, puis `drafts`, et relire les brouillons. N'approuver qu'après validation des mentions
   légales (section 6).

### 9.5 Fonctionnement continu (systemd)

Fichiers dans `deploy/croissance/` : le script `garageflow-growth`, l'unité `garageflow-growth@.service` et cinq minuteries.

| Tâche | Quand (UTC) | Effet |
| --- | --- | --- |
| `discovery` | lundi 05:17 | Nouvelles fiches SIRENE, 100 par zone au plus |
| `enrich` | chaque jour 05:37 | Vérification des sites renseignés |
| `score` | chaque jour 05:47 | Requalification |
| `drafts` | chaque jour 05:57 | Brouillons à relire, **aucun envoi** |
| `weekly-report` | lundi 07:13 | Rapport interne vers `GROWTH_REPORT_TO` |

```sh
sudo sh deploy/croissance/installer.sh --activer     # après l'essai de la section 9.4
systemctl list-timers 'garageflow-growth-*'
journalctl -u 'garageflow-growth@*' --since today     # compteurs de chaque exécution
sudo sh deploy/croissance/installer.sh --desactiver  # arrêt de la planification
```

Garanties :

- Une exécution manquée (serveur éteint) est rattrapée au redémarrage (`Persistent=true`). Rejouer une tâche dans la même période renvoie
  l'exécution existante. Une exécution bloquée plus de 30 minutes est reprise, trois tentatives au plus.
- Le service tourne sous un compte sans shell, système en lecture seule. Le secret est lu par curl dans un fichier `640` : il n'apparaît ni
  dans `ps` ni dans le journal.
- Un échec (réponse 401, 404 ou 500) marque l'unité en échec : `systemctl --failed`, et la console affiche l'exécution en échec.
- Arrêt d'urgence : case de la console, ou `GROWTH_KILL_SWITCH=1` puis `docker compose up -d --no-deps app`.
- Aucun envoi automatique : seul le bouton « Envoyer » d'un administrateur, sur un brouillon approuvé, envoie (test section 3).

Non vérifié : l'installation elle-même sur le VPS (version de systemd, `runuser`, `docker compose exec`). Le script et les unités ont été
contrôlés en local (syntaxe, calendrier, lecture du secret depuis un fichier, réponse 401 traitée comme un échec).

### 9.6 Retour arrière

- **Automatique** : le script de déploiement relance l'image précédente si `/` ou `/login` ne répondent pas. Le retour arrière sur le nouveau
  schéma a été vérifié (section 2).
- **Manuel**, image seulement, sans toucher à la base :

  ```sh
  cd /var/www/garageflow
  sed -n 's/^GARAGEFLOW_TAG=//p' .env                     # version en ligne
  docker images garageflow --format '{{.Tag}}'            # la précédente est conservée
  sed -i "s/^GARAGEFLOW_TAG=.*/GARAGEFLOW_TAG=<sha précédent>/" .env
  docker compose up -d --no-deps app
  ```

- **Base** : inutile pour cette version, car la migration est additive. Une restauration (`pg_restore --clean` depuis
  `backups/avant-<sha>.dump`) **efface les données écrites depuis** : à ne faire qu'en dernier recours, et après accord explicite.
- Désactiver la prospection sans revenir en arrière : arrêt d'urgence (section 9.5) et `sudo sh deploy/croissance/installer.sh --desactiver`.

### 9.7 Surveillance (sans nouveau service)

| Signal | Où |
| --- | --- |
| Déploiements, bascules et retours arrière | `/var/www/garageflow/deploy.log` |
| Tâches en échec, compteurs, motifs d'exclusion SIRENE | `/admin/croissance`, « Exécutions récentes » ; table `GrowthJobRun` |
| Erreurs applicatives | `docker compose logs --since 24h app \| grep -E "\[growth\]\|\[stripe\]\|\[mail\]\|\[action\]"` |
| Échec d'une tâche planifiée | `systemctl --failed`, `journalctl -u 'garageflow-growth@*'`, et l'exécution en échec dans la console |
| Synthèse hebdomadaire | Rapport du lundi sur `GROWTH_REPORT_TO` |
| Dépense de rédaction assistée | `/admin/croissance`, « Réglages » ; table `AiUsage` |

## 10. Stripe en mode test, sans paiement réel

À faire **en local ou sur une copie**, jamais avec les clés de production. Le webhook est déjà vérifié hors ligne, avec de vrais événements
signés (`stripe-webhook.test.ts`) : activation, changement de plan, impayé, résiliation, abonnement en attente, prix inconnu.

1. Tableau de bord Stripe en **mode test** : créer deux produits mensuels en EUR. Le montant dépend de la décision TVA (section 7). Noter les
   identifiants `price_…`.
2. Fichier `.env` local : `STRIPE_SECRET_KEY=sk_test_…`, `STRIPE_PRICE_ATELIER=price_…`, `STRIPE_PRICE_RESEAU=price_…`.
3. `stripe login`, puis `stripe listen --forward-to localhost:3000/api/stripe/webhook`. Recopier le `whsec_…` affiché dans
   `STRIPE_WEBHOOK_SECRET`. Lancer `pnpm dev`.
4. Créer un garage, puis `/app/abonnement` → Atelier → carte `4242 4242 4242 4242`. Attendu : retour avec `?paiement=succes`, garage en
   `ACTIVE`, plan `ATELIER`, échéance dans un mois, ligne `billing.subscription_updated` dans `AuditLog`.
5. Carte `4000 0025 0000 3155` (3-D Secure) : abandonner l'authentification. Attendu : le garage reste en essai (correctif de cette revue).
6. Portail Stripe : passer au plan Réseau (attendu : plan `RESEAU`), puis résilier en fin de période (attendu : `cancelAtPeriodEnd` vrai).
7. `stripe trigger invoice.payment_failed`, ou la carte `4000 0000 0000 0341` sur un abonnement : attendu `PAST_DUE`, écriture toujours
   possible jusqu'à l'échéance.
8. Dans le tableau de bord, annuler l'abonnement : attendu `CANCELED`, écriture bloquée, lecture et export toujours possibles.
9. `/admin/croissance` : le revenu mensuel et les compteurs suivent chaque étape.
10. En production, plus tard : webhook déclaré dans le tableau de bord vers `https://garageflow.aaweb.fr/api/stripe/webhook`, avec les
    événements `checkout.session.completed` et `customer.subscription.created`, `updated` et `deleted`.

Tant que ce plan n'a pas été exécuté, l'activation manuelle depuis `/admin`, avec une facture émise à part, reste la voie sûre pour les cinq
premiers clients.

## 11. Coûts mensuels

| Poste | Coût | Statut |
| --- | --- | --- |
| API SIRENE, vérification des sites, tâches planifiées (systemd du VPS) | 0 € | **PASS** (aucun service ajouté) |
| Envoi depuis votre messagerie | 0 € | **PASS** (mode par défaut) |
| Rédaction assistée | 0 € si désactivée ; sinon plafonnée par le budget de la console (10 $ par défaut) | **PASS** (plafond testé) ; coût réel **UNVERIFIED** (aucun appel réel) |
| Stripe | Commission par paiement, aucun abonnement | Hors de ce dépôt |
