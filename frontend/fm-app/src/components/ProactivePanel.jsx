import React from "react";



export default function ProactivePanel() {

  const [items, setItems] = React.useState([]);

  const [loading, setLoading] = React.useState(false);

  const [note, setNote] = React.useState("Ich erinnere dich morgen daran.");

  const base = (import.meta.env.VITE_API_BASE || "http://localhost:30521/api");



  const load = async () => {

    try {

      setLoading(true);

      const r = await fetch(`${base}/proactive/reminders?status=queued`);

      const j = await r.json();

      setItems(j.items || []);

    } catch(e) {

      // ignore

    } finally {

      setLoading(false);

    }

  };



  const addQuick = async (spec="1d") => {

    await fetch(`${base}/proactive/remember`, {

      method: "POST",

      headers: {"Content-Type":"application/json"},

      body: JSON.stringify({ user_id: "denis", kind:"followup", note, in: spec, payload:{source:"panel"} })

    });

    await load();

  };



  const trigger = async () => {

    await fetch(`${base}/proactive/trigger`, { method:"POST" });

    await load();

  };



  React.useEffect(() => {

    load();

    const t = setInterval(load, 5000);

    return () => clearInterval(t);

  }, []);



  return (

    <div className="fixed left-4 bottom-32 z-50">

      <div className="glass-card max-w-sm w-[360px] p-4 border border-white/10 rounded-2xl shadow-xl bg-black/25 backdrop-blur-lg">

        <div className="flex items-center justify-between mb-2">

          <h2 className="text-base font-semibold tracking-tight text-white/90">Erinnerungen</h2>

          {loading ? <span className="text-xs text-white/50">lädt…</span> : null}

        </div>



        <div className="space-y-2 max-h-40 overflow-auto pr-1">

          {items.length === 0 ? (

            <div className="text-white/60 text-sm">Ruhig & aufgeräumt. Keine offenen Erinnerungen.</div>

          ) : items.map(it => (

            <div key={it.id} className="text-sm text-white/90 bg-white/5 rounded-lg p-2 border border-white/10">

              <div className="font-medium">{it.note || "Erinnerung"}</div>

              <div className="text-white/50 text-xs">Fällig: {new Date(it.due_ts*1000).toLocaleString("de-DE")}</div>

            </div>

          ))}

        </div>



        <div className="mt-3 space-y-2">

          <input

            className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-sm text-white placeholder:text-white/40 outline-none focus:border-white/20 focus:bg-white/8 transition"

            placeholder="Deine Erinnerung (ruhig, klar, geschäftlich)"

            value={note}

            onChange={e=>setNote(e.target.value)}

          />

          <div className="flex items-center gap-2">

            <button onClick={()=>addQuick("1d")} className="px-3 py-2 rounded-lg bg-white/10 hover:bg-white/15 text-white text-sm border border-white/10 transition">

              + Morgen (1 Tag)

            </button>

            <button onClick={()=>addQuick("5s")} className="px-3 py-2 rounded-lg bg-white/10 hover:bg-white/15 text-white text-sm border border-white/10 transition">

              Test (5s)

            </button>

            <button onClick={trigger} className="ml-auto px-3 py-2 rounded-lg bg-white/10 hover:bg-white/15 text-white text-sm border border-white/10 transition">

              Prüfen

            </button>

          </div>

          <div className="text-[12px] text-white/55">

            Ton: ruhig · warm · verlässlich. <span className="text-white/75">„Ich habe das im Blick. Ich melde mich morgen."</span>

          </div>

        </div>

      </div>

    </div>

  );

}

