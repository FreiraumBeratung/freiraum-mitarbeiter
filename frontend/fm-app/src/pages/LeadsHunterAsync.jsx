import { useEffect, useState } from "react"



export default function LeadsHunterAsync(){

  const [category,setCategory] = useState("shk")

  const [location,setLocation] = useState("Arnsberg")

  const [count,setCount] = useState(20)

  const [task,setTask] = useState(null)

  const [status,setStatus] = useState(null)

  const [progress,setProgress] = useState(0)

  const [mode,setMode] = useState("collect") // collect|outreach



  const start = async ()=>{

    setStatus("starting")

    const payload = { category, location, count: Number(count), save_to_db: true, export_excel: true, outreach: mode==="outreach" }

    const r = await fetch("/api/lead_hunter/hunt_async",{ method:"POST", headers:{"Content-Type":"application/json"}, body:JSON.stringify(payload) })

    const data = await r.json()

    setTask(data.task_id); setStatus("running")

  }



  useEffect(()=>{

    if(!task) return

    const id = setInterval(async ()=>{

      const r = await fetch(`/api/lead_hunter/task/${task}`)

      const d = await r.json()

      setStatus(d.status)

      setProgress(d.progress || 0)

      if(d.status === "done" || d.status === "error" || d.status === "canceled"){

        clearInterval(id)

        setTask(null)

        setStatus(d.status)

        if(d.status === "done" && d.result?.excel) alert(`Excel exportiert: ${d.result.excel}`)

        if(d.status === "error" && d.error) alert(`Fehler: ${d.error}`)

      }

    }, 1500)

    return ()=>clearInterval(id)

  },[task])



  return (

    <div className="p-6 text-white">

      <h1 className="text-xl font-semibold mb-4">Kontakt-Suche (asynchron)</h1>

      <div className="grid grid-cols-1 md:grid-cols-4 gap-3 mb-4">

        <input className="px-3 py-2 rounded-lg bg-white/10 border border-white/10" value={category} onChange={e=>setCategory(e.target.value)} placeholder="Kategorie (z. B. shk, elektro, makler)" />

        <input className="px-3 py-2 rounded-lg bg-white/10 border border-white/10" value={location} onChange={e=>setLocation(e.target.value)} placeholder="Ort (z. B. Arnsberg)" />

        <input className="px-3 py-2 rounded-lg bg-white/10 border border-white/10" value={count} onChange={e=>setCount(e.target.value)} type="number" min="1" />

        <select className="px-3 py-2 rounded-lg bg-white/10 border border-white/10" value={mode} onChange={e=>setMode(e.target.value)}>

          <option value="collect">Nur sammeln</option>

          <option value="outreach">Sammeln + Outreach</option>

        </select>

      </div>

      <div className="flex gap-3 mb-4">

        <button onClick={start} disabled={task !== null} className="px-4 py-2 rounded-lg bg-amber-400 text-black font-semibold disabled:opacity-50 disabled:cursor-not-allowed">Suche starten</button>

        {status && <span className="px-3 py-2 rounded-lg bg-white/10 border border-white/10">Status: {status}</span>}

        {task && <button onClick={()=>{fetch(`/api/lead_hunter/cancel/${task}`, {method:"POST"}); setTask(null); setStatus("canceled")}} className="px-3 py-2 rounded-lg bg-red-500 text-white">Abbrechen</button>}

      </div>

      <div className="mt-6">

        <div className="h-3 w-full rounded bg-white/10 overflow-hidden">

          <div className="h-3 bg-amber-400 transition-all duration-300" style={{width: `${progress}%`}}></div>

        </div>

        {progress > 0 && <div className="text-sm text-fr-muted mt-2">{Math.round(progress)}% abgeschlossen</div>}

      </div>

    </div>

  )

}

