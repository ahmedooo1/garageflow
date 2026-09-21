# GarageFlow

Logiciel d'atelier en SaaS pour garages automobiles indépendants : du client à la restitution, avec validation des travaux par le client via un lien sécurisé.

**Parcours couvert** : Client → Véhicule → Réception → État & photos → Diagnostic → Travaux proposés → Validation client (sans compte) → Réparation → Contrôle final → Véhicule prêt → Restitution → Clôture → Historique.

Aucune intelligence artificielle n'est utilisée : le diagnostic est saisi par le technicien.

## Stack

| Couche         | Choix                                                                 |
| -------------- | --------------------------------------------------------------------- |
| Framework      | Next.js 16 (App Router, Server Actions, Turbopack), React 19          |
| Langage        | TypeScript strict                                                     |
| Base           | PostgreSQL 14+ via Prisma 6 (montants en `Decimal(10,2)`)             |
| UI             | Tailwind CSS 4, lucide-react ; PWA installable (manifest + icônes)    |
| Auth           | Sessions serveur (cookie httpOnly, jeton haché SHA-256), bcrypt       |
| Photos         | Upload serveur → validation MIME réelle (`file-type`) → ré-encodage `sharp` → stockage local ou S3-compatible, URLs signées |
| Emails         | `nodemailer` (SMTP) ou journalisation en développement                |
| Facturation    | Stripe Checkout + portail client, ou activation manuelle              |
| Tests          | Vitest (unitaires + intégration sur base réelle), Playwright (E2E)    |

## Démarrage rapide

Prérequis : Node.js ≥ 20.9 (LTS 20/22/24), pnpm ≥ 10, PostgreSQL local ou Docker.

```bash
pnpm install
cp .env.example .env            # puis renseigner APP_SECRET (openssl rand -hex 32)
docker compose up -d db          # PostgreSQL (optionnel : MinIO avec --profile s3)
pnpm db:migrate                  # applique les migrations
pnpm db:seed                     # données démo « Garage Normandie Auto »
pnpm dev                         # http://localhost:3000
```

Comptes démo (mot de passe commun `Demo1234!Garage`) :

| Rôle       | Email                        | Accès                          |
| ---------- | ---------------------------- | ------------------------------ |
| Gérant     | philippe@normandie-auto.fr   | tout + console plateforme `/admin` |
| Réception  | claire@normandie-auto.fr     | clients, dossiers, envois      |
| Technicien | karim@normandie-auto.fr      | diagnostic et réparation       |
| Technicien | julien@normandie-auto.fr     | diagnostic et réparation       |

Le seed crée 6 clients, 9 véhicules et 8 dossiers répartis sur les statuts, avec photos, constats, checklist, estimations et décisions client. Le garage de démonstration est abonné pour 12 mois, afin que l'essai n'expire pas pendant une démonstration.

## Pages publiques

| Route               | Contenu                                                              |
| ------------------- | -------------------------------------------------------------------- |
| `/`                 | Page d'accueil : parcours en 8 étapes, fonctionnalités, portail client, tarifs, FAQ |
| `/cgu`              | Conditions générales d'utilisation et d'abonnement                   |
| `/confidentialite`  | Politique de confidentialité (responsabilités, durées, droits)       |
| `/validation/<jeton>` | Portail client, sans compte                                        |

Les textes juridiques sont rédigés pour un éditeur français et doivent être relus par un juriste avant exploitation commerciale : ils ne mentionnent pas encore la raison sociale, l'adresse ni l'hébergeur retenus.

## Modèle SaaS

### Plans et essai

| Plan    | Prix mensuel HT | Comptes actifs |
| ------- | --------------- | -------------- |
| Atelier | 59 €            | 5              |
| Réseau  | 129 €           | 50             |

Chaque garage créé démarre un essai de 14 jours, sans carte bancaire, avec les limites du plan Atelier. Les définitions sont centralisées dans `src/lib/plans.ts`.

### Blocage à l'échéance

`evaluateAccess()` décide des droits à partir de l'état d'abonnement. Le principe : **la lecture reste toujours ouverte, seule l'écriture est bloquée**, afin qu'un garage garde l'accès à ses données et puisse les exporter.

- Essai en cours → écriture autorisée, rappel à 7 jours puis bandeau rouge à l'expiration.
- Abonnement actif ou impayé dans la période payée → écriture autorisée.
- Essai terminé, période dépassée, résiliation ou suspension → écriture bloquée.

L'application concrète se fait dans `requireCtx()` : toutes les server actions et la route d'upload y passent. Les rares actions qui doivent rester possibles malgré une échéance (souscription, export des données) utilisent `allowExpired: true`.

Le nombre de comptes actifs est vérifié à la création d'un utilisateur et à sa réactivation.

### Console plateforme

`/admin`, réservée aux utilisateurs marqués `platformAdmin`. Elle affiche les garages inscrits, leur abonnement, leur usage agrégé et le revenu mensuel. Actions disponibles : prolonger un essai, activer un plan manuellement, suspendre ou réactiver un compte. Chaque action est journalisée.

Par choix, la console n'expose **aucune donnée métier** des garages : ni clients, ni véhicules, ni dossiers, seulement des compteurs. Un test le vérifie.

### Facturation Stripe

Le parcours d'abonnement est implémenté : création du client Stripe, session Checkout, portail de facturation et webhook signé (`/api/stripe/webhook`) qui synchronise plan, statut et échéance.

> **Non vérifié en conditions réelles.** Ce dépôt ne dispose pas de clés Stripe : le code a été écrit et typé, mais jamais exécuté contre l'API. À tester en mode test Stripe avant mise en production.

Sans les variables `STRIPE_*`, l'application reste pleinement fonctionnelle : la page d'abonnement propose un contact et l'activation se fait depuis la console plateforme.

### Portabilité des données

`GET /api/export` renvoie l'intégralité des données du garage au format JSON (clients, véhicules, dossiers, diagnostics, estimations, décisions, timeline). Réservé au gérant, accessible depuis les paramètres, et **disponible même quand l'abonnement est échu**.

La suppression complète d'un tenant existe côté serveur (`purgeGarage`) et supprime les dépendances dans l'ordre. Elle n'est volontairement pas exposée dans l'interface.

## Scripts

| Commande                | Rôle                                                    |
| ----------------------- | ------------------------------------------------------- |
| `pnpm dev`              | serveur de développement                                |
| `pnpm build` / `start`  | build et serveur de production (client Prisma généré au `postinstall`) |
| `pnpm lint`             | ESLint (config Next + React Compiler rules)             |
| `pnpm typecheck`        | `tsc --noEmit`                                          |
| `pnpm test`             | Vitest : unitaires + intégration (base `garageflow_test`)|
| `pnpm test:e2e`         | Playwright : scénario complet et pages publiques         |
| `pnpm db:migrate`       | `prisma migrate dev`                                    |
| `pnpm db:deploy`        | `prisma migrate deploy` (production)                    |
| `pnpm db:seed`          | données de démonstration                                |
| `pnpm db:reset`         | réinitialise la base (dev)                              |

### Tests

Les tests d'intégration utilisent une base dédiée définie dans `.env.test` (`garageflow_test`), dont les tables sont vidées à chaque exécution. Créez-la une fois :

```bash
psql -h localhost -U postgres -c "CREATE DATABASE garageflow_test;"
pnpm test
```

Couverture : machine d'état, calcul des prix en Decimal, RBAC, droits d'abonnement, authentification, isolation multi-tenant (IDOR croisés), validation client, permissions par rôle, workflow complet, limites de comptes et console plateforme.

Le test E2E (`e2e/workflow.spec.ts`) déroule le scénario complet : création du garage, Jean Martin, Peugeot 308, réception, photos, diagnostic, plaquettes à 175 € et vidange à 110 €, envoi du lien, acceptation/refus par le client dans un contexte navigateur séparé, réparation, contrôle final, véhicule prêt, restitution, clôture et historique. `e2e/marketing.spec.ts` couvre la page d'accueil et les pages légales.

```bash
pnpm exec playwright install chromium   # une fois
pnpm test:e2e
```

## Architecture

```
prisma/schema.prisma          modèle de données (tout est rattaché à un Garage)
prisma/seed.ts                données démo (passe par les services, donc timeline cohérente)
src/lib/                      code partagé pur : machine d'état, prix (Decimal), plans, libellés, RBAC
src/server/db.ts              client Prisma
src/server/context.ts         Ctx { garageId, userId, role } + permissions + droits d'abonnement
src/server/auth/session.ts    sessions (cookie → hash → DB), création / destruction
src/server/lib/               erreurs, crypto (tokens, HMAC), rate limiting, stockage, emails, validation zod
src/server/services/          logique métier ; chaque requête filtre par garageId
src/server/actions/           server actions (parse FormData → service → revalidate/redirect)
src/app/(marketing)/          site public : accueil, CGU, confidentialité
src/app/(auth)/               login, inscription, mot de passe oublié / réinitialisation
src/app/app/                  application (layout protégé) : atelier, dossiers, clients, véhicules, équipe, abonnement, paramètres
src/app/admin/                console plateforme (éditeur)
src/app/validation/[token]    portail client public (sans compte)
src/app/api/upload            upload multipart (origine vérifiée, MIME, taille, sharp)
src/app/api/files/[...key]    service des fichiers locaux via URL signée HMAC + expiration
src/app/api/export            export JSON des données du garage
src/app/api/stripe/webhook    réception des événements Stripe (signature vérifiée)
src/proxy.ts                  redirection optimiste vers /login + en-têtes de sécurité
tests/                        unitaires et intégration
e2e/                          Playwright
```

### Machine d'état

Définie dans `src/lib/state-machine.ts` et appliquée dans les services (`assertTransition`). Les transitions manuelles passent par des actions nommées ; les transitions système (envoi d'estimation, décision client, restitution) sont réalisées par les services concernés dans une transaction avec l'événement de timeline correspondant.

`ARRIVED → WAITING_DIAGNOSIS → DIAGNOSIS_IN_PROGRESS → WAITING_CUSTOMER_APPROVAL → APPROVED | PARTIALLY_APPROVED → (WAITING_PARTS) → REPAIR_IN_PROGRESS → QUALITY_CONTROL → READY_FOR_PICKUP → DELIVERED → CLOSED`, plus `CANCELLED` depuis les états antérieurs à la réparation.

### Validation client

1. Le garage envoie l'estimation : elle passe en `SENT` (verrouillée), un jeton de 256 bits est généré, seul son hash SHA-256 est stocké, avec une expiration (`APPROVAL_LINK_TTL_HOURS`). Si le client a une adresse email, le lien lui est envoyé automatiquement.
2. Le client ouvre `/validation/<jeton>` sans compte, autorise ou refuse chaque ligne.
3. La décision est enregistrée en transaction avec verrou optimiste (`UPDATE … WHERE status = 'SENT'`) : lignes acceptées/refusées, montants, horodatage, IP, snapshot JSON. L'estimation passe en `DECIDED` et devient immuable ; toute nouvelle soumission est rejetée (409).
4. Pour modifier une proposition, le garage crée une nouvelle version (`reviseEstimate`) : l'ancienne reste consultable, ses liens sont révoqués.

### Sécurité

- Sessions serveur, cookie `httpOnly` `SameSite=Lax` (`Secure` en production), mot de passe bcrypt (coût 12), comparaison à temps constant même pour un email inconnu.
- RBAC : `OWNER`, `RECEPTION`, `TECHNICIAN` (voir `src/lib/rbac.ts`), vérifié dans chaque service. L'accès plateforme est un drapeau distinct, hors périmètre du garage.
- Isolation multi-tenant : toutes les requêtes incluent `garageId` ; tests d'IDOR croisés dans `tests/integration/tenant-isolation.test.ts`.
- Validation zod de toutes les entrées ; rendu React (échappement XSS) ; Server Actions protégées par la vérification d'origine intégrée à Next ; route d'upload avec vérification `Origin` ; webhook Stripe à signature vérifiée.
- Rate limiting en mémoire sur connexion, inscription, réinitialisation, portail client et uploads (à remplacer par un store partagé en multi-instances).
- Uploads : 10 Mo max, type détecté par signature binaire (JPEG/PNG/WebP/AVIF), ré-encodage JPEG par sharp (métadonnées EXIF supprimées), clé de stockage aléatoire, URLs signées expirant en 15 min.
- Aucun secret côté client ; journal d'audit (`AuditLog`) des actions critiques, y compris facturation et actions plateforme.

## Configuration

Voir `.env.example`. Variables principales :

- `DATABASE_URL`, `APP_URL` (utilisée pour construire les liens client), `APP_SECRET` (≥ 32 caractères), `APPROVAL_LINK_TTL_HOURS`.
- Stockage : `STORAGE_DRIVER=local|s3`, `STORAGE_LOCAL_DIR`, `S3_*`.
- Emails : `MAIL_TRANSPORT=log|smtp`, `MAIL_FROM`, `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASSWORD`.
- Facturation : `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, `STRIPE_PRICE_ATELIER`, `STRIPE_PRICE_RESEAU`.

## Docker

```bash
docker compose up -d db                 # PostgreSQL seul
docker compose --profile s3 up -d       # + MinIO (S3-compatible) sur :9000 / console :9001
docker compose --profile app up --build # + application (build multi-étapes, migrations au démarrage)
```

## Limitations connues

- **Stripe n'a jamais été exécuté** faute de clés : à valider en mode test avant toute mise en production.
- Pas d'envoi de SMS : le lien de validation part par email quand le client en a une, sinon le garage le transmet lui-même.
- Aucune tâche planifiée : les relances de fin d'essai ne sont pas automatisées, le bandeau dans l'application en tient lieu.
- Le rate limiting est en mémoire, donc limité à une instance.
- Pas de mode hors ligne : la PWA est installable mais nécessite le réseau.
- Pas de facturation comptable : GarageFlow s'arrête au montant accepté et à la restitution, sans édition de facture client.
- Les documents juridiques sont des bases sérieuses mais génériques, à compléter et faire relire.
