/** Social share card (og:image) — generated at build time, brand tokens inline. */

import { ImageResponse } from "next/og";

export const dynamic = "force-static";
export const alt = "RepLift — nutrition & fitness tracking, engineered for correctness";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default function OgImage() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
          padding: 72,
          background: "linear-gradient(135deg, #0b1120 0%, #111827 60%, #1f2937 100%)",
          color: "#f8fafc",
          fontFamily: "sans-serif",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 20 }}>
          <div
            style={{
              width: 72,
              height: 72,
              borderRadius: 20,
              background: "#f97316",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              fontSize: 40,
              fontWeight: 800,
              color: "#fff",
            }}
          >
            R
          </div>
          <div style={{ fontSize: 44, fontWeight: 800, display: "flex" }}>
            Rep<span style={{ color: "#fb923c" }}>Lift</span>
          </div>
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>
          <div style={{ fontSize: 76, fontWeight: 800, lineHeight: 1.05, letterSpacing: -2, display: "flex", flexDirection: "column" }}>
            <span>Eat with intent.</span>
            <span style={{ color: "#fb923c" }}>Lift your limits.</span>
          </div>
          <div style={{ fontSize: 30, color: "#94a3b8", maxWidth: 900 }}>
            Offline-first logging · explainable food search · nutrition math you can trust
          </div>
        </div>

        <div style={{ display: "flex", gap: 14 }}>
          {["Next.js", "FastAPI", "PostgreSQL", "Redis", "Offline-first sync"].map((t) => (
            <div
              key={t}
              style={{
                padding: "10px 22px",
                borderRadius: 999,
                border: "1px solid rgba(248,250,252,0.18)",
                background: "rgba(248,250,252,0.06)",
                fontSize: 22,
                color: "#cbd5e1",
              }}
            >
              {t}
            </div>
          ))}
        </div>
      </div>
    ),
    size,
  );
}
