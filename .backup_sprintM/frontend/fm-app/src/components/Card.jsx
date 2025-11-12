export default function Card({title, right, children, className=""}) {
  return (
    <div className={`card border-glow m-4 p-5 ${className}`}>
      {(title || right) && (
        <div className="mb-3 flex items-center">
          <div className="font-semibold text-lg">{title}</div>
          <div className="ml-auto">{right}</div>
        </div>
      )}
      {children}
    </div>
  )
}













