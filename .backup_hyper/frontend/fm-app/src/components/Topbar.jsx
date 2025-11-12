export default function Topbar({active, onTab}){
  const tabs = ['Übersicht','Posteingang','Angebote','Leads','Nachfassungen','Berichte','Vorschläge','Persönlichkeit','Entscheidungen','Automatisierung','Lead-Suche','Sequenzen','Kalender','Audit','Einstellungen'];
  return (
    <div className='sticky top-0 z-10 backdrop-blur-md bg-black/20 border-b border-fr-border/50' style={{height: '58px'}}>
      <div className='px-6 h-full flex items-center gap-2'>
        {tabs.map(t => (
          <button key={t}
            onClick={()=>onTab(t)}
            className={'fr-tab ' + (active===t ? 'fr-tab--active' : 'text-fr-muted')}>
            {t}
          </button>
        ))}
      </div>
    </div>
  )
}
