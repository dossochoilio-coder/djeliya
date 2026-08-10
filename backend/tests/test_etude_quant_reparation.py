"""
Tests de la réparation automatique des codes d'items dupliqués entre sections
du questionnaire quantitatif — deux bugs réels trouvés et corrigés ici :
1. Les études générées avant le correctif de renumérotation collisionnaient
   les codes entre sections (chaque section repartait de "Q1"), faisant lire
   les mêmes colonnes à plusieurs construits différents.
2. La toute première tentative de réparation automatique ne fonctionnait pas :
   les dictionnaires imbriqués étaient mutés AVANT d'être copiés, si bien que
   SQLAlchemy ne détectait aucun changement à sauvegarder
   (session.is_modified() renvoyait False). Corrigé par une copie profonde
   effectuée AVANT toute mutation.
"""

from app.db import get_session, EtudeQuantitative
from app.main import _reparer_codes_questionnaire_si_necessaire


def _etude_avec_codes_dupliques(session, proprietaire_id: str, etude_id: str) -> EtudeQuantitative:
    sections = [
        {"titre": "S1", "items": [{"code": f"Q{i}", "libelle": f"a{i}"} for i in range(1, 4)]},
        {"titre": "S2", "items": [{"code": f"Q{i}", "libelle": f"b{i}"} for i in range(1, 4)]},
    ]
    e = EtudeQuantitative(
        id=etude_id, proprietaire_id=proprietaire_id, theme="Test", langue="fr", statut="termine",
        contenu={"titre": "T", "questionnaire": {"sections": sections}},
    )
    session.add(e)
    session.commit()
    return e


def test_detecte_et_repare_les_codes_dupliques(utilisateur):
    session = get_session()
    try:
        e = _etude_avec_codes_dupliques(session, utilisateur["id"], "etude-dup-1")
        codes_avant = [it["code"] for s in e.contenu["questionnaire"]["sections"] for it in s["items"]]
        assert codes_avant == ["Q1", "Q2", "Q3", "Q1", "Q2", "Q3"]

        repare = _reparer_codes_questionnaire_si_necessaire(e, session)
        assert repare is True

        codes_apres = [it["code"] for s in e.contenu["questionnaire"]["sections"] for it in s["items"]]
        assert codes_apres == ["Q1", "Q2", "Q3", "Q4", "Q5", "Q6"]
    finally:
        session.close()


def test_la_reparation_persiste_reellement_en_base(utilisateur):
    """Le test le plus important : vérifie que la correction est bien
    sauvegardée en base (pas seulement en mémoire dans l'objet Python) — c'est
    exactement ce qui avait échoué silencieusement avant la copie profonde."""
    session = get_session()
    try:
        e = _etude_avec_codes_dupliques(session, utilisateur["id"], "etude-dup-2")
        _reparer_codes_questionnaire_si_necessaire(e, session)
        session.close()

        session2 = get_session()
        e2 = session2.get(EtudeQuantitative, "etude-dup-2")
        codes = [it["code"] for s in e2.contenu["questionnaire"]["sections"] for it in s["items"]]
        assert codes == ["Q1", "Q2", "Q3", "Q4", "Q5", "Q6"]
        session2.close()
    finally:
        pass


def test_ne_touche_pas_une_etude_deja_correcte(utilisateur):
    session = get_session()
    try:
        sections = [
            {"titre": "S1", "items": [{"code": "Q1"}, {"code": "Q2"}]},
            {"titre": "S2", "items": [{"code": "Q3"}, {"code": "Q4"}]},
        ]
        e = EtudeQuantitative(
            id="etude-deja-ok", proprietaire_id=utilisateur["id"], theme="T", langue="fr", statut="termine",
            contenu={"titre": "T", "questionnaire": {"sections": sections}},
        )
        session.add(e)
        session.commit()

        repare = _reparer_codes_questionnaire_si_necessaire(e, session)
        assert repare is False
    finally:
        session.close()
