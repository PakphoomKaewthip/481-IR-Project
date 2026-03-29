import { useEffect, useState } from "react";

import Dashboard from "./components/Dashboard.jsx";
import LoginScreen from "./components/LoginScreen.jsx";
import RecipeModal from "./components/RecipeModal.jsx";
import { usePersistentState } from "./hooks/usePersistentState";
import {
  createFolder,
  fetchBookmarks,
  fetchBookmarkSuggestions,
  fetchCurrentUser,
  fetchFolders,
  fetchRandomRecipes,
  saveBookmark,
  searchRecipes,
  signIn,
  signUp,
} from "./lib/api";
import { COMMON_CORRECTIONS, DEFAULT_API_BASE, STORAGE_KEYS } from "./lib/constants";
import { DEFAULT_QUERY, hasQueryValue, trimQuery } from "./lib/domain";
import { getCorrectionSuggestion } from "./lib/utils";

const DEFAULT_FEEDBACK =
  "Sign in, confirm any suggested correction, then search with one combined English query.";

export default function App() {
  const [user, setUser] = usePersistentState(STORAGE_KEYS.user, null);
  const [token, setToken] = usePersistentState(STORAGE_KEYS.authToken, "");
  const [folders, setFolders] = useState([]);
  const [bookmarks, setBookmarks] = useState([]);
  const [bookmarkSuggestions, setBookmarkSuggestions] = useState([]);
  // suggestions เฉพาะ folder ที่เลือกอยู่
  const [folderSuggestions, setFolderSuggestions] = useState([]);
  const [activeFolderId, setActiveFolderId] = useState("");
  const [currentView, setCurrentView] = useState("discover");
  const [currentSection, setCurrentSection] = useState("discover");
  const [query, setQuery] = useState(DEFAULT_QUERY);
  const [authMode, setAuthMode] = useState("signin");
  const [folderName, setFolderName] = useState("");
  const [username, setUsername] = useState("");
  const [identifier, setIdentifier] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [feedback, setFeedback] = useState(DEFAULT_FEEDBACK);
  const [results, setResults] = useState([]);
  const [randomRecipes, setRandomRecipes] = useState([]);
  const [suggestion, setSuggestion] = useState(null);
  const [selectedRecipe, setSelectedRecipe] = useState(null);
  const [bookmarkFolderId, setBookmarkFolderId] = useState(activeFolderId || "");
  const [rating, setRating] = useState(5);
  const [authLoading, setAuthLoading] = useState(Boolean(token && !user));

  useEffect(() => {
    if (!activeFolderId && folders.length) {
      setActiveFolderId(folders[0].id);
    }
  }, [activeFolderId, folders]);

  useEffect(() => {
    setBookmarkFolderId(activeFolderId || folders[0]?.id || "");
  }, [activeFolderId, folders]);

  // โหลด global suggestions + bookmarks + folders ตอน login
  useEffect(() => {
    let cancelled = false;

    async function loadUserData() {
      if (!token || !user) {
        if (!cancelled) {
          setFolders([]);
          setBookmarks([]);
          setBookmarkSuggestions([]);
          setFolderSuggestions([]);
          setActiveFolderId("");
        }
        return;
      }

      try {
        const [nextFolders, nextBookmarks] = await Promise.all([
          fetchFolders(token),
          fetchBookmarks(token),
        ]);

        let nextBookmarkSuggestions = [];
        try {
          nextBookmarkSuggestions = await fetchBookmarkSuggestions(token);
        } catch {
          nextBookmarkSuggestions = [];
        }

        if (!cancelled) {
          setFolders(nextFolders);
          setBookmarks(nextBookmarks);
          setBookmarkSuggestions(nextBookmarkSuggestions);
          setActiveFolderId((current) => current || nextFolders[0]?.id || "");
        }
      } catch (error) {
        if (!cancelled) {
          setBookmarkSuggestions([]);
          setFeedback(`Failed to load saved data: ${error.message}`);
        }
      }
    }

    loadUserData();

    return () => {
      cancelled = true;
    };
  }, [token, user]);

  // โหลด suggestions เฉพาะ folder เมื่อ activeFolderId เปลี่ยน
  useEffect(() => {
    let cancelled = false;

    async function loadFolderSuggestions() {
      if (!token || !user || !activeFolderId) {
        if (!cancelled) setFolderSuggestions([]);
        return;
      }

      try {
        const suggestions = await fetchBookmarkSuggestions(token, 5, activeFolderId);
        if (!cancelled) setFolderSuggestions(suggestions);
      } catch {
        if (!cancelled) setFolderSuggestions([]);
      }
    }

    loadFolderSuggestions();

    return () => {
      cancelled = true;
    };
  }, [token, user, activeFolderId]);

  useEffect(() => {
    let cancelled = false;

    async function restoreSession() {
      if (!token) {
        setAuthLoading(false);
        return;
      }

      setAuthLoading(true);
      try {
        const session = await fetchCurrentUser(token);
        if (!cancelled) {
          setUser(session.user);
          setFeedback("Session restored.");
        }
      } catch (error) {
        if (!cancelled) {
          setUser(null);
          setToken("");
          setFeedback(`Authentication required: ${error.message}`);
        }
      } finally {
        if (!cancelled) {
          setAuthLoading(false);
        }
      }
    }

    restoreSession();

    return () => {
      cancelled = true;
    };
  }, [token, setToken, setUser]);

  useEffect(() => {
    let cancelled = false;

    async function loadRandomRecipes() {
      if (user) {
        if (!cancelled) {
          setRandomRecipes([]);
        }
        return;
      }

      try {
        const recipes = await fetchRandomRecipes(8);
        if (!cancelled) {
          setRandomRecipes(recipes);
        }
      } catch (error) {
        if (!cancelled) {
          setRandomRecipes([]);
        }
      }
    }

    loadRandomRecipes();

    return () => {
      cancelled = true;
    };
  }, [user]);

  async function handleLogin() {
    if (!identifier.trim() || !password.trim()) {
      setFeedback("Enter your username or email and password before signing in.");
      return;
    }

    try {
      const auth = await signIn(identifier.trim(), password);
      setToken(auth.token);
      setUser(auth.user);
      setCurrentView("discover");
      setCurrentSection("discover");
      setFeedback("Signed in successfully.");
    } catch (error) {
      setFeedback(`Sign in failed: ${error.message}`);
    }
  }

  async function handleSignup() {
    if (!username.trim() || !email.trim() || !password.trim()) {
      setFeedback("Enter username, email, and password before signing up.");
      return;
    }

    try {
      const auth = await signUp({
        username: username.trim(),
        email: email.trim(),
        password,
      });
      setToken(auth.token);
      setUser(auth.user);
      setCurrentView("discover");
      setCurrentSection("discover");
      setFeedback("Account created and signed in successfully.");
    } catch (error) {
      setFeedback(`Sign up failed: ${error.message}`);
    }
  }

  function handleLogout() {
    setUser(null);
    setToken("");
    setSelectedRecipe(null);
    setResults([]);
    setFolders([]);
    setBookmarks([]);
    setBookmarkSuggestions([]);
    setFolderSuggestions([]);
    setActiveFolderId("");
    setCurrentView("discover");
    setCurrentSection("discover");
    setIdentifier("");
    setUsername("");
    setEmail("");
    setPassword("");
    setAuthMode("signin");
    setFeedback("Signed out. You are back on the sign-in screen.");
  }

  async function handleSearch(event) {
    event.preventDefault();

    if (!user) {
      setCurrentView("auth");
      setFeedback("Sign in first to search recipes.");
      return;
    }

    const trimmedSearchQuery = trimQuery(query);

    if (!hasQueryValue(trimmedSearchQuery)) {
      setFeedback("Provide at least one search field.");
      return;
    }

    const corrected = getCorrectionSuggestion(trimmedSearchQuery, COMMON_CORRECTIONS);
    if (corrected) {
      setSuggestion(corrected);
      return;
    }

    setSuggestion(null);
    await runSearch(trimmedSearchQuery);
  }

  async function runSearch(currentQuery) {
    setFeedback("Searching recipes and ranking by similarity...");

    try {
      const searchResult = await searchRecipes(DEFAULT_API_BASE, currentQuery, token);
      setResults(searchResult);
      setFeedback(
        searchResult.length
          ? "Search complete. Select a result card to view the modal and bookmark it."
          : "No recipes matched this query."
      );
    } catch (error) {
      setResults([]);
      setFeedback(`Search error: ${error.message}`);
    }
  }

  function handleAcceptSuggestion() {
    if (!suggestion) return;
    setQuery(suggestion);
    setSuggestion(null);
    runSearch(suggestion);
  }

  function handleClearSearch() {
    setQuery(DEFAULT_QUERY);
    setSuggestion(null);
    setResults([]);
    setFeedback("Search fields cleared.");
  }

  async function handleCreateFolder() {
    if (!folderName.trim()) {
      setFeedback("Enter a folder name.");
      return;
    }

    try {
      const folder = await createFolder(token, folderName.trim());
      setFolders((current) => [folder, ...current]);
      if (!activeFolderId) {
        setActiveFolderId(folder.id);
      }
      setBookmarkFolderId(folder.id);
      setFolderName("");
      setFeedback(`Folder "${folder.name}" created.`);
    } catch (error) {
      setFeedback(`Create folder failed: ${error.message}`);
    }
  }

  function handleOpenRecipe(recipe) {
    setSelectedRecipe(recipe);
    setBookmarkFolderId(activeFolderId || folders[0]?.id || "");
    setRating(5);
  }

  async function handleSaveBookmark() {
    if (!selectedRecipe) {
      setFeedback("Select a recipe first.");
      return;
    }
    if (!folders.length) {
      setFeedback("Create a folder before saving bookmarks.");
      return;
    }

    const nextBookmark = {
      folderId: bookmarkFolderId || activeFolderId || folders[0].id,
      rating,
      recipeId: selectedRecipe.recipeId,
      recipe: selectedRecipe,
      savedAt: Date.now(),
    };

    try {
      await saveBookmark(token, {
        recipe_id: Number(selectedRecipe.recipeId),
        folder_id: Number(nextBookmark.folderId),
        rating,
      });

      const refreshedBookmarks = await fetchBookmarks(token);
      let refreshedBookmarkSuggestions = [];
      let refreshedFolderSuggestions = [];
      try {
        refreshedBookmarkSuggestions = await fetchBookmarkSuggestions(token);
        refreshedFolderSuggestions = await fetchBookmarkSuggestions(token, 5, activeFolderId);
      } catch {
        refreshedBookmarkSuggestions = [];
        refreshedFolderSuggestions = [];
      }
      setBookmarks(refreshedBookmarks);
      setBookmarkSuggestions(refreshedBookmarkSuggestions);
      setFolderSuggestions(refreshedFolderSuggestions);
      setSelectedRecipe(null);
      setCurrentSection("bookmarks");
      setFeedback(`Bookmarked "${selectedRecipe.name}" with ${rating} stars.`);
    } catch (error) {
      setFeedback(`Bookmark failed: ${error.message}`);
    }
  }

  const authStatus = user ? `Signed in as ${user.identifier || user.email || user.username}` : "Signed out";

  return (
    <>
      {!user && currentView === "auth" ? (
        <LoginScreen
          authMode={authMode}
          onAuthModeChange={setAuthMode}
          onBackToDiscover={() => setCurrentView("discover")}
          authLoading={authLoading}
          authStatus={authStatus}
          username={username}
          identifier={identifier}
          email={email}
          password={password}
          onUsernameChange={setUsername}
          onIdentifierChange={setIdentifier}
          onEmailChange={setEmail}
          onPasswordChange={setPassword}
          onLogin={handleLogin}
          onSignup={handleSignup}
        />
      ) : (
        <Dashboard
          user={user}
          onLogout={handleLogout}
          onGoToLogin={() => setCurrentView("auth")}
          currentSection={currentSection}
          onSectionChange={setCurrentSection}
          folders={folders}
          activeFolderId={activeFolderId}
          onActiveFolderChange={setActiveFolderId}
          folderName={folderName}
          onFolderNameChange={setFolderName}
          onCreateFolder={handleCreateFolder}
          query={query}
          onQueryChange={(value) => setQuery({ text: value })}
          onSearch={handleSearch}
          onClearSearch={handleClearSearch}
          suggestion={suggestion}
          onAcceptSuggestion={handleAcceptSuggestion}
          results={results}
          randomRecipes={randomRecipes}
          bookmarks={bookmarks}
          bookmarkSuggestions={bookmarkSuggestions}
          folderSuggestions={folderSuggestions}
          onOpenRecipe={handleOpenRecipe}
        />
      )}

      <RecipeModal
        recipe={selectedRecipe}
        canBookmark={Boolean(user && token)}
        folders={folders}
        activeFolderId={activeFolderId}
        bookmarkFolderId={bookmarkFolderId}
        folderName={folderName}
        rating={rating}
        onFolderNameChange={setFolderName}
        onCreateFolder={handleCreateFolder}
        onBookmarkFolderChange={setBookmarkFolderId}
        onRatingChange={setRating}
        onSave={handleSaveBookmark}
        onGoToLogin={() => setCurrentView("auth")}
        onClose={() => setSelectedRecipe(null)}
      />
    </>
  );
}
