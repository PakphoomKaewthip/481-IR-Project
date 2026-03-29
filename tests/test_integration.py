"""
High-level Tests — Flask API endpoints (mock DB + ES)
รัน: pytest tests/test_highlevel_core.py -v
"""

import pytest
import pandas as pd
from datetime import datetime
from unittest.mock import patch, MagicMock


# ────────────────────────────────────────────────
# Helpers
# ────────────────────────────────────────────────

MOCK_RECIPES = {
    1: {"recipe_id": 1, "name": "Chicken Soup", "description": "Warm",
        "category": "Soup", "images": "", "ingredient_parts": "chicken",
        "instructions": "Boil", "keywords": "soup"},
    2: {"recipe_id": 2, "name": "Beef Stew", "description": "Rich",
        "category": "Main", "images": "", "ingredient_parts": "beef",
        "instructions": "Simmer", "keywords": "stew"},
}


def make_cursor(rows=None, fetchone_val=None):
    cur = MagicMock()
    cur.fetchall.return_value = rows or []
    cur.fetchone.return_value = fetchone_val
    return cur


def make_conn(cursor):
    conn = MagicMock()
    conn.cursor.return_value = cursor
    return conn


# ────────────────────────────────────────────────
# Flask app fixture
# ────────────────────────────────────────────────

@pytest.fixture(scope="module")
def app():
    mock_es = MagicMock()
    mock_es.info.return_value = {}

    mock_docs = pd.DataFrame({
        "recipe_id": [1, 2],
        "name": ["Chicken Soup", "Beef Stew"],
        "category": ["Soup", "Main"],
        "processed_text": ["chicken broth", "beef onion"],
        "description": ["Warm", "Rich"],
    })
    mock_indexer = MagicMock()
    mock_indexer.return_value.documents = mock_docs

    with patch("elasticsearch.Elasticsearch", return_value=mock_es), \
         patch("backend.search.elastic_search.build_es_client", return_value=mock_es), \
         patch("backend.search.elastic_search.Indexer_manual", mock_indexer), \
         patch("backend.app.load_recipe_image_map", return_value={"1": "['http://img.com/1.jpg']"}), \
         patch("backend.app.load_recipe_lookup", return_value=MOCK_RECIPES):

        import importlib
        import backend.app as app_module
        importlib.reload(app_module)
        app_module.app.config["TESTING"] = True
        yield app_module.app


@pytest.fixture
def client(app):
    return app.test_client()


@pytest.fixture
def token(app):
    with app.app_context():
        from backend.app import create_token
        return create_token({"sub": 1, "email": "test@test.com", "username": "tester"})


@pytest.fixture
def auth(token):
    return {"Authorization": f"Bearer {token}", "Content-Type": "application/json"}


# ════════════════════════════════════════════════
# AUTH endpoints
# ════════════════════════════════════════════════

class TestAuthEndpoints:

    def test_signup_success(self, client):
        cur = make_cursor(fetchone_val=(1, "john", "john@test.com"))
        with patch("backend.app.get_connection", return_value=make_conn(cur)):
            res = client.post("/auth/signup", json={
                "username": "john", "email": "john@test.com", "password": "pass123"
            })
        assert res.status_code == 201
        assert "token" in res.get_json()

    def test_signup_missing_fields_returns_400(self, client):
        res = client.post("/auth/signup", json={"username": "john"})
        assert res.status_code == 400

    def test_signup_duplicate_returns_409(self, client):
        cur = MagicMock()
        cur.execute.side_effect = Exception("duplicate key")
        with patch("backend.app.get_connection", return_value=make_conn(cur)):
            res = client.post("/auth/signup", json={
                "username": "john", "email": "john@test.com", "password": "pass123"
            })
        assert res.status_code == 409

    def test_signin_success(self, client, app):
        with app.app_context():
            from backend.app import hash_password
            pw_hash = hash_password("pass123")
        cur = make_cursor(fetchone_val=(1, "john", "john@test.com", pw_hash))
        with patch("backend.app.get_connection", return_value=make_conn(cur)):
            res = client.post("/auth/signin", json={
                "identifier": "john@test.com", "password": "pass123"
            })
        assert res.status_code == 200
        assert "token" in res.get_json()

    def test_signin_wrong_password_returns_401(self, client, app):
        with app.app_context():
            from backend.app import hash_password
            pw_hash = hash_password("correct")
        cur = make_cursor(fetchone_val=(1, "john", "john@test.com", pw_hash))
        with patch("backend.app.get_connection", return_value=make_conn(cur)):
            res = client.post("/auth/signin", json={
                "identifier": "john@test.com", "password": "wrong"
            })
        assert res.status_code == 401

    def test_signin_user_not_found_returns_401(self, client):
        cur = make_cursor(fetchone_val=None)
        with patch("backend.app.get_connection", return_value=make_conn(cur)):
            res = client.post("/auth/signin", json={
                "identifier": "nobody@test.com", "password": "pass"
            })
        assert res.status_code == 401

    def test_me_without_token_returns_401(self, client):
        assert client.get("/auth/me").status_code == 401

    def test_me_with_valid_token(self, client, auth):
        res = client.get("/auth/me", headers=auth)
        assert res.status_code == 200
        assert res.get_json()["user"]["email"] == "test@test.com"

    def test_me_with_invalid_token_returns_401(self, client):
        res = client.get("/auth/me", headers={"Authorization": "Bearer badtoken"})
        assert res.status_code == 401


# ════════════════════════════════════════════════
# SEARCH endpoints
# ════════════════════════════════════════════════

class TestSearchEndpoints:

    def test_search_without_auth_returns_401(self, client):
        assert client.get("/search?q=chicken").status_code == 401

    def test_search_empty_query_returns_empty_list(self, client, auth):
        res = client.get("/search?q=", headers=auth)
        assert res.status_code == 200
        assert res.get_json() == []

    def test_search_returns_results_with_bookmark_flag(self, client, auth):
        mock_results = [{
            "recipe_id": 1, "name": "Chicken Soup", "score": 0.9,
            "description": "Warm", "category": "Soup",
            "images": "", "ingredient_parts": "chicken", "instructions": "Boil",
        }]
        cur = make_cursor(rows=[])  # ไม่มี bookmark
        with patch("backend.app.elastic_search", return_value=mock_results), \
             patch("backend.app.get_connection", return_value=make_conn(cur)):
            res = client.get("/search?q=chicken", headers=auth)

        assert res.status_code == 200
        data = res.get_json()
        assert data[0]["recipe_id"] == 1
        assert data[0]["is_bookmarked"] is False

    def test_search_recipe_is_bookmarked(self, client, auth):
        mock_results = [{
            "recipe_id": 1, "name": "Chicken Soup", "score": 0.9,
            "description": "", "category": "Soup",
            "images": "", "ingredient_parts": "", "instructions": "",
        }]
        cur = make_cursor(rows=[(1,)])  # recipe 1 ถูก bookmark แล้ว
        with patch("backend.app.elastic_search", return_value=mock_results), \
             patch("backend.app.get_connection", return_value=make_conn(cur)):
            res = client.get("/search?q=chicken", headers=auth)

        assert res.get_json()[0]["is_bookmarked"] is True

    def test_suggest_without_auth_returns_401(self, client):
        assert client.get("/search/suggest?q=chicken").status_code == 401

    def test_suggest_short_query_returns_empty(self, client, auth):
        res = client.get("/search/suggest?q=a", headers=auth)
        assert res.status_code == 200
        assert res.get_json() == []

    def test_suggest_returns_suggestions(self, client, auth):
        with patch("backend.app.suggest_query", return_value=[
            {"original": "chiken", "suggestion": "chicken"}
        ]):
            res = client.get("/search/suggest?q=chiken", headers=auth)
        assert res.get_json()[0]["suggestion"] == "chicken"


# ════════════════════════════════════════════════
# BOOKMARK endpoints
# ════════════════════════════════════════════════

class TestBookmarkEndpoints:

    def test_add_bookmark_without_auth_returns_401(self, client):
        assert client.post("/bookmark", json={"recipe_id": 1}).status_code == 401

    def test_add_bookmark_success(self, client, auth):
        now = datetime(2024, 1, 1)
        cur = make_cursor(fetchone_val=(10, 1, 4, None, now))
        with patch("backend.app.get_connection", return_value=make_conn(cur)):
            res = client.post("/bookmark", headers=auth, json={"recipe_id": 1, "rating": 4})

        assert res.status_code == 200
        bm = res.get_json()["bookmark"]
        assert bm["recipe_id"] == 1
        assert bm["rating"] == 4

    def test_get_bookmarks_without_auth_returns_401(self, client):
        assert client.get("/bookmarks").status_code == 401

    def test_get_bookmarks_returns_list(self, client, auth):
        now = datetime(2024, 1, 1)
        cur = make_cursor(rows=[(10, 1, 4, None, None, now)])
        with patch("backend.app.get_connection", return_value=make_conn(cur)):
            res = client.get("/bookmarks", headers=auth)

        assert res.status_code == 200
        data = res.get_json()
        assert data[0]["bookmark_id"] == 10
        assert data[0]["recipe_id"] == 1


# ════════════════════════════════════════════════
# FOLDER endpoints
# ════════════════════════════════════════════════

class TestFolderEndpoints:

    def test_create_folder_without_auth_returns_401(self, client):
        assert client.post("/folders", json={"folder_name": "test"}).status_code == 401

    def test_create_folder_success(self, client, auth):
        now = datetime(2024, 1, 1)
        cur = make_cursor(fetchone_val=(5, "Favorites", now))
        with patch("backend.app.get_connection", return_value=make_conn(cur)):
            res = client.post("/folders", headers=auth, json={"folder_name": "Favorites"})

        assert res.status_code == 201
        assert res.get_json()["name"] == "Favorites"

    def test_create_folder_empty_name_returns_400(self, client, auth):
        cur = make_cursor()
        with patch("backend.app.get_connection", return_value=make_conn(cur)):
            res = client.post("/folders", headers=auth, json={"folder_name": "  "})
        assert res.status_code == 400

    def test_create_duplicate_folder_returns_409(self, client, auth):
        cur = MagicMock()
        cur.execute.side_effect = [None, Exception("unique constraint")]
        with patch("backend.app.get_connection", return_value=make_conn(cur)):
            res = client.post("/folders", headers=auth, json={"folder_name": "Favorites"})
        assert res.status_code == 409

    def test_get_folders_returns_list(self, client, auth):
        now = datetime(2024, 1, 1)
        cur = make_cursor(rows=[(1, "Favorites", now), (2, "Later", now)])
        with patch("backend.app.get_connection", return_value=make_conn(cur)):
            res = client.get("/folders", headers=auth)

        assert res.status_code == 200
        assert len(res.get_json()) == 2

    def test_delete_folder_without_auth_returns_401(self, client):
        assert client.delete("/folders/1").status_code == 401

    def test_delete_folder_success(self, client, auth):
        cur = make_cursor()
        with patch("backend.app.get_connection", return_value=make_conn(cur)):
            res = client.delete("/folders/1", headers=auth)
        assert res.status_code == 200
        assert res.get_json()["status"] == "deleted"