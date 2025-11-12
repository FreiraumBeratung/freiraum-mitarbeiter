export function Btn({children, className="", ...props}){
  return <button {...props}
    className={`px-3 py-2 rounded-xl border transition-colors ${className}`} />
}

export function BtnPrimary({children, className="", ...props}){
  return <button {...props}
    className={`px-4 py-2 rounded-xl border border-orange-600/40 bg-orange-600/85 hover:bg-orange-600 active:translate-y-[1px] shadow-md shadow-orange-900/20 ${className}`}>
    {children}
  </button>
}

export function BtnGhost({children, className="", ...props}){
  return <button {...props}
    className={`px-3 py-2 rounded-xl border border-zinc-700 bg-zinc-900/70 hover:border-zinc-600 ${className}`}>
    {children}
  </button>
}












