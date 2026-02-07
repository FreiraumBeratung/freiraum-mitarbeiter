/**
 * Unit Tests für Wizard4 email-compose Subject-Resolver
 *
 * Regeln:
 * - Kein expliziter Betreff ("Betreff X") → subject = "Kurze Info" (kein Guessing)
 * - Expliziter Betreff → subject = explicitSubject
 */

import { describe, it, expect } from 'vitest';
import { stripSubjectCommand } from '../../logic/wizard4/subject_command_strip';
import { routeVoiceIntent } from './intent_router';

/** Simuliert die Subject-Resolution wie in voice/index.ts (ohne explizites Betreff = "Kurze Info") */
function resolveWizard4Subject(bodyHint: string): string {
  const { explicitSubject } = stripSubjectCommand(bodyHint);
  const hasExplicitSubject = Boolean(explicitSubject?.trim());
  if (hasExplicitSubject) {
    return explicitSubject!.trim();
  }
  return 'Kurze Info';
}

describe('Wizard4 email-compose Subject-Resolver', () => {
  it('"schick thomas sofort raus ich bin im termin" (ohne Betreff) -> subject == "Kurze Info"', () => {
    // Body nach Send-Strip wäre "ich bin im termin" – kein "Betreff X"
    const bodyHint = 'ich bin im termin';
    const subject = resolveWizard4Subject(bodyHint);
    expect(subject).toBe('Kurze Info');
  });

  it('"betreff rückruf ruf mich zurück" -> subject == "Rückruf"', () => {
    const bodyHint = 'betreff rückruf ruf mich zurück';
    const subject = resolveWizard4Subject(bodyHint);
    expect(subject).toBe('Rückruf');
  });

  it('intent "schick thomas sofort raus ich bin im termin" liefert subjectHint/kein explicitSubject', () => {
    const intent = routeVoiceIntent('schick thomas sofort raus ich bin im termin');
    expect(intent.type).toBe('email-compose');
    // subjectHint darf NICHT "Termin morgen" sein (kein Guessing) – wird in voice/index durch "Kurze Info" ersetzt
    // Hier prüfen wir nur: stripSubjectCommand auf dem Body gibt keinen explicitSubject
    const bodyHint = intent.type === 'email-compose' ? (intent.bodyHint ?? '') : '';
    const { explicitSubject } = stripSubjectCommand(bodyHint);
    expect(explicitSubject).toBeUndefined();
  });

  it('"betreff rückruf ruf mich zurück" -> subject == "Rückruf" (via stripSubjectCommand)', () => {
    const subject = resolveWizard4Subject('betreff rückruf ruf mich zurück');
    expect(subject).toBe('Rückruf');
  });

  it('(F) Wenn subject aus intent gesetzt ist, darf default nicht greifen', () => {
    const intent = routeVoiceIntent('Schick Thomas sofort raus, Betreff Rückruf. Ich bin im Termin.');
    expect(intent.type).toBe('email-compose');
    if (intent.type === 'email-compose') {
      expect(intent.subjectHint?.toLowerCase()).toContain('rückruf');
    }
  });
});
