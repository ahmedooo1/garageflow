# Lecture de la carte grise sur l'appareil (phase 1)

Branche `feature/identification-plaque`, 5 novembre 2026. Rien n'a été fusionné, déployé ni acheté. La recherche payante par plaque reste
désactivée (`PLATE_LOOKUP_PROVIDER` vide).

## 1. Ce que fait la fonction

Dans « Nouveau véhicule » et « Modifier le véhicule », le bloc **Lire la carte grise** propose deux actions :

- **Photographier la carte grise** : appareil photo arrière du téléphone (`capture="environment"`) ;
- **Importer une image** : photo ou scan déjà enregistré.

La lecture se fait dans le navigateur. L'écran de vérification montre, rubrique par rubrique :

- la valeur lue, **modifiable** ;
- un niveau de confiance : **Fiable** ou **À vérifier**, avec un pourcentage ;
- le cas échéant, « Non lu », « trouvé hors rubrique », « corrigé » ou « O/0 ou I/1 à vérifier ».

Rien n'est repris dans le formulaire avant un clic sur **Reporter dans le formulaire**. Ensuite, tous les champs restent modifiables, et
l'enregistrement est l'action habituelle « Créer le véhicule ». La fiche indique « Caractéristiques : Carte grise (lecture locale, vérifiée
par l'utilisateur) ».

| Rubrique | Contenu | Champ du véhicule |
| --- | --- | --- |
| A | Immatriculation | Immatriculation |
| B | Date de 1re immatriculation | Mise en circulation, année |
| D.1 | Marque | Marque |
| D.2 | Type mine / TVV | Type mine / TVV (nouveau) |
| D.2.1 | CNIT | CNIT (nouveau) |
| D.3 | Dénomination commerciale | Modèle |
| E | VIN | VIN |
| P.1 | Cylindrée | Cylindrée en cm³ (nouveau) |
| P.2 | Puissance nette maximale (kW) | Puissance (kW) |
| P.3 | Énergie | Carburant |
| P.6 | Puissance fiscale | Puissance fiscale (CV) |

D.2, D.2.1 et P.1 sont stockés parce qu'ils identifient la version exacte : ce sont les clés des catalogues de pièces et des référentiels
d'homologation, utiles à un enrichissement futur. Aucune autre rubrique n'est lue.

## 2. Confidentialité : garanties et preuves

| Garantie | Comment | Preuve |
| --- | --- | --- |
| L'image n'est jamais envoyée | Lecture en mémoire dans le navigateur. Les champs fichier n'ont pas d'attribut `name` et sont vidés après lecture : le formulaire ne peut pas les transmettre. | E2E : sur tout le parcours (lecture, enregistrement), aucune requête ne contient d'image (signatures PNG et JPEG, envoi de fichier), aucune ne dépasse 150 Ko, toutes vont vers l'application elle-même. |
| Aucun service externe | Moteur Tesseract.js (Apache 2.0) et modèle français (MIT), servis par GarageFlow sous `/ocr/` (copiés depuis `node_modules` à la construction). Aucun CDN, aucune API de reconnaissance. | E2E : un seul hôte contacté, `localhost` ; le modèle est chargé depuis `/ocr/lang/`. |
| Aucune image conservée | Pas de cache du modèle en IndexedDB (`cacheMethod: "none"`), canevas vidés et image libérée après lecture, rien côté serveur. | E2E : dossier de stockage inchangé, aucune photo en base, IndexedDB et Cache Storage vides, `localStorage` sans donnée de la carte. |
| Ni nom, ni adresse du titulaire | Liste blanche des onze rubriques. Les rubriques C.x et toutes les autres sont écartées, comme les mots qui ne suivent aucun code reconnu. La recherche de VIN ou de plaque hors rubrique ignore la zone C. Le texte brut n'est jamais conservé ni transmis. | Tests unitaires (zone C, code C mal lu, plaque écrite dans la zone C) ; intégration (moteur réel, trois titulaires fictifs) ; E2E (ni requête, ni base, ni navigateur ne contient le nom ou l'adresse). |
| Origine non falsifiable au-delà du garage | `technicalOrigin` n'accepte que `carte_grise` ou rien : toute autre valeur devient « Saisie manuelle ». C'est une déclaration de l'utilisateur, d'où le libellé « vérifiée par l'utilisateur ». | Test d'intégration. |
| Cloisonnement entre garages | Inchangé : toute lecture et modification passe par le garage de la session. | Test d'intégration : un autre garage ne lit ni ne modifie TVV et CNIT. |

## 3. Précision observée (spécimens synthétiques)

**Jeu de test** : 18 images générées par `scripts/generer-specimens-carte-grise.mjs` (`tests/fixtures/carte-grise`).

- Ce sont des données fictives marquées « SPÉCIMEN », sans emblème ni fond de sécurité officiel.
- Trois véhicules : diesel, essence, électrique.
- Chacun a un titulaire fictif dans la zone C.

**Mesure** : faite par le test E2E, dans le vrai navigateur, avec le parcours complet de l'application (build de production). Le rapport
est écrit dans `test-results/precision-carte-grise.json`.

| Image | Rubriques exactes | Fausses | Absentes | Durée |
| --- | --- | --- | --- | --- |
| Peugeot, nette | 11/11 | 0 | 0 | 1,6 s |
| Peugeot, tournée de 90° | 11/11 | 0 | 0 | 1,9 s |
| Peugeot, tournée de 180° | 11/11 | 0 | 0 | 1,4 s |
| Peugeot, tournée de 270° | 11/11 | 0 | 0 | 1,4 s |
| Peugeot, inclinée de 4° | 8/11 | 0 | 3 | 2,5 s |
| Peugeot, basse résolution (42 %) | 6/11 | 0 | 5 | 1,9 s |
| Peugeot, floue | 10/11 | 0 | 1 | 1,4 s |
| Peugeot, terne et bruitée | 9/11 | 0 | 2 | 1,4 s |
| Peugeot, JPEG qualité 30 | 11/11 | 0 | 0 | 0,9 s |
| Peugeot, reflet | 10/11 | 0 | 1 | 2,4 s |
| Peugeot, VIN et P.2 masqués | 9/11 | 0 | 2 (les masqués) | 1,4 s |
| Renault, nette | 10/11 | 1 (D.2) | 0 | 1,4 s |
| Renault, 180° | 10/11 | 1 (D.2) | 0 | 1,4 s |
| Renault, floue | 8/11 | 1 (D.2) | 2 | 1,4 s |
| Tesla, nette (P.1 vide sur la carte) | 9/10 | 0 | 1 (VIN) | 1,4 s |
| Tesla, 180° | 9/10 | 0 | 1 (VIN) | 1,9 s |
| Tesla, floue | 9/10 | 0 | 1 | 1,4 s |
| Aucune carte grise sur la photo | échec annoncé | | | 1,5 s |

**Total** : 162 valeurs exactes sur 184 (88 %), 19 absentes, 3 fausses. Les trois fausses sont « BHOFB » lu au lieu de « BH0FB » (O au
lieu de zéro). Elles sont signalées « À vérifier · O/0 ou I/1 à vérifier » : **aucune valeur fausse n'est présentée comme fiable**, et le
test échoue si cela arrive. Une rubrique masquée n'est jamais devinée.

Par rubrique, sur 17 images : A 16, B 14, D.1 15, D.2 14 (3 fausses), D.2.1 15, D.3 16, E 13, P.1 12/14, P.2 16, P.3 16, P.6 15.

Les durées sont mesurées sur le serveur de test (Chromium sans écran). **Sur un téléphone d'entrée de gamme, elles seront plus longues :
non mesuré.** Le premier usage charge environ 4,6 Mo : moteur de 3,8 Mo, modèle de 0,7 Mo, script de 0,1 Mo.

## 4. Limites connues

- **Ce ne sont pas de vraies cartes grises.** La mise en page des spécimens reprend les codes de rubrique, pas la typographie, le fond
  guilloché ni les plis d'une carte réelle. La précision réelle reste **à mesurer** sur des cartes d'atelier photographiées avec l'accord
  des clients (lot A de la stratégie).
- **Inclinaison et basse résolution** : au-delà de quelques degrés d'inclinaison, ou sur une photo prise de loin, des rubriques ne sont
  plus lues. Elles restent vides, jamais fausses. Aucun redressement de perspective n'est fait (amélioration possible : détection des bords
  de la carte).
- **Confusions de caractères** dans les codes libres (D.2, D.2.1) : O/0 et I/1. Aucun contexte ne permet de trancher, d'où le marquage
  systématique « à vérifier ».
- **VIN mal segmenté** : sur la Tesla nette, le moteur lit 19 caractères au lieu de 17. Le VIN est alors laissé vide plutôt que deviné.
  Sur la Peugeot, le code « E » n'est pas lu, mais le VIN est retrouvé à sa forme (« trouvé hors rubrique », donc à vérifier).
- **Marque** : une marque absente de la liste interne (environ 70 marques) est proposée « à vérifier ».
- **Formats d'image** : JPEG et PNG vérifiés. WebP non testé ; HEIC (iPhone) dépend du navigateur : non vérifié. Le format le plus courant à la prise
  de vue directe dans le navigateur est JPEG.
- **Orientation** : quatre orientations essayées au plus, puis un dernier essai avec contraste renforcé. Une photo très dégradée peut
  donc demander jusqu'à cinq lectures.

## 5. Référentiels ADEME : évaluation, enrichissement non implémenté

Exigence : confirmer les colonnes exactes, la couverture et la licence **avant** d'implémenter l'enrichissement. Ce n'est pas possible
depuis l'environnement de travail : `data.ademe.fr`, `www.data.gouv.fr` et `static.data.gouv.fr` sont bloqués par la politique réseau.
Ni l'API Data Fair, ni les fichiers, ni les pages de description n'ont pu être lus. **Aucun enrichissement n'a donc été codé.**

| Jeu de données | Ce qui est établi (recherche web, à confirmer) | Non confirmé |
| --- | --- | --- |
| [ADEME : Car Labelling](https://data.ademe.fr/datasets/ademe-car-labelling) | Véhicules neufs vendus en France, environ 3 600 lignes, Licence Ouverte 2.0 (page data.gouv.fr), API Data Fair et CSV | Colonnes exactes (puissance fiscale et maximale citées), présence du CNIT ou du TVV, rythme de mise à jour (trimestriel ou semestriel selon la page) |
| [Émissions de CO2 et de polluants des véhicules commercialisés en France](https://www.data.gouv.fr/datasets/emissions-de-co2-et-de-polluants-des-vehicules-commercialises-en-france) | Données UTAC depuis 2001, avec CNIT et énergie | Colonnes, licence exacte, années couvertes |
| Score environnemental (bonus écologique), [leasing social 2026](https://data.ademe.fr/datasets/tvv-leasing-social-2026) | Listes de voitures électriques **éligibles**, indexées par TVV (rubrique D.2). Environ 1 240 versions annoncées pour la liste publiée au Journal officiel du 23 octobre 2026. | Colonnes, licence, et surtout la portée : **seules les versions éligibles** y figurent, ce qui rend ces listes inutiles pour identifier un véhicule en général |

À faire pour lever le blocage, au choix :

1. autoriser `data.ademe.fr` dans les domaines réseau de l'environnement, puis lire
   `https://data.ademe.fr/data-fair/api/v1/datasets/ademe-car-labelling` (schéma, licence, nombre de lignes) ;
2. ou me transmettre les fichiers CSV et la page « Description des champs ».

L'enrichissement ne sera construit qu'ensuite, avec un import manuel et la mention de la source.

## 6. 2D-Doc : non construit

La spécification 2D-Doc de l'ANTS prévoit les champs du certificat d'immatriculation. Mais aucune source consultée ne confirme qu'un code
2D-Doc est imprimé sur les cartes grises en circulation : il est attesté sur d'autres documents. Conformément à la consigne, aucun
décodeur n'a été écrit. À constater sur de vraies cartes (lot A) avant d'y consacrer du temps.

## 7. Lancer la démonstration et les tests

```sh
pnpm install
pnpm dev                                              # copie le moteur dans public/ocr puis démarre Next
# Ouvrir /app/vehicules/new, « Importer une image », choisir un fichier de tests/fixtures/carte-grise/

pnpm test                                             # unitaires et intégration (moteur réel sur les spécimens)
pnpm build && CI=1 pnpm exec playwright test          # E2E : parcours, confidentialité, mesure, téléphone
node scripts/generer-specimens-carte-grise.mjs        # régénère les spécimens synthétiques
```

| Fichier | Rôle |
| --- | --- |
| `src/lib/carte-grise.ts` | Analyse des mots lus : liste blanche, validation, niveau de confiance (fonction pure) |
| `src/lib/carte-grise-ocr.ts` | Lecture dans le navigateur : orientation EXIF, rotations, moteur local, libération de la mémoire |
| `src/components/carte-grise-scan.tsx` | Capture, vérification, confirmation |
| `scripts/copier-ocr.mjs` | Copie du moteur et du modèle dans `public/ocr` (non versionné) |
| `tests/unit/carte-grise.test.ts` | Analyse : 13 tests |
| `tests/integration/carte-grise-ocr.test.ts` | Moteur réel sur les spécimens : 6 tests |
| `tests/integration/vehicle-carte-grise.test.ts` | Enregistrement, origine, cloisonnement : 4 tests |
| `e2e/carte-grise.spec.ts` | Navigateur : parcours et confidentialité, mesure, fichier invalide, téléphone |
