/**
 * Unit Tests für "An <Name> <body> schick raus" (an-name-send-out)
 *
 * Behebt Bug: "An Thomas bin beim Kunden schick raus." darf nicht toRaw="an" liefern,
 * sondern toRaw="thomas", bodyHint="Bin beim Kunden.", autoSend=true.
 */

import { describe, it, expect } from 'vitest';
import { routeVoiceIntent } from './intent_router';

describe('An-Name-Send-Out Pattern', () => {
  it('"An Thomas bin beim Kunden schick raus." -> toRaw=thomas, body=Bin beim Kunden., autoSend=true', () => {
    const input = 'An Thomas bin beim Kunden schick raus.';
    const intent = routeVoiceIntent(input);

    expect(intent.type).toBe('email-compose');
    if (intent.type === 'email-compose') {
      expect(intent.toRaw?.toLowerCase()).toBe('thomas');
      expect(intent.bodyHint).toBeDefined();
      if (intent.bodyHint) {
        const b = intent.bodyHint.toLowerCase();
        expect(b).toMatch(/bin\s+beim\s+kunden/);
        expect(b).not.toContain('thomas');
        expect(b).not.toContain('raus');
        expect(b).not.toMatch(/\ban\b/);
      }
      expect(intent.meta?.autoSend).toBe(true);
      expect(intent.meta?.source).toBe('an-name-send-out');
    }
  });

  it('"An Thomas, wir starten 10 Minuten später, schick raus." -> toRaw=thomas, body enthält Start-Info', () => {
    const input = 'An Thomas, wir starten 10 Minuten später, schick raus.';
    const intent = routeVoiceIntent(input);

    expect(intent.type).toBe('email-compose');
    if (intent.type === 'email-compose') {
      expect(intent.toRaw?.toLowerCase()).toBe('thomas');
      expect(intent.bodyHint).toBeDefined();
      if (intent.bodyHint) {
        const b = intent.bodyHint.toLowerCase();
        expect(b).toMatch(/starten|minuten|später|spaeter/);
        expect(intent.toRaw).not.toBe('an');
      }
      expect(intent.meta?.source).toBe('an-name-send-out');
    }
  });

  it('"An Thomas schick raus." -> toRaw=thomas, forcePreviewOnly + uiHint, Empfänger stimmt', () => {
    const input = 'An Thomas schick raus.';
    const intent = routeVoiceIntent(input);

    expect(intent.type).toBe('email-compose');
    if (intent.type === 'email-compose') {
      expect(intent.toRaw?.toLowerCase()).toBe('thomas');
      expect(intent.toRaw).not.toBe('an');
      expect(intent.meta?.forcePreviewOnly).toBe(true);
      expect(intent.meta?.forcePreviewOnlyReason).toBe('missing_body');
      expect(intent.meta?.uiHint).toBeDefined();
      expect(intent.meta?.source).toBe('an-name-send-out');
    }
  });

  it('"Schick die Mail los." -> darf NICHT toName="die" werden (email-send oder ohne Compose-toRaw die)', () => {
    const input = 'Schick die Mail los.';
    const intent = routeVoiceIntent(input);

    if (intent.type === 'email-compose') {
      expect(intent.toRaw?.toLowerCase()).not.toBe('die');
    }
    expect(intent.type === 'email-send' || (intent.type === 'email-compose' && intent.toRaw?.toLowerCase() !== 'die')).toBe(true);
  });
});
