import {useEffect, useRef, useState} from "react"



export default function AvatarBot({

  suggestApi = "/api/insights/suggestions",

  decisionApi = "/api/decision/think",

  autoSpeak = false,

}) {

  const [visible, setVisible] = useState(true)

  const [speaking, setSpeaking] = useState(false)

  const [hint, setHint] = useState(null)

  const [animWave, setAnimWave] = useState(false)

  const speakRef = useRef(null)



  // fetch suggestions every 45s

  useEffect(() => {

    let alive = true

    const load = async () => {

      try {

        const r = await fetch(suggestApi)

        if (!r.ok) return

        const data = await r.json()

        if (!alive) return

        const first = (Array.isArray(data) && data.length) ? data[0] : null

        setHint(first ? (first.text || first.title || "Ich habe eine Idee …") : "Ich habe ein paar Ideen – willst du sie hören?")

        setAnimWave(true)

        setTimeout(() => setAnimWave(false), 1200)

        if (autoSpeak && hint) speak(hint)

      } catch { /* ignore */ }

    }

    load()

    const id = setInterval(load, 45000)

    return () => { alive = false; clearInterval(id) }

  }, [])



  const speak = (text) => {

    try {

      const synth = window.speechSynthesis

      if (!synth) return

      const utter = new SpeechSynthesisUtterance(text)

      // deutsch, ruhig, professionell

      utter.lang = "de-DE"

      utter.rate = 1.0

      utter.pitch = 1.0

      setSpeaking(true)

      utter.onend = () => setSpeaking(false)

      synth.speak(utter)

      speakRef.current = utter

    } catch { /* ignore */ }

  }



  const onClickIdeas = async () => {

    try {

      const r = await fetch(decisionApi, { method:"POST", headers:{"Content-Type":"application/json"}, body: JSON.stringify({ user_id:"denis"}) })

      if (!r.ok) return

      const data = await r.json()

      const top = data?.actions?.[0]?.title || "Ich habe frische Next Steps für dich!"

      setHint(top)

      speak(top)

    } catch { /* ignore */ }

  }



  return (

    <div data-testid="avatar-bot"

      className="fixed left-4 bottom-4 z-50 select-none"

      style={{filter:"drop-shadow(0 8px 28px rgba(0,0,0,.45))"}}

    >

      {/* Toggle */}

      <div className="mb-2 flex gap-2">

        <button onClick={()=>setVisible(v=>!v)} className="px-3 py-1 rounded-xl text-xs bg-white/10 text-white border border-white/10 backdrop-blur hover:bg-white/15 transition">

          {visible ? "Bot verbergen" : "Bot zeigen"}

        </button>

      </div>



      {visible && (

        <div className="flex items-end gap-3">

          {/* Sprechblase */}

          <div className={`max-w-[320px] px-4 py-3 rounded-2xl border border-white/10 bg-white/6 text-white/90 backdrop-blur-md ${speaking? "ring-1 ring-white/20" : ""}`}>

            <div className="text-sm leading-snug">

              <div className="font-semibold mb-1">Hey, ich habe was für dich!</div>

              <div>{hint || "Ich habe ein paar Ideen – möchtest du sie hören?"}</div>

            </div>

            <div className="mt-2 flex gap-2">

              <button onClick={()=>speak(hint || "Ich habe ein paar Ideen für dich.")}

                className="px-3 py-1 rounded-lg text-xs bg-white/15 border border-white/10 hover:bg-white/25 transition">Vorlesen</button>

              <button onClick={onClickIdeas}

                className="px-3 py-1 rounded-lg text-xs bg-amber-400/90 text-black font-semibold hover:bg-amber-400 transition">Zeig Vorschläge</button>

            </div>

          </div>



          {/* Avatar (SVG) */}

          <div className={`w-20 h-24 rounded-2xl border border-white/10 bg-white/8 backdrop-blur-md flex items-end justify-center relative overflow-hidden`}>

            {/* Kopf */}

            <div className="absolute top-2 left-1/2 -translate-x-1/2 w-12 h-12 rounded-full bg-gradient-to-b from-white/70 to-white/30 border border-white/40 flex items-center justify-center">

              <div className={`w-6 h-2 bg-black/70 rounded-full ${speaking ? "animate-pulse" : ""}`}></div>

              {/* Augen */}

              <div className="absolute top-3 left-1/2 -translate-x-1/2 flex gap-3">

                <div className="w-1.5 h-1.5 rounded-full bg-black/70"></div>

                <div className="w-1.5 h-1.5 rounded-full bg-black/70"></div>

              </div>

            </div>

            {/* Körper */}

            <div className="absolute bottom-2 w-14 h-10 left-1/2 -translate-x-1/2 rounded-xl bg-gradient-to-b from-white/25 to-white/10 border border-white/30"></div>

            {/* Beine */}

            <div className="absolute bottom-1 left-1/2 -translate-x-1/2 flex gap-3">

              <div className="w-2 h-3 bg-white/60 rounded-md"></div>

              <div className="w-2 h-3 bg-white/60 rounded-md"></div>

            </div>

            {/* Arme (rechts winken) */}

            <div className={`absolute top-10 right-1 w-2 h-6 bg-white/60 rounded-md origin-top ${animWave ? "animate-[wiggle_1.2s_ease-in-out]" : ""}`}></div>

            <div className="absolute top-10 left-1 w-2 h-6 bg-white/60 rounded-md rounded-t"></div>



            <style>{`

              @keyframes wiggle {

                0%,100% { transform: rotate(0deg); }

                25% { transform: rotate(25deg); }

                50% { transform: rotate(-15deg); }

                75% { transform: rotate(20deg); }

              }

            `}</style>

          </div>

        </div>

      )}

    </div>

  )

}

