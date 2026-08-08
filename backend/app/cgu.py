"""
Conditions générales d'utilisation et politique de confidentialité de Djeliya.

Fondées sur la loi n° 2013-450 du 19 juin 2013 relative à la protection des
données à caractère personnel en Côte d'Ivoire, dont l'Autorité de Régulation
des Télécommunications/TIC de Côte d'Ivoire (ARTCI) est l'autorité de
protection compétente (www.autoritedeprotection.ci).

Ce texte sert de base et doit être relu et complété par le porteur du projet,
notamment pour désigner formellement le responsable de traitement, vérifier
si une déclaration ou une autorisation préalable auprès de l'ARTCI est requise
compte tenu des données collectées, et le cas échéant désigner un
Correspondant à la protection des données à caractère personnel (CPDCP),
obligation introduite par l'arrêté n°0099/MTND/CAB du 16 août 2024.
"""

CGU_VERSION = "1.0 — août 2026"

CGU_TEXTE = f"""DJELIYA — Conditions générales d'utilisation
et politique de confidentialité
Version {CGU_VERSION}

1. QUI SOMMES-NOUS

Djeliya est une plateforme de transcription et d'analyse qualitative destinée
aux chercheurs en sciences humaines et en sciences de gestion. Le responsable
du traitement des données à caractère personnel collectées via l'application
est l'exploitant du service, joignable à l'adresse indiquée dans l'application
(Réglages).

2. DONNÉES COLLECTÉES

Dans le cadre de l'utilisation de Djeliya, les données suivantes sont
collectées et traitées :

a) Données de compte : adresse e-mail, nom (facultatif), mot de passe (stocké
   sous forme chiffrée irréversible, jamais en clair).
b) Données d'usage : historique des transcriptions et analyses effectuées,
   solde de crédits, mouvements de crédits, corpus créés ou rejoints.
c) Enregistrements audio et transcriptions des entretiens de recherche que tu
   effectues via l'application. Ces enregistrements peuvent constituer des
   données à caractère personnel concernant les personnes interviewées
   (voix, propos tenus, parfois informations sensibles selon le sujet de
   recherche), dont TU es responsable en tant que chercheur les ayant
   recueillies. Tu dois t'assurer d'avoir obtenu le consentement libre et
   éclairé de chaque personne interviewée avant de l'enregistrer et de la
   transcrire via Djeliya.
d) Corrections manuelles de transcription en dioula ou en baoulé, uniquement
   si tu as explicitement activé la contribution à l'amélioration des
   modèles de langues locales (réglage désactivé par défaut, modifiable à
   tout moment).

3. FINALITÉS DU TRAITEMENT

Les données sont traitées pour : fournir le service de transcription et
d'analyse qualitative ; sécuriser les comptes (vérification d'adresse
e-mail, réinitialisation de mot de passe) ; gérer les crédits et forfaits ;
permettre la collaboration en équipe sur un même corpus de recherche ; le
cas échéant, améliorer la reconnaissance des langues locales ivoiriennes
(uniquement avec ton consentement explicite).

4. BASE LÉGALE ET CONSENTEMENT

Le traitement repose sur ton consentement explicite, recueilli lors de la
création de ton compte, et sur l'exécution du service que tu demandes. Tu
peux retirer ton consentement à tout moment en supprimant ton compte
(Réglages → Supprimer mon compte) ou en désactivant la contribution aux
langues locales.

5. DESTINATAIRES ET SOUS-TRAITANTS

Selon les fonctionnalités que tu actives, certaines données transitent par
des prestataires techniques tiers, uniquement pour l'exécution du service :
- Anthropic (analyse qualitative par intelligence artificielle) ;
- Hugging Face / pyannote (diarisation des locuteurs, si activée) ;
- PayDunya (traitement des paiements si tu achètes des crédits ou un forfait —
  reçoit les informations strictement nécessaires au paiement : montant,
  moyen de paiement choisi ; Djeliya ne stocke jamais tes coordonnées
  bancaires ou de Mobile Money) ;
- ton fournisseur de messagerie SMTP (envoi des e-mails de vérification et
  de réinitialisation de mot de passe, si configuré) ;
- l'hébergeur du serveur (Railway) et de la base de données (PostgreSQL).
Aucune donnée n'est vendue ni utilisée à des fins publicitaires.

6. DURÉE DE CONSERVATION

Tes données sont conservées tant que ton compte est actif. Tu peux les
supprimer à tout moment (voir section 8). Les mouvements de crédits sont
conservés à des fins de transparence comptable même après ajustement.

7. SÉCURITÉ

Les mots de passe sont hachés (bcrypt), les communications transitent en
HTTPS, l'accès aux entretiens et corpus est strictement limité à leur
propriétaire et aux membres du corpus concerné.

8. TES DROITS

Conformément à la loi n° 2013-450 du 19 juin 2013, tu disposes d'un droit
d'accès, de rectification, d'opposition et de suppression de tes données :
- Modifier ton nom ou ton mot de passe : Réglages → Modifier mon compte.
- Supprimer définitivement ton compte et tes données : Réglages → Supprimer
  mon compte. Cette action supprime tes entretiens, tes corpus (dont tu es
  seul propriétaire) et tes contributions ; elle est irréversible.
- Pour toute autre demande (accès, rectification, portabilité), contacte le
  responsable du traitement à l'adresse indiquée dans l'application.
Tu disposes également d'un droit de réclamation auprès de l'Autorité de
Régulation des Télécommunications/TIC de Côte d'Ivoire (ARTCI), autorité de
protection des données personnelles (www.autoritedeprotection.ci).

9. MINEURS

Djeliya n'est pas destiné aux personnes de moins de 18 ans.

10. MODIFICATION DES PRÉSENTES CONDITIONS

Cette version pourra évoluer ; en cas de modification substantielle, une
nouvelle acceptation te sera demandée à la prochaine connexion.

11. RESPONSABILITÉ DU CHERCHEUR

En utilisant Djeliya pour mener des entretiens de recherche, tu t'engages à
respecter les règles d'éthique de la recherche applicables à ton institution
(consentement des participants, anonymisation si nécessaire, conservation
sécurisée des données de recherche), Djeliya n'étant qu'un outil technique
et non un comité d'éthique.
"""
