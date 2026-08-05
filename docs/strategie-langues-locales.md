# Stratégie langues locales — Djeliya

Ce document répond à une question simple mais structurante : **comment Djeliya passe-t-il d'une
transcription approximative du dioula/baoulé (aujourd'hui, un modèle généraliste qui n'a jamais
appris ces langues) à une reconnaissance vocale réellement fiable ?**

C'est le seul axe de différenciation que ni NVivo, ni ATLAS.ti, ni Sonix, ni Dovetail ne pourront
jamais rattraper facilement — mais c'est un travail humain et scientifique avant d'être un travail
d'ingénierie logicielle.

---

## 1. Pourquoi ça ne marche pas aujourd'hui

Whisper (le modèle utilisé par Djeliya) a été entraîné sur des millions d'heures d'audio, mais quasi
exclusivement dans des langues à forte présence écrite/numérique. Le dioula, le baoulé, le bété, le
sénoufo n'y figurent pour ainsi dire pas. Résultat concret : le modèle **hallucine** — il produit du
texte plausible phonétiquement mais souvent faux, car il essaie de faire correspondre les sons à des
mots français ou anglais qu'il connaît.

Aucune astuce de prompt ou de post-traitement ne corrige ça durablement. Il faut soit :
- un modèle qui a vu la langue pendant son entraînement (MMS de Meta couvre partiellement le dioula),
- soit un modèle affiné (*fine-tuné*) spécifiquement sur cette langue.

## 2. Choix technique recommandé : partir de MMS, affiner sur Whisper

| Langue | Couverture actuelle | Stratégie recommandée |
|---|---|---|
| Dioula | Partielle (MMS de Meta) | Fine-tuning léger de MMS + collecte ciblée pour combler les lacunes lexicales locales (commerce, entretiens) |
| Baoulé | Quasi nulle | Fine-tuning de Whisper `small`/`medium` sur corpus dédié — projet pilote after Dioula |
| Bété, Sénoufo, autres | Nulle | À envisager une fois la méthodologie validée sur les deux premières langues |

**Recommandation** : commencer par le dioula (déjà un socle MMS à améliorer), valider toute la
méthodologie dessus, puis répliquer sur le baoulé avec les mêmes outils et un budget/calendrier déjà
calibrés par l'expérience du premier cycle.

## 3. Le corpus — l'étape qui prend le plus de temps

Un fine-tuning correct nécessite un corpus audio **annoté** (audio + transcription texte alignée),
pas seulement de l'audio brut.

**Ordre de grandeur réaliste** :
- Minimum viable pour un premier cycle de fine-tuning exploitable : **15 à 25 heures** d'audio annoté par langue.
- Idéal pour une qualité robuste en production : **80 à 150 heures**.

**Comment le constituer, concrètement :**
1. **Réutiliser tes propres entretiens** validés par les chercheurs dans Djeliya (avec leur accord) —
   chaque correction manuelle qu'un chercheur fait déjà dans l'app est, en soi, une donnée
   d'entraînement précieuse. *C'est un argument fort pour formaliser, dans les conditions
   d'utilisation, le droit de réutiliser (de façon anonymisée) les corrections des chercheurs pour
   améliorer le modèle — à condition de l'annoncer clairement et d'obtenir leur consentement.*
2. **Enregistrements dédiés** : lecture à voix haute de phrases types (vocabulaire de la recherche en
   sciences de gestion : entrepreneuriat, commerce, finance informelle) par des locuteurs natifs des
   deux sexes et de tranches d'âge variées — la variabilité vocale est ce qui rend un modèle robuste.
3. **Radios communautaires locales** (podcasts, émissions en dioula/baoulé) — sous réserve d'accord
   de droits avec les diffuseurs, c'est une source d'audio naturel abondante et gratuite à collecter.

## 4. Partenariats à activer

- **Université Félix Houphouët-Boigny** (Abidjan) — département de linguistique ou sciences du
  langage : co-encadrement scientifique, accès à des locuteurs natifs pour l'annotation.
- **INP-HB** (Institut National Polytechnique Félix Houphouët-Boigny) — profil plus technique,
  pertinent pour la partie fine-tuning/MLOps.
- **Instituts de recherche en langues ivoiriennes** (ILA — Institut de Linguistique Appliquée) —
  ressources lexicographiques déjà existantes à valoriser.
- **Bailleurs possibles** : ce projet a un vrai potentiel de financement scientifique (préservation
  linguistique + recherche en IA) — pistes à explorer : Organisation Internationale de la
  Francophonie, fondations type Mozilla Common Voice (qui finance déjà la collecte de données vocales
  pour langues sous-dotées), coopération universitaire française/canadienne.

## 5. Protocole d'annotation — pour garantir un corpus scientifiquement exploitable

- **Consentement explicite** des locuteurs enregistrés (formulaire écrit ou oral enregistré),
  précisant l'usage : entraînement d'un modèle de reconnaissance vocale.
- **Double transcription** d'un échantillon (10-15 %) par deux annotateurs indépendants, avec calcul
  d'accord inter-annotateurs — garantit que le corpus lui-même est fiable avant de s'en servir pour
  entraîner un modèle.
- **Anonymisation** : retirer les noms propres sensibles des transcriptions d'entraînement.
- **Documentation** : conventions de transcription (ponctuation, gestion du code-switching
  français/dioula très fréquent en Côte d'Ivoire) fixées avant de commencer, pas après.

## 6. Pipeline technique de fine-tuning (une fois le corpus prêt)

1. Format du corpus : paires audio/texte, découpées en segments de 5 à 30 secondes.
2. Fine-tuning via Hugging Face `transformers` (`Seq2SeqTrainer` sur Whisper, ou script d'adaptation
   MMS) — s'exécute sur un GPU loué ponctuellement (Google Colab Pro, ou un cloud GPU à l'heure type
   RunPod/Lambda) : quelques centaines d'euros pour un premier cycle, pas besoin d'infrastructure
   dédiée.
3. Évaluation : taux d'erreur mot (WER) sur un jeu de test tenu à part, jamais vu pendant
   l'entraînement — c'est la métrique qui te dira objectivement si le modèle s'est amélioré.
4. Déploiement : le modèle affiné remplace le modèle général pour les langues concernées dans le
   serveur Djeliya (changement de configuration, pas de réécriture d'architecture).

## 7. Calendrier réaliste

| Phase | Durée estimée |
|---|---|
| Constitution du partenariat + protocole d'annotation | 4 à 8 semaines |
| Collecte + annotation corpus dioula (pilote) | 2 à 4 mois |
| Premier cycle de fine-tuning + évaluation | 2 à 3 semaines |
| Itération qualité (si WER insuffisant) | 1 à 2 mois |
| Réplication sur le baoulé | Nettement plus rapide (méthodologie déjà rodée) |

**Au total, compter 6 à 9 mois avant une première version dioula réellement fiable en production.**
Ce n'est pas un défaut de Djeliya — c'est la réalité de tout projet sérieux de reconnaissance vocale
pour une langue sous-dotée. Aucun raccourci technique ne remplace ce travail.

## 8. Ce que Djeliya peut faire dès maintenant, sans attendre

- Le champ **vocabulaire local** déjà présent dans l'app (guide le modèle général vers les termes
  attendus) reste utile en attendant — il améliore modestement, pas structurellement, la qualité.
- Le bandeau d'avertissement déjà affiché pour le dioula/baoulé (« expérimental ») doit rester tant
  qu'un modèle affiné n'est pas en production — c'est une question d'honnêteté scientifique envers
  les chercheurs qui utilisent l'app.
- Chaque correction manuelle qu'un chercheur fait aujourd'hui dans l'app peut déjà être journalisée
  (avec consentement) comme future donnée d'entraînement — commencer cette collecte maintenant fait
  gagner plusieurs mois le jour où le vrai projet de fine-tuning démarre.
