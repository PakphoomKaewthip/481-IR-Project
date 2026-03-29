"""
Unit Tests — test ฟังก์ชันล้วนๆ ไม่ต้อง Flask / DB / ES
รัน: pytest tests/test_unit_core.py -v
"""

import json
import time
import pytest
from unittest.mock import patch


# ════════════════════════════════════════════════
# AUTH — password hashing
# ════════════════════════════════════════════════

class TestPassword:

    def test_hash_format(self):
        from backend.app import hash_password
        result = hash_password("mypassword")
        parts = result.split("$")
        assert len(parts) == 2
        assert len(parts[0]) == 32  # salt = 16 bytes hex

    def test_same_password_different_hash(self):
        from backend.app import hash_password
        assert hash_password("pass") != hash_password("pass")  # salt ต่างกันทุกครั้ง

    def test_verify_correct(self):
        from backend.app import hash_password, verify_password
        h = hash_password("correct")
        assert verify_password("correct", h) is True

    def test_verify_wrong(self):
        from backend.app import hash_password, verify_password
        h = hash_password("correct")
        assert verify_password("wrong", h) is False

    def test_verify_invalid_format(self):
        from backend.app import verify_password
        assert verify_password("any", "no_dollar_sign") is False


# ════════════════════════════════════════════════
# AUTH — JWT
# ════════════════════════════════════════════════

class TestJWT:

    def test_create_and_decode(self):
        from backend.app import create_token, decode_token
        token = create_token({"sub": 1, "email": "a@b.com"})
        payload = decode_token(token)
        assert payload["sub"] == 1
        assert payload["email"] == "a@b.com"

    def test_token_has_three_segments(self):
        from backend.app import create_token
        token = create_token({"sub": 1, "email": "a@b.com"})
        assert token.count(".") == 2

    def test_tampered_signature_raises(self):
        from backend.app import create_token, decode_token
        token = create_token({"sub": 1, "email": "a@b.com"})
        parts = token.split(".")
        parts[2] = parts[2][:-3] + "xxx"
        with pytest.raises(ValueError, match="Invalid token signature"):
            decode_token(".".join(parts))

    def test_expired_token_raises(self):
        from backend.app import _b64url_encode, decode_token, JWT_SECRET
        import hmac, hashlib

        header = _b64url_encode(b'{"alg":"HS256","typ":"JWT"}')
        body = _b64url_encode(json.dumps({
            "sub": 1, "email": "x@y.com", "exp": int(time.time()) - 999
        }).encode())
        sig = hmac.new(JWT_SECRET.encode(), f"{header}.{body}".encode(), hashlib.sha256).digest()
        expired_token = f"{header}.{body}.{_b64url_encode(sig)}"

        with pytest.raises(ValueError, match="Token expired"):
            decode_token(expired_token)

    def test_invalid_format_raises(self):
        from backend.app import decode_token
        with pytest.raises(ValueError, match="Invalid token format"):
            decode_token("not.valid")


# ════════════════════════════════════════════════
# SEARCH — hybrid scoring helpers
# ════════════════════════════════════════════════

class TestMinmaxNormalize:

    def test_normal(self):
        from backend.search.elastic_search import minmax_normalize
        assert minmax_normalize([0, 5, 10]) == [0.0, 0.5, 1.0]

    def test_all_same_returns_ones(self):
        from backend.search.elastic_search import minmax_normalize
        assert all(v == 1.0 for v in minmax_normalize([3, 3, 3]))

    def test_empty(self):
        from backend.search.elastic_search import minmax_normalize
        assert minmax_normalize([]) == []

    def test_negative_values(self):
        from backend.search.elastic_search import minmax_normalize
        result = minmax_normalize([-10, 0, 10])
        assert result[0] == pytest.approx(0.0)
        assert result[2] == pytest.approx(1.0)


class TestLevenshteinAndSimilar:

    def test_identical(self):
        from backend.search.elastic_search import _levenshtein
        assert _levenshtein("abc", "abc") == 0

    def test_typo(self):
        from backend.search.elastic_search import _levenshtein
        assert _levenshtein("chicken", "chicekn") == 2

    def test_empty_strings(self):
        from backend.search.elastic_search import _levenshtein
        assert _levenshtein("", "") == 0
        assert _levenshtein("hello", "") == 5

    def test_similar_close_words(self):
        from backend.search.elastic_search import _is_similar
        assert _is_similar("chicken", "chicekn") is True

    def test_similar_different_words(self):
        from backend.search.elastic_search import _is_similar
        assert _is_similar("apple", "zebra") is False

    def test_similar_length_gap_too_large(self):
        from backend.search.elastic_search import _is_similar
        assert _is_similar("hi", "hamburger") is False


# ════════════════════════════════════════════════
# SERIALIZE — recipe output
# ════════════════════════════════════════════════

class TestSerializeRecipe:

    def test_full_recipe(self):
        from backend.app import serialize_recipe
        recipe = {
            "recipe_id": 1, "name": "Pasta", "description": "Yummy",
            "category": "Italian", "images": "http://img.png",
            "ingredient_parts": "flour", "instructions": "Boil", "keywords": "easy",
        }
        result = serialize_recipe(recipe)
        assert result["recipe_id"] == 1
        assert result["name"] == "Pasta"

    def test_empty_recipe_defaults(self):
        from backend.app import serialize_recipe
        result = serialize_recipe({})
        assert result["name"] == ""
        assert result["recipe_id"] is None