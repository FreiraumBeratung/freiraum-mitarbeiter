/**
 * Unit-Tests für repairBodyAfterSendAdverbStrip (Nach Strip von Jetzt/Sofort/Direkt).
 * Prüft, dass "rufe ich später zurück." zu "Ich rufe später zurück." wird.
 */

import { describe, it, expect } from 'vitest';
import { repairBodyAfterSendAdverbStrip } from '../../logic/wizard4/email';

describe('repairBodyAfterSendAdverbStrip', () => {
  it('"rufe ich später zurück." -> "Ich rufe später zurück."', () => {
    const input = 'rufe ich später zurück.';
    const out = repairBodyAfterSendAdverbStrip(input);
    expect(out).toBe('Ich rufe später zurück.');
  });

  it('"ich rufe später zurück." -> "Ich rufe später zurück." (nur Großschreibung)', () => {
    const input = 'ich rufe später zurück.';
    const out = repairBodyAfterSendAdverbStrip(input);
    expect(out).toBe('Ich rufe später zurück.');
  });

  it('bereits groß/ Pronomen am Anfang: "Wir melden uns." bleibt unverändert', () => {
    const input = 'Wir melden uns.';
    const out = repairBodyAfterSendAdverbStrip(input);
    expect(out).toBe('Wir melden uns.');
  });

  it('kein doppeltes "Ich Ich"', () => {
    const input = 'ich ich rufe an.';
    const out = repairBodyAfterSendAdverbStrip(input);
    expect(out).not.toMatch(/Ich\s+Ich\s+Ich/);
    expect(out).toContain('Ich ');
  });

  it('Satzzeichen am Ende wird gesichert', () => {
    const input = 'rufe ich später zurück';
    const out = repairBodyAfterSendAdverbStrip(input);
    expect(out).toMatch(/[.!?]$/);
    expect(out).toBe('Ich rufe später zurück.');
  });
});
