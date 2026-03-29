export default function LoginScreen({
  authMode,
  onAuthModeChange,
  onBackToDiscover,
  authLoading,
  authStatus,
  username,
  identifier,
  email,
  password,
  onUsernameChange,
  onIdentifierChange,
  onEmailChange,
  onPasswordChange,
  onLogin,
  onSignup,
}) {
  const loggedIn = authStatus !== "Signed out";
  const isSignup = authMode === "signup";

  return (
    <section className="auth-screen">
      <div className="auth-card glass">
        <div className="auth-copy">
          <p className="eyebrow">IR Recipe Discovery</p>
          <h1>{isSignup ? "Create your account before entering the recipe workspace." : "Sign in before entering the recipe workspace."}</h1>
          <p className="hero-text">
            This frontend connects to the existing Flask search API. Account data is now saved in the database and authenticated with JWT.
          </p>
        </div>
        <div className="auth-panel">
          <div className="status-row">
            <span className="status-dot" data-logged-in={loggedIn}></span>
            <span>{authStatus}</span>
          </div>
          <div className="auth-grid">
            {isSignup ? (
              <label>
                <span>Username</span>
                <input
                  value={username}
                  onChange={(event) => onUsernameChange(event.target.value)}
                  type="text"
                  placeholder="username"
                  disabled={authLoading}
                />
              </label>
            ) : (
              <label>
                <span>Username or Email</span>
                <input
                  value={identifier}
                  onChange={(event) => onIdentifierChange(event.target.value)}
                  type="text"
                  placeholder="username or Gmail"
                  disabled={authLoading}
                />
              </label>
            )}
            {isSignup ? (
              <label>
                <span>Email</span>
                <input
                  value={email}
                  onChange={(event) => onEmailChange(event.target.value)}
                  type="email"
                  placeholder="Gmail"
                  disabled={authLoading}
                />
              </label>
            ) : null}
            <label>
              <span>Password</span>
              <input
                value={password}
                onChange={(event) => onPasswordChange(event.target.value)}
                type="password"
                placeholder="Use any password"
                disabled={authLoading}
              />
            </label>
          </div>
          <div className="hero-actions">
            {isSignup ? (
              <>
                <button onClick={onSignup} className="primary-btn" type="button" disabled={authLoading}>
                  Register
                </button>
                <button onClick={() => onAuthModeChange("signin")} className="ghost-btn" type="button" disabled={authLoading}>
                  Back to Log in
                </button>
              </>
            ) : (
              <>
                <button onClick={onLogin} className="primary-btn" type="button" disabled={authLoading}>
                  Log in
                </button>
                <button onClick={() => onAuthModeChange("signup")} className="ghost-btn" type="button" disabled={authLoading}>
                  Register
                </button>
              </>
            )}
          </div>
          <button onClick={onBackToDiscover} className="text-btn" type="button" disabled={authLoading}>
            Back to Search
          </button>
          <p className="muted-text">
            {authLoading
              ? "Checking your existing session token..."
              : "Authentication now uses JWT from the Flask backend."}
          </p>
        </div>
      </div>
    </section>
  );
}
