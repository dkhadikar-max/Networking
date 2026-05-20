export default function Vignette() {
  return (
    <div
      className="fixed top-0 left-0 w-full h-full z-[1] pointer-events-none"
      style={{ background: "radial-gradient(ellipse at center, transparent 0%, rgba(6, 78, 78, 0.4) 100%)" }}
    />
  );
}
