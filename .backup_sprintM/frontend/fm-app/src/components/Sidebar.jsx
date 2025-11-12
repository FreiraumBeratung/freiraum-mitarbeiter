export default function Sidebar(){
  return (
    <aside className='hidden md:flex flex-col w-16 hover:w-64 transition-all duration-300 p-6 gap-6 z-10 group'>
      <div className='fr-card p-5 flex flex-col items-center gap-4'>
        <div className='w-24 h-24 rounded-2xl bg-black/60 border border-fr-border flex items-center justify-center shadow-fr_glow'>
          <img src='/logo.png' alt='Freiraum' className='w-16 h-16 object-contain'/>
        </div>
        <div className='text-center opacity-0 group-hover:opacity-100 transition-opacity'>
          <div className='text-fr-muted text-xs tracking-wider'>FREIRAUM</div>
          <div className='font-semibold'>Mitarbeiter</div>
        </div>
      </div>
      <div className='fr-card p-4'>
        <div className='text-xs text-fr-muted opacity-0 group-hover:opacity-100 transition-opacity'>Status</div>
        <div className='mt-2 text-sm opacity-0 group-hover:opacity-100 transition-opacity'>Backend <span className='text-fr-orange'>online</span></div>
        <div className='text-sm opacity-0 group-hover:opacity-100 transition-opacity'>IMAP/SMTP <span className='text-fr-orange'>bereit</span></div>
      </div>
    </aside>
  )
}
