import { normalizeRecipe } from "./utils";

function buildApiUrl(apiBase) {
  if (apiBase.startsWith("http://") || apiBase.startsWith("https://")) {
    return new URL(apiBase);
  }

  return new URL(apiBase, window.location.origin);
}

async function parseJsonResponse(response, fallbackMessage) {
  const data = await response.json();
  if (!response.ok) {
    throw new Error(data.error || fallbackMessage);
  }
  return data;
}

function buildAuthHeaders(token) {
  return token ? { Authorization: `Bearer ${token}` } : {};
}

function buildJsonHeaders(token) {
  return {
    "Content-Type": "application/json",
    ...buildAuthHeaders(token),
  };
}

export async function signIn(identifier, password) {
  const response = await fetch("http://127.0.0.1:5000/auth/signin", {
    method: "POST",
    headers: buildJsonHeaders(),
    body: JSON.stringify({ identifier, password }),
  });

  return parseJsonResponse(response, "Sign in failed");
}

export async function signUp({ username, email, password }) {
  const response = await fetch("http://127.0.0.1:5000/auth/signup", {
    method: "POST",
    headers: buildJsonHeaders(),
    body: JSON.stringify({ username, email, password }),
  });

  return parseJsonResponse(response, "Sign up failed");
}

export async function fetchCurrentUser(token) {
  const response = await fetch("http://127.0.0.1:5000/auth/me", {
    headers: buildAuthHeaders(token),
  });

  return parseJsonResponse(response, "Session check failed");
}

export async function searchRecipes(apiBase, query, token) {
  const url = buildApiUrl(apiBase);
  url.searchParams.set("q", query.text || "");

  const response = await fetch(url.toString(), {
    headers: buildAuthHeaders(token),
  });
  const data = await parseJsonResponse(response, "Search failed");

  return (Array.isArray(data) ? data : []).map(normalizeRecipe);
}

export async function fetchRecommendations(apiBase, seed, excludedIds = [], token) {
  try {
    const url = buildApiUrl(apiBase);
    if (seed.q) {
      url.searchParams.set("q", seed.q);
    } else {
      url.searchParams.set("q", [seed.dish, seed.ingredients, seed.process].filter(Boolean).join(" "));
    }

    const response = await fetch(url.toString(), {
      headers: buildAuthHeaders(token),
    });
    const data = await response.json();
    if (!response.ok) return [];

    return (Array.isArray(data) ? data : [])
      .map(normalizeRecipe)
      .filter((recipe) => !excludedIds.includes(recipe.recipeId))
      .slice(0, 4);
  } catch {
    return [];
  }
}

export async function fetchRandomRecipes(limit = 8) {
  const url = new URL("http://127.0.0.1:5000/recipes/random");
  url.searchParams.set("limit", String(limit));

  const response = await fetch(url.toString());
  const data = await parseJsonResponse(response, "Failed to load random recipes");

  return (Array.isArray(data) ? data : []).map(normalizeRecipe);
}

export async function fetchFolders(token) {
  const response = await fetch("http://127.0.0.1:5000/folders", {
    headers: buildAuthHeaders(token),
  });

  return parseJsonResponse(response, "Failed to load folders");
}

export async function createFolder(token, folderName) {
  const response = await fetch("http://127.0.0.1:5000/folders", {
    method: "POST",
    headers: buildJsonHeaders(token),
    body: JSON.stringify({ folder_name: folderName }),
  });

  return parseJsonResponse(response, "Failed to create folder");
}

export async function fetchBookmarks(token) {
  const response = await fetch("http://127.0.0.1:5000/bookmarks", {
    headers: buildAuthHeaders(token),
  });
  const data = await parseJsonResponse(response, "Failed to load bookmarks");

  return (Array.isArray(data) ? data : []).map((item) => ({
    id: String(item.bookmark_id),
    folderId: item.folder_id || "",
    rating: Number(item.rating || 0),
    recipeId: String(item.recipe_id),
    recipe: normalizeRecipe(item.recipe || {}),
    savedAt: item.created_at ? Date.parse(item.created_at) : Date.now(),
    folder: item.folder || "",
  }));
}

// folderId (optional) — ถ้าส่งมาจะ filter suggestions เฉพาะ folder นั้น
export async function fetchBookmarkSuggestions(token, limit = 5, folderId = null) {
  const url = new URL("http://127.0.0.1:5000/bookmarks/suggestions");
  url.searchParams.set("limit", String(limit));
  if (folderId) {
    url.searchParams.set("folder_id", String(folderId));
  }

  const response = await fetch(url.toString(), {
    headers: buildAuthHeaders(token),
  });
  const data = await parseJsonResponse(response, "Failed to load bookmark suggestions");

  return (Array.isArray(data) ? data : []).map((item) => ({
    id: String(item.bookmark_id),
    folderId: item.folder_id || "",
    rating: Number(item.rating || 0),
    recipeId: String(item.recipe_id),
    recipe: normalizeRecipe({
      ...(item.recipe || {}),
      score: item.score ?? 0,
      ml_score: item.score ?? 0,
    }),
    savedAt: item.created_at ? Date.parse(item.created_at) : Date.now(),
    folder: item.folder || "",
    suggestionScore: Number(item.score || 0),
  }));
}

export async function saveBookmark(token, payload) {
  const response = await fetch("http://127.0.0.1:5000/bookmark", {
    method: "POST",
    headers: buildJsonHeaders(token),
    body: JSON.stringify(payload),
  });

  return parseJsonResponse(response, "Failed to save bookmark");
}