/**
 * OceanBackground — subtle animated deep-ocean wave effect.
 *
 * Pure CSS + SVG. Three wave layers animated with CSS translateX
 * (GPU-accelerated, no repaints). Zero JS overhead at runtime.
 *
 * Usage: place as first child of a `position: relative; overflow: hidden`
 * container with `absolute inset-0 -z-10` to sit behind all content.
 */
export function OceanBackground() {
  return (
    <div
      aria-hidden="true"
      className="absolute inset-0 overflow-hidden pointer-events-none select-none"
      style={{ zIndex: 0 }}
    >
      <style>{`
        @keyframes ocean-drift-a {
          from { transform: translateX(0); }
          to   { transform: translateX(-50%); }
        }
        @keyframes ocean-drift-b {
          from { transform: translateX(-8%); }
          to   { transform: translateX(-58%); }
        }
        @keyframes ocean-drift-c {
          from { transform: translateX(-4%); }
          to   { transform: translateX(-54%); }
        }
        .ocean-layer {
          position: absolute;
          left: 0;
          width: 200%;
          will-change: transform;
        }
      `}</style>

      {/* ── Base gradient: gives the subtle depth gradient top→bottom ── */}
      <div
        className="absolute inset-0"
        style={{
          background:
            "linear-gradient(180deg, hsl(225,44%,6%) 0%, hsl(225,46%,9%) 60%, hsl(224,48%,11%) 100%)",
        }}
      />

      {/*
       * ── Wave Layer 1: deepest / slowest / darkest ──
       * Positioned near the middle of the page, very low opacity.
       * Amplitude ~30px, long period.
       */}
      <svg
        className="ocean-layer"
        viewBox="0 0 2880 90"
        preserveAspectRatio="none"
        xmlns="http://www.w3.org/2000/svg"
        style={{
          top: "28%",
          height: "90px",
          animation: "ocean-drift-a 38s linear infinite",
          opacity: 0.18,
        }}
      >
        <path
          d="M0,45 C240,15 480,75 720,45 C960,15 1200,75 1440,45 C1680,15 1920,75 2160,45 C2400,15 2640,75 2880,45 L2880,90 L0,90 Z"
          fill="hsl(225,50%,18%)"
        />
      </svg>

      {/*
       * ── Wave Layer 2: mid-depth / medium speed ──
       * Slightly different phase offset and speed.
       */}
      <svg
        className="ocean-layer"
        viewBox="0 0 2880 110"
        preserveAspectRatio="none"
        xmlns="http://www.w3.org/2000/svg"
        style={{
          top: "48%",
          height: "110px",
          animation: "ocean-drift-b 26s linear infinite",
          opacity: 0.14,
        }}
      >
        <path
          d="M0,55 C180,25 360,85 540,55 C720,25 900,85 1080,55 C1260,25 1440,85 1620,55 C1800,25 1980,85 2160,55 C2340,25 2520,85 2700,55 C2790,40 2880,55 2880,55 L2880,110 L0,110 Z"
          fill="hsl(222,52%,20%)"
        />
      </svg>

      {/*
       * ── Wave Layer 3: surface / fastest / widest ──
       * Subtler amplitude, moves quickest to suggest surface chop.
       */}
      <svg
        className="ocean-layer"
        viewBox="0 0 2880 130"
        preserveAspectRatio="none"
        xmlns="http://www.w3.org/2000/svg"
        style={{
          top: "62%",
          height: "130px",
          animation: "ocean-drift-c 18s linear infinite",
          opacity: 0.11,
        }}
      >
        <path
          d="M0,65 C160,40 320,90 480,65 C640,40 800,90 960,65 C1120,40 1280,90 1440,65 C1600,40 1760,90 1920,65 C2080,40 2240,90 2400,65 C2560,40 2720,90 2880,65 L2880,130 L0,130 Z"
          fill="hsl(220,55%,22%)"
        />
      </svg>

      {/* ── Very faint shimmer band near top — evokes light on deep water ── */}
      <div
        className="absolute left-0 right-0"
        style={{
          top: 0,
          height: "35%",
          background:
            "radial-gradient(ellipse 120% 60% at 50% 0%, hsla(210,80%,40%,0.045) 0%, transparent 70%)",
          pointerEvents: "none",
        }}
      />
    </div>
  );
}
