export default function Tabs({tab,setTab}) {
  const T = ["Dashboard","Inbox","Angebote","Leads","Follow-ups","Reports","Settings"]
  return (
    <div className="px-4 py-3 flex flex-wrap gap-2 border-b border-zinc-900 bg-black/40">
      {T.map(t => (
        <button key={t} onClick={()=>setTab(t)}
          className={`px-3 py-1.5 rounded-full text-sm transition-colors ${tab===t?'bg-orange-500/25 text-orange-200 border border-orange-500/40':'bg-zinc-900/60 border border-zinc-800 hover:border-zinc-700'}`}>
          {t}
        </button>
      ))}
    </div>
  )
}













