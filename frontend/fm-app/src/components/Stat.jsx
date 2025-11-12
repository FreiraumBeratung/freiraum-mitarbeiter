export function Stat({label, value}) {
  return (
    <div className="p-4 rounded-2xl bg-zinc-900 border border-orange-600/20">
      <div className="text-2xl font-bold">{value}</div>
      <div className="text-xs opacity-70">{label}</div>
    </div>
  )
}
























