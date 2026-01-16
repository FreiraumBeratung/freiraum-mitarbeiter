/**
 * Unit Tests für "lass <name> bitte folgendes wissen" Intent-Erkennung
 * 
 * Testet das Pattern: "Lass <name> bitte folgendes wissen ..."
 */

import { describe, it, expect } from 'vitest';
import { routeVoiceIntent } from './intent_router';

describe('Intent Router: "lass <name> wissen" Pattern', () => {
  // T1: AutoSend durch "bitte"
  it('T1: should recognize "Lass Thomas bitte folgendes wissen" with autoSend=true', () => {
    const input = 'Lass Thomas bitte folgendes wissen, Thomas, hier ist Dennis. Ich komme 15 Minuten später.';
    const result = routeVoiceIntent(input);

    expect(result.type).toBe('email-compose');
    if (result.type === 'email-compose') {
      expect(result.toRaw).toBe('Thomas');
      expect(result.bodyHint).toBeTruthy();
      // bodyHint sollte NICHT mit "thomas" starten (Duplikat entfernt)
      expect(result.bodyHint?.toLowerCase()).not.toMatch(/^thomas/);
      expect(result.bodyHint?.toLowerCase()).toContain('hier ist');
      expect(result.bodyHint?.toLowerCase()).toContain('dennis');
      // meta.autoSend sollte true sein
      expect(result.meta?.autoSend).toBe(true);
    }
  });

  // T2: AutoSend durch Send-Phrase ohne "bitte"
  it('T2: should recognize "Lass Thomas folgendes wissen" with send phrase and autoSend=true', () => {
    const input = 'Lass Thomas folgendes wissen: Hi Thomas, ich komme 10 Minuten später und schick\'s direkt los.';
    const result = routeVoiceIntent(input);

    expect(result.type).toBe('email-compose');
    if (result.type === 'email-compose') {
      expect(result.toRaw).toBe('Thomas');
      expect(result.meta?.autoSend).toBe(true);
      // bodyHint sollte "schick\'s direkt los" NICHT enthalten (bereinigt)
      expect(result.bodyHint?.toLowerCase()).not.toContain('schick\'s direkt los');
      expect(result.bodyHint?.toLowerCase()).not.toContain('schicks direkt los');
    }
  });

  // T3: Kein AutoSend wenn weder bitte noch Send-Phrase
  it('T3: should NOT set autoSend if neither "bitte" nor send phrase present', () => {
    const input = 'Lass Thomas folgendes wissen: Hi Thomas, ich komme 10 Minuten später.';
    const result = routeVoiceIntent(input);

    expect(result.type).toBe('email-compose');
    if (result.type === 'email-compose') {
      expect(result.toRaw).toBe('Thomas');
      // meta.autoSend sollte false sein
      expect(result.meta?.autoSend).toBe(false);
    }
  });

  // T4: Negation schlägt alles
  it('T4: should NOT set autoSend if negation/preview words present (highest priority)', () => {
    const input = 'Lass Thomas bitte folgendes wissen: Hi Thomas, ich komme 10 Minuten später, aber nicht senden.';
    const result = routeVoiceIntent(input);

    expect(result.type).toBe('email-compose');
    if (result.type === 'email-compose') {
      expect(result.toRaw).toBe('Thomas');
      // Auch wenn "bitte" vorhanden ist, sollte autoSend=false sein wegen "nicht senden"
      expect(result.meta?.autoSend).toBe(false);
    }
  });

  // T5: Body aus wissen:-Teil
  it('T5: should extract body from part after "wissen:"', () => {
    const input = 'Lass Thomas wissen: Ich komme 5 Minuten später.';
    const result = routeVoiceIntent(input);

    expect(result.type).toBe('email-compose');
    if (result.type === 'email-compose') {
      expect(result.toRaw).toBe('Thomas');
      expect(result.bodyHint).toBeTruthy();
      // bodyHint sollte den Satz nach "wissen:" enthalten
      expect(result.bodyHint?.toLowerCase()).toContain('ich komme 5 minuten später');
    }
  });

  // T6: Body-Name Duplikat wird entfernt
  it('T6: should remove name duplicate from bodyHint start (case-insensitive)', () => {
    const input = 'Lass Thomas bitte folgendes wissen, Thomas, hier ist Dennis.';
    const result = routeVoiceIntent(input);

    expect(result.type).toBe('email-compose');
    if (result.type === 'email-compose') {
      expect(result.toRaw).toBe('Thomas');
      expect(result.bodyHint).toBeTruthy();
      // bodyHint sollte mit "hier ist" beginnen (nicht mit "Thomas")
      expect(result.bodyHint?.toLowerCase()).toMatch(/^hier ist/);
      expect(result.bodyHint?.toLowerCase()).not.toMatch(/^thomas/);
      expect(result.bodyHint?.toLowerCase()).toContain('dennis');
    }
  });

  // Zusätzlicher Test: Send-Phrase "sende sofort" sollte AutoSend triggern
  it('should set autoSend=true with "sende sofort" send phrase', () => {
    const input = 'Lass Thomas folgendes wissen: Hi Thomas, ich komme später und sende sofort.';
    const result = routeVoiceIntent(input);

    expect(result.type).toBe('email-compose');
    if (result.type === 'email-compose') {
      expect(result.meta?.autoSend).toBe(true);
    }
  });

  // Zusätzlicher Test: "nur zeigen" sollte AutoSend blockieren
  it('should block autoSend with "nur zeigen" negation', () => {
    const input = 'Lass Thomas bitte folgendes wissen: Hi Thomas, ich komme später, aber nur zeigen.';
    const result = routeVoiceIntent(input);

    expect(result.type).toBe('email-compose');
    if (result.type === 'email-compose') {
      expect(result.meta?.autoSend).toBe(false);
    }
  });

  // T1 (Benutzer-Anforderung): Punkt nach "wissen" unterstützen
  it('T1: should recognize "Lass Thomas bitte folgendes wissen." with point separator', () => {
    const input = 'Lass Thomas bitte folgendes wissen. Hi Thomas, ich komme 10 minuten später.';
    const result = routeVoiceIntent(input);

    expect(result.type).toBe('email-compose');
    if (result.type === 'email-compose') {
      expect(result.toRaw?.toLowerCase()).toBe('thomas');
      expect(result.bodyHint).toBeTruthy();
      expect(result.bodyHint?.toLowerCase()).toMatch(/^hi\s+thomas/);
      expect(result.bodyHint?.toLowerCase()).toContain('ich komme 10 minuten später');
      expect(result.meta?.autoSend).toBe(true);
    }
  });

  // T2 (Benutzer-Anforderung): Kein AutoSend ohne "bitte" und ohne Send-Phrase
  it('T2: should NOT set autoSend if neither "bitte" nor send phrase (with point)', () => {
    const input = 'Lass Thomas folgendes wissen. Hi Thomas, ich komm 10 Minuten später.';
    const result = routeVoiceIntent(input);

    expect(result.type).toBe('email-compose');
    if (result.type === 'email-compose') {
      expect(result.meta?.autoSend).toBe(false);
    }
  });

  // T3 (Benutzer-Anforderung): Body aus "wissen:" extrahieren
  it('T3: should extract body from "wissen:" part', () => {
    const input = 'Lass Thomas wissen: Ich komme 5 Minuten später.';
    const result = routeVoiceIntent(input);

    expect(result.type).toBe('email-compose');
    if (result.type === 'email-compose') {
      expect(result.bodyHint?.toLowerCase()).toContain('ich komme 5 minuten später');
    }
  });

  // T4 (Benutzer-Anforderung): Negation schlägt alles
  it('T4: should NOT set autoSend if negation present (with point)', () => {
    const input = 'Lass Thomas bitte folgendes wissen: Hi Thomas, ich komme 10 Minuten später, aber nicht senden.';
    const result = routeVoiceIntent(input);

    expect(result.type).toBe('email-compose');
    if (result.type === 'email-compose') {
      expect(result.meta?.autoSend).toBe(false);
    }
  });
});
