function EmptyState({ message }) {
  return <div className="empty-state list-empty">{message}</div>;
}

function RecipeImage({ recipe }) {
  if (!recipe.image) {
    return (
      <div className="result-image-empty">
        <span>No image in indexed data</span>
      </div>
    );
  }

  return <img className="result-image" src={recipe.image} alt={recipe.name} loading="lazy" decoding="async" />;
}

function NavLink({ label, active = false, onClick }) {
  return (
    <button className={`nav-link${active ? " nav-link-active" : ""}`} onClick={onClick} type="button">
      {label}
    </button>
  );
}

function RecipeCard({ recipe, onOpenRecipe, showScore = false }) {
  return (
    <article className="recommendation-card result-shelf-card" onClick={() => onOpenRecipe(recipe)}>
      <div className="result-image-wrap recommendation-image-wrap">
        <RecipeImage recipe={recipe} />
      </div>
      <div className="recommendation-card-body">
        <div className="result-topline">
          {showScore ? (
            <span className="pill score-pill">Similarity {recipe.score.toFixed(2)}</span>
          ) : (
            <span className="pill">{recipe.mlScore ? `ML ${recipe.mlScore.toFixed(2)}` : recipe.category}</span>
          )}
          <span className="result-category">{recipe.category}</span>
        </div>
        <h3 className="result-title">{recipe.name}</h3>
        <p className="result-description">{recipe.description}</p>
        <div className="result-tags">
          {recipe.tags?.slice(0, 3).map((tag) => (
            <span key={tag} className="tag">
              {tag}
            </span>
          ))}
        </div>
        <button
          onClick={(event) => {
            event.stopPropagation();
            onOpenRecipe(recipe);
          }}
          className="primary-btn result-detail-btn"
          type="button"
        >
          View details
        </button>
      </div>
    </article>
  );
}

// Reusable bookmark card — same markup used in both bookmarks & folders sections
function BookmarkCard({ bookmark, onOpenRecipe, showSuggestionScore = false }) {
  return (
    <article
      className="recommendation-card result-shelf-card"
      onClick={() => onOpenRecipe(bookmark.recipe)}
    >
      <div className="result-image-wrap recommendation-image-wrap">
        <RecipeImage recipe={bookmark.recipe} />
      </div>
      <div className="recommendation-card-body">
        <div className="result-topline">
          {showSuggestionScore ? (
            <span className="pill score-pill">ML {bookmark.suggestionScore.toFixed(2)}</span>
          ) : (
            <span className="pill score-pill">{bookmark.rating} stars</span>
          )}
          <span className="result-category">{bookmark.folder || "No folder"}</span>
        </div>
        <h3 className="result-title">{bookmark.recipe.name}</h3>
        <p className="result-description">{bookmark.recipe.description}</p>
        <button
          onClick={(event) => {
            event.stopPropagation();
            onOpenRecipe(bookmark.recipe);
          }}
          className="primary-btn result-detail-btn"
          type="button"
        >
          View details
        </button>
      </div>
    </article>
  );
}

export default function Dashboard({
  user,
  onLogout,
  onGoToLogin,
  currentSection,
  onSectionChange,
  folders,
  activeFolderId,
  onActiveFolderChange,
  folderName,
  onFolderNameChange,
  onCreateFolder,
  query,
  onQueryChange,
  onSearch,
  onClearSearch,
  suggestion,
  onAcceptSuggestion,
  results,
  randomRecipes,
  bookmarks,
  bookmarkSuggestions,
  folderSuggestions = [],
  onOpenRecipe,
}) {
  const uniqueRecipes = [];
  const seenRecipeIds = new Set();
  const activeFolder = folders.find((folder) => folder.id === activeFolderId) || folders[0] || null;

  // --- Bookmarks section ---
  const suggestedBookmarkIds = new Set(bookmarkSuggestions.map((bookmark) => bookmark.id));
  const remainingBookmarks = bookmarks.filter((bookmark) => !suggestedBookmarkIds.has(bookmark.id));
  const hasBookmarks = bookmarks.length > 0;

  // --- Folders section ---
  // bookmarks ทั้งหมดใน folder ที่เลือก
  const activeFolderBookmarks = bookmarks.filter(
    (bookmark) => activeFolder && bookmark.folderId === activeFolder.id
  );

  // folderSuggestions มาจาก API — filter เฉพาะที่ folderId ตรงกับ activeFolder
  const activeFolderSuggestions = folderSuggestions.filter(
    (s) => String(s.folderId) === String(activeFolder?.id)
  );

  // ตัด suggestions ที่แสดงแล้วออกจาก "All Bookmarks"
  const folderSuggestedIds = new Set(activeFolderSuggestions.map((s) => s.id));
  const folderRemainingBookmarks = activeFolderBookmarks.filter(
    (b) => !folderSuggestedIds.has(b.id)
  );

  for (const recipe of results) {
    if (seenRecipeIds.has(recipe.recipeId)) {
      continue;
    }
    seenRecipeIds.add(recipe.recipeId);
    uniqueRecipes.push(recipe);
  }

  return (
    <div className="page-shell">
      <header className="app-topbar glass">
        <div className="brand-lockup">
          <p className="eyebrow">IR Recipe Search</p>
          <h2>Food Assemble</h2>
        </div>
        <nav className="topbar-nav" aria-label="Primary">
          <NavLink label="Discover" active={currentSection === "discover"} onClick={() => onSectionChange("discover")} />
          <NavLink label="Folders" active={currentSection === "folders"} onClick={() => onSectionChange("folders")} />
          <NavLink label="Bookmarks" active={currentSection === "bookmarks"} onClick={() => onSectionChange("bookmarks")} />
        </nav>
        <div className="topbar-actions">
          {user ? (
            <>
              <span className="pill">{user.email}</span>
              <button onClick={onLogout} className="ghost-btn" type="button">
                Log Out
              </button>
            </>
          ) : (
            <button onClick={onGoToLogin} className="ghost-btn" type="button">
              Sign In
            </button>
          )}
        </div>
      </header>

      <main className="dashboard-flow">
        {currentSection === "discover" ? (
          <>
            <section className="discover-hero">
              <div className="hero-center">
                <h1>Discover Food Assemble</h1>
                <p className="hero-subtitle">
                  Search thousands of recipes, bookmark your favorites, and get personalized
                  recommendations tailored to your taste.
                </p>
              </div>

              <div className="search-stage">
                <form className="hero-search-shell glass" onSubmit={onSearch}>
                  <div className="hero-search-row">
                    <input
                      value={query.text}
                      onChange={(event) => onQueryChange(event.target.value)}
                      type="text"
                      placeholder="Dish name, ingredients, or cooking process"
                    />
                    <button type="submit" className="primary-btn hero-search-btn">
                      Search
                    </button>
                  </div>
                  <div className="hero-search-meta">
                    <span className="pill">{results.length} results</span>
                    <button onClick={onClearSearch} type="button" className="ghost-btn">
                      Clear
                    </button>
                  </div>
                </form>

                {suggestion ? (
                  <div className="search-overlay glass">
                    <div className="suggestion-panel">
                      <div className="suggestion-header">
                        <span className="suggestion-dot"></span>
                        <div>
                          <strong>Possible typo detected</strong>
                          <p className="bookmark-meta">
                            Did you mean <strong>{suggestion.text}</strong>?
                          </p>
                        </div>
                      </div>
                      <div className="hero-actions">
                        <button onClick={onAcceptSuggestion} className="primary-btn" type="button">
                          Use correction
                        </button>
                        <button onClick={onClearSearch} className="ghost-btn" type="button">
                          Keep my text
                        </button>
                      </div>
                    </div>
                  </div>
                ) : null}
              </div>
            </section>

            {uniqueRecipes.length ? (
              <section className="merged-results-section">
                <div className="section-head shelf-head">
                  <div>
                    <h2 className="shelf-title">All Recipes</h2>
                    <p className="shelf-copy">Search results ranked by similarity.</p>
                  </div>
                  <span className="pill">{uniqueRecipes.length} total</span>
                </div>
                <div className="merged-results-grid">
                  {uniqueRecipes.map((recipe) => (
                    <RecipeCard
                      key={recipe.recipeId}
                      recipe={recipe}
                      onOpenRecipe={onOpenRecipe}
                      showScore
                    />
                  ))}
                </div>
              </section>
            ) : null}

            {!user && !uniqueRecipes.length && randomRecipes.length ? (
              <section className="merged-results-section">
                <div className="section-head shelf-head">
                  <div>
                    <h2 className="shelf-title">Random Recipes</h2>
                    <p className="shelf-copy">Guest preview recipes loaded before sign in.</p>
                  </div>
                  <span className="pill">{randomRecipes.length} total</span>
                </div>
                <div className="merged-results-grid">
                  {randomRecipes.map((recipe) => (
                    <RecipeCard
                      key={`guest-${recipe.recipeId}`}
                      recipe={recipe}
                      onOpenRecipe={onOpenRecipe}
                    />
                  ))}
                </div>
              </section>
            ) : null}
          </>
        ) : currentSection === "bookmarks" ? (
          <section className="merged-results-section">
            {bookmarkSuggestions.length ? (
              <section className="merged-results-section">
                <div className="section-head shelf-head">
                  <div>
                    <h3 className="shelf-title">Suggest For You</h3>
                    <p className="shelf-copy">Top 5 bookmarked recipes selected from your taste profile.</p>
                  </div>
                  <span className="pill">{bookmarkSuggestions.length} total</span>
                </div>
                <div className="merged-results-grid bookmarks-grid">
                  {bookmarkSuggestions.map((bookmark) => (
                    <BookmarkCard
                      key={`suggest-${bookmark.id}`}
                      bookmark={bookmark}
                      onOpenRecipe={onOpenRecipe}
                      showSuggestionScore
                    />
                  ))}
                </div>
              </section>
            ) : null}

            {remainingBookmarks.length ? (
              <section className="merged-results-section">
                <div className="section-head shelf-head">
                  <div>
                    <h3 className="shelf-title">All Bookmarks</h3>
                    <p className="shelf-copy">All saved recipes except the 5 items already shown in suggest.</p>
                  </div>
                  <span className="pill">{remainingBookmarks.length} total</span>
                </div>
                <div className="merged-results-grid bookmarks-grid">
                  {remainingBookmarks.map((bookmark) => (
                    <BookmarkCard
                      key={`${bookmark.recipeId}-${bookmark.folderId}-${bookmark.rating}`}
                      bookmark={bookmark}
                      onOpenRecipe={onOpenRecipe}
                    />
                  ))}
                </div>
              </section>
            ) : hasBookmarks ? (
              <EmptyState message="All bookmarked recipes are currently shown in the suggest section above." />
            ) : (
              <EmptyState message="No bookmarks yet. Save a dish from Discover to show it here." />
            )}
          </section>
        ) : (
          /* ───────────────── FOLDERS SECTION ───────────────── */
          <section className="merged-results-section">
            <div className="section-head shelf-head">
              <div>
                <h2 className="shelf-title">Folders</h2>
              </div>
            </div>

            <div className="folder-create-box">
              <div>
                <p className="section-kicker">Create folder</p>
                <h3 className="folder-create-title">Add a new folder</h3>
                <p className="shelf-copy">Create a folder here, then use it for bookmarking recipes.</p>
              </div>
              <div className="folder-create-form">
                <input
                  value={folderName}
                  onChange={(event) => onFolderNameChange(event.target.value)}
                  type="text"
                  placeholder="Folder name"
                />
                <button onClick={onCreateFolder} className="primary-btn" type="button">
                  Create folder
                </button>
              </div>
            </div>

            {folders.length ? (
              <>
                <div className="folder-grid">
                  {folders.map((folder) => {
                    const folderCount = bookmarks.filter((bookmark) => bookmark.folderId === folder.id).length;
                    return (
                      <button
                        key={folder.id}
                        className={`folder-card${activeFolder?.id === folder.id ? " folder-card-active" : ""}`}
                        onClick={() => onActiveFolderChange(folder.id)}
                        type="button"
                      >
                        <span className="section-kicker">Folder</span>
                        <strong className="folder-card-title">{folder.name}</strong>
                        <span className="folder-card-meta">{folderCount} saved recipes</span>
                      </button>
                    );
                  })}
                </div>

                {/* ── Active folder content ── */}
                <div className="section-head shelf-head">
                  <div>
                    <h2 className="shelf-title">{activeFolder?.name || "Selected Folder"}</h2>
                    <p className="shelf-copy">Recipes saved inside this folder.</p>
                  </div>
                  <span className="pill">{activeFolderBookmarks.length} total</span>
                </div>

                {activeFolderBookmarks.length ? (
                  <>
                    {/* Suggest For You — เฉพาะ bookmarks ของ folder นี้ */}
                    {activeFolderSuggestions.length ? (
                      <section className="merged-results-section">
                        <div className="section-head shelf-head">
                          <div>
                            <h3 className="shelf-title">Suggest For You</h3>
                            <p className="shelf-copy">
                              Top picks from your taste profile inside this folder.
                            </p>
                          </div>
                          <span className="pill">{activeFolderSuggestions.length} total</span>
                        </div>
                        <div className="merged-results-grid bookmarks-grid">
                          {activeFolderSuggestions.map((bookmark) => (
                            <BookmarkCard
                              key={`folder-suggest-${bookmark.id}`}
                              bookmark={bookmark}
                              onOpenRecipe={onOpenRecipe}
                              showSuggestionScore
                            />
                          ))}
                        </div>
                      </section>
                    ) : null}

                    {/* All bookmarks in this folder (excluding suggested ones) */}
                    {folderRemainingBookmarks.length ? (
                      <section className="merged-results-section">
                        <div className="section-head shelf-head">
                          <div>
                            <h3 className="shelf-title">All Bookmarks</h3>
                            <p className="shelf-copy">
                              {activeFolderSuggestions.length
                                ? "Remaining recipes not shown in suggest above."
                                : "All recipes saved in this folder."}
                            </p>
                          </div>
                          <span className="pill">{folderRemainingBookmarks.length} total</span>
                        </div>
                        <div className="merged-results-grid bookmarks-grid">
                          {folderRemainingBookmarks.map((bookmark) => (
                            <BookmarkCard
                              key={`${bookmark.recipeId}-${bookmark.folderId}-${bookmark.rating}`}
                              bookmark={bookmark}
                              onOpenRecipe={onOpenRecipe}
                            />
                          ))}
                        </div>
                      </section>
                    ) : activeFolderSuggestions.length ? (
                      <EmptyState message="All recipes in this folder are shown in the suggest section above." />
                    ) : null}
                  </>
                ) : (
                  <EmptyState message="This folder does not have any bookmarked recipes yet." />
                )}
              </>
            ) : (
              <EmptyState message="No folders found in the database yet. Create one from the recipe modal first." />
            )}
          </section>
        )}
      </main>
    </div>
  );
}
