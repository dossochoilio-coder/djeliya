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
    DeclarativeBase, Mapped, mapped_column, relationship, sessionmaker, Session,
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
    cree_le: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=now)


class Corpus(Base):
    __tablename__ = "corpus"
    id: Mapped[str] = mapped_column(primary_key=True)
    nom: Mapped[str] = mapped_column()
    proprietaire_id: Mapped[str] = mapped_column(ForeignKey("utilisateurs.id"))
    code_invitation: Mapped[str] = mapped_column(unique=True, index=True)
    cree_le: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=now)


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


def _migrer_colonnes_manquantes():
    """Filet de sécurité léger : ajoute les colonnes créées après un premier déploiement
    (create_all ne modifie jamais les tables existantes, seulement les nouvelles)."""
    from sqlalchemy import inspect, text
    inspecteur = inspect(engine)
    if "utilisateurs" not in inspecteur.get_table_names():
        return
    colonnes = {c["name"] for c in inspecteur.get_columns("utilisateurs")}
    if "contribution_langues_locales" not in colonnes:
        with engine.connect() as conn:
            defaut = "0" if DATABASE_URL.startswith("sqlite") else "false"
            conn.execute(text(
                f"ALTER TABLE utilisateurs ADD COLUMN contribution_langues_locales BOOLEAN DEFAULT {defaut}"
            ))
            conn.commit()


def get_session() -> Session:
    return SessionLocal()
