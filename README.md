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

- **Comptes et sécurité** : chaque chercheur a son compte (e-mail + mot de passe), avec vérification d'adresse e-mail par code et récupération de mot de passe oublié. Le compte `dosso.choilio@gmail.com` est automatiquement administrateur, avec accès illimité.
- **Crédits et forfaits** : chaque transcription/analyse consomme des crédits (remboursés automatiquement en cas d'échec) ; un crédit d'essai gratuit est offert à l'inscription. L'administrateur peut ajuster les crédits de n'importe quel utilisateur et gérer un catalogue de forfaits payants. **Important** : aucune passerelle de paiement réelle (Stripe, Mobile Money...) n'est intégrée — le flux actuel est une confirmation manuelle par l'admin après réception d'un paiement hors application (Mobile Money, virement), ce qui est une pratique de démarrage courante mais nécessite une intégration dédiée pour un paiement automatisé.
- **Persistance réelle** : transcriptions, analyses et codages sont stockés dans PostgreSQL — ils survivent aux redémarrages et redéploiements du serveur (voir configuration Railway ci-dessous).
- **Corpus d'équipe** : crée un corpus, partage son code d'invitation avec tes collègues, codez ensemble les mêmes entretiens.
- **Diarisation des locuteurs** (facultative) : distingue automatiquement qui parle dans la transcription.
- **Analyse qualitative multi-méthodologies** : trois méthodes reconnues au choix — Gioia et al. (structuration à 3 niveaux), analyse thématique réflexive (Braun & Clarke), analyse de contenu catégorielle (Bardin) — avec, pour chacune, une démarche méthodologique de niveau doctoral générée explicitement (positionnement épistémologique, justification, procédure suivie), des verbatims horodatés cliquables, une synthèse interprétative et les limites méthodologiques.
- **Analyse transversale de corpus** : au-delà d'un entretien, analyse conjointe de tous les entretiens terminés d'un même corpus (minimum 2), avec attribution de chaque verbatim à son entretien d'origine et commentaire sur la convergence/divergence entre cas et la saturation théorique.
- **Codage collaboratif et fiabilité inter-codeurs** : chaque chercheur code les segments indépendamment ; l'app calcule le kappa de Cohen entre codeurs, un indicateur de rigueur attendu en recherche qualitative.
- **Écran d'accueil** : liste réelle des entretiens (recherche, statut, date), bouton flottant pour en démarrer un nouveau.
- **Enregistrement natif** : dictaphone intégré avec vumètre réactif au micro réel, ou import d'un fichier audio existant.
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
| `POST` | `/api/admin/forfaits` | *(admin)* Créer un forfait |
| `GET` | `/api/methodes` | Méthodologies d'analyse disponibles |
| `POST` | `/api/corpus` | Créer un corpus (retourne un code d'invitation) |
| `GET` | `/api/corpus` | Lister mes corpus |
| `GET` | `/api/corpus/{id}` | Détail d'un corpus, dont son analyse transversale |
| `POST` | `/api/corpus/rejoindre` | Rejoindre un corpus via son code |
| `POST` | `/api/corpus/{id}/analyser` | Lancer l'analyse transversale du corpus (≥ 2 entretiens terminés) |
| `POST` | `/api/transcriptions` | Envoi d'un audio |
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
