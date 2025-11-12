import React, { useEffect, useRef } from "react";

export default function GlassyHero() {
  const ref = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const c = ref.current!;
    const ctx = c.getContext("2d")!;
    const dpr = window.devicePixelRatio || 1;

    function resize() {
      c.width = c.clientWidth * dpr;
      c.height = c.clientHeight * dpr;
    }

    resize();
    window.addEventListener("resize", resize);

    const dots = Array.from({ length: 60 }, () => ({
      x: Math.random(),
      y: Math.random(),
      v: (0.2 + Math.random() * 0.6) / 60,
    }));

    let t = 0;
    let raf = 0;

    function loop() {
      raf = requestAnimationFrame(loop);
      t += 0.002;

      ctx.clearRect(0, 0, c.width, c.height);

      // gradient backdrop
      const g = ctx.createRadialGradient(
        c.width * 0.7,
        c.height * 0.3,
        50,
        c.width * 0.7,
        c.height * 0.3,
        Math.max(c.width, c.height) * 0.8
      );
      g.addColorStop(0, "rgba(255,115,0,0.12)");
      g.addColorStop(1, "rgba(0,0,0,0)");
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, c.width, c.height);

      // dots
      dots.forEach((d, i) => {
        const x = d.x * c.width + Math.sin(t + i) * 8;
        const y = d.y * c.height + Math.cos(t * 1.2 + i) * 8;
        ctx.beginPath();
        ctx.arc(x, y, 2.2 * dpr, 0, Math.PI * 2);
        ctx.fillStyle = "rgba(255,255,255,0.06)";
        ctx.fill();
      });

      // title
      ctx.font = `${42 * dpr}px Inter, ui-sans-serif`;
      ctx.fillStyle = "rgba(255,255,255,0.06)";
      ctx.fillText("FREIRAUM BERATUNG", 24 * dpr, 64 * dpr);
    }

    loop();

    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("resize", resize);
    };
  }, []);

  return (
    <canvas
      ref={ref}
      className="fixed inset-0 -z-10 opacity-100 pointer-events-none"
    />
  );
}

