import React, { useEffect, useRef, useState } from "react";
import { PartnerBotBus } from "../modules/partnerbot";

export default function HeroFloatCanvas() {
  const ref = useRef<HTMLCanvasElement>(null);
  const [glow, setGlow] = useState(false);
  const glowTimer = useRef<number | null>(null);

  useEffect(() => {
    const off = PartnerBotBus.onPose(() => {
      setGlow(true);
      if (glowTimer.current) window.clearTimeout(glowTimer.current);
      glowTimer.current = window.setTimeout(() => {
        setGlow(false);
        glowTimer.current = null;
      }, 400);
    });
    return () => {
      off();
      if (glowTimer.current) window.clearTimeout(glowTimer.current);
    };
  }, []);
  useEffect(() => {
    const cv = ref.current!;
    const ctx = cv.getContext("2d")!;
    let raf = 0;
    function resize() { cv.width = innerWidth; cv.height = innerHeight; }
    resize();
    addEventListener("resize", resize);

    const dots = Array.from({length: 80}, () => ({
      x: Math.random()*cv.width, y: Math.random()*cv.height,
      r: Math.random()*1.8+0.6, s: Math.random()*0.7+0.2
    }));
    const start = performance.now();
    const render = (t:number) => {
      ctx.clearRect(0,0,cv.width,cv.height);
      // soft gradient glow
      const g = ctx.createRadialGradient(cv.width*0.7, cv.height*0.3, 40, cv.width*0.7, cv.height*0.3, Math.max(cv.width, cv.height)*0.7);
      g.addColorStop(0, "rgba(255,115,0,.10)");
      g.addColorStop(1, "rgba(0,0,0,0)");
      ctx.fillStyle = g; ctx.fillRect(0,0,cv.width,cv.height);

      ctx.fillStyle = "rgba(255,255,255,.08)";
      dots.forEach(d=>{ d.x += Math.sin((t/10000)+d.y)*0.02; d.y += (d.s*0.15); if(d.y>cv.height) d.y = -10;
        ctx.beginPath(); ctx.arc(d.x,d.y,d.r,0,Math.PI*2); ctx.fill();
      });
      raf = requestAnimationFrame(render);
    };
    raf = requestAnimationFrame(render);
    return () => { cancelAnimationFrame(raf); removeEventListener("resize", resize); };
  }, []);
  return (
    <div className={`float-bg transition-all duration-300 ${glow ? "opacity-80 brightness-[1.2]" : "opacity-60"}`}>
      <canvas ref={ref} />
      <div className="float-title">FREIRAUM&nbsp;BERATUNG</div>
      <div className="float-sub">Automatisierung&nbsp;fürs&nbsp;Sauerland</div>
    </div>
  );
}