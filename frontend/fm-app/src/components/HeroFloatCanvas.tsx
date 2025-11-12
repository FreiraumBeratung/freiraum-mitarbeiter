import React, { useEffect, useRef } from "react";

export default function HeroFloatCanvas() {
  const ref = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const c = ref.current;
    if (!c) return;

    const ctx = c.getContext("2d");
    if (!ctx) return;

    const dpr = window.devicePixelRatio || 1;

    function resize() {
      c.width = c.clientWidth * dpr;
      c.height = c.clientHeight * dpr;
      ctx.scale(dpr, dpr);
    }

    resize();
    window.addEventListener("resize", resize);

    const dots = Array.from({ length: 80 }, () => ({
      x: Math.random() * c.clientWidth,
      y: Math.random() * c.clientHeight,
      vx: (Math.random() - 0.5) * 0.3,
      vy: (Math.random() - 0.5) * 0.3,
      size: 1.5 + Math.random() * 1.5,
    }));

    const headlines = [
      { text: "FREIRAUM BERATUNG", y: 0.25, offset: 0 },
      { text: "Automatisierung fürs Sauerland", y: 0.75, offset: Math.PI },
    ];

    let t = 0;
    let raf = 0;

    function loop() {
      raf = requestAnimationFrame(loop);
      t += 0.005;

      ctx.clearRect(0, 0, c.clientWidth, c.clientHeight);

      // Gradient backdrop
      const grad = ctx.createRadialGradient(
        c.clientWidth * 0.7,
        c.clientHeight * 0.3,
        50,
        c.clientWidth * 0.7,
        c.clientHeight * 0.3,
        Math.max(c.clientWidth, c.clientHeight) * 0.8
      );
      grad.addColorStop(0, "rgba(255,115,0,0.08)");
      grad.addColorStop(1, "rgba(0,0,0,0)");
      ctx.fillStyle = grad;
      ctx.fillRect(0, 0, c.clientWidth, c.clientHeight);

      // Animated dots
      dots.forEach((d) => {
        d.x += d.vx;
        d.y += d.vy;
        if (d.x < 0 || d.x > c.clientWidth) d.vx *= -1;
        if (d.y < 0 || d.y > c.clientHeight) d.vy *= -1;

        ctx.beginPath();
        ctx.arc(d.x, d.y, d.size, 0, Math.PI * 2);
        ctx.fillStyle = "rgba(255,255,255,0.04)";
        ctx.fill();
      });

      // Floating headlines
      ctx.font = "600 48px Inter, ui-sans-serif";
      ctx.textAlign = "left";
      ctx.fillStyle = "rgba(255,255,255,0.035)";

      headlines.forEach((hl) => {
        const y = c.clientHeight * hl.y + Math.sin(t + hl.offset) * 8;
        const x = 40 + Math.cos(t * 0.7 + hl.offset) * 5;
        ctx.fillText(hl.text, x, y);
      });

      // Smaller secondary text
      ctx.font = "400 32px Inter, ui-sans-serif";
      ctx.fillStyle = "rgba(255,255,255,0.025)";
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
      style={{ width: "100%", height: "100%" }}
    />
  );
}

