# Djeliya — Transcription pour la recherche qualitative

Plateforme de transcription d'entretiens multilingues (français · anglais · langues ivoiriennes) destinée aux chercheurs en sciences humaines et sciences de gestion.

```
djeliya/
├── mobile/            Application (React + Vite + Capacitor → APK / AAB Android)
│   ├── src/           Interface Djeliya (ruban linguistique, éditeur, analyse)
│   └── android/       Projet Android natif généré (Gradle, prêt à compiler)
├── backend/           API de transcription (FastAPI + faster-whisper) → Railway
└── .github/workflows/ Compilation automatique APK/AAB + vérification backend
```

## 1. Mettre le projet sur GitHub

```bash
cd djeliya
git init
git add .
git commit -m "Djeliya : application mobile + API de transcription"
git branch -M main
git remote add origin https://github.com/VOTRE_COMPTE/djeliya.git
git push -u origin main
```

## Fonctionnalités de l'application

- **Comptes et sécurité** : chaque chercheur a son compte (e-mail + mot de passe), avec vérification d'adresse e-mail par code et récupération de mot de passe oublié. Le compte `dosso.choilio@gmail.com` est automatiquement administrateur, avec accès illimité. Chaque utilisateur peut modifier son nom/mot de passe ou supprimer définitivement son compte (Réglages).
- **Conditions d'utilisation et confidentialité** : consentement explicite requis et horodaté à l'inscription, texte fondé sur la loi n° 2013-450 du 19 juin 2013 relative à la protection des données à caractère personnel (Côte d'Ivoire), accessible à tout moment depuis Réglages. **À personnaliser** : coordonnées exactes du responsable de traitement, et vérifier auprès de l'ARTCI si une déclaration/autorisation préalable est requise selon les données collectées.
- **Crédits et forfaits** : chaque transcription/analyse consomme des crédits (remboursés automatiquement en cas d'échec) ; un crédit d'essai gratuit est offert à l'inscription. L'administrateur peut ajuster (delta) ou redéfinir (valeur absolue) les crédits de n'importe quel utilisateur, gérer un catalogue de forfaits payants, et supprimer un compte. Les forfaits fixes restent en confirmation manuelle par l'admin ; **la recharge à la carte, elle, est payée directement par l'utilisateur via PayDunya** (voir ci-dessous).
- **Recharge de crédits à la carte via PayDunya** : chaque utilisateur peut acheter des crédits lui-même, à 150 FCFA/crédit (10 crédits minimum, sans limite du nombre d'achats), payables par Mobile Money/carte via la page de paiement PayDunya. Sécurité vérifiée par tests automatisés : vérification de signature du webhook (hash SHA-512 documenté par PayDunya), **double vérification indépendante** du statut de paiement directement auprès de l'API PayDunya avant de créditer quoi que ce soit (jamais confiance aveugle au contenu du webhook), et idempotence (un webhook rejoué deux fois ne crédite jamais deux fois). **Nécessite trois identifiants PayDunya** (clé maîtresse, clé privée, token) — la clé maîtresse seule ne suffit jamais.
- **Export Word et Excel — niveau doctoral** : le rapport d'étude (corpus entier) inclut désormais une page de garde, un vrai sommaire Word, une présentation chiffrée de l'étude, la démarche méthodologique référencée (APA : Gioia et al. 2013 / Braun & Clarke 2006-2019 / Bardin 2013), la structure complète des résultats, la fiabilité inter-codeurs (kappa de Cohen avec interprétation), et deux annexes (composition du corpus, transcriptions intégrales de tous les entretiens). L'Excel ajoute une feuille "Codebook" (fréquence de chaque concept) et une feuille "Transcriptions" couvrant tout le corpus.
- **Conservation des données** : rien n'est jamais supprimé automatiquement — seule une action explicite de l'utilisateur (ou de l'admin) efface un entretien, un corpus ou un compte. L'app demande aussi un stockage "persistant" au système d'exploitation pour empêcher toute éviction de l'audio local sous pression de stockage.
- **Statistiques qualitatives** : le rapport d'étude calcule désormais la convergence entre entretiens (sur combien de cas un thème apparaît — logique de triangulation) et la saturation théorique (nombre de concepts nouveaux apportés par chaque entretien, dans l'ordre chronologique).
- **Bilingue français / anglais** : toute l'interface (boutons, titres, messages) se traduit selon le réglage choisi dans Réglages. **L'analyse qualitative générée par l'IA suit aussi cette langue** (démarche méthodologique, thèmes, synthèse rédigés en anglais si demandé), avec une règle méthodologique stricte : les verbatims (citations) ne sont jamais traduits, ils restent dans la langue exacte de l'entretien. Les rapports Word/Excel exportés suivent également cette langue. Seul le texte légal des CGU reste en français dans les deux langues, pour ne pas s'écarter du texte de référence fondé sur la loi ivoirienne.
- **Guide d'entretien généré par l'IA** : à partir d'un thème et d'une question de recherche, conception d'un guide d'entretien semi-directif complet — préambule de consentement, sections thématiques en entonnoir avec questions et relances, **grille de cohérence** (chaque question mise en correspondance avec la dimension théorique qu'elle vise à explorer, avec justification), conseils méthodologiques, note méthodologique référencée (Kvale & Brinkmann, Patton, Blanchet & Gotman). Exportable en Word, suit la langue de l'interface. Accessible depuis la carte dédiée en haut de l'écran Entretiens.
- **Étude quantitative générée par l'IA** : à partir d'un thème et d'une question de recherche, l'app produit **en 5 étapes séquentielles indépendantes** (cadre théorique, puis revue de littérature, puis méthodologie, puis questionnaire, puis note méthodologique) — chaque étape ayant sa propre marge de tokens et son propre contexte des étapes précédentes, ce qui élimine le risque de troncature d'un contenu volumineux généré en un seul bloc, tout en gardant une cohérence de bout en bout. La progression réelle s'affiche dans l'app (« Étape 2/5 — Revue de littérature… »). Une **table de références APA** accompagne chaque étude : un socle méthodologique fixe et réellement vérifié (Cronbach 1951, Nunnally & Bernstein 1994, Fornell & Larcker 1981, Churchill 1979, Hair et al. 2019), et les concepts théoriques mobilisés par l'IA présentés séparément comme « à référencer précisément par le chercheur » — jamais comme des citations exactes garanties, pour ne jamais risquer de fausse référence. Un **gabarit Excel est généré dynamiquement à partir du questionnaire réel** (pas un modèle générique) pour la collecte de données. Une fois les données collectées et le fichier réimporté, l'app calcule une analyse statistique complète et vérifiée : statistiques descriptives enrichies (médiane, asymétrie, aplatissement, IC 95%), fiabilité des construits (alpha de Cronbach, corrélation item-total corrigée, alpha si item supprimé), test de normalité (Shapiro-Wilk), et corrélations entre construits avec bascule automatique Pearson/Spearman selon la normalité détectée. Résultats exportables en Word et Excel.
- **Avertissement systématique sur le contenu généré par l'IA** : tout contenu produit par l'IA (guide d'entretien, analyse qualitative d'un entretien ou d'un corpus) porte une mention claire — dans l'app et dans les exports Word/Excel — rappelant qu'il s'agit d'un outil d'aide à valider, relire et adapter par le chercheur, et non d'un instrument scientifiquement validé au sens psychométrique du terme.
- **Persistance réelle** : transcriptions, analyses et codages sont stockés dans PostgreSQL — ils survivent aux redémarrages et redéploiements du serveur (voir configuration Railway ci-dessous).
- **Corpus d'équipe** : crée un corpus, partage son code d'invitation avec tes collègues, codez ensemble les mêmes entretiens.
- **Diarisation des locuteurs** (facultative) : distingue automatiquement qui parle dans la transcription.
- **Analyse qualitative multi-méthodologies** : trois méthodes reconnues au choix — Gioia et al. (structuration à 3 niveaux), analyse thématique réflexive (Braun & Clarke), analyse de contenu catégorielle (Bardin) — avec, pour chacune, une démarche méthodologique de niveau doctoral générée explicitement (positionnement épistémologique, justification, procédure suivie), des verbatims horodatés cliquables, une synthèse interprétative et les limites méthodologiques.
- **Analyse transversale de corpus** : au-delà d'un entretien, analyse conjointe de tous les entretiens terminés d'un même corpus (minimum 2), avec attribution de chaque verbatim à son entretien d'origine et commentaire sur la convergence/divergence entre cas et la saturation théorique.
- **Codage collaboratif et fiabilité inter-codeurs** : chaque chercheur code les segments indépendamment ; l'app calcule le kappa de Cohen entre codeurs, un indicateur de rigueur attendu en recherche qualitative.
- **Écran d'accueil** : liste réelle des entretiens (recherche, statut, date), bouton flottant pour en démarrer un nouveau.
- **Enregistrement natif** : dictaphone intégré avec vumètre réactif au micro réel, **pause et reprise sans coupure ni perte** (l'audio repart exactement où il s'était arrêté), écran maintenu actif pendant l'enregistrement pour éviter toute interruption par la mise en veille du téléphone. Fonctionne entièrement hors connexion — seul l'envoi final pour transcription nécessite le réseau, et l'audio reste sauvegardé sur l'appareil si cet envoi échoue (bouton « Relancer »). **Envoi fractionné automatique pour les entretiens longs** (> 6 Mo) : Railway limite chaque requête HTTP publique à 5 minutes, ce qui pouvait interrompre l'envoi d'un enregistrement d'1h+ sur une connexion mobile instable (« Failed to fetch »). Au-delà du seuil, l'app découpe l'envoi en petits morceaux de 2 Mo, chacun réessayé individuellement en cas de coupure, puis réassemblés côté serveur — testé avec vérification d'intégrité binaire complète.
- **Fiche entretien** : lecture avec vraie forme d'onde, surlignage du segment en cours, mots peu fiables soulignés et corrigibles d'un geste.
- **Glossaire** : centralise le vocabulaire local relevé au fil des entretiens.
- **Export** : copie du texte dans le presse-papiers, ou partage natif (Android) vers WhatsApp, e-mail, etc.
- **Réglages** : adresse du serveur, langue et vocabulaire par défaut, test de connexion en direct.

## 2. Obtenir l'APK et l'AAB

Dès la première poussée sur `main`, le workflow **Android — APK et AAB** compile :

- **`djeliya-debug-apk`** — installable directement sur un téléphone pour tester ;
- **`djeliya-release-aab`** — le format exigé par Google Play.

Récupérez-les dans l'onglet **Actions** du dépôt → dernière exécution → **Artifacts**. Vous pouvez aussi lancer la compilation à la main (bouton *Run workflow*).

### Signer l'AAB pour Google Play

Créez une clé une seule fois (gardez-la précieusement, elle est exigée pour toutes les mises à jour futures) :

```bash
keytool -genkey -v -keystore djeliya.keystore -alias djeliya \
  -keyalg RSA -keysize 2048 -validity 10000
base64 -w 0 djeliya.keystore   # copier la sortie
```

Puis dans GitHub → *Settings → Secrets and variables → Actions*, ajoutez :

| Secret | Contenu |
|---|---|
| `KEYSTORE_BASE64` | la sortie de la commande `base64` ci-dessus |
| `KEYSTORE_PASSWORD` | le mot de passe du keystore |
| `KEY_ALIAS` | `djeliya` |
| `KEY_PASSWORD` | le mot de passe de la clé |

Sans ces secrets, le workflow produit quand même l'APK de test et un AAB non signé.

## 3. Déployer le serveur sur Railway

1. Sur [railway.com](https://railway.com) : **New Project → Deploy from GitHub repo** → choisir `djeliya`.
2. Dans les réglages du service, définir **Root Directory = `backend`**. Railway détecte le `Dockerfile` et le `railway.json` automatiquement.
3. Variables d'environnement (voir `backend/.env.example`) :
   - **`JWT_SECRET`** — **obligatoire**, sinon personne ne peut se connecter. Génère-la avec `openssl rand -hex 32` (ou n'importe quel générateur de chaîne aléatoire longue).
   - **Base de données PostgreSQL — fortement recommandé** : dans ton projet Railway, clique sur **New → Database → Add PostgreSQL**. Puis, dans le service backend, onglet **Variables**, ajoute `DATABASE_URL` en la reliant au service Postgres via une *Reference Variable* (`${{Postgres.DATABASE_URL}}`). Sans ça, les comptes et entretiens seront effacés à chaque redéploiement.
   - `WHISPER_MODEL=small` convient au CPU de départ ; passez à `medium` ou `large-v3` avec plus de RAM pour une meilleure précision.
4. Pour activer l'**analyse qualitative** (méthode Gioia), ajoute `ANTHROPIC_API_KEY` (obtenue sur [console.anthropic.com](https://console.anthropic.com)).
5. Pour activer la **diarisation des locuteurs** (facultatif, plus lourd) : accepte les conditions du modèle sur [huggingface.co/pyannote/speaker-diarization-3.1](https://huggingface.co/pyannote/speaker-diarization-3.1), crée un jeton sur [huggingface.co/settings/tokens](https://huggingface.co/settings/tokens), ajoute-le comme `HF_TOKEN`. Cette étape alourdit sensiblement le temps de build (installation de PyTorch) — sans elle, tout le reste continue de fonctionner normalement.
4. Générer un domaine public (*Settings → Networking → Generate Domain*), puis vérifier `https://votre-domaine.up.railway.app/health`.

Chaque poussée sur `main` redéploie le serveur automatiquement.

### API

| Méthode | Route | Rôle |
|---|---|---|
| `GET` | `/health` | État du serveur (modèle, analyse/diarisation configurées) |
| `GET` | `/api/languages` | Langues disponibles |
| `POST` | `/api/auth/inscription` | Créer un compte |
| `POST` | `/api/auth/connexion` | Se connecter (retourne un jeton) |
| `GET` | `/api/auth/moi` | Profil du compte connecté (dont crédits, forfait) |
| `POST` | `/api/auth/verifier-email` | Valider le code de vérification reçu par e-mail |
| `POST` | `/api/auth/renvoyer-code` | Renvoyer un code de vérification |
| `POST` | `/api/auth/mot-de-passe-oublie` | Demander un code de réinitialisation |
| `POST` | `/api/auth/reinitialiser-mot-de-passe` | Définir un nouveau mot de passe avec le code reçu |
| `GET` | `/api/forfaits` | Catalogue public des forfaits actifs |
| `GET` | `/api/admin/utilisateurs` | *(admin)* Lister tous les comptes |
| `POST` | `/api/admin/utilisateurs/{id}/credits` | *(admin)* Ajuster le solde de crédits d'un utilisateur |
| `POST` | `/api/admin/utilisateurs/{id}/attribuer-forfait` | *(admin)* Activer un forfait pour un utilisateur |
| `GET` | `/api/cgu` | Texte des conditions d'utilisation et de confidentialité |
| `PATCH` | `/api/auth/moi` | Modifier son nom / mot de passe |
| `DELETE` | `/api/auth/moi` | Supprimer définitivement son compte |
| `GET` | `/api/transcriptions/{id}/export/docx` | Exporter l'entretien en Word |
| `GET` | `/api/transcriptions/{id}/export/xlsx` | Exporter l'entretien en Excel (avec statistiques) |
| `GET` | `/api/corpus/{id}/export/docx` | Exporter l'analyse transversale en Word |
| `GET` | `/api/corpus/{id}/export/xlsx` | Exporter l'analyse transversale en Excel |
| `POST` | `/api/admin/forfaits` | *(admin)* Créer un forfait |
| `POST` | `/api/admin/utilisateurs/{id}/credits/definir` | *(admin)* Redéfinir le solde de crédits (valeur absolue) |
| `DELETE` | `/api/admin/utilisateurs/{id}` | *(admin)* Supprimer un compte utilisateur |
| `GET` | `/api/guides` | Lister mes guides d'entretien |
| `POST` | `/api/guides` | Générer un nouveau guide d'entretien (1 crédit) |
| `GET` | `/api/guides/{id}` | Détail / statut d'un guide |
| `DELETE` | `/api/guides/{id}` | Supprimer un guide |
| `GET` | `/api/guides/{id}/export/docx` | Exporter le guide en Word |
| `GET` | `/api/etudes-quantitatives` | Lister mes études quantitatives |
| `POST` | `/api/etudes-quantitatives` | Générer une étude (cadre théorique, revue, méthodologie, questionnaire) |
| `GET` | `/api/etudes-quantitatives/{id}` | Détail / statut d'une étude |
| `DELETE` | `/api/etudes-quantitatives/{id}` | Supprimer une étude |
| `GET` | `/api/etudes-quantitatives/{id}/export/docx` | Exporter l'étude (cadre théorique...) en Word |
| `GET` | `/api/etudes-quantitatives/{id}/export/template` | Télécharger le gabarit Excel du questionnaire |
| `POST` | `/api/etudes-quantitatives/{id}/donnees` | Importer les données remplies et lancer l'analyse statistique |
| `GET` | `/api/etudes-quantitatives/{id}/donnees` | Historique des analyses de cette étude |
| `GET` | `/api/etudes-quantitatives/{id}/donnees/{analyse}/export/docx` | Exporter les résultats de l'analyse en Word |
| `GET` | `/api/etudes-quantitatives/{id}/donnees/{analyse}/export/xlsx` | Exporter les résultats de l'analyse en Excel |
| `GET` | `/api/recharges/tarif` | Grille tarifaire publique de la recharge à la carte |
| `POST` | `/api/recharges` | Créer une commande de recharge et obtenir le lien de paiement PayDunya |
| `GET` | `/api/recharges` | Historique de mes recharges |
| `GET` | `/api/recharges/{id}` | Détail / statut d'une recharge |
| `POST` | `/api/recharges/webhook/paydunya` | *(appelé par PayDunya)* Confirmation serveur à serveur du paiement |
| `POST` | `/api/recharges/{id}/verifier` | Forcer une re-vérification du statut réel auprès de PayDunya (si le webhook n'est jamais arrivé) |
| `GET` | `/api/methodes` | Méthodologies d'analyse disponibles |
| `POST` | `/api/corpus` | Créer un corpus (retourne un code d'invitation) |
| `GET` | `/api/corpus` | Lister mes corpus |
| `GET` | `/api/corpus/{id}` | Détail d'un corpus, dont son analyse transversale |
| `POST` | `/api/corpus/rejoindre` | Rejoindre un corpus via son code |
| `POST` | `/api/corpus/{id}/analyser` | Lancer l'analyse transversale du corpus (≥ 2 entretiens terminés) |
| `POST` | `/api/transcriptions` | Envoi d'un audio (fichiers ≤ 6 Mo) |
| `POST` | `/api/transcriptions/envoi/init` | Démarrer un envoi fractionné (fichiers > 6 Mo, entretiens longs) |
| `POST` | `/api/transcriptions/envoi/{session}/morceau` | Envoyer un morceau du fichier |
| `POST` | `/api/transcriptions/envoi/{session}/terminer` | Assembler les morceaux et lancer la transcription |
| `GET` | `/api/transcriptions` | Lister mes entretiens (et ceux de mes corpus) |
| `GET` | `/api/transcriptions/{id}` | Détail : segments, locuteurs, analyse |
| `POST` | `/api/transcriptions/{id}/segments` | Persister une correction manuelle de transcription |
| `POST` | `/api/transcriptions/{id}/analyser` | Lancer l'analyse qualitative |
| `POST` | `/api/transcriptions/{id}/codages` | Enregistrer mon codage d'un segment |
| `GET` | `/api/transcriptions/{id}/fiabilite` | Kappa de Cohen entre codeurs |
| `POST` | `/api/auth/preferences` | Activer/désactiver la contribution langues locales |
| `POST` | `/api/contributions` | Enregistrer une correction dioula/baoulé (avec consentement) |
| `GET` | `/api/contributions/nombre` | Nombre de contributions envoyées par le compte connecté |

Toutes les routes (sauf `/health`, `/api/languages`, `/api/auth/*`) exigent un en-tête `Authorization: Bearer <jeton>`.

## 4. Langues ivoiriennes — feuille de route

Le modèle général couvre très bien le français et l'anglais, y compris accentués. Pour le dioula, le baoulé et les autres langues locales, un travail de fine-tuning dédié est nécessaire — voir le document complet [`docs/strategie-langues-locales.md`](docs/strategie-langues-locales.md) : corpus nécessaire, partenariats à activer, calendrier réaliste (6 à 9 mois pour une première langue en production).

## Développement local

```bash
# Interface
cd mobile && npm install && npm run dev

# Serveur
cd backend && pip install -r requirements.txt
uvicorn app.main:app --reload
```
