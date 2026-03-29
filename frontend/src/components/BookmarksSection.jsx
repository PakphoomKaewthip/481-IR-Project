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

function EmptyState({ message }) {
  return <div className="empty-state list-empty">{message}</div>;
}

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

export default function BookmarksSection({ bookmarks = [], onOpenRecipe }) {
  if (!bookmarks.length) {
    return (
      <section className="merged-results-section">
        <EmptyState message="No bookmarks yet. Save a dish from Discover to show it here." />
      </section>
    );
  }

  return (
    <section className="merged-results-section">
      <div className="section-head shelf-head">
        <div>
          <h3 className="shelf-title">All Bookmarks</h3>
          <p className="shelf-copy">All your saved recipes.</p>
        </div>
        <span className="pill">{bookmarks.length} total</span>
      </div>
      <div className="merged-results-grid bookmarks-grid">
        {bookmarks.map((bookmark) => (
          <BookmarkCard
            key={`${bookmark.recipeId}-${bookmark.folderId}-${bookmark.rating}`}
            bookmark={bookmark}
            onOpenRecipe={onOpenRecipe}
          />
        ))}
      </div>
    </section>
  );
}