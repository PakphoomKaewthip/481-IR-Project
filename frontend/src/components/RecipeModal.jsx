import { useEffect, useRef } from "react";

export default function RecipeModal({
  recipe,
  canBookmark,
  folders,
  activeFolderId,
  bookmarkFolderId,
  folderName,
  rating,
  onFolderNameChange,
  onCreateFolder,
  onBookmarkFolderChange,
  onRatingChange,
  onSave,
  onGoToLogin,
  onClose,
}) {
  const dialogRef = useRef(null);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;

    if (recipe && !dialog.open) {
      dialog.showModal();
    }

    if (!recipe && dialog.open) {
      dialog.close();
    }
  }, [recipe]);

  if (!recipe) {
    return <dialog ref={dialogRef} className="recipe-modal"></dialog>;
  }

  return (
    <dialog ref={dialogRef} className="recipe-modal" onClose={onClose}>
      <article className="modal-card">
        <button className="modal-close" aria-label="Close" onClick={onClose} type="button">
          ×
        </button>
        <div className="modal-media">
          {recipe.image ? (
            <img src={recipe.image} alt={recipe.name} />
          ) : (
            <div className="result-image-empty modal-image-empty">
              <span>No image in indexed data</span>
            </div>
          )}
        </div>
        <div className="modal-content">
          <div className="section-head compact">
            <div>
              <p className="section-kicker">{recipe.category || "Recipe details"}</p>
              <h2>{recipe.name}</h2>
            </div>
          </div>
          <p className="modal-description">{recipe.description}</p>
          <div className="detail-grid">
            <section>
              <h3>Ingredients</h3>
              <ul className="detail-list">
                {recipe.ingredients.map((ingredient) => (
                  <li key={ingredient}>{ingredient}</li>
                ))}
              </ul>
            </section>
            <section>
              <h3>Cooking steps</h3>
              <ol className="detail-list ordered">
                {recipe.instructions.map((step) => (
                  <li key={step}>{step}</li>
                ))}
              </ol>
            </section>
          </div>
          {!canBookmark ? (
            <div className="bookmark-setup">
              <p className="bookmark-helper">
                Sign in to bookmark this dish, choose a folder, and add your rating.
              </p>
              <button onClick={onGoToLogin} className="primary-btn" type="button">
                Sign in to bookmark
              </button>
            </div>
          ) : folders.length ? (
            <div className="bookmark-form">
              <select
                value={bookmarkFolderId || activeFolderId || ""}
                onChange={(event) => onBookmarkFolderChange(event.target.value)}
              >
                {folders.map((folder) => (
                  <option key={folder.id} value={folder.id}>
                    {folder.name}
                  </option>
                ))}
              </select>
              <select value={rating} onChange={(event) => onRatingChange(Number(event.target.value))}>
                <option value={5}>5 stars</option>
                <option value={4}>4 stars</option>
                <option value={3}>3 stars</option>
                <option value={2}>2 stars</option>
                <option value={1}>1 star</option>
              </select>
              <button onClick={onSave} className="primary-btn" type="button">
                Bookmark dish
              </button>
            </div>
          ) : (
            <div className="bookmark-setup">
              <p className="bookmark-helper">
                Create a folder before bookmarking this dish. After that you can choose the folder
                and rating.
              </p>
              <div className="bookmark-form bookmark-form-create">
                <input
                  value={folderName}
                  onChange={(event) => onFolderNameChange(event.target.value)}
                  type="text"
                  placeholder="Create a folder first"
                />
                <button onClick={onCreateFolder} className="primary-btn" type="button">
                  Create folder
                </button>
              </div>
            </div>
          )}
        </div>
      </article>
    </dialog>
  );
}
