# GarageFlow

Gestion d'atelier pour garages automobiles indépendants : du client à la restitution, avec validation des travaux par le client via un lien sécurisé.

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
| Tests          | Vitest (unitaires + intégration sur base réelle), Playwright (E2E)    |

## Démarrage rapide

Prérequis : Node.js ≥ 20.9 (LTS 20/22/24 ; Node 23 est refusé par Prisma 7 mais accepté par Prisma 6 utilisé ici), pnpm ≥ 10, PostgreSQL local ou Docker.

```bash
pnpm install
cp .env.example .env            # puis renseigner APP_SECRET (openssl rand -hex 32)
docker compose up -d db          # PostgreSQL (optionnel : MinIO avec --profile s3)
pnpm db:migrate                  # applique les migrations
pnpm db:seed                     # données démo « Garage Normandie Auto »
pnpm dev                         # http://localhost:3000
```

Comptes démo (mot de passe commun `Demo1234!Garage`) :

| Rôle       | Email                        |
| ---------- | ---------------------------- |
| Gérant     | philippe@normandie-auto.fr   |
| Réception  | claire@normandie-auto.fr     |
| Technicien | karim@normandie-auto.fr      |
| Technicien | julien@normandie-auto.fr     |

Le seed crée 6 clients, 9 véhicules et 8 dossiers répartis sur les statuts (réceptionné, attente client, attente pièces, en réparation, contrôle final, prêt, clôturé, annulé), avec photos, constats, checklist, estimations et décisions client.

## Scripts

| Commande                | Rôle                                                    |
| ----------------------- | ------------------------------------------------------- |
| `pnpm dev`              | serveur de développement                                |
| `pnpm build` / `start`  | build et serveur de production (le client Prisma est généré au `postinstall`) |
| `pnpm lint`             | ESLint (config Next + React Compiler rules)             |
| `pnpm typecheck`        | `tsc --noEmit`                                          |
| `pnpm test`             | Vitest : unitaires + intégration (base `garageflow_test`)|
| `pnpm test:e2e`         | Playwright : scénario complet (lance `next dev` si besoin)|
| `pnpm db:migrate`       | `prisma migrate dev`                                    |
| `pnpm db:deploy`        | `prisma migrate deploy` (production)                    |
| `pnpm db:seed`          | données de démonstration                                |
| `pnpm db:reset`         | réinitialise la base (dev)                              |

### Tests

Les tests d'intégration utilisent une base dédiée définie dans `.env.test` (`garageflow_test`), réinitialisée à chaque exécution par `prisma migrate reset`. Créez-la une fois :

```bash
psql -h localhost -U postgres -c "CREATE DATABASE garageflow_test;"
pnpm test
```

Le test E2E (`e2e/workflow.spec.ts`) déroule le scénario complet : création du garage, Jean Martin, Peugeot 308, réception, photos, diagnostic, plaquettes à 175 € et vidange à 110 €, envoi du lien, acceptation/refus par le client dans un contexte navigateur séparé, réparation, contrôle final, véhicule prêt, restitution, clôture et historique.

```bash
pnpm exec playwright install chromium   # une fois
pnpm test:e2e
```

## Architecture

```
prisma/schema.prisma          modèle de données (tout est rattaché à un Garage)
prisma/seed.ts                données démo (passe par les services, donc timeline cohérente)
src/lib/                      code partagé pur : machine d'état, prix (Decimal), libellés, RBAC
src/server/db.ts              client Prisma
src/server/context.ts         Ctx { garageId, userId, role } + assertPermission / requireCtx
src/server/auth/session.ts    sessions (cookie → hash → DB), création / destruction
src/server/lib/               erreurs, crypto (tokens, HMAC), rate limiting, stockage, validation zod
src/server/services/          logique métier ; chaque requête filtre par garageId
src/server/actions/           server actions (parse FormData → service → revalidate/redirect)
src/app/(auth)/               login, inscription, mot de passe oublié / réinitialisation
src/app/app/                  application (layout protégé) : atelier, dossiers, clients, véhicules, équipe, paramètres
src/app/validation/[token]    portail client public (sans compte)
src/app/api/upload            upload multipart (origine vérifiée, MIME, taille, sharp)
src/app/api/files/[...key]    service des fichiers locaux via URL signée HMAC + expiration
src/proxy.ts                  redirection optimiste vers /login + en-têtes de sécurité
tests/                        unitaires (state machine, prix, RBAC) et intégration (auth, tenant, validation, permissions, workflow)
e2e/                          Playwright
```

### Machine d'état

Définie dans `src/lib/state-machine.ts` et appliquée dans les services (`assertTransition`). Les transitions manuelles passent par des actions nommées ; les transitions système (envoi d'estimation, décision client, restitution) sont réalisées par les services concernés dans une transaction avec l'événement de timeline correspondant.

`ARRIVED → WAITING_DIAGNOSIS → DIAGNOSIS_IN_PROGRESS → WAITING_CUSTOMER_APPROVAL → APPROVED | PARTIALLY_APPROVED → (WAITING_PARTS) → REPAIR_IN_PROGRESS → QUALITY_CONTROL → READY_FOR_PICKUP → DELIVERED → CLOSED`, plus `CANCELLED` depuis les états antérieurs à la réparation.

### Validation client

1. Le garage envoie l'estimation : elle passe en `SENT` (verrouillée), un jeton de 256 bits est généré, seul son hash SHA-256 est stocké, avec une expiration (`APPROVAL_LINK_TTL_HOURS`).
2. Le client ouvre `/validation/<jeton>` sans compte, autorise ou refuse chaque ligne.
3. La décision est enregistrée en transaction avec verrou optimiste (`UPDATE … WHERE status = 'SENT'`) : lignes acceptées/refusées, montants, horodatage, IP, snapshot JSON. L'estimation passe en `DECIDED` et devient immuable ; toute nouvelle soumission est rejetée (409).
4. Pour modifier une proposition, le garage crée une nouvelle version (`reviseEstimate`) : l'ancienne reste consultable, ses liens sont révoqués.

### Sécurité

- Sessions serveur, cookie `httpOnly` `SameSite=Lax` (`Secure` en production), mot de passe bcrypt (coût 12), comparaison à temps constant même pour un email inconnu.
- RBAC : `OWNER`, `RECEPTION`, `TECHNICIAN` (voir `src/lib/rbac.ts`), vérifié dans chaque service.
- Isolation multi-tenant : toutes les requêtes incluent `garageId` ; tests d'IDOR croisés dans `tests/integration/tenant-isolation.test.ts`.
- Validation zod de toutes les entrées ; rendu React (échappement XSS) ; Server Actions protégées par la vérification d'origine intégrée à Next ; route d'upload avec vérification `Origin`.
- Rate limiting en mémoire sur connexion, inscription, réinitialisation, portail client et uploads (à remplacer par un store partagé en multi-instances).
- Uploads : 10 Mo max, type détecté par signature binaire (JPEG/PNG/WebP/AVIF), ré-encodage JPEG par sharp (métadonnées EXIF supprimées), clé de stockage aléatoire, URLs signées expirant en 15 min.
- Aucun secret côté client ; journal d'audit (`AuditLog`) des actions critiques.

## Configuration

Voir `.env.example`. Variables principales :

- `DATABASE_URL`, `APP_URL` (utilisée pour construire les liens client), `APP_SECRET` (≥ 32 caractères), `APPROVAL_LINK_TTL_HOURS`.
- Stockage : `STORAGE_DRIVER=local|s3`, `STORAGE_LOCAL_DIR`, `S3_*`.
- `MAIL_TRANSPORT=log` : les emails (réinitialisation de mot de passe) sont écrits dans les logs serveur.

## Docker

```bash
docker compose up -d db                 # PostgreSQL seul
docker compose --profile s3 up -d       # + MinIO (S3-compatible) sur :9000 / console :9001
docker compose --profile app up --build # + application (build multi-étapes, migrations au démarrage)
```

## Limitations connues

- Le lien de validation est affiché au garage pour transmission manuelle (SMS/email) : pas d'envoi automatique.
- Le transport email est un journal (`MAIL_TRANSPORT=log`) ; brancher un SMTP pour la production.
- Le rate limiting est en mémoire (une instance).
- Pas de mode hors ligne : la PWA est installable mais nécessite le réseau.
- Pas de facturation / paiement : GarageFlow s'arrête au montant accepté et à la restitution.
