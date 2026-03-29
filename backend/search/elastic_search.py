from pathlib import Path

import numpy as np
from elasticsearch import Elasticsearch
from elasticsearch import exceptions as es_exceptions
from sklearn.feature_extraction.text import TfidfVectorizer
from sklearn.metrics.pairwise import cosine_similarity

from backend.search.indexer_manual import Indexer_manual
INDEX_NAME = "recipes"
ca_cert_path = str(Path.home() / "http_ca.crt")

ES_AUTH = ("elastic", "vBIu5OrE6zIDVFH_Z893")


def build_es_client():
    https_client = Elasticsearch(
        "https://localhost:9200",
        basic_auth=ES_AUTH,
        ca_certs=ca_cert_path,
    )

    try:
        https_client.info()
        return https_client
    except Exception as exc:
        error_text = str(exc).lower()
        if "tls" not in error_text and "ssl" not in error_text:
            raise

    http_client = Elasticsearch(
        "http://localhost:9200",
        basic_auth=ES_AUTH,
    )
    http_client.info()
    return http_client


es = build_es_client()


# LOAD CUSTOM TF-IDF INDEX
indexer = Indexer_manual()
documents = indexer.documents.copy()
description_map = dict(
    zip(
        documents["recipe_id"].astype(int),
        documents["description"].fillna("").astype(str),
    )
)

# ใช้ unigram ตามที่ต้องการ
tfidf_vectorizer = TfidfVectorizer(ngram_range=(1, 1))
X_tfidf = tfidf_vectorizer.fit_transform(documents["processed_text"])


# HELPERS
def minmax_normalize(scores):
    if len(scores) == 0:
        return []

    mn = min(scores)
    mx = max(scores)

    if mx == mn:
        return [1.0 for _ in scores]

    return [(s - mn) / (mx - mn) for s in scores]


def elastic_retrieve(query, top_k=100):
    body = {
        "query": {
            "multi_match": {
                "query": query,
                "fields": ["name^2", "category", "processed_text"],
                "fuzziness": "AUTO"
            }
        }
    }

    res = es.search(
        index=INDEX_NAME,
        body=body,
        size=top_k,
    )

    return res["hits"]["hits"]


def tfidf_search_scores(query):
    """
    คำนวณ custom TF-IDF cosine similarity กับทุก document
    แล้วคืนเป็น dict: recipe_id -> score
    """
    q_vec = tfidf_vectorizer.transform([query])
    sims = cosine_similarity(q_vec, X_tfidf).flatten()

    score_map = dict(zip(documents["recipe_id"].astype(int), sims))
    return score_map


def suggest_query(query, top_k=5):
    """
    ใช้ ES fuzzy multi_match เพื่อหาคำที่ใกล้เคียง
    แล้ว extract tokens จาก name/category ที่ match
    คืน list ของ suggested terms เรียงตาม score
    """
    if not query or not query.strip():
        return []

    tokens = query.strip().lower().split()
    suggestions = []

    for token in tokens:
        # ถ้าคำสั้นเกิน 2 ตัวอักษร ข้ามไป
        if len(token) < 3:
            continue

        body = {
            "query": {
                "multi_match": {
                    "query": token,
                    "fields": ["name^2", "category"],
                    "fuzziness": "AUTO",
                    "prefix_length": 1,
                }
            },
            "_source": ["name", "category"],
            "size": top_k * 2,
        }

        try:
            res = es.search(index=INDEX_NAME, body=body)
            hits = res["hits"]["hits"]
        except Exception:
            continue

        seen = set()
        for hit in hits:
            src = hit["_source"]
            # แตก words จาก name และ category
            for field_value in [src.get("name", ""), src.get("category", "")]:
                for word in field_value.lower().split():
                    if word in seen or len(word) < 3:
                        continue
                    # เช็คว่า word นี้ใกล้เคียงกับ token ไหม (ไม่ตรงกัน 100%)
                    if word != token and _is_similar(token, word):
                        seen.add(word)
                        suggestions.append({"original": token, "suggestion": word})
                        if len(suggestions) >= top_k:
                            break
                if len(suggestions) >= top_k:
                    break
            if len(suggestions) >= top_k:
                break

    return suggestions


def _is_similar(a, b):
    """
    เช็คว่า 2 คำใกล้เคียงกันไหม โดยใช้ Levenshtein distance
    threshold: ถ้าระยะห่างน้อยกว่าหรือเท่ากับ 2 ถือว่าใกล้เคียง
    """
    if abs(len(a) - len(b)) > 3:
        return False
    return _levenshtein(a, b) <= 2


def _levenshtein(s1, s2):
    """คำนวณ Levenshtein distance ระหว่าง 2 strings"""
    m, n = len(s1), len(s2)
    dp = list(range(n + 1))

    for i in range(1, m + 1):
        prev = dp[0]
        dp[0] = i
        for j in range(1, n + 1):
            temp = dp[j]
            if s1[i - 1] == s2[j - 1]:
                dp[j] = prev
            else:
                dp[j] = 1 + min(prev, dp[j], dp[j - 1])
            prev = temp

    return dp[n]


# HYBRID SEARCH
def search(query, top_k=5, candidate_k=100, alpha=0.5):
    """
    alpha = น้ำหนักของ Elasticsearch score
    (1 - alpha) = น้ำหนักของ custom TF-IDF score
    """

    # 1) ดึง candidate จาก Elasticsearch ก่อน
    es_hits = elastic_retrieve(query, top_k=candidate_k)

    # 2) คำนวณ TF-IDF score custom
    tfidf_score_map = tfidf_search_scores(query)

    temp_results = []

    for hit in es_hits:
        src = hit["_source"]
        recipe_id = int(src["recipe_id"])
        es_score = float(hit["_score"])
        tfidf_score = float(tfidf_score_map.get(recipe_id, 0.0))

        temp_results.append({
            "recipe_id": recipe_id,
            "name": src.get("name", ""),
            "description": src.get("description", description_map.get(recipe_id, "")),
            "category": src.get("category", ""),
            "images": src.get("images", ""),
            "ingredient_parts": src.get("ingredient_parts", ""),
            "instructions": src.get("instructions", ""),
            "es_score": es_score,
            "tfidf_score": tfidf_score,
        })

    # normalize score ก่อนผสม
    es_scores = [x["es_score"] for x in temp_results]
    tfidf_scores = [x["tfidf_score"] for x in temp_results]

    es_norm = minmax_normalize(es_scores)
    tfidf_norm = minmax_normalize(tfidf_scores)

    for i, item in enumerate(temp_results):
        item["score"] = alpha * es_norm[i] + (1 - alpha) * tfidf_norm[i]

    # sort ตาม hybrid score
    temp_results.sort(key=lambda x: x["score"], reverse=True)

    return temp_results[:top_k]


#TEST
if __name__ == "__main__":
    results = search("spicy chicken", top_k=5, candidate_k=100, alpha=0.5)

    for r in results:
        print("-" * 50)
        print("recipe_id   :", r["recipe_id"])
        print("name        :", r["name"])
        print("category    :", r["category"])
        print("es_score    :", round(r["es_score"], 4))
        print("tfidf_score :", round(r["tfidf_score"], 4))
        print("final_score :", round(r["score"], 4))