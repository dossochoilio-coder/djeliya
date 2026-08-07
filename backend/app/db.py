"""
Couche de persistance de Djeliya.

En production (Railway), DATABASE_URL pointe vers le service PostgreSQL
attaché au projet. En local / test, on retombe sur un fichier SQLite pour
pouvoir développer sans base externe.
"""

import os
from datetime import datetime, timezone

from sqlalchemy import create_engine, ForeignKey, JSON, DateTime, Boolean, Text
from sqlalchemy.orm import (
    DeclarativeBase, Mapped, mapped_column, sessionmaker, Session,
)

DATABASE_URL = os.getenv("DATABASE_URL", "sqlite:///./djeliya.db")
# Railway fournit parfois l'URL au format postgres:// (héritage) — SQLAlchemy veut postgresql://
if DATABASE_URL.startswith("postgres://"):
    DATABASE_URL = DATABASE_URL.replace("postgres://", "postgresql://", 1)

connect_args = {"check_same_thread": False} if DATABASE_URL.startswith("sqlite") else {}
engine = create_engine(DATABASE_URL, connect_args=connect_args)
SessionLocal = sessionmaker(bind=engine, autoflush=False, autocommit=False)


class Base(DeclarativeBase):
    pass


def now():
    return datetime.now(timezone.utc)


# ----------------------------------------------------------------- modèles
class Utilisateur(Base):
    __tablename__ = "utilisateurs"
    id: Mapped[str] = mapped_column(primary_key=True)
    email: Mapped[str] = mapped_column(unique=True, index=True)
    nom: Mapped[str] = mapped_column(default="")
    mot_de_passe_hash: Mapped[str] = mapped_column()
    contribution_langues_locales: Mapped[bool] = mapped_column(Boolean, default=False)

    email_verifie: Mapped[bool] = mapped_column(Boolean, default=False)
    code_verification: Mapped[str | None] = mapped_column(nullable=True)
    code_verification_expire: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    code_reinitialisation: Mapped[str | None] = mapped_column(nullable=True)
    code_reinitialisation_expire: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)

    est_admin: Mapped[bool] = mapped_column(Boolean, default=False)
    credits: Mapped[float] = mapped_column(default=0)
    forfait_actuel: Mapped[str | None] = mapped_column(nullable=True)

    cgu_acceptees_le: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    cgu_version: Mapped[str | None] = mapped_column(nullable=True)

    cree_le: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=now)


class Corpus(Base):
    __tablename__ = "corpus"
    id: Mapped[str] = mapped_column(primary_key=True)
    nom: Mapped[str] = mapped_column()
    proprietaire_id: Mapped[str] = mapped_column(ForeignKey("utilisateurs.id"))
    code_invitation: Mapped[str] = mapped_column(unique=True, index=True)
    cree_le: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=now)

    analyse_statut: Mapped[str | None] = mapped_column(nullable=True)
    analyse: Mapped[dict | None] = mapped_column(JSON, nullable=True)
    analyse_erreur: Mapped[str | None] = mapped_column(Text, nullable=True)
    analyse_contexte: Mapped[str | None] = mapped_column(nullable=True)
    analyse_methode: Mapped[str | None] = mapped_column(nullable=True)
    analyse_modele: Mapped[str | None] = mapped_column(nullable=True)
    analyse_nb_entretiens: Mapped[int | None] = mapped_column(nullable=True)
    analyse_langue: Mapped[str | None] = mapped_column(nullable=True)


class MembreCorpus(Base):
    __tablename__ = "membres_corpus"
    id: Mapped[str] = mapped_column(primary_key=True)
    corpus_id: Mapped[str] = mapped_column(ForeignKey("corpus.id"), index=True)
    utilisateur_id: Mapped[str] = mapped_column(ForeignKey("utilisateurs.id"), index=True)
    role: Mapped[str] = mapped_column(default="codeur")  # "proprietaire" | "codeur"
    rejoint_le: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=now)


class Entretien(Base):
    __tablename__ = "entretiens"
    id: Mapped[str] = mapped_column(primary_key=True)
    proprietaire_id: Mapped[str] = mapped_column(ForeignKey("utilisateurs.id"), index=True)
    corpus_id: Mapped[str | None] = mapped_column(ForeignKey("corpus.id"), nullable=True, index=True)
    titre: Mapped[str] = mapped_column(default="")
    langue: Mapped[str] = mapped_column(default="auto")
    statut: Mapped[str] = mapped_column(default="en_attente")
    erreur: Mapped[str | None] = mapped_column(Text, nullable=True)
    note: Mapped[str | None] = mapped_column(Text, nullable=True)
    langue_detectee: Mapped[str | None] = mapped_column(nullable=True)
    segments: Mapped[list] = mapped_column(JSON, default=list)
    locuteurs: Mapped[list] = mapped_column(JSON, default=list)  # segments de diarisation

    analyse_statut: Mapped[str | None] = mapped_column(nullable=True)
    analyse: Mapped[dict | None] = mapped_column(JSON, nullable=True)
    analyse_erreur: Mapped[str | None] = mapped_column(Text, nullable=True)
    analyse_contexte: Mapped[str | None] = mapped_column(nullable=True)
    analyse_modele: Mapped[str | None] = mapped_column(nullable=True)
    analyse_methode: Mapped[str | None] = mapped_column(nullable=True)
    analyse_langue: Mapped[str | None] = mapped_column(nullable=True)

    cree_le: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=now)


class Codage(Base):
    """Un codage indépendant d'un segment par un chercheur, pour le calcul de fiabilité inter-codeurs."""
    __tablename__ = "codages"
    id: Mapped[str] = mapped_column(primary_key=True)
    entretien_id: Mapped[str] = mapped_column(ForeignKey("entretiens.id"), index=True)
    utilisateur_id: Mapped[str] = mapped_column(ForeignKey("utilisateurs.id"), index=True)
    segment_index: Mapped[int] = mapped_column()
    code: Mapped[str] = mapped_column()  # libellé de thème choisi par le codeur
    cree_le: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=now)


class Forfait(Base):
    """Catalogue des forfaits payants, gérable par l'administrateur."""
    __tablename__ = "forfaits"
    id: Mapped[str] = mapped_column(primary_key=True)
    nom: Mapped[str] = mapped_column()
    prix_fcfa: Mapped[int] = mapped_column(default=0)
    credits_inclus: Mapped[float] = mapped_column(default=0)
    description: Mapped[str] = mapped_column(default="")
    actif: Mapped[bool] = mapped_column(Boolean, default=True)
    cree_le: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=now)


class MouvementCredit(Base):
    """Journal des mouvements de crédits, pour la transparence et l'audit."""
    __tablename__ = "mouvements_credit"
    id: Mapped[str] = mapped_column(primary_key=True)
    utilisateur_id: Mapped[str] = mapped_column(ForeignKey("utilisateurs.id"), index=True)
    delta: Mapped[float] = mapped_column()
    motif: Mapped[str] = mapped_column(default="")
    cree_le: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=now)


class Commande(Base):
    """Commande de recharge de crédits à la carte (paiement réel, hors forfaits
    prédéfinis) — 150 FCFA par crédit, 10 crédits minimum, sans limite de nombre
    d'achats. Le statut passe de en_attente à payee (webhook du fournisseur) ou
    a echouee/expiree."""
    __tablename__ = "commandes"
    id: Mapped[str] = mapped_column(primary_key=True)
    utilisateur_id: Mapped[str] = mapped_column(ForeignKey("utilisateurs.id"), index=True)
    credits: Mapped[float] = mapped_column()
    montant_fcfa: Mapped[int] = mapped_column()
    statut: Mapped[str] = mapped_column(default="en_attente")  # en_attente | payee | echouee | expiree
    fournisseur: Mapped[str | None] = mapped_column(nullable=True)
    reference_fournisseur: Mapped[str | None] = mapped_column(nullable=True, index=True)
    lien_paiement: Mapped[str | None] = mapped_column(nullable=True)
    cree_le: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=now)
    payee_le: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)


class EtudeQuantitative(Base):
    """Cadre théorique, revue de littérature, méthodologie et questionnaire générés
    par l'IA à partir d'un thème et d'une question de recherche — pendant quantitatif
    du guide d'entretien qualitatif."""
    __tablename__ = "etudes_quantitatives"
    id: Mapped[str] = mapped_column(primary_key=True)
    proprietaire_id: Mapped[str] = mapped_column(ForeignKey("utilisateurs.id"), index=True)
    theme: Mapped[str] = mapped_column()
    question_recherche: Mapped[str] = mapped_column(default="")
    langue: Mapped[str] = mapped_column(default="fr")
    statut: Mapped[str] = mapped_column(default="en_cours")  # en_cours | termine | erreur
    contenu: Mapped[dict | None] = mapped_column(JSON, nullable=True)
    erreur: Mapped[str | None] = mapped_column(Text, nullable=True)
    modele: Mapped[str | None] = mapped_column(nullable=True)
    cree_le: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=now)


class AnalyseQuantitative(Base):
    """Résultats de l'analyse statistique d'un jeu de données importé (rempli à
    partir du gabarit Excel généré pour une étude quantitative donnée)."""
    __tablename__ = "analyses_quantitatives"
    id: Mapped[str] = mapped_column(primary_key=True)
    etude_id: Mapped[str] = mapped_column(ForeignKey("etudes_quantitatives.id"), index=True)
    proprietaire_id: Mapped[str] = mapped_column(ForeignKey("utilisateurs.id"), index=True)
    nom_fichier: Mapped[str] = mapped_column(default="")
    statut: Mapped[str] = mapped_column(default="en_cours")  # en_cours | termine | erreur
    resultats: Mapped[dict | None] = mapped_column(JSON, nullable=True)
    erreur: Mapped[str | None] = mapped_column(Text, nullable=True)
    modele: Mapped[str | None] = mapped_column(nullable=True)
    cree_le: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=now)


class GuideEntretien(Base):
    """Guide d'entretien de recherche généré par l'IA à partir d'un thème et d'une
    question de recherche — outil de préparation, distinct des entretiens transcrits."""
    __tablename__ = "guides_entretien"
    id: Mapped[str] = mapped_column(primary_key=True)
    proprietaire_id: Mapped[str] = mapped_column(ForeignKey("utilisateurs.id"), index=True)
    theme: Mapped[str] = mapped_column()
    question_recherche: Mapped[str] = mapped_column(default="")
    langue: Mapped[str] = mapped_column(default="fr")
    statut: Mapped[str] = mapped_column(default="en_cours")  # en_cours | termine | erreur
    guide: Mapped[dict | None] = mapped_column(JSON, nullable=True)
    erreur: Mapped[str | None] = mapped_column(Text, nullable=True)
    modele: Mapped[str | None] = mapped_column(nullable=True)
    cree_le: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=now)


class ContributionLangue(Base):
    """
    Corrections manuelles apportées par les chercheurs sur des segments en langue
    locale (dioula, baoulé...), avec consentement explicite — en vue d'un futur
    cycle de fine-tuning (jamais un réentraînement automatique). Voir
    docs/strategie-langues-locales.md.
    """
    __tablename__ = "contributions_langues"
    id: Mapped[str] = mapped_column(primary_key=True)
    utilisateur_id: Mapped[str] = mapped_column(ForeignKey("utilisateurs.id"), index=True)
    langue: Mapped[str] = mapped_column(index=True)
    texte_original: Mapped[str] = mapped_column(Text)
    texte_corrige: Mapped[str] = mapped_column(Text)
    cree_le: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=now)


def init_db():
    Base.metadata.create_all(engine)
    _migrer_colonnes_manquantes()
    _promouvoir_admin()


ADMIN_EMAIL = "dosso.choilio@gmail.com"


def _promouvoir_admin():
    """S'assure que le compte administrateur du projet a toujours les droits admin
    et un solde de crédits illimité en pratique — idempotent, sans effet si déjà fait."""
    from sqlalchemy import inspect, text
    inspecteur = inspect(engine)
    if "utilisateurs" not in inspecteur.get_table_names():
        return
    with engine.connect() as conn:
        conn.execute(text(
            "UPDATE utilisateurs SET est_admin = :vrai, email_verifie = :vrai "
            "WHERE email = :email"
        ), {"vrai": True, "email": ADMIN_EMAIL})
        conn.commit()


# Type SQL portable (SQLite + PostgreSQL) pour chaque colonne ajoutée après le
# premier déploiement — create_all() ne modifie jamais les tables existantes.
_COLONNES_ATTENDUES = {
    "utilisateurs": {
        "contribution_langues_locales": "BOOLEAN DEFAULT {bool_false}",
        "email_verifie": "BOOLEAN DEFAULT {bool_false}",
        "code_verification": "VARCHAR",
        "code_verification_expire": "TIMESTAMP",
        "code_reinitialisation": "VARCHAR",
        "code_reinitialisation_expire": "TIMESTAMP",
        "est_admin": "BOOLEAN DEFAULT {bool_false}",
        "credits": "FLOAT DEFAULT 0",
        "forfait_actuel": "VARCHAR",
        "cgu_acceptees_le": "TIMESTAMP",
        "cgu_version": "VARCHAR",
    },
    "corpus": {
        "analyse_statut": "VARCHAR",
        "analyse": "{json_type}",
        "analyse_erreur": "TEXT",
        "analyse_contexte": "VARCHAR",
        "analyse_methode": "VARCHAR",
        "analyse_modele": "VARCHAR",
        "analyse_nb_entretiens": "INTEGER",
        "analyse_langue": "VARCHAR",
    },
    "entretiens": {"analyse_methode": "VARCHAR", "analyse_langue": "VARCHAR"},
}


def _migrer_colonnes_manquantes():
    """Filet de sécurité léger : ajoute les colonnes créées après un premier déploiement."""
    from sqlalchemy import inspect, text
    inspecteur = inspect(engine)
    est_sqlite = DATABASE_URL.startswith("sqlite")
    json_type = "JSON" if est_sqlite else "JSONB"
    bool_false = "0" if est_sqlite else "false"

    for table, colonnes in _COLONNES_ATTENDUES.items():
        if table not in inspecteur.get_table_names():
            continue
        existantes = {c["name"] for c in inspecteur.get_columns(table)}
        for nom, type_sql in colonnes.items():
            if nom in existantes:
                continue
            type_sql = type_sql.format(json_type=json_type, bool_false=bool_false)
            with engine.connect() as conn:
                conn.execute(text(f"ALTER TABLE {table} ADD COLUMN {nom} {type_sql}"))
                conn.commit()


def get_session() -> Session:
    return SessionLocal()
