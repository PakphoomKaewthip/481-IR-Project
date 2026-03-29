import { useEffect, useState } from "react";

import { fetchRecommendations } from "../lib/api";
import { RANDOM_TERMS } from "../lib/constants";
import { summarizeBookmarks } from "../lib/utils";

const emptyRecommendations = {
  summary: [],
  category: [],
  random: [],
};

export function useRecommendations({ user, apiBase, bookmarks, folders, activeFolderId, selectedFolderId }) {
  const [recommendations, setRecommendations] = useState(emptyRecommendations);

  useEffect(() => {
    let cancelled = false;

    async function loadRecommendations() {
      if (!user) {
        setRecommendations(emptyRecommendations);
        return;
      }

      const summarySeed = summarizeBookmarks(bookmarks);
      const summary = summarySeed
        ? await fetchRecommendations(
            apiBase,
            summarySeed,
            bookmarks.map((item) => item.recipeId)
          )
        : [];

      const folderId = selectedFolderId || activeFolderId || folders[0]?.id;
      const folderBookmarks = bookmarks.filter((bookmark) => bookmark.folderId === folderId);
      const categorySeed = summarizeBookmarks(folderBookmarks);
      const category = categorySeed
        ? await fetchRecommendations(
            apiBase,
            categorySeed,
            folderBookmarks.map((item) => item.recipeId)
          )
        : [];

      const randomSeed = {
        q: RANDOM_TERMS[Math.floor(Math.random() * RANDOM_TERMS.length)],
      };
      const random = await fetchRecommendations(apiBase, randomSeed, []);

      if (!cancelled) {
        setRecommendations({ summary, category, random });
      }
    }

    loadRecommendations();

    return () => {
      cancelled = true;
    };
  }, [activeFolderId, apiBase, bookmarks, folders, selectedFolderId, user]);

  return [recommendations, setRecommendations];
}
