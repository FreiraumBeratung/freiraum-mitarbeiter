export function Field({label, children}){
  return (
    <div className="flex flex-col gap-1 min-w-0">
      {label && <div className="fr-label">{label}</div>}
      {children}
    </div>
  )
}

export function Input(props){
  return <input {...props} className={(props.className||'') + ' fr-input'} />
}

export function Textarea(props){
  return <textarea {...props} className={(props.className||'') + ' fr-textarea'} />
}

export function Row({children}){
  return <div className="grid grid-cols-1 md:grid-cols-2 gap-3">{children}</div>
}

export function Actions({children}){
  return <div className="flex flex-wrap gap-3 items-center">{children}</div>
}










