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

- **Écran d'accueil** : liste réelle des entretiens (recherche, statut, date), bouton flottant pour en démarrer un nouveau.
- **Enregistrement natif** : dictaphone intégré avec vumètre réactif au micro réel, ou import d'un fichier audio existant.
- **Envoi automatique** : l'audio part vers ton serveur Railway dès la validation ; le statut (en file, en cours, terminé) se met à jour tout seul en arrière-plan, même en naviguant ailleurs dans l'app.
- **Fiche entretien** : lecture avec vraie forme d'onde (calculée depuis l'audio), surlignage du segment en cours, mots peu fiables soulignés et corrigibles d'un geste.
- **Analyse qualitative (méthode Gioia)** : codage thématique inductif automatique — concepts de premier ordre, thèmes de second ordre, dimensions agrégées — avec verbatims horodatés cliquables, synthèse interprétative et limites méthodologiques explicites. Nécessite une clé `ANTHROPIC_API_KEY` sur Railway (voir ci-dessous).
- **Corpus et Glossaire** : regroupe tes entretiens par projet de recherche, et centralise le vocabulaire local relevé au fil des entretiens.
- **Export** : copie du texte dans le presse-papiers, ou partage natif (Android) vers WhatsApp, e-mail, etc.
- **Réglages** : adresse du serveur, langue et vocabulaire par défaut, test de connexion en direct.
- **Stockage local** : chaque entretien (audio + transcription) reste sur le téléphone ; seul l'audio envoyé pour transcription (et le texte envoyé pour analyse) transite par ton serveur.

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
3. Variables d'environnement (facultatif, voir `backend/.env.example`) : `WHISPER_MODEL=small` convient au CPU de départ ; passez à `medium` ou `large-v3` avec plus de RAM pour une meilleure précision sur les dictions difficiles.
4. Pour activer l'**analyse qualitative** (méthode Gioia), ajoute la variable `ANTHROPIC_API_KEY` (obtenue sur [console.anthropic.com](https://console.anthropic.com)) dans l'onglet **Variables** du service. Sans elle, la transcription fonctionne normalement mais le bouton d'analyse renvoie une erreur claire.
4. Générer un domaine public (*Settings → Networking → Generate Domain*), puis vérifier `https://votre-domaine.up.railway.app/health`.

Chaque poussée sur `main` redéploie le serveur automatiquement.

### API

| Méthode | Route | Rôle |
|---|---|---|
| `GET` | `/health` | État du serveur |
| `GET` | `/api/languages` | Langues disponibles |
| `POST` | `/api/transcriptions` | Envoi d'un audio (`audio`, `langue`, `vocabulaire`) |
| `GET` | `/api/transcriptions/{id}` | Résultat : segments horodatés, mots + confiance |

Le champ `vocabulaire` (ex. `"tontine, pagne, Adjamé, Cocody"`) guide le modèle vers les termes de terrain et améliore nettement les dictions peu claires.

## 4. Langues ivoiriennes — feuille de route

Le modèle général couvre très bien le français et l'anglais, y compris accentués. Pour le dioula, le baoulé et les autres langues locales, aucun modèle du marché n'est fiable aujourd'hui : le serveur est conçu pour brancher un modèle affiné (MMS de Meta pour le dioula, ou Whisper affiné sur vos propres enregistrements annotés). Les codes `dyu` et `bci` sont déjà prévus dans l'API ; le champ `note` du résultat signale quand la validation humaine est indispensable.

## Développement local

```bash
# Interface
cd mobile && npm install && npm run dev

# Serveur
cd backend && pip install -r requirements.txt
uvicorn app.main:app --reload
```
