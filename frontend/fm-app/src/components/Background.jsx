import { useEffect } from 'react';

export default function Background(){
  useEffect(()=>{
    const canvas = document.getElementById('bg-canvas');
    if(!canvas) return;
    const ctx = canvas.getContext('2d');

    const resize = ()=>{
      const dpr = Math.min(2, window.devicePixelRatio||1);
      const w = window.innerWidth;
      const h = window.innerHeight;
      canvas.style.width = w + 'px';
      canvas.style.height = h + 'px';
      canvas.width = Math.round(w*dpr);
      canvas.height = Math.round(h*dpr);
      ctx.setTransform(dpr,0,0,dpr,0,0);
    };
    window.addEventListener('resize', resize);
    resize();

    // Partikel (Orange Glimmer)
    const N = 120;
    const particles = Array.from({length:N}).map(()=>({
      x: Math.random()*window.innerWidth,
      y: Math.random()*window.innerHeight,
      r: Math.random()*1.8 + .4,
      dx: (Math.random()-.5)*.28,
      dy: (Math.random()-.5)*.28,
      a: Math.random()*Math.PI*2
    }));

    // Slogans, drifting across screen
    const lines = [
      'FREIRAUM BERATUNG',
      'Automatisierung & Digitalisierung',
      'Individuelle Lösungen für Unternehmen',
      'Zusammen stärken wir das Sauerland'
    ];
    let lineIdx = 0; let alpha = 0; let appear = true; let lastSwitch = performance.now();
    let t = 0; let raf;

    const tick = (now=0)=>{
      raf = requestAnimationFrame(tick);
      t += 0.003;

      const w = window.innerWidth, h = window.innerHeight;

      // Hintergrund-Gradient + weicher Film
      const g = ctx.createRadialGradient(w*0.65,h*0.45,0,w*0.65,h*0.45,Math.max(w,h)*0.9);
      g.addColorStop(0,'rgba(255,122,26,0.06)');
      g.addColorStop(1,'rgba(0,0,0,0)');
      ctx.fillStyle = 'rgba(8,8,10,0.28)';
      ctx.fillRect(0,0,w,h);
      ctx.fillStyle = g; ctx.fillRect(0,0,w,h);

      // Partikel zeichnen
      ctx.fillStyle = 'rgba(255,122,26,0.32)';
      particles.forEach(p=>{
        p.x += p.dx; p.y += p.dy; p.a += 0.01;
        if(p.x<0) p.x=w; if(p.x>w) p.x=0; if(p.y<0) p.y=h; if(p.y>h) p.y=0;
        ctx.beginPath(); ctx.arc(p.x,p.y,p.r,0,Math.PI*2); ctx.fill();
      });

      // Text-Alpha (fade in/out)
      const elapsed = now - lastSwitch;
      const fade = Math.min(1, elapsed/700);
      if(appear){ alpha = fade; if(elapsed>1600){ appear=false; lastSwitch=now; } }
      else { alpha = 1-fade; if(elapsed>4200){ appear=true; lastSwitch=now; lineIdx=(lineIdx+1)%lines.length; } }

      // Driftende Typo in zwei Ebenen
      const baseX = w*0.5 + Math.sin(t*1.7)*22;
      const baseY = h*0.78 + Math.cos(t*1.3)*8;

      ctx.save();
      ctx.globalAlpha = Math.max(0,Math.min(1,alpha));
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.font = '800 56px Inter, Segoe UI, Roboto, Arial, sans-serif';
      ctx.shadowColor = 'rgba(255,122,26,0.45)'; ctx.shadowBlur = 26;
      ctx.fillStyle = 'rgba(255,180,120,0.28)';
      ctx.fillText(lines[lineIdx], baseX, baseY);

      // Große Wasserzeichen-Zeile (Marke) sehr dezent quer
      ctx.globalAlpha = 0.06;
      ctx.shadowBlur = 0; ctx.fillStyle = '#ff7a1a';
      ctx.font = '900 140px Inter, Segoe UI, Roboto, Arial, sans-serif';
      const waterX = w*0.5 - t*120 % (w*1.5);
      ctx.translate(waterX, h*0.32);
      ctx.rotate(-0.06);
      ctx.fillText('FREIRAUM BERATUNG', 0, 0);
      ctx.restore();
    };

    tick();
    return ()=>{ cancelAnimationFrame(raf); window.removeEventListener('resize', resize); };
  },[]);
  return <canvas id='bg-canvas'/>;
}
