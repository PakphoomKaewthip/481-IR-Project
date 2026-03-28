export function splitList(value) {
  if (!value) return [];
  return String(value)
    .replace(/^c\(/, "")
    .replace(/\)$/, "")
    .replace(/[\[\]"]/g, "")
    .split(/[;,]|\s{2,}/)
    .map((item) => item.trim())
    .filter(Boolean);
}

export function splitInstructions(value) {
  if (!value) return ["No cooking steps available."];
  return String(value)
    .replace(/c\(/g, "")
    .replace(/\)$/g, "")
    .split(/"\s*,\s*"|\.\s+(?=[A-Z0-9])|\s(?=(step\s+\d+))/i)
    .map((item) => item.replace(/["[\]]/g, "").trim())
    .filter((item) => item.length > 8)
    .slice(0, 10);
}

export function parseImage(value) {
  if (!value) return "";
  const match = String(value).match(/https?:\/\/[^",' )]+/);
  return match ? match[0] : "";
}

export function capitalizeWords(value) {
  return String(value)
    .split(/\s+/)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");
}

export function sentenceCase(value) {
  const text = String(value).trim();
  return text ? text.charAt(0).toUpperCase() + text.slice(1) : "";
}

export function uid() {
  return typeof crypto !== "undefined" && crypto.randomUUID
    ? crypto.randomUUID()
    : `id-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

export function normalizeRecipe(raw) {
  const name = capitalizeWords(raw.name || raw.Name || "Untitled dish");
  const description = sentenceCase(raw.description || raw.Description || "No description available.");
  const category = raw.category || raw.RecipeCategory || "General";
  const recipeId = String(raw.recipe_id || raw.RecipeId || uid());
  const imageValue = parseImage(raw.Images || raw.images);

  return {
    recipeId,
    name,
    description,
    category,
    ingredients: splitList(raw.ingredient_parts || raw.RecipeIngredientParts),
    instructions: splitInstructions(raw.instructions || raw.RecipeInstructions),
    tags: splitList(raw.keywords || raw.Keywords).slice(0, 6),
    score: Number(raw.score || 0),
    image: imageValue ? `http://127.0.0.1:5000/recipe-image/${recipeId}` : "",
  };
}

export function summarizeBookmarks(bookmarks) {
  if (!bookmarks.length) return null;

  const combined = bookmarks
    .map(
      (bookmark) =>
        `${bookmark.recipe.name} ${bookmark.recipe.category} ${bookmark.recipe.ingredients.slice(0, 4).join(" ")}`
    )
    .join(" ");

  return {
    dish: combined.split(" ").slice(0, 6).join(" "),
    ingredients: combined.split(" ").slice(6, 12).join(" "),
    process: "similar recommended dish",
  };
}

export function getCorrectionSuggestion(query, corrections) {
  let changed = false;
  const corrected = {};

  Object.entries(query).forEach(([key, value]) => {
    corrected[key] = value
      .split(/\s+/)
      .map((token) => {
        const candidate = corrections[token.toLowerCase()];
        if (candidate) {
          changed = true;
          return candidate;
        }
        return token;
      })
      .join(" ");
  });

  return changed ? corrected : null;
}
