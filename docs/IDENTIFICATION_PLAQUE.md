# Identification d'un véhicule par son immatriculation

Branche `feature/identification-plaque`, 4 novembre 2026. Rien n'a été acheté, déployé, ni appelé chez un fournisseur payant.

## 1. Ce que fait la fonction

Dans « Nouveau véhicule » (y compris depuis une nouvelle réception), le bouton **Rechercher les caractéristiques** interroge le
fournisseur configuré avec l'immatriculation, et seulement elle. Le résultat s'affiche pour vérification : rien n'est repris dans le
formulaire sans clic sur **Utiliser ces informations**. Tous les champs restent modifiables, et la saisie manuelle fonctionne toujours :

- quand la recherche est désactivée (par défaut) ;
- quand le fournisseur est indisponible, trop lent ou ne connaît pas la plaque ;
- quand la réponse est incomplète (les champs absents sont listés).

Champs récupérés et enregistrés (liste blanche) : marque, modèle, version, VIN, date de mise en circulation, année, carburant (codes de la
carte grise ES, GO, EL, EH, EE, GH, GL, GP, EG…), motorisation, puissance (kW, avec conversion en ch), puissance fiscale, boîte de vitesses.
La fiche du véhicule indique l'origine des caractéristiques (« Recherche par immatriculation (fournisseur) » ou « saisie manuelle ») et leur
date. Cette origine est vérifiée côté serveur : la recherche doit appartenir au garage, porter sur la même plaque et dater de moins de 24 h.

## 2. Garde-fous

| Risque | Mesure | Preuve |
| --- | --- | --- |
| Identité ou adresse du titulaire | L'adaptateur ne recopie que les champs techniques, puis `sanitizeTechnical` reconstruit l'objet à partir de la seule liste blanche. | Tests : une réponse contenant nom, adresse et date de naissance n'en laisse rien, ni dans la réponse, ni en base, ni dans le cache. Les tests échouent si la liste blanche est contournée (vérifié). |
| Plaque en clair dans le journal | Empreinte HMAC propre au garage (`APP_SECRET`) : le journal sert de quota et de cache sans contenir la plaque. | Test d'intégration. |
| Saisie invalide | Formats SIV (AA-123-AA, sans I, O, U, ni SS, ni 000) et FNI (123 ABC 75, Corse, outre-mer). Refus avant tout appel. | Tests unitaires. |
| Coût | Quota par garage et par mois (essai : 20, Atelier : 100, Réseau : 300), plafond mensuel de la plateforme, cache par garage, aucun appel pour une plaque déjà enregistrée, une seule requête pour deux recherches simultanées. | Tests d'intégration. |
| Abus | 20 recherches par utilisateur et par 10 minutes, 60 par garage et par heure. | Test. |
| Lenteur ou panne du fournisseur | Délai de 8 s par défaut (1 à 20 s), aucune relance automatique (un appel relancé peut être facturé deux fois). Réponse plafonnée à 256 Ko. | Tests avec un fournisseur muet et un fournisseur en erreur 503. |
| Fuite de la clé | Variable serveur uniquement (pas de `NEXT_PUBLIC_`), envoyée en en-tête. Aucune redirection suivie, pour que la clé ne parte vers aucun autre hôte. Absente des journaux et des messages d'erreur. | Test : l'URL appelée ne contient que la plaque ; `redirect: "error"`. |
| Droits | Réception et gérant seulement (`vehicles:write`), abonnement actif. Un technicien est refusé. | Test. |
| Données fictives en production | Le fournisseur `demo` est refusé quand `NODE_ENV=production`. | Test unitaire. |

## 3. Cadre légal (à faire valider)

- **Pas d'accès public au SIV.** Ses données ne sont réutilisables que par des tiers titulaires d'une licence du ministère de l'Intérieur,
  qui vaut agrément, moyennant redevance (article L. 330-5 du code de la route ; licences encadrées par les articles R. 330-7 à R. 330-11).
  La **licence technique** permet de diffuser les caractéristiques techniques d'un véhicule « sans communication des noms, prénoms et
  adresses ». Elle a deux niveaux : niveau 1, et niveau 2 dite « de rediffusion ». Le titulaire d'une licence de niveau 2 ne peut utiliser
  les données qu'en interne, et ne peut ni les revendre ni les rediffuser.
- **Conséquence pour GarageFlow.** Le fournisseur retenu doit démontrer :
  - son numéro de licence SIV, et le niveau de celle-ci ;
  - que son contrat autorise l'usage dans un logiciel en ligne (SaaS) qui affiche les données aux garages clients ;
  - la durée de conservation autorisée. Le cache est configurable et désactivable : `PLATE_LOOKUP_CACHE_DAYS`, et `cacheAllowed` dans
    l'adaptateur.

  C'est **la** question à poser avant toute signature.
- **RGPD.** L'immatriculation et le VIN permettent d'identifier indirectement le titulaire : ce sont des données personnelles. GarageFlow
  les traite déjà, comme sous-traitant des garages. Le fournisseur devient un **sous-traitant ultérieur**, ce qui demande :
  - un contrat avec clauses de l'article 28 ;
  - l'hébergement dans l'Union européenne, ou un encadrement des transferts ;
  - sa mention dans la politique de confidentialité et la liste des sous-traitants ;
  - une durée de conservation.

  Ce qui est en place : minimisation (plaque seule envoyée, liste blanche), empreinte au lieu de la plaque, cache cloisonné par garage.
  Ce qui manque : la purge automatique du journal de recherches (proposition : 13 mois, le temps des statistiques de facturation).
- Sources : [interieur.gouv.fr, réutilisation du SIV](https://www.interieur.gouv.fr/fr/Repertoire-des-informations-publiques/La-reutilisation-des-donnees-du-systeme-d-immatriculation-des-vehicules),
  [licence technique BT](https://www.securite-routiere.gouv.fr/sites/default/files/2020-08/licence_technique_bt_rediffusion_-_juillet_2020.pdf),
  [guide de réutilisation 2022](https://www.securite-routiere.gouv.fr/sites/default/files/2022-05/mai_2022_guide_reutilisation_donnees_siv.pdf),
  [cadre juridique](https://www.securite-routiere.gouv.fr/reglementation-liee-aux-modes-de-deplacements/immatriculation-des-vehicules/le-dispositif-juridique).

## 4. Fournisseurs étudiés

Méthode : recherche web le 4 novembre 2026. Les pages des fournisseurs n'ont **pas pu être ouvertes**, car la politique réseau de
l'environnement les bloque : chiffres et affirmations viennent des extraits indexés par le moteur de recherche, et sont **à confirmer**
auprès de chaque fournisseur. Aucun n'a été testé.

| Fournisseur | Couverture annoncée | Documentation | Tarifs relevés (HT) | Licence et RGPD | Remarques |
| --- | --- | --- | --- | --- | --- |
| [api-plaque-immatriculation.com](https://www.api-plaque-immatriculation.com/) | France (SIV), réponse en moins de 0,5 s annoncée | Annoncée « complète », non lue | Offre gratuite (volume non publié), puis à partir de 9 €/mois, dépassement 0,01 $ par requête | « Données SIV officielles » annoncées, sans numéro de licence relevé | Le moins cher relevé. Prix si bas qu'ils doivent être confirmés par écrit. |
| [api-plaque.com](https://www.api-plaque.com/) | France | Non lue | Gratuit 10/mois ; Pro 59 €/600 ; Ultra 199 €/5 000 ; Mega 299 €/10 000 ; 0,10 € la requête supplémentaire | Non relevé | Grille publique et lisible : référence du calcul de coût ci-dessous. |
| [apiplaqueimmatriculation.com](https://apiplaqueimmatriculation.com/) | France et international, « compatible TecDoc » | [Google Sites](https://sites.google.com/view/apiplaqueimmatriculation/documentation), non lue | Dès 39 €/mois ; Standard mensuel 59 €/800 ; annuel Premium 2 699 €/an jusqu'à 10 000/mois | Non relevé | Utile si les références pièces (K-Type) comptent. |
| [Auto Ways](https://auto-ways.net/) (aussi via [Zyla Labs](https://www.zylalabs.com/api-marketplace/automotive+%26+vehicle+data/france+license+plate+api+-+official+siv+vehicle+data/6418)) | France (SIV), K-Type TecDoc, code moteur | SwaggerHub cité, non lu | Non publié | « Officiel SIV » annoncé | Une clé d'exemple circule dans un gist public de 2022 : vérifier leurs pratiques de sécurité. |
| [RegCheck (Infinite Loop)](https://www.regcheck.org.uk/) | Plus de 50 pays ; **France non confirmée** | API SOAP documentée publiquement | 0,30 AUD par recherche, par blocs de 100, 10 % de remise au-delà de 1 000 | Société australienne : transferts hors UE à encadrer | Identifiant transmis dans l'URL : à éviter (journaux). |
| TecAlliance (TecDoc) et AAA Data | Référentiels professionnels (pièces, SIV) | Sur contrat | Sur devis | Licences explicites (TecDoc ; écosystème SIV) | Choix « éditeur de logiciel » si le volume justifie un contrat. |

**Recommandation.** Demander une offre écrite à deux fournisseurs, par exemple api-plaque-immatriculation.com et api-plaque.com, en
exigeant :

1. le numéro et le niveau de leur licence SIV ;
2. l'autorisation écrite d'usage SaaS pour des garages clients ;
3. un contrat de sous-traitance (article 28) et l'hébergement dans l'UE ;
4. la liste exacte des champs renvoyés, et la garantie qu'aucune donnée du titulaire n'est renvoyée ;
5. les règles de conservation (cache) ;
6. la facturation d'une plaque inconnue et d'une erreur ;
7. une clé de test gratuite.

Retenir celui qui répond par écrit aux sept points.

## 5. Estimation des coûts mensuels

Sur la base des grilles relevées ci-dessus, non confirmées. Hypothèse de change : 1 AUD ≈ 0,60 €.

| Volume mensuel | api-plaque.com | apiplaqueimmatriculation.com | api-plaque-immatriculation.com | RegCheck |
| --- | --- | --- | --- | --- |
| 100 recherches | 59 € (Pro) | 39 à 59 € | 0 à 9 € | ≈ 18 € (30 AUD) |
| 1 000 recherches | 99 € (Pro 59 € + 400 × 0,10 €) | 59 € + dépassement non publié, ou palier supérieur (prix non publié) | ≈ 9 € + jusqu'à 10 $ de dépassement | ≈ 180 € (300 AUD) |
| 10 000 recherches | 299 € (Mega) | ≈ 225 €/mois (2 699 €/an, engagement annuel) | ≈ 9 € + jusqu'à 100 $ | ≈ 1 620 € (2 700 AUD, remise comprise) |

Lecture pour GarageFlow, avec api-plaque.com comme référence prudente : 10 garages à 100 recherches font 1 000 recherches, soit environ
99 € par mois (environ 10 € par garage pour un abonnement à 59 €). 100 garages font 10 000 recherches, soit environ 299 € (3 € par garage).

Le coût réel sera plus bas :
- une plaque déjà enregistrée dans le garage ne déclenche aucun appel ;
- le cache évite de repayer une plaque recherchée deux fois ;
- un garage crée plutôt 20 à 60 véhicules par mois que 100.

Le plafond `PLATE_LOOKUP_GLOBAL_MONTHLY_CAP` (1 000 par défaut) borne la facture quoi qu'il arrive.

## 6. Configuration

```sh
PLATE_LOOKUP_PROVIDER=""             # vide = désactivée ; « demo » = données fictives (jamais en production)
PLATE_LOOKUP_API_KEY=""              # secret du serveur
PLATE_LOOKUP_TIMEOUT_MS="8000"
PLATE_LOOKUP_CACHE_DAYS="30"         # 0 si le contrat l'interdit
PLATE_LOOKUP_GLOBAL_MONTHLY_CAP="1000"
```

Quotas par garage : `plateLookupsPerMonth` dans `src/lib/plans.ts` (Atelier 100, Réseau 300), et `TRIAL_PLATE_LOOKUPS` (20) pendant l'essai.

Fournisseur de démonstration (développement) : `AB-123-CD` donne une réponse complète, `EF-456-GH` une réponse incomplète, `EE-111-EE` un
service indisponible ; toute autre plaque est inconnue.

## 7. Ajouter le fournisseur retenu

1. `src/server/plate-lookup/providers/<id>.ts` : un objet `PlateProvider`.
   - L'appel passe par `fetchProviderJson` : délai, aucune redirection, taille plafonnée, erreurs typées.
   - La clé va dans un en-tête si le fournisseur le permet.
   - Seuls les champs techniques sont recopiés dans `RawTechnical`.
   - `billsNotFound` et `cacheAllowed` suivent le contrat.
2. Une ligne dans `PROVIDERS` (`src/server/plate-lookup/config.ts`).
3. Un test avec une réponse réelle anonymisée, au format exact de la documentation, comme dans `tests/integration/plate-lookup.test.ts`.
4. **Premier appel réel uniquement après accord**, avec la clé de test du fournisseur, sur une plaque d'un véhicule de l'atelier.

## 8. Vérifié ou non

| Élément | Statut |
| --- | --- |
| Formats de plaque, liste blanche, normalisation, codes d'énergie, conversion kW/ch | **PASS** (tests unitaires) |
| Délai, erreurs HTTP, réponse trop volumineuse, absence de redirection | **PASS** (tests unitaires, fournisseur simulé) |
| Quotas, plafond, cache, cloisonnement entre garages, appels simultanés, limites de débit, droits | **PASS** (tests d'intégration, vraie base) |
| Aucune donnée du titulaire dans la réponse, la base ou le cache | **PASS** (les tests échouent si la liste blanche est contournée) |
| Origine des caractéristiques vérifiée côté serveur | **PASS** (test d'intégration) |
| Recherche, confirmation et cas dégradés dans le navigateur | **PASS** (E2E avec le fournisseur de démonstration, serveur de développement) |
| Fonctionnement existant | **PASS** (100 tests unitaires et d'intégration ; 16 tests E2E sur le build de production, recherche désactivée) |
| Migration compatible avec un retour arrière | **PASS** (`scripts/verifier-migrations.mjs`) |
| Format réel d'un fournisseur, qualité des données, délais réels | **UNVERIFIED** : aucune clé, et la documentation n'a pas pu être lue |
| Tarifs et conditions des fournisseurs | **UNVERIFIED** : extraits de moteur de recherche, à confirmer par écrit |
| Licence SIV et usage SaaS autorisés par le fournisseur | **UNVERIFIED** : question à poser avant signature |
| Purge du journal de recherches | Non fait : à ajouter avec la durée de conservation retenue |
