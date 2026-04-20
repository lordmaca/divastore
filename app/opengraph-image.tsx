import { ImageResponse } from "next/og";

// Default Open Graph image rendered at request time by Next. 1200x630 is the
// canonical size Facebook/Twitter/LinkedIn target. Matches the brand card
// style (lavender→pink gradient, cursive wordmark, sparkle).
export const alt = "Brilho de Diva — Realce sua Beleza, Brilhe como uma Diva";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default async function Image() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          background:
            "linear-gradient(135deg,#e9defc 0%,#f4d9ee 100%)",
          position: "relative",
        }}
      >
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            justifyContent: "center",
            background: "rgba(255,255,255,0.55)",
            border: "1px solid rgba(255,255,255,0.7)",
            borderRadius: 48,
            padding: "80px 120px",
            boxShadow: "0 20px 60px -20px rgba(210,58,133,0.25)",
          }}
        >
          <div
            style={{
              fontSize: 28,
              letterSpacing: "0.3em",
              color: "#d23a85",
              opacity: 0.8,
              textTransform: "uppercase",
            }}
          >
            DivaHub · AI Portal
          </div>
          <div
            style={{
              fontSize: 160,
              lineHeight: 1,
              marginTop: 24,
              color: "#d23a85",
              fontFamily: "serif",
              fontStyle: "italic",
              fontWeight: 700,
            }}
          >
            Brilho de Diva
          </div>
          <div
            style={{
              marginTop: 28,
              display: "flex",
              alignItems: "center",
              gap: 16,
              fontSize: 32,
              color: "rgba(210,58,133,0.9)",
            }}
          >
            <span style={{ height: 2, width: 60, background: "rgba(255,95,169,0.6)" }} />
            <span style={{ color: "#ff5fa9" }}>⊰❀⊱</span>
            <span style={{ height: 2, width: 60, background: "rgba(255,95,169,0.6)" }} />
          </div>
          <div
            style={{
              marginTop: 24,
              fontSize: 34,
              color: "rgba(74,42,85,0.8)",
              fontWeight: 500,
            }}
          >
            Realce sua Beleza, Brilhe como uma Diva!
          </div>
        </div>
      </div>
    ),
    size,
  );
}
