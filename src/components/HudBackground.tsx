/**
 * Deep futuristic backdrop, fixed behind all content.
 * Layers (back -> front): vignette, perspective grid floor, slow scan sweep,
 * viewport corner brackets (HUD frame). MatrixRain renders on top of this.
 * Pure CSS/SVG, no JS — cheap, and sits at -z-20.
 */
export default function HudBackground() {
  return (
    <div aria-hidden className="pointer-events-none fixed inset-0 -z-20 overflow-hidden">
      {/* radial depth + vignette */}
      <div
        className="absolute inset-0"
        style={{
          background:
            "radial-gradient(1100px 560px at 78% -8%, rgba(0,255,0,0.10), transparent 60%)," +
            "radial-gradient(820px 480px at -8% 108%, rgba(72,245,255,0.05), transparent 55%)," +
            "radial-gradient(140% 120% at 50% 40%, transparent 55%, rgba(0,0,0,0.85) 100%)",
        }}
      />

      {/* perspective grid floor */}
      <div
        className="absolute inset-x-0 bottom-0 h-[55vh] origin-bottom hud-floor"
        style={{
          backgroundImage:
            "linear-gradient(rgba(0,255,0,0.16) 1px, transparent 1px)," +
            "linear-gradient(90deg, rgba(0,255,0,0.16) 1px, transparent 1px)",
          backgroundSize: "56px 56px",
          transform: "perspective(420px) rotateX(64deg)",
          maskImage: "linear-gradient(to top, black 0%, transparent 92%)",
          WebkitMaskImage: "linear-gradient(to top, black 0%, transparent 92%)",
          opacity: 0.5,
        }}
      />

      {/* full-screen scan sweep */}
      <div
        className="absolute inset-x-0 h-[42vh] hud-sweep"
        style={{
          background: "linear-gradient(180deg, transparent, rgba(0,255,0,0.05) 50%, transparent)",
        }}
      />

      {/* viewport corner brackets */}
      {(
        [
          "left-3 top-3 border-l border-t",
          "right-3 top-3 border-r border-t",
          "left-3 bottom-3 border-l border-b",
          "right-3 bottom-3 border-r border-b",
        ] as const
      ).map((pos) => (
        <span key={pos} className={`absolute h-7 w-7 border-neon/40 ${pos}`} />
      ))}
    </div>
  );
}
