"use client";

/** Last resort if the site's own layout fails, so it can't rely on the site's styles. */
export default function GlobalError({ reset }: { reset: () => void }) {
  return (
    <html lang="en">
      <body style={{ margin: 0, minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", background: "#f5f4f0", color: "#111111", fontFamily: "Georgia, serif", textAlign: "center", padding: 24 }}>
        <main>
          <h1 style={{ fontSize: 44, fontWeight: 400, margin: 0 }}>We hit a snag</h1>
          <p style={{ color: "#55565b", fontFamily: "system-ui, sans-serif", margin: "16px 0 28px" }}>Please try again in a moment.</p>
          <button onClick={reset} style={{ background: "#111111", color: "#ffffff", border: 0, borderRadius: 999, padding: "12px 24px", fontSize: 14, cursor: "pointer", fontFamily: "system-ui, sans-serif" }}>Try again</button>
        </main>
      </body>
    </html>
  );
}
