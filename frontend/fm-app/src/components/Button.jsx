export function Button({children, variant='primary', ...props}){
  const base = 'fr-btn ' + (variant==='primary' ? 'fr-btn--primary' : variant==='ghost' ? 'fr-btn--ghost' : '');
  return <button {...props} className={base}>{children}</button>
}

