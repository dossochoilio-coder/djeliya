"""
Envoi d'e-mails transactionnels de Djeliya (vérification, réinitialisation de
mot de passe) via SMTP générique — compatible Gmail (avec mot de passe
d'application), ou tout autre fournisseur SMTP (SendGrid, Resend, etc.).
"""

import os
import smtplib
from email.mime.text import MIMEText

SMTP_HOST = os.getenv("SMTP_HOST")
SMTP_PORT = int(os.getenv("SMTP_PORT", "587"))
SMTP_USER = os.getenv("SMTP_USER")
SMTP_PASSWORD = os.getenv("SMTP_PASSWORD")
SMTP_FROM = os.getenv("SMTP_FROM", SMTP_USER or "")

EMAIL_CONFIGURE = bool(SMTP_HOST and SMTP_USER and SMTP_PASSWORD)


def envoyer_email(destinataire: str, sujet: str, corps: str) -> bool:
    """Retourne True si l'e-mail a bien été envoyé, False s'il n'a pas pu l'être
    (jamais d'exception propagée : l'appelant décide comment réagir à un échec)."""
    if not EMAIL_CONFIGURE:
        return False
    try:
        msg = MIMEText(corps, "plain", "utf-8")
        msg["Subject"] = sujet
        msg["From"] = SMTP_FROM
        msg["To"] = destinataire
        with smtplib.SMTP(SMTP_HOST, SMTP_PORT, timeout=10) as serveur:
            serveur.starttls()
            serveur.login(SMTP_USER, SMTP_PASSWORD)
            serveur.sendmail(SMTP_FROM, [destinataire], msg.as_string())
        return True
    except Exception:  # noqa: BLE001
        return False


def envoyer_code_verification(destinataire: str, code: str):
    return envoyer_email(
        destinataire,
        "Djeliya — Vérifie ton adresse e-mail",
        f"Bienvenue sur Djeliya !\n\n"
        f"Ton code de vérification est : {code}\n\n"
        f"Il expire dans 30 minutes. Si tu n'es pas à l'origine de cette inscription, ignore ce message.",
    )


def envoyer_code_reinitialisation(destinataire: str, code: str):
    return envoyer_email(
        destinataire,
        "Djeliya — Réinitialisation de ton mot de passe",
        f"Tu as demandé à réinitialiser ton mot de passe Djeliya.\n\n"
        f"Ton code de réinitialisation est : {code}\n\n"
        f"Il expire dans 30 minutes. Si tu n'es pas à l'origine de cette demande, ignore ce message "
        f"— ton mot de passe actuel reste valide.",
    )
