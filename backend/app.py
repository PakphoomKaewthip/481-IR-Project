import csv
import base64
import hashlib
import hmac
import json
import os
import pickle
import random
import secrets
import sys
import time
import warnings
from functools import lru_cache
from pathlib import Path
from urllib.error import HTTPError, URLError
from urllib.request import Request, urlopen

import numpy as np
from flask import Flask, request, jsonify, Response, g
import traceback
from sklearn.metrics.pairwise import cosine_similarity
from backend.search.elastic_search import search as elastic_search, suggest_query
PROJECT_ROOT = Path(__file__).resolve().parent.parent
if str(PROJECT_ROOT) not in sys.path:
    sys.path.insert(0, str(PROJECT_ROOT))

from db import get_connection

app = Flask(__name__)
recipes_csv_path = PROJECT_ROOT / "resources" / "recipes_final_for_search.csv"
model_artifacts_path = Path(__file__).resolve().parent / "model_artifacts"
JWT_SECRET = os.environ.get("JWT_SECRET", "ir-project-dev-secret")
JWT_EXP_SECONDS = 60 * 60 * 24


def load_recipe_image_map():
    image_map = {}

    with recipes_csv_path.open(newline="", encoding="utf-8") as csv_file:
        reader = csv.DictReader(csv_file)
        for row in reader:
            recipe_id = (row.get("recipe_id") or "").strip()
            image_url = (row.get("images") or "").strip()
            if recipe_id and image_url:
                image_map[recipe_id] = image_url

    return image_map

RECIPE_IMAGE_MAP = load_recipe_image_map()


def load_recipe_lookup():
    recipe_lookup = {}

    with recipes_csv_path.open(newline="", encoding="utf-8") as csv_file:
        reader = csv.DictReader(csv_file)
        for row in reader:
            recipe_id = (row.get("recipe_id") or "").strip()
            if not recipe_id:
                continue
            recipe_lookup[int(recipe_id)] = {
                "recipe_id": int(recipe_id),
                "name": row.get("name", ""),
                "description": row.get("description", ""),
                "category": row.get("category", ""),
                "images": row.get("images", ""),
                "ingredient_parts": row.get("ingredient_parts", ""),
                "instructions": row.get("instructions", ""),
                "keywords": row.get("keywords", ""),
            }

    return recipe_lookup


RECIPE_LOOKUP = load_recipe_lookup()


@lru_cache(maxsize=1)
def load_recommendation_resources():
    recipe_text_lookup = {}

    with recipes_csv_path.open(newline="", encoding="utf-8") as csv_file:
        reader = csv.DictReader(csv_file)
        for row in reader:
            recipe_id = (row.get("recipe_id") or "").strip()
            if not recipe_id:
                continue
            recipe_text_lookup[int(recipe_id)] = (
                row.get("search_text")
                or row.get("processed_text")
                or row.get("description")
                or ""
            )

    with warnings.catch_warnings():
        warnings.simplefilter("ignore")
        with (model_artifacts_path / "tfidf.pkl").open("rb") as artifact_file:
            tfidf = pickle.load(artifact_file)
        with (model_artifacts_path / "svd.pkl").open("rb") as artifact_file:
            svd = pickle.load(artifact_file)

    return {
        "recipe_text_lookup": recipe_text_lookup,
        "tfidf": tfidf,
        "svd": svd,
    }


def build_bookmark_suggestions(bookmarks, top_k=5):
    if not bookmarks:
        return []

    resources = load_recommendation_resources()
    recipe_text_lookup = resources["recipe_text_lookup"]
    tfidf = resources["tfidf"]
    svd = resources["svd"]

    vectorizable_bookmarks = []
    for bookmark in bookmarks:
        recipe_id = int(bookmark["recipe_id"])
        recipe_text = recipe_text_lookup.get(recipe_id, "").strip()
        if not recipe_text:
            continue

        vectorizable_bookmarks.append(
            {
                **bookmark,
                "recipe_id": recipe_id,
                "vector_text": recipe_text,
            }
        )

    if not vectorizable_bookmarks:
        return []

    texts = [bookmark["vector_text"] for bookmark in vectorizable_bookmarks]
    vectors = svd.transform(tfidf.transform(texts)).astype(np.float32)
    vectors /= np.maximum(np.linalg.norm(vectors, axis=1, keepdims=True), 1e-12)

    weights = np.asarray(
        [max(float(bookmark.get("rating") or 0), 1.0) for bookmark in vectorizable_bookmarks],
        dtype=np.float32,
    )
    profile_vector = np.average(vectors, axis=0, weights=weights).astype(np.float32).reshape(1, -1)
    profile_vector /= np.maximum(np.linalg.norm(profile_vector, axis=1, keepdims=True), 1e-12)

    similarity_scores = cosine_similarity(profile_vector, vectors).ravel()
    ranked_indices = np.argsort(similarity_scores)[::-1][:top_k]

    suggestions = []
    for index in ranked_indices:
        bookmark = vectorizable_bookmarks[int(index)]
        score = float(similarity_scores[int(index)])
        recipe = RECIPE_LOOKUP.get(bookmark["recipe_id"], {})

        suggestions.append(
            {
                "bookmark_id": bookmark["bookmark_id"],
                "recipe_id": bookmark["recipe_id"],
                "rating": bookmark["rating"],
                "folder_id": str(bookmark["folder_id"]) if bookmark["folder_id"] is not None else "",
                "folder": bookmark["folder"],
                "created_at": bookmark["created_at"].isoformat() if bookmark["created_at"] else None,
                "score": round(score, 4),
                "recipe": serialize_recipe(recipe),
            }
        )

    return suggestions


def serialize_recipe(recipe):
    return {
        "recipe_id": recipe.get("recipe_id"),
        "name": recipe.get("name", ""),
        "description": recipe.get("description", ""),
        "category": recipe.get("category", ""),
        "images": recipe.get("images", ""),
        "ingredient_parts": recipe.get("ingredient_parts", ""),
        "instructions": recipe.get("instructions", ""),
        "keywords": recipe.get("keywords", ""),
    }


def _b64url_encode(data):
    return base64.urlsafe_b64encode(data).rstrip(b"=").decode("ascii")


def _b64url_decode(data):
    padding = "=" * (-len(data) % 4)
    return base64.urlsafe_b64decode(data + padding)


def hash_password(password, salt=None):
    salt = salt or secrets.token_hex(16)
    derived = hashlib.scrypt(
        password.encode("utf-8"),
        salt=salt.encode("utf-8"),
        n=2**14,
        r=8,
        p=1,
    )
    return f"{salt}${derived.hex()}"


def verify_password(password, password_hash):
    try:
        salt, expected = password_hash.split("$", 1)
    except ValueError:
        return False

    candidate = hash_password(password, salt)
    return hmac.compare_digest(candidate, password_hash)


def create_token(payload):
    header = {"alg": "HS256", "typ": "JWT"}
    body = {
        **payload,
        "exp": int(time.time()) + JWT_EXP_SECONDS,
    }

    header_segment = _b64url_encode(json.dumps(header, separators=(",", ":")).encode("utf-8"))
    payload_segment = _b64url_encode(json.dumps(body, separators=(",", ":")).encode("utf-8"))
    signing_input = f"{header_segment}.{payload_segment}".encode("utf-8")
    signature = hmac.new(JWT_SECRET.encode("utf-8"), signing_input, hashlib.sha256).digest()

    return f"{header_segment}.{payload_segment}.{_b64url_encode(signature)}"


def decode_token(token):
    try:
        header_segment, payload_segment, signature_segment = token.split(".")
    except ValueError as exc:
        raise ValueError("Invalid token format") from exc

    signing_input = f"{header_segment}.{payload_segment}".encode("utf-8")
    expected_signature = hmac.new(JWT_SECRET.encode("utf-8"), signing_input, hashlib.sha256).digest()
    actual_signature = _b64url_decode(signature_segment)

    if not hmac.compare_digest(actual_signature, expected_signature):
        raise ValueError("Invalid token signature")

    payload = json.loads(_b64url_decode(payload_segment))
    if int(payload.get("exp", 0)) < int(time.time()):
        raise ValueError("Token expired")

    return payload


def get_bearer_token():
    auth_header = request.headers.get("Authorization", "")
    if not auth_header.startswith("Bearer "):
        return None
    return auth_header.split(" ", 1)[1].strip()


def require_auth():
    token = get_bearer_token()
    if not token:
        return jsonify({"error": "Missing bearer token"}), 401

    try:
        payload = decode_token(token)
    except ValueError as exc:
        return jsonify({"error": str(exc)}), 401

    g.current_user = {
        "user_id": int(payload["sub"]),
        "email": payload["email"],
        "username": payload.get("username", ""),
        "identifier": payload.get("identifier") or payload.get("username") or payload["email"],
    }
    return None


@app.after_request
def add_cors_headers(response):
    response.headers["Access-Control-Allow-Origin"] = "*"
    response.headers["Access-Control-Allow-Headers"] = "Content-Type, Authorization"
    response.headers["Access-Control-Allow-Methods"] = "GET, POST, OPTIONS"
    return response

@app.route("/")
def home():
    return "IR search API (Elasticsearch)"


@app.route("/auth/signup", methods=["POST"])
def signup():
    data = request.get_json(silent=True) or {}
    username = (data.get("username") or "").strip().lower()
    email = (data.get("email") or "").strip().lower()
    password = data.get("password") or ""

    if not username or not email or not password:
        return jsonify({"error": "Username, email, and password are required"}), 400

    conn = get_connection()
    cur = conn.cursor()

    try:
        cur.execute(
            """
            INSERT INTO users (username, email, password_hash)
            VALUES (%s, %s, %s)
            RETURNING user_id, username, email
            """,
            (username or None, email or None, hash_password(password)),
        )
        user_id, saved_username, saved_email = cur.fetchone()
        conn.commit()
    except Exception:
        conn.rollback()
        cur.close()
        conn.close()
        return jsonify({"error": "Username or email already exists"}), 409

    cur.close()
    conn.close()

    identifier = saved_username or saved_email
    token = create_token(
        {"sub": user_id, "email": saved_email or "", "username": saved_username or "", "identifier": identifier}
    )
    return jsonify(
        {"token": token, "user": {"id": user_id, "username": saved_username, "email": saved_email, "identifier": identifier}}
    ), 201


@app.route("/auth/signin", methods=["POST"])
def signin():
    data = request.get_json(silent=True) or {}
    identifier = (data.get("identifier") or data.get("email") or "").strip().lower()
    password = data.get("password") or ""

    if not identifier or not password:
        return jsonify({"error": "Username or email and password are required"}), 400

    conn = get_connection()
    cur = conn.cursor()
    cur.execute(
        """
        SELECT user_id, username, email, password_hash
        FROM users
        WHERE email = %s OR username = %s
        """,
        (identifier, identifier),
    )
    row = cur.fetchone()
    cur.close()
    conn.close()

    if not row or not verify_password(password, row[3]):
        return jsonify({"error": "Invalid username/email or password"}), 401

    resolved_identifier = row[1] or row[2]
    token = create_token(
        {"sub": row[0], "username": row[1] or "", "email": row[2] or "", "identifier": resolved_identifier}
    )
    return jsonify(
        {
            "token": token,
            "user": {"id": row[0], "username": row[1], "email": row[2], "identifier": resolved_identifier},
        }
    )


@app.route("/auth/me")
def me():
    auth_error = require_auth()
    if auth_error:
        return auth_error

    return jsonify({"user": g.current_user})


from flask import redirect, jsonify
import ast

@app.route("/recipe-image/<int:recipe_id>")
def recipe_image(recipe_id):
    raw = RECIPE_IMAGE_MAP.get(str(recipe_id))

    if not raw:
        return jsonify({"error": "Image not found"}), 404

    try:
        parsed = ast.literal_eval(raw)

        if isinstance(parsed, list) and len(parsed) > 0:
            return redirect(parsed[0])
    except:
        return redirect(raw)

    return jsonify({"error": "Invalid image format"}), 500


@app.route("/recipes/random")
def random_recipes():
    limit = max(1, min(int(request.args.get("limit", 8)), 24))
    pool = list(RECIPE_LOOKUP.values())
    sampled = random.sample(pool, min(limit, len(pool)))
    return jsonify([serialize_recipe(recipe) for recipe in sampled])

@app.route("/search")
def search_api():
    auth_error = require_auth()
    if auth_error:
        return auth_error

    q = request.args.get("q", "").strip()
    user_id = g.current_user["user_id"]

    if not q:
        return jsonify([])

    try:
        results = elastic_search(q, top_k=5)

        # 👉 ถ้ามี user → เช็ค bookmark
        conn = get_connection()
        cur = conn.cursor()

        recipe_ids = [r["recipe_id"] for r in results]

        if recipe_ids:
            cur.execute("""
                SELECT recipe_id
                FROM bookmarks
                WHERE user_id = %s AND recipe_id = ANY(%s)
            """, (user_id, recipe_ids))

            bookmarked = {row[0] for row in cur.fetchall()}
        else:
            bookmarked = set()

        for r in results:
            r["is_bookmarked"] = r["recipe_id"] in bookmarked

        cur.close()
        conn.close()

        return jsonify(results)

    except Exception as e:
        traceback.print_exc()
        return jsonify({"error": str(e)}), 500

@app.route("/bookmark", methods=["POST"])
def add_bookmark():
    auth_error = require_auth()
    if auth_error:
        return auth_error

    data = request.json

    conn = get_connection()
    cur = conn.cursor()

    cur.execute("""
        INSERT INTO bookmarks (user_id, recipe_id, folder_id, rating)
        VALUES (%s, %s, %s, %s)
        ON CONFLICT (user_id, recipe_id)
        DO UPDATE SET folder_id = EXCLUDED.folder_id, rating = EXCLUDED.rating
        RETURNING bookmark_id, recipe_id, rating, folder_id, created_at
    """, (
        g.current_user["user_id"],
        data["recipe_id"],
        data.get("folder_id"),
        data.get("rating", 3)
    ))

    row = cur.fetchone()

    folder_name = None
    if row[3] is not None:
        cur.execute(
            """
            SELECT folder_name
            FROM folders
            WHERE folder_id = %s AND user_id = %s
            """,
            (row[3], g.current_user["user_id"]),
        )
        folder_result = cur.fetchone()
        folder_name = folder_result[0] if folder_result else None

    conn.commit()
    cur.close()
    conn.close()

    return jsonify({
        "status": "ok",
        "bookmark": {
            "bookmark_id": row[0],
            "recipe_id": row[1],
            "rating": row[2],
            "folder_id": str(row[3]) if row[3] is not None else "",
            "folder": folder_name,
            "created_at": row[4].isoformat() if row[4] else None,
            "recipe": RECIPE_LOOKUP.get(row[1], {}),
        }
    })


@app.route("/folders", methods=["GET", "POST"])
def folders_api():
    auth_error = require_auth()
    if auth_error:
        return auth_error

    user_id = g.current_user["user_id"]

    conn = get_connection()
    cur = conn.cursor()

    if request.method == "POST":
        data = request.get_json(silent=True) or {}
        folder_name = (data.get("folder_name") or "").strip()

        if not folder_name:
            cur.close()
            conn.close()
            return jsonify({"error": "Folder name is required"}), 400

        try:
            cur.execute(
                """
                INSERT INTO folders (user_id, folder_name)
                VALUES (%s, %s)
                RETURNING folder_id, folder_name, created_at
                """,
                (user_id, folder_name),
            )
            row = cur.fetchone()
            conn.commit()
            result = {
                "id": str(row[0]),
                "name": row[1],
                "createdAt": row[2].isoformat() if row[2] else None,
            }
            cur.close()
            conn.close()
            return jsonify(result), 201
        except Exception:
            conn.rollback()
            cur.close()
            conn.close()
            return jsonify({"error": "Folder already exists"}), 409

    cur.execute(
        """
        SELECT folder_id, folder_name, created_at
        FROM folders
        WHERE user_id = %s
        ORDER BY created_at DESC, folder_id DESC
        """,
        (user_id,),
    )

    rows = cur.fetchall()
    cur.close()
    conn.close()

    return jsonify(
        [
            {
                "id": str(row[0]),
                "name": row[1],
                "createdAt": row[2].isoformat() if row[2] else None,
            }
            for row in rows
        ]
    )

@app.route("/bookmarks")
def get_bookmarks():
    auth_error = require_auth()
    if auth_error:
        return auth_error

    user_id = g.current_user["user_id"]

    conn = get_connection()
    cur = conn.cursor()

    cur.execute("""
        SELECT b.bookmark_id, b.recipe_id, b.rating, b.folder_id, f.folder_name, b.created_at
        FROM bookmarks b
        LEFT JOIN folders f ON b.folder_id = f.folder_id
        WHERE b.user_id = %s
        ORDER BY b.rating DESC, b.created_at DESC
    """, (user_id,))

    rows = cur.fetchall()

    results = []
    for r in rows:
        recipe = RECIPE_LOOKUP.get(r[1], {})
        results.append({
            "bookmark_id": r[0],
            "recipe_id": r[1],
            "rating": r[2],
            "folder_id": str(r[3]) if r[3] is not None else "",
            "folder": r[4],
            "created_at": r[5].isoformat() if r[5] else None,
            "recipe": recipe,
        })

    cur.close()
    conn.close()

    return jsonify(results)


@app.route("/search/suggest")
def search_suggest():
    auth_error = require_auth()
    if auth_error:
        return auth_error

    q = request.args.get("q", "").strip()

    if not q or len(q) < 2:
        return jsonify([])

    try:
        suggestions = suggest_query(q, top_k=5)
        return jsonify(suggestions)
    except Exception as exc:
        traceback.print_exc()
        return jsonify([])


@app.route("/bookmarks/suggestions")
def get_bookmark_suggestions():
    auth_error = require_auth()
    if auth_error:
        return auth_error

    user_id = g.current_user["user_id"]
    limit = max(1, min(int(request.args.get("limit", 5)), 5))

    conn = get_connection()
    cur = conn.cursor()

    cur.execute("""
        SELECT b.bookmark_id, b.recipe_id, b.rating, b.folder_id, f.folder_name, b.created_at
        FROM bookmarks b
        LEFT JOIN folders f ON b.folder_id = f.folder_id
        WHERE b.user_id = %s
        ORDER BY b.rating DESC, b.created_at DESC
    """, (user_id,))

    rows = cur.fetchall()
    cur.close()
    conn.close()

    bookmarks = [
        {
            "bookmark_id": row[0],
            "recipe_id": row[1],
            "rating": row[2],
            "folder_id": row[3],
            "folder": row[4],
            "created_at": row[5],
        }
        for row in rows
    ]

    try:
        return jsonify(build_bookmark_suggestions(bookmarks, top_k=limit))
    except Exception as exc:
        traceback.print_exc()
        return jsonify({"error": f"Failed to load bookmark suggestions: {exc}"}), 500

if __name__ == "__main__":
    print("starting flask")
    app.run(debug=True)
