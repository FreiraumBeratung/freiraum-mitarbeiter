import { Button } from '../components/Button.jsx'
import { Field, Input, Textarea } from '../components/Form.jsx'
import CharacterGreeting from '../components/CharacterGreeting.jsx'
import VoicePanel from '../components/VoicePanel.jsx'
// Voice-Komponenten: VoicePanel bleibt für Dashboard, VoiceFloatButton entfernt - jetzt globales GlobalPTT

export default function Dashboard(){
  return (
    <div className='flex flex-col gap-6'>
      <CharacterGreeting />
      <VoicePanel />
      <div className='fr-card p-6'>
        <div className='h1'>Angebot erstellen</div>
        <div className='mt-2 text-fr-muted'>Schnelles Angebot mit Mail-Versand und PDF-Vorschau.</div>

        <div className='mt-5 grid md:grid-cols-2 gap-4'>
          <Field label='E-Mail Empfänger'>
            <Input placeholder='kunde@example.com'/>
          </Field>
          <Field label='Angebotsdatum'>
            <Input placeholder='TT.MM.JJJJ' />
          </Field>
          <Field label='Kunde'>
            <Input placeholder='Kunde/Firma'/>
          </Field>
          <Field label='AP (optional)'>
            <Input placeholder='Ansprechpartner'/>
          </Field>
        </div>

        <div className='mt-4'>
          <Field label='Artikelzeilen'>
            <Textarea placeholder='Artikelzeilen (z. B. "Betonstein A;10;Stk;2,40")'/>
          </Field>
        </div>

        <div className='mt-4 flex flex-wrap gap-3 items-center'>
          <Button>Zeilen übernehmen</Button>
          <Button>Mails neu laden</Button>
          <span className='fr-badge'>Gesamt (brutto): 0,00 €</span>
          <Button>PDF-Vorschau</Button>
          <Button variant='primary'>Senden (PDF)</Button>
        </div>
      </div>

      <div className='fr-card p-6'>
        <div className='h2'>Artikel</div>
        <div className='mt-3 overflow-x-auto'>
          <table className='fr-table min-w-[720px]'>
            <thead>
              <tr>
                <th>Artikel</th>
                <th>Menge</th>
                <th>Einheit</th>
                <th>Preis (€)</th>
                <th>Summe</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td colSpan='5' style={{opacity:.6}}>Noch keine Zeilen …</td>
              </tr>
            </tbody>
          </table>
        </div>

        <div className='mt-4 grid md:grid-cols-3 gap-3'>
          <Field label='Gesamt-Rabatt (%)'><Input defaultValue='0' /></Field>
          <Field label='MwSt (%)'><Input defaultValue='19' /></Field>
          <Field label='Summe'><Input defaultValue='0,00 €' /></Field>
        </div>
      </div>
    </div>
  )
}

