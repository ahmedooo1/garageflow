# Identification des véhicules : stratégie « gratuit d'abord »

Branche `feature/identification-plaque`, 5 novembre 2026. Document d'étude : rien n'a été acheté, déployé, ni appelé chez un fournisseur
payant. Les fournisseurs réels restent désactivés (`PLATE_LOOKUP_PROVIDER` vide).

**Méthode.** Recherche web du 4 et du 5 novembre 2026. L'environnement de travail bloque les sites des fournisseurs, d'ADEME et de
l'ANTS, si bien qu'aucune page n'a été lue en entier et aucun fichier n'a été téléchargé. Les chiffres et les conditions viennent des
extraits indexés par le moteur de recherche. Ce qui n'a pas pu être confirmé est marqué **à vérifier**. Aucun site n'a été « scrapé »,
aucun contrôle d'accès contourné.

## 1. Le point de départ : il n'existe pas d'accès gratuit plaque → véhicule

Le SIV n'est pas public. Ses données ne sont réutilisables que par les titulaires d'une licence du ministère de l'Intérieur, qui vaut
agrément, moyennant redevance (article L. 330-5 du code de la route, licences encadrées aux articles R. 330-7 à R. 330-11). La licence
technique de niveau 2 (rediffusion) limite l'usage à un usage interne, sans revente ni rediffusion. Toute API « plaque → véhicule » est donc :

- soit payante, et sa chaîne de licence doit permettre un usage SaaS ;
- soit hors cadre.

L'habilitation SIV dont disposent certains garages pour les démarches de carte grise sert à ces démarches, pas à identifier un véhicule
reçu à l'atelier : elle ne doit pas être détournée pour cet usage.

En revanche, **la carte grise que le client présente contient presque tout ce qu'il faut**, et plusieurs référentiels publics décrivent les
types de véhicules. La stratégie consiste à lire le document d'abord, à compléter par les référentiels ouverts, et à ne payer une
recherche par plaque qu'en dernier recours, sur demande explicite.

## 2. Les sources, une par une

### 2.1 Recherche par plaque (payante)

| | immatriculationapi.com | API Plaque : api-plaque.com | API Plaque : api-plaque-immatriculation.com |
| --- | --- | --- | --- |
| Nature | Plaque → véhicule | Plaque → véhicule | Plaque → véhicule (SIV annoncé) |
| Gratuit | 10 recherches d'essai à l'inscription, une seule fois | 10 recherches par mois | 10 recherches par mois (offre Basic, clé délivrée via RapidAPI) |
| Coût marginal | 0,20 € par recherche, remise sur volume | 0,10 € par recherche au-delà du forfait ; Pro 59 €/600, Ultra 199 €/5 000, Mega 299 €/10 000 | 0,01 $ par recherche au-delà du forfait ; forfaits à 199 $/5 000 et 299 $/10 000 ; ailleurs « dès 9 €/mois » (**contradictoire**) |
| Champs | Une quarantaine annoncés : marque, modèle, numéro de châssis, cylindrée… | Marque, modèle, VIN, énergie, puissances (annoncés) | De 40 à plus de 100 champs annoncés, dont des codes TecDoc |
| Exactitude | Source des données non indiquée | Non indiquée | « Données SIV officielles » annoncées, licence non citée |
| Rediffusion SaaS, cache | Non trouvé | Non trouvé | Non trouvé |
| Documentation, contrat | Interface SOAP (.NET ASMX), couverture France, Espagne, Italie et Europe. Probablement de la même famille que RegCheck (**à vérifier**). | Documentation non lue | Documentation annoncée, non lue ; passage par RapidAPI (intermédiaire américain : transfert de données hors UE à encadrer) |

Pour les trois, à obtenir par écrit avant toute signature :

- le numéro et le niveau de la licence SIV ;
- l'autorisation d'usage dans un SaaS pour des garages clients ;
- la durée de conservation permise (cache) ;
- un contrat de sous-traitance RGPD (article 28) et le lieu d'hébergement ;
- la liste exacte des champs renvoyés, avec la garantie qu'aucune donnée du titulaire n'en fait partie ;
- la facturation d'une plaque inconnue.

### 2.2 HistoVec (service public gratuit)

- **Nature** : rapport d'historique (sinistres, gages, propriétaires successifs, contrôles techniques) que **seul le propriétaire** génère, en
  s'identifiant avec les données de sa carte grise, puis partage à un acheteur.
- **Usage possible pour GarageFlow** : aucun en automatique. Il n'existe pas d'API publique. Une intégration « professionnels » était
  annoncée par beta.gouv.fr en 2019, sans confirmation qu'elle existe aujourd'hui.
- **Droits** : les conditions visent un particulier qui partage avec un acheteur, pas la réutilisation par un logiciel. Il ne faut ni
  automatiser la génération, ni lire automatiquement un rapport partagé.
- **Rôle dans la stratégie** : hors de l'identification. Au mieux, le client montre son rapport, et le garage note ce qu'il juge utile.

### 2.3 ADEME : Car Labelling et historique des émissions (données ouvertes)

- **Nature** : **référentiel de types, pas de plaques**. Il décrit des versions de modèles, pas un véhicule immatriculé.
- **Jeux de données** :
  - « ADEME : Car Labelling » : véhicules neufs actuellement vendus en France, environ 3 600 lignes, mis à jour chaque trimestre ou
    deux fois par an (les deux pages se contredisent) ;
  - « Émissions de CO2 et de polluants des véhicules commercialisés en France » : données UTAC acquises chaque année depuis 2001, avec
    gamme, marque, modèle, **n° de CNIT** et énergie.
- **Champs** : puissance fiscale, puissance maximale, puissance électrique, carburant, consommations, CO2, et le CNIT dans le jeu
  historique. La liste exacte des colonnes est **à vérifier** sur la page « Description des champs », que le téléchargement bloqué n'a pas
  permis de lire. D'après le format connu du jeu historique, on attend aussi la boîte de vitesses (type et nombre de rapports), la
  carrosserie, les masses et le TVV.
- **Exactitude** : données d'homologation, exactes pour un type ; elles ne disent rien d'un véhicule particulier (options,
  modifications).
- **Droits** : **Licence Ouverte / Open Licence 2.0**. Réutilisation commerciale, rediffusion et stockage permis, à condition de citer la
  source et la date de dernière mise à jour.
- **Documentation** : téléchargement CSV et API Data Fair sur data.ademe.fr, aucun contrat.
- **Clé de jointure** : le **CNIT**, rubrique D.2.1 de la carte grise (depuis 2004), et le **TVV**, rubrique D.2.

### 2.4 Sources ouvertes complémentaires

| Source | Nature | Gratuit | Champs | Droits | Remarques |
| --- | --- | --- | --- | --- | --- |
| [AEE : surveillance du CO2 des voitures neuves](https://co2cars.apps.eea.europa.eu/) (règlement (UE) 2019/631) | Référentiel par immatriculation neuve agrégée par type ; pas de plaque | Oui, CSV par année | Constructeur, numéro de réception, **type, variante, version**, marque, dénomination commerciale, CO2 (NEDC, WLTP) ; puissance et cylindrée **à vérifier** | Politique de réutilisation de l'AEE, **à vérifier** (habituellement CC BY 4.0) | Comble le trou des modèles qui ne sont plus vendus, grâce au TVV. Fichiers volumineux : ne garder que la France. |
| Décodage du VIN, préfixe constructeur (WMI, ISO 3780) | Identifiant du constructeur, pas du véhicule | Oui, table locale | Constructeur, pays | Table WMI publique ; base vPIC du NHTSA (données fédérales américaines, **à vérifier**) | Fiable pour la marque, pas pour le modèle d'un véhicule européen. Aucun appel réseau nécessaire. |
| Statistiques de parc (SDES, data.gouv.fr) | Agrégats par territoire | Oui | Aucun champ par véhicule | Licence Ouverte | Inutile pour identifier ; utile pour la prospection. |
| 2D-Doc du certificat d'immatriculation (spécification publique de l'ANTS) | Données du document, **signées** (ECDSA, clés publiques de la TSL de l'ANTS) | Oui | Champs du certificat : A (plaque), B, D.1, D.3, E, J, P.3, V.7, V.9… | Lecture et vérification libres ; spécification publique | **À vérifier** : la spécification prévoit le type de document, mais rien ne confirme que les cartes grises en circulation portent ce code. Il est attesté sur d'autres documents de l'ANTS. À constater sur des cartes réelles. |

### 2.5 La carte grise elle-même

Rubriques utiles :

| Rubrique | Contenu |
| --- | --- |
| A | Immatriculation |
| B | Date de première immatriculation |
| D.1 | Marque |
| D.2 | TVV |
| D.2.1 | CNIT |
| D.3 | Dénomination commerciale |
| E | VIN |
| J.1 | Genre national |
| P.1 | Cylindrée |
| P.2 | Puissance nette maximale (kW) |
| P.3 | Énergie |
| P.6 | Puissance fiscale |
| V.7 | CO2 |

Les rubriques **C.1 à C.4 contiennent le nom et l'adresse du titulaire** : elles ne doivent jamais être lues ni conservées.

## 3. Stratégie hybride proposée

Ordre de résolution, du gratuit au payant. Chaque champ garde sa source, et rien n'est enregistré sans confirmation :

1. **Véhicule déjà connu du garage** : aucune recherche (déjà en place).
2. **Lecture de la carte grise**, gratuite et sur le téléphone ou l'ordinateur du garage :
   1. Code 2D-Doc s'il est présent : décodage d'un code Datamatrix et vérification de la signature. Les données sont alors exactes et
      certifiées.
   2. Sinon, reconnaissance de texte **dans le navigateur** (Tesseract.js, licence Apache 2.0), guidée par les libellés des rubriques
      (A, B, D.1, E, P.2…). Chaque valeur est validée par son format : plaque, VIN de 17 caractères, date réelle, puissance numérique,
      code d'énergie connu, format du CNIT.
   3. **L'image ne quitte pas l'appareil** : ni envoyée, ni stockée. La zone C est exclue de la lecture, et seules les rubriques de la
      liste blanche sont extraites.
3. **Complément par les référentiels ouverts**, avec le CNIT, le TVV, ou la marque et le modèle : puissance, puissance fiscale, boîte,
   carrosserie, CO2. L'affichage dit « caractéristiques du type (référence ADEME, Licence Ouverte 2.0) », et jamais qu'il s'agit des
   données du véhicule.
4. **Décodage local du VIN** : marque attendue. Une incohérence avec D.1 est signalée.
5. **Recherche payante par plaque** : désactivée par défaut, activable par la plateforme, déclenchée seulement par un clic quand il n'y a
   pas de carte grise. Quotas, plafond et cache sont déjà en place dans `src/server/plate-lookup`.
6. **Saisie manuelle** : toujours possible, à chaque étape.

Règle de fusion : document signé, puis carte grise lue et confirmée, puis recherche payante, puis référentiel de type, puis décodage du
VIN. Un désaccord entre deux sources est affiché à l'utilisateur, sans choix automatique.

### 3.1 Travaux à prévoir (non réalisés)

| Lot | Contenu | Effort estimé |
| --- | --- | --- |
| A. Constat sur cartes réelles | Photographier 30 cartes grises d'atelier, avec l'accord des clients, en masquant la zone C. Mesurer la présence du 2D-Doc et la qualité de lecture rubrique par rubrique. Les images de test ne sont pas versionnées. | 1 jour |
| B. Lecture assistée de la carte grise | Composant « Photographier la carte grise » : recadrage, reconnaissance de texte dans le navigateur, extraction par rubrique, validation, même écran de confirmation que la recherche par plaque (`Source : carte grise`), tests sur images synthétiques. | 5 à 8 jours |
| C. 2D-Doc | Décodage Datamatrix (zxing-wasm, Apache 2.0), lecture des champs selon la dernière spécification de l'ANTS, vérification de la signature avec la TSL. Seulement si le lot A le justifie. | 2 à 3 jours |
| D. Référentiels ouverts | Script d'import **manuel** des fichiers officiels (ADEME, puis AEE limitée à la France) dans une table `VehicleReference` indexée par CNIT, TVV et marque + modèle. Mention de la source et de la date. Rafraîchissement trimestriel lancé par un administrateur. Proposition de complément dans le formulaire. | 3 à 4 jours |
| E. Décodage du VIN | Table WMI locale, contrôle de cohérence avec la marque. | 0,5 jour |
| F. Provenance par champ | Origine conservée champ par champ (aujourd'hui une seule origine par véhicule), affichée sur la fiche. | 1 à 2 jours |

**Objectifs de qualité, à mesurer au lot A** : au moins 95 % d'exactitude rubrique par rubrique pour A, E, D.1 et P.3 après validation de
format. En deçà, la rubrique n'est pas pré-remplie : elle est seulement proposée.

**Confidentialité.** La photo d'une carte grise contient l'identité et l'adresse du titulaire : c'est pour cela que le traitement se fait
dans le navigateur, sans envoi. Si un appareil trop ancien imposait une lecture côté serveur, ce serait en mémoire, sans écriture, avec
mention dans la politique de confidentialité. Cette solution de repli n'est pas recommandée.

## 4. Matrice de décision

Notes de 1 (mauvais) à 5 (excellent). Pondération : coût marginal 25 %, couverture plaque → véhicule 20 %, exactitude 20 %, droits SaaS
et cache 20 %, effort et risque d'intégration 10 %, confidentialité 5 %.

| Source | Plaque → véhicule | Coût | Couverture | Exactitude | Droits | Effort | Confidentialité | **Score** | Rôle retenu |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| Carte grise, lecture locale | Oui, document du client | 5 | 4 | 4 | 5 | 3 | 4 | **4,35** | Source principale |
| Carte grise, 2D-Doc | Oui, si présent | 5 | 2 (à constater) | 5 | 5 | 3 | 4 | **4,15** | Bonus si présent |
| ADEME (Car Labelling + historique) | Non, type seulement | 5 | 2 | 4 | 5 | 4 | 5 | **4,10** | Complément par CNIT |
| Décodage du VIN (WMI) | Non, marque seulement | 5 | 2 | 3 | 5 | 4 | 5 | **3,90** | Contrôle de cohérence |
| AEE, CO2 des voitures neuves | Non, type seulement | 5 | 2 | 4 | 4 (à vérifier) | 3 | 5 | **3,80** | Complément par TVV |
| api-plaque-immatriculation.com | Oui | 4 (à confirmer) | 5 | 3 | 2 | 4 | 2 | **3,50** | Option payante n° 1, sous conditions |
| api-plaque.com | Oui | 3 | 5 | 3 | 2 | 4 | 3 | **3,30** | Option payante n° 2 |
| immatriculationapi.com | Oui | 2 | 5 | 3 | 2 | 3 | 3 | **2,95** | Écartée (coût, interface SOAP) |
| HistoVec | Non, rapport du propriétaire | 5 | 1 | 5 | 1 | 1 | 3 | **2,90** | Écartée de l'identification |

Lecture : les sources « type seulement » obtiennent de bons scores parce qu'elles sont gratuites et sûres juridiquement, mais elles ne
remplacent pas la carte grise : elles la complètent. Les options payantes perdent surtout sur les droits, tant que leur licence et leur
contrat ne sont pas connus. Leur note pourra monter après réponse écrite.

## 5. Coût estimé pour 1 000 véhicules

**Hypothèses**, à remplacer par les mesures du lot A :

- 80 % des véhicules arrivent avec leur carte grise ;
- pour 75 % d'entre eux, la lecture est exploitable, soit 60 % du total sans saisie ;
- les 20 % restants de cartes présentes sont saisis à la main d'après la carte ;
- les 20 % sans carte sont saisis à la main, ou passent par une recherche payante si le garage l'a activée.

| Scénario | Recherches payantes | immatriculationapi.com (0,20 €) | api-plaque.com (0,10 € au-delà du forfait) | api-plaque-immatriculation.com (0,01 $) |
| --- | --- | --- | --- | --- |
| **Gratuit** : carte grise, référentiels, saisie | 0 | **0 €** | **0 €** | **0 €** |
| **Hybride** : payant seulement sans carte grise | 200 | 40 € | ≈ 19 € en dépassement, ou forfait Pro 59 € | ≈ 2 $ + forfait (montant contradictoire, de 0 à 9 €/mois annoncé) |
| **Tout payant** | 1 000 | 200 € | 99 € (Pro 59 € + 400 × 0,10 €) | ≈ 10 $ + forfait |

S'ajoutent :

- **infrastructure** : 0 € (lecture dans le navigateur ; référentiels de quelques dizaines à quelques centaines de Mo sur le VPS actuel) ;
- **développement** : environ 12 à 19 jours pour les lots A à F, une seule fois ;
- **référentiels ouverts** : 0 €, avec la seule obligation de citer la source.

Par véhicule, la stratégie hybride coûte de 0 à 0,04 €, contre 0,01 à 0,20 € en tout payant. Elle supprime surtout la dépendance à un
contrat dont les droits de rediffusion ne sont pas encore connus.

## 6. Décisions à prendre

1. Lancer le lot A (constat sur 30 cartes) avant tout développement : il décide de l'intérêt du 2D-Doc et fixe les vraies hypothèses de
   coût.
2. Valider le principe « image traitée sur l'appareil, jamais envoyée », et sa mention dans la politique de confidentialité.
3. Garder la recherche payante désactivée tant qu'un fournisseur n'a pas répondu par écrit aux questions de la section 2.1.

## 7. Sources

- [immatriculationapi.com](https://www.immatriculationapi.com/), [annonce RapidAPI](https://rapidapi.com/immatriculationapi-Sf2chpuXeWt/api/api-de-plaque-d-immatriculation-france)
- [api-plaque.com](https://www.api-plaque.com/), [api-plaque-immatriculation.com](https://www.api-plaque-immatriculation.com/), [RapidAPI : API plaque immatriculation SIV](https://rapidapi.com/api-plaque-immatriculation-siv-api-plaque-immatriculation-siv-default/api/api-plaque-immatriculation-siv), [apiplaqueimmatriculation.com](https://apiplaqueimmatriculation.com/nos-pack/)
- [HistoVec](https://histovec.interieur.gouv.fr/), [HistoVec sur beta.gouv.fr](https://beta.gouv.fr/startups/histovec.html)
- [ADEME Car Labelling (data.gouv.fr)](https://www.data.gouv.fr/datasets/ademe-car-labelling), [ADEME Car Labelling (data.ademe.fr)](https://data.ademe.fr/datasets/ademe-car-labelling), [Émissions de CO2 et de polluants des véhicules commercialisés en France](https://www.data.gouv.fr/datasets/emissions-de-co2-et-de-polluants-des-vehicules-commercialises-en-france)
- [AEE : CO2 des voitures neuves](https://co2cars.apps.eea.europa.eu/), [métadonnées 2024](https://sdi.eea.europa.eu/catalogue/srv/api/records/aa674839-5720-4d28-9a4e-4f0bb3fa5e80/attachments/CO2%20from%20cars%20and%20vans_Stastical%20metadata_2024.pdf)
- [Spécification 2D-Doc de l'ANTS, v3.3.1](https://img.ants.gouv.fr/49ba9a9b-5b88-48d0-9e32-67a8b05ef1e7.pdf), [processus 2D-Doc](https://ants.gouv.fr/files/f5d55001-78e5-40b4-a8af-2cdc8d057983/a33806ff-b011-4076-affd-7ecac6a070c2/4120b591-07fa-4e55-9177-72d63102de37/ants_2d-doc_processus_v12-1.pdf), [2D-Doc (Wikipédia)](https://fr.wikipedia.org/wiki/2D-Doc)
- [CNIT et certificat d'immatriculation](https://www.fiscalite-automobile.fr/cnit-et-le-certificat-dimmatriculation/), [lire une carte grise](https://www.francecartegrise.com/comprendre-une-carte-grise/comment-lire-une-carte-grise/)
- [Réutilisation des données du SIV](https://www.interieur.gouv.fr/fr/Repertoire-des-informations-publiques/La-reutilisation-des-donnees-du-systeme-d-immatriculation-des-vehicules), [licence technique BT](https://www.securite-routiere.gouv.fr/sites/default/files/2020-08/licence_technique_bt_rediffusion_-_juillet_2020.pdf)
