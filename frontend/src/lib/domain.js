export const DEFAULT_QUERY = {
  text: "",
};

export function trimQuery(query) {
  return {
    text: query.text.trim(),
  };
}

export function hasQueryValue(query) {
  return Boolean(query.text);
}

export function rankBookmarks(bookmarks) {
  return [...bookmarks].sort((a, b) => b.rating - a.rating || b.savedAt - a.savedAt);
}

export function upsertBookmark(bookmarks, nextBookmark) {
  const existingIndex = bookmarks.findIndex((item) => item.recipeId === nextBookmark.recipeId);

  if (existingIndex === -1) {
    return [...bookmarks, nextBookmark];
  }

  const copy = [...bookmarks];
  copy[existingIndex] = nextBookmark;
  return copy;
}

export function getNextFolderIdAfterDelete(folders, folderId) {
  return folders.find((folder) => folder.id !== folderId)?.id || "";
}
