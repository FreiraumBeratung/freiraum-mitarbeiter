import { useEffect, useRef } from "react"

export default function CanvasBG({
  messages = ["FREIRAUM BERATUNG","Automatisierung & Digitalisierung","Individuelle Lösungen. Regional. Stark."],
  yOffset = 0.70,        // 0..1: vertikale Position (0=oben, 1=unten)
  size = 56,             // Fontgröße
  intervalMs = 2600,     // Wechsel alle X ms
}) {
  const ref = useRef(null)
  useEffect(()=>{
    const canvas = ref.current
    const ctx = canvas.getContext("2d")
    let w = canvas.width = window.innerWidth
    let h = canvas.height = window.innerHeight
    const DPR = Math.min(2, window.devicePixelRatio || 1)
    canvas.width = w * DPR; canvas.height = h * DPR; ctx.scale(DPR, DPR)

    const particles = Array.from({length: 90}, ()=>({
      x: Math.random()*w, y: Math.random()*h, r: Math.random()*1.6+0.5, vx:(Math.random()-0.5)*0.22, vy:(Math.random()-0.5)*0.22
    }))

    let t = 0
    let msgIndex = 0
    let alpha = 0
    let appearing = true
    let lastSwitch = performance.now()

    let raf
    function draw(now){
      raf = requestAnimationFrame(draw)
      t += 0.003

      // Hintergrund
      ctx.fillStyle = "rgba(0,0,0,0.35)"
      ctx.fillRect(0,0,w,h)
      const g = ctx.createRadialGradient(w*0.6,h*0.5,0,w*0.6,h*0.5,Math.max(w,h)*0.9)
      g.addColorStop(0,"rgba(255,132,0,0.06)")
      g.addColorStop(1,"rgba(0,0,0,0.0)")
      ctx.fillStyle = g; ctx.fillRect(0,0,w,h)

      // Partikel
      ctx.fillStyle = "rgba(255,132,0,0.35)"
      particles.forEach(p=>{
        p.x += p.vx; p.y += p.vy
        if(p.x<0) p.x=w; if(p.x>w) p.x=0; if(p.y<0) p.y=h; if(p.y>h) p.y=0
        ctx.beginPath(); ctx.arc(p.x,p.y,p.r,0,Math.PI*2); ctx.fill()
      })

      // Alpha steuern (fade in/out)
      const elapsed = now - lastSwitch
      const fade = Math.min(1, elapsed / 600)
      if (appearing) { alpha = fade; if (elapsed > 1200) { appearing = false; lastSwitch = now; } }
      else { alpha = 1 - fade; if (elapsed > (intervalMs-1200)) { appearing = true; lastSwitch = now; msgIndex = (msgIndex+1)%messages.length; } }

      // Text
      const tx = w*0.5 + Math.sin(t*2.0)*18
      const ty = h*(yOffset||0.7) + Math.cos(t*1.3)*6
      ctx.font = `800 ${size}px system-ui, Segoe UI, Inter, Arial`
      ctx.textAlign = "center"; ctx.textBaseline = "middle"

      ctx.save()
      ctx.globalAlpha = Math.max(0, Math.min(1, alpha))
      ctx.shadowColor = "rgba(255,132,0,0.45)"
      ctx.shadowBlur = 28
      ctx.fillStyle = "rgba(255,180,110,0.32)"
      ctx.fillText(messages[msgIndex], tx, ty)
      ctx.restore()
    }
    raf = requestAnimationFrame(draw)

    function onResize(){
      w = canvas.width = window.innerWidth
      h = canvas.height = window.innerHeight
      canvas.width = w * DPR; canvas.height = h * DPR; ctx.scale(DPR, DPR)
    }
    window.addEventListener("resize", onResize)
    return ()=>{ cancelAnimationFrame(raf); window.removeEventListener("resize", onResize) }
  },[messages,yOffset,size,intervalMs])

  return <canvas ref={ref} className="fixed inset-0 -z-10" aria-hidden />
}
