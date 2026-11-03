# GarageFlow : liste de lancement du moteur de prospection

Branche `claude/remote-control-bkgpep`, état au 3 novembre 2026. Rien n'a été fusionné, déployé ni envoyé.

**Légende**
- **PASS** : vérifié par une exécution réelle, décrite dans la colonne « Preuve ».
- **FAIL** : vérifié et non conforme, ou bloquant tant que l'action indiquée n'est pas faite.
- **UNVERIFIED** : impossible à vérifier depuis l'environnement de développement (réseau, accès serveur, avis juridique). C'est une hypothèse,
  avec la commande ou la question qui permet de trancher.

Le proxy réseau du développement refuse `recherche-entreprises.api.gouv.fr`, `annuaire-entreprises.data.gouv.fr` et `garageflow.aaweb.fr`
(refus 403 de la politique réseau). Rien n'a donc été observé sur le site en production ni sur l'API SIRENE réelle.

## 0. À faire en premier : fuite de données sur /admin, en production aujourd'hui

| Élément | Statut | Preuve et action |
| --- | --- | --- |
| `/admin` sur `master` (en production) | **FAIL** | Le contrôle du rôle n'est fait que dans le layout ; Next rend la page en parallèle et le **corps de la redirection 307 contient la page entière**. Reproduit en local sur un build de `master` (`e2dcf1f`) : sans être connecté (`curl …/admin`, réponse 307), le corps contient le revenu mensuel et l'email du gérant ; avec n'importe quel compte garage, la liste des garages inscrits (gérants, emails, téléphones). Créer un compte est libre : c'est donc public. |
| Correctif | **PASS** | Commit `5d48d25` : `requirePlatformAdmin()` dans chaque page `/admin`, et `/admin` sans cookie redirigé par le proxy avant tout rendu. Vérifié : test E2E qui lit le corps brut de la redirection (anonyme et compte garage), qui échoue sans le correctif et passe avec. |
| Correctif applicable seul à `master` | **PASS** | Les deux fichiers `src/proxy.ts` et `src/app/admin/page.tsx` ont été appliqués à `master` (`e2dcf1f`) dans une copie de travail : typecheck, lint et build OK, plus aucune fuite (anonyme ou compte garage). Commandes en section 9.1. |

Ce correctif devrait partir avant le reste, indépendamment de la prospection.

## 1. Qualité et tests

| Élément | Statut | Preuve |
| --- | --- | --- |
| Tests unitaires et d'intégration (base PostgreSQL réelle) | **PASS** | `pnpm test` : **16 fichiers, 134 tests passés, 0 échec** (60 tests préexistants inclus). |
| Tests de bout en bout (Playwright, build de production) | **PASS** | `pnpm build && pnpm start`, puis `pnpm exec playwright test` : **14/14 passés**. |
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
| Réponse réelle de l'API | **UNVERIFIED** | Accès refusé par la politique réseau, aussi bien par le proxy que par le service de récupération web. |
| Lecture du format documenté | **PASS** | Tests sur réponses au format documenté : établissements actifs dans la zone seulement, exclusion des diffusions restreintes et des valeurs « [NON-DIFFUSIBLE] », dirigeants jamais lus. |
| Détection d'un changement de format | **PASS** | Un champ attendu absent (`matching_etablissements`, `siret`, `code_postal`…) apparaît dans `missingFields`, et la découverte n'importe rien à l'aveugle. Une réponse sans `results` fait échouer la tâche, visiblement. |
| Essai à blanc sans risque | **PASS** (outil prêt) | `pnpm exec tsx scripts/sirene-dry-run.ts --raw elbeuf 1`, depuis n'importe quel poste connecté : ni base, ni écriture, codes de sortie 1 en cas de dérive. Dans la console, « Simuler » la découverte n'écrit que la ligne d'exécution, avec un échantillon. |

Hypothèses à confirmer lors du premier essai à blanc :

1. `code_postal` accepte plusieurs valeurs séparées par des virgules. Si elle est ignorée, le filtre par zone du code protège l'import, et
   `skipReasons.horsZone` sera élevé.
2. `activite_principale=45.20A` (avec le point) et `etat_administratif=A` sont acceptés.
3. Les champs `matching_etablissements[].siret`, `code_postal`, `activite_principale`, `etat_administratif`, `liste_enseignes` et
   `tranche_effectif_salarie` existent.
4. `per_page=25` est accepté. La limite de 7 requêtes par seconde est respectée (une requête toutes les 400 ms).
5. Le volume attendu : quelques dizaines d'établissements actifs en 45.20A par zone, plafonnés à 100 par zone et par exécution.

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

### 9.1 Correctif de sécurité seul, vers `master` (recommandé en premier)

```sh
git fetch origin
git switch -c hotfix/admin-rbac origin/master
git checkout origin/claude/remote-control-bkgpep -- src/proxy.ts src/app/admin/page.tsx
pnpm install --frozen-lockfile
pnpm lint && pnpm typecheck && pnpm test && pnpm build
git commit -am "Sécurité : rôle plateforme vérifié dans la page /admin"
git push -u origin hotfix/admin-rbac
# Ouvrir une pull request vers master, la relire, fusionner : le workflow Déploiement s'exécute.
```

Vérification après déploiement :

```sh
curl -s -o /tmp/admin.html -w "%{http_code}\n" https://garageflow.aaweb.fr/admin   # 307
grep -c "Revenu mensuel" /tmp/admin.html                                              # 0
```

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
- `GROWTH_CRON_SECRET` (`openssl rand -hex 32`, à recopier dans `/etc/garageflow-growth.secret`, en `chmod 600`) ;
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

### 9.4 Premier essai de prospection, sans envoi

1. Depuis un poste connecté, dans une copie du dépôt : `pnpm exec tsx scripts/sirene-dry-run.ts --raw elbeuf 1`. Attendu : statut 200,
   `missingFields: []`, et des SIRET qui s'ouvrent sur annuaire-entreprises.data.gouv.fr. En cas de champ manquant, **s'arrêter** et me
   transmettre la sortie.
2. Console, « Découverte SIRENE » puis « Simuler » : mêmes vérifications sur l'échantillon.
3. « Exécuter », puis ouvrir trois fiches et comparer chaque fait à la fiche annuaire.
4. Renseigner le site de cinq garages, puis « Vérifier le site maintenant » : contrôler les signaux et l'email relevé.
5. « Préparation des brouillons », puis relire. N'envoyer qu'après validation des mentions légales (section 6).

### 9.5 Planification

```sh
# /usr/local/bin/garageflow-growth (chmod 700)
#!/bin/sh
set -eu
curl -fsS --max-time 600 -X POST -H "Authorization: Bearer $(cat /etc/garageflow-growth.secret)" \
  "http://127.0.0.1:3031/api/growth/cron?job=$1"
```

```cron
# Heures UTC. Appel direct du conteneur (port 3031, celui du script de déploiement) : pas de délai du proxy web.
17 5 * * 1   /usr/local/bin/garageflow-growth discovery
37 5 * * *   /usr/local/bin/garageflow-growth enrich
47 5 * * *   /usr/local/bin/garageflow-growth score
57 5 * * *   /usr/local/bin/garageflow-growth drafts
13 7 * * 1   /usr/local/bin/garageflow-growth weekly-report
```

À activer seulement après l'essai de la section 9.4. Arrêt d'urgence : case de la console, ou `GROWTH_KILL_SWITCH=1` puis
`docker compose up -d --no-deps app`.

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
- Désactiver la prospection sans revenir en arrière : arrêt d'urgence (section 9.5) et retrait des lignes de crontab.

### 9.7 Surveillance (sans nouveau service)

| Signal | Où |
| --- | --- |
| Déploiements, bascules et retours arrière | `/var/www/garageflow/deploy.log` |
| Tâches en échec, compteurs, motifs d'exclusion SIRENE | `/admin/croissance`, « Exécutions récentes » ; table `GrowthJobRun` |
| Erreurs applicatives | `docker compose logs --since 24h app \| grep -E "\[growth\]\|\[stripe\]\|\[mail\]\|\[action\]"` |
| Échec d'une tâche planifiée | Code de sortie de `curl -f` : le cron envoie la sortie par email s'il est configuré pour le faire (`MAILTO`) |
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
| API SIRENE, vérification des sites, tâches planifiées (cron du VPS) | 0 € | **PASS** (aucun service ajouté) |
| Envoi depuis votre messagerie | 0 € | **PASS** (mode par défaut) |
| Rédaction assistée | 0 € si désactivée ; sinon plafonnée par le budget de la console (10 $ par défaut) | **PASS** (plafond testé) ; coût réel **UNVERIFIED** (aucun appel réel) |
| Stripe | Commission par paiement, aucun abonnement | Hors de ce dépôt |
