import React from "react";

type Props = {
  robot: React.ReactNode;
  composer: React.ReactNode;
  ptt?: React.ReactNode;
};

export default function FreiraumLayout({ robot, composer, ptt }: Props) {
  return (
    <div className="h-full w-full bg-[#07090d] text-white p-6">
      <div className="h-full w-full grid grid-cols-[minmax(360px,36%)_1fr] gap-6">
        {/* LEFT: ROBOT STAGE */}
        <div className="min-h-0 rounded-[36px] bg-[radial-gradient(circle_at_30%_18%,rgba(120,178,255,0.17),transparent_42%),linear-gradient(180deg,rgba(255,255,255,0.06),rgba(255,255,255,0.015))] shadow-[0_30px_55px_rgba(0,0,0,0.46)] flex flex-col p-8">
          <div className="flex-1 flex flex-col items-center justify-center">
            {robot}
          </div>
          {ptt && (
            <div className="-mt-14 mb-2 flex items-center justify-center">
              {ptt}
            </div>
          )}
        </div>

        {/* RIGHT: WORKBENCH */}
        <div className="min-h-0 grid grid-rows-[minmax(0,60%)_minmax(0,40%)] gap-5">
          {/* EXCHANGE MAIN AREA */}
          <div className="min-h-0 rounded-[34px] bg-[radial-gradient(circle_at_88%_10%,rgba(255,255,255,0.12),transparent_30%),linear-gradient(180deg,rgba(20,23,29,0.97),rgba(11,13,17,0.95))] shadow-[0_30px_55px_rgba(0,0,0,0.5)] p-6 flex flex-col">
            <div className="flex items-center justify-between mb-4">
              <div>
                <div className="text-white/95 text-xl font-semibold tracking-[0.01em]">Outlook Inbox</div>
                <div className="text-white/60 text-xs mt-0.5">Arbeitsbereich fuer Eingang, Kontexte und schnelle Antworten</div>
              </div>
              <div className="text-[11px] text-white/70 rounded-full px-2.5 py-1 bg-emerald-400/15 border border-emerald-300/25">Verbunden</div>
            </div>
            <div className="h-11 rounded-xl bg-white/[0.05] mb-4 px-3 flex items-center text-white/65 text-xs">
              Suche, Filter, Prioritaeten...
            </div>
            <div className="min-h-0 flex-1 grid grid-cols-[0.95fr_1.05fr] gap-3">
              <div className="rounded-2xl bg-white/[0.04] p-3 space-y-2 overflow-hidden">
                <div className="rounded-lg bg-white/[0.11] px-3 py-2.5">
                  <div className="flex items-center justify-between">
                    <span className="text-[12px] font-medium text-white/92">Re: Terminabstimmung</span>
                    <span className="text-[10px] text-white/55">09:42</span>
                  </div>
                  <div className="text-[11px] text-white/58 mt-1">Anna Meier · Bitte bestaetigen Sie den Slot am Donnerstag.</div>
                </div>
                <div className="rounded-lg bg-white/[0.085] px-3 py-2.5">
                  <div className="flex items-center justify-between">
                    <span className="text-[12px] font-medium text-white/88">Angebot Q2</span>
                    <span className="text-[10px] text-white/55">08:17</span>
                  </div>
                  <div className="text-[11px] text-white/54 mt-1">M. Huber · Freigabe fuer Budgetpositionen fehlt noch.</div>
                </div>
                <div className="rounded-lg bg-white/[0.07] px-3 py-2.5">
                  <div className="flex items-center justify-between">
                    <span className="text-[12px] font-medium text-white/84">Rueckfrage Kunde</span>
                    <span className="text-[10px] text-white/50">Gestern</span>
                  </div>
                  <div className="text-[11px] text-white/50 mt-1">Service-Team · Ein technisches Detail ist offen.</div>
                </div>
                <div className="rounded-lg bg-white/[0.06] px-3 py-2.5">
                  <div className="flex items-center justify-between">
                    <span className="text-[12px] font-medium text-white/82">Protokoll Follow-up</span>
                    <span className="text-[10px] text-white/50">Gestern</span>
                  </div>
                  <div className="text-[11px] text-white/48 mt-1">PMO · Zusammenfassung liegt im Anhang bereit.</div>
                </div>
              </div>
              <div className="rounded-2xl bg-white/[0.04] p-3 overflow-hidden">
                <div className="h-full rounded-xl bg-white/[0.08] p-4">
                  <div className="text-[11px] text-white/55 mb-1">Aktuelle Nachricht</div>
                  <div className="text-sm text-white/90 font-medium mb-2">Re: Terminabstimmung</div>
                  <div className="text-[12px] text-white/65 mb-3">Von: Anna Meier · An: Freiraum Vertrieb</div>
                  <div className="h-2 w-full rounded bg-white/15 mb-2" />
                  <div className="h-2 w-11/12 rounded bg-white/15 mb-2" />
                  <div className="h-2 w-10/12 rounded bg-white/15 mb-2" />
                  <div className="h-2 w-8/12 rounded bg-white/15 mb-4" />
                  <div className="inline-flex h-7 items-center rounded-full bg-white/12 px-3 text-[11px] text-white/72">Antwortentwurf durch PTT vorbereiten</div>
                </div>
              </div>
            </div>
          </div>

          {/* COMPOSER PREVIEW */}
          <div className="min-h-0 rounded-[34px] bg-[linear-gradient(180deg,rgba(255,255,255,0.05),rgba(255,255,255,0.015))] shadow-[0_16px_34px_rgba(0,0,0,0.38)] p-4 flex items-start justify-center">
            <div className="w-full flex items-start justify-center pt-1">
              {composer}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
