import { useEffect, useRef } from "react";

const ORBS = [
  { x: 0.22, y: 0.28, r: 340, color: "17,153,142", vx: 0.00006, vy: 0.00004, phase: 0 },
  { x: 0.78, y: 0.22, r: 300, color: "243,156,18", vx: -0.00005, vy: 0.00005, phase: 2 },
  { x: 0.5, y: 0.55, r: 380, color: "0,180,219", vx: 0.00004, vy: -0.00006, phase: 4 },
];

export function AmbientBackground() {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    const stage = canvas?.parentElement;
    const ctx = canvas?.getContext("2d");
    if (!canvas || !stage || !ctx) return;

    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    let raf = 0;

    function resize() {
      const rect = stage!.getBoundingClientRect();
      canvas!.width = rect.width * dpr;
      canvas!.height = rect.height * dpr;
      canvas!.style.width = `${rect.width}px`;
      canvas!.style.height = `${rect.height}px`;
      ctx!.setTransform(dpr, 0, 0, dpr, 0, 0);
    }

    function draw(t: number) {
      const w = canvas!.width / dpr;
      const h = canvas!.height / dpr;
      const styles = getComputedStyle(document.documentElement);
      const base = styles.getPropertyValue("--amb-base").trim() || "#eef4f6";
      const alpha = parseFloat(styles.getPropertyValue("--amb-alpha")) || 0.2;

      ctx!.clearRect(0, 0, w, h);
      ctx!.fillStyle = base;
      ctx!.fillRect(0, 0, w, h);

      ORBS.forEach((o) => {
        const x = (o.x + Math.sin(t * o.vx + o.phase) * 0.05) * w;
        const y = (o.y + Math.cos(t * o.vy + o.phase) * 0.06) * h;
        const grad = ctx!.createRadialGradient(x, y, 0, x, y, o.r);
        grad.addColorStop(0, `rgba(${o.color},${alpha})`);
        grad.addColorStop(1, `rgba(${o.color},0)`);
        ctx!.fillStyle = grad;
        ctx!.beginPath();
        ctx!.arc(x, y, o.r, 0, Math.PI * 2);
        ctx!.fill();
      });
    }

    resize();
    window.addEventListener("resize", resize);

    const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (reduceMotion) {
      draw(0);
    } else {
      const loop = (ts: number) => {
        draw(ts);
        raf = requestAnimationFrame(loop);
      };
      raf = requestAnimationFrame(loop);
    }

    return () => {
      window.removeEventListener("resize", resize);
      if (raf) cancelAnimationFrame(raf);
    };
  }, []);

  return (
    <>
      <canvas ref={canvasRef} className="absolute inset-0 h-full w-full" aria-hidden="true" />
      <svg
        className="absolute inset-0 h-full w-full opacity-60 [mask-image:linear-gradient(to_bottom,black,black_55%,transparent_92%)]"
        aria-hidden="true"
      >
        <defs>
          <pattern id="girih" width="72" height="72" patternUnits="userSpaceOnUse" patternTransform="rotate(15)">
            <g fill="none" stroke="var(--girih-stroke)" strokeWidth={0.75}>
              <rect x="14" y="14" width="44" height="44" />
              <rect x="14" y="14" width="44" height="44" transform="rotate(45 36 36)" />
            </g>
          </pattern>
        </defs>
        <rect width="100%" height="100%" fill="url(#girih)" />
      </svg>
    </>
  );
}
