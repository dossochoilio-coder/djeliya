"""
Tests de la suppression de corpus — préserve les entretiens rattachés (jamais
supprimés, juste détachés), refuse à quiconque n'est pas propriétaire.
"""

from app.db import get_session, Entretien


def test_suppression_corpus_preserve_les_entretiens(client, utilisateur):
    r_corpus = client.post("/api/corpus", json={"nom": "Corpus test"}, headers=utilisateur["headers"])
    corpus_id = r_corpus.json()["id"]

    session = get_session()
    try:
        session.add(Entretien(
            id="entretien-rattache", proprietaire_id=utilisateur["id"], corpus_id=corpus_id,
            titre="Entretien test", statut="termine",
        ))
        session.commit()
    finally:
        session.close()

    r_suppr = client.delete(f"/api/corpus/{corpus_id}", headers=utilisateur["headers"])
    assert r_suppr.status_code == 200, r_suppr.text

    r_corpus_apres = client.get("/api/corpus", headers=utilisateur["headers"])
    assert not any(c["id"] == corpus_id for c in r_corpus_apres.json())

    session2 = get_session()
    try:
        entretien = session2.get(Entretien, "entretien-rattache")
        assert entretien is not None, "L'entretien ne doit jamais être supprimé"
        assert entretien.corpus_id is None, "L'entretien doit être détaché, pas supprimé"
    finally:
        session2.close()


def test_suppression_corpus_refusee_a_un_non_proprietaire(client, utilisateur, autre_utilisateur):
    r_corpus = client.post("/api/corpus", json={"nom": "Corpus privé"}, headers=utilisateur["headers"])
    corpus_id = r_corpus.json()["id"]

    r_suppr = client.delete(f"/api/corpus/{corpus_id}", headers=autre_utilisateur["headers"])
    assert r_suppr.status_code == 403

    r_liste = client.get("/api/corpus", headers=utilisateur["headers"])
    assert any(c["id"] == corpus_id for c in r_liste.json()), "Le corpus doit toujours exister"


def test_suppression_corpus_inexistant_404(client, utilisateur):
    r = client.delete("/api/corpus/id-qui-nexiste-pas", headers=utilisateur["headers"])
    assert r.status_code == 404
