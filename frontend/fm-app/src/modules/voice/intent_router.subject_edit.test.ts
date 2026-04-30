/**
 * Unit Tests Subject-Edit Intents: Betreff setzen/anhaengen/loeschen
 */

import { describe, it, expect } from 'vitest';
import { routeVoiceIntent } from './intent_router';

describe('Subject-Edit Intents', () => {
  it('"den betreff zu guten tag" -> email-subject-set(subject="Guten Tag")', () => {
    const intent = routeVoiceIntent('den betreff zu guten tag');
    expect(intent.type).toBe('email-subject-set');
    if (intent.type === 'email-subject-set') {
      expect(intent.payload.subject).toBe('Guten Tag');
    }
  });

  it('"den betreff guten tag" -> email-subject-set(subject="Guten Tag")', () => {
    const intent = routeVoiceIntent('den betreff guten tag');
    expect(intent.type).toBe('email-subject-set');
    if (intent.type === 'email-subject-set') {
      expect(intent.payload.subject).toBe('Guten Tag');
    }
  });

  it('"ändere den betreff zu guten tag" -> email-subject-set(subject="Guten Tag")', () => {
    const intent = routeVoiceIntent('ändere den betreff zu guten tag');
    expect(intent.type).toBe('email-subject-set');
    if (intent.type === 'email-subject-set') {
      expect(intent.payload.subject).toBe('Guten Tag');
    }
  });

  it('"mach aus dem betreff folgendes guten tag" -> email-subject-replace(subject="Guten Tag")', () => {
    const intent = routeVoiceIntent('mach aus dem betreff folgendes guten tag');
    expect(intent.type).toBe('email-subject-replace');
    if (intent.type === 'email-subject-replace') {
      expect(intent.payload.subject).toBe('Guten Tag');
    }
  });

  it('"ändere den betreff auf rückruf" -> email-subject-set(subject="Rückruf")', () => {
    const intent = routeVoiceIntent('ändere den betreff auf rückruf');
    expect(intent.type).toBe('email-subject-set');
    if (intent.type === 'email-subject-set') {
      expect(intent.payload.subject).toBe('Rückruf');
    }
  });

  it('"betreff: Angebot Rückruf." -> email-subject-set(subject="Angebot Rückruf")', () => {
    const intent = routeVoiceIntent('betreff: Angebot Rückruf.');
    expect(intent.type).toBe('email-subject-set');
    if (intent.type === 'email-subject-set') {
      expect(intent.payload.subject).toBe('Angebot Rückruf');
    }
  });

  it('"füge beim betreff dringend hinzu" -> email-subject-append(append="dringend")', () => {
    const intent = routeVoiceIntent('füge beim betreff dringend hinzu');
    expect(intent.type).toBe('email-subject-append');
    if (intent.type === 'email-subject-append') {
      expect(intent.payload.append).toBe('Dringend');
    }
  });

  it('"Füge beim Betreff dringend hinzu." -> email-subject-append append="dringend"', () => {
    const intent = routeVoiceIntent('Füge beim Betreff dringend hinzu.');
    expect(intent.type).toBe('email-subject-append');
    if (intent.type === 'email-subject-append') {
      expect(intent.payload.append).toBe('Dringend');
    }
  });

  it('"häng beim betreff bitte sehr dringend dran" -> append="Sehr Dringend"', () => {
    const intent = routeVoiceIntent('häng beim betreff bitte sehr dringend dran');
    expect(intent.type).toBe('email-subject-append');
    if (intent.type === 'email-subject-append') {
      expect(intent.payload.append).toBe('Sehr Dringend');
    }
  });

  it('"pack beim betreff Angebot dazu" -> append="Angebot"', () => {
    const intent = routeVoiceIntent('pack beim betreff Angebot dazu');
    expect(intent.type).toBe('email-subject-append');
    if (intent.type === 'email-subject-append') {
      expect(intent.payload.append).toBe('Angebot');
    }
  });

  it('"füge beim betreff hinzu" -> KEIN match (append leer)', () => {
    const intent = routeVoiceIntent('füge beim betreff hinzu');
    expect(intent.type).not.toBe('email-subject-append');
  });

  it('"ersetze im betreff Angebote durch Angebot" -> email-subject-replace-part', () => {
    const intent = routeVoiceIntent('ersetze im betreff Angebote durch Angebot');
    expect(intent.type).toBe('email-subject-replace-part');
    if (intent.type === 'email-subject-replace-part') {
      expect(intent.payload.from).toBe('Angebote');
      expect(intent.payload.to).toBe('Angebot');
    }
  });

  it('"mach aus dem betreff Pizza durch Pasta" -> email-subject-replace-part', () => {
    const intent = routeVoiceIntent('mach aus dem betreff Pizza durch Pasta');
    expect(intent.type).toBe('email-subject-replace-part');
    if (intent.type === 'email-subject-replace-part') {
      expect(intent.payload.from).toBe('Pizza');
      expect(intent.payload.to).toBe('Pasta');
    }
  });

  it('"ersetze im betreff das wort Pizza durch Pasta" -> email-subject-replace-part', () => {
    const intent = routeVoiceIntent('ersetze im betreff das wort Pizza durch Pasta');
    expect(intent.type).toBe('email-subject-replace-part');
    if (intent.type === 'email-subject-replace-part') {
      expect(intent.payload.from).toBe('Pizza');
      expect(intent.payload.to).toBe('Pasta');
    }
  });

  it('"betreff löschen" -> email-subject-clear', () => {
    const intent = routeVoiceIntent('betreff löschen');
    expect(intent.type).toBe('email-subject-clear');
    if (intent.type === 'email-subject-clear') {
      expect(intent.payload).toBeDefined();
    }
  });

  it('"Füge beim Betreff dringend hinzu." -> email-subject-append (NICHT email-compose)', () => {
    const intent = routeVoiceIntent('Füge beim Betreff dringend hinzu.');
    expect(intent.type).toBe('email-subject-append');
    expect(intent.type).not.toBe('email-compose');
  });

  it('"füge im betreff folgendes dringend hinzu" -> email-subject-append(append="Dringend")', () => {
    const intent = routeVoiceIntent('füge im betreff folgendes dringend hinzu');
    expect(intent.type).toBe('email-subject-append');
    if (intent.type === 'email-subject-append') {
      expect(intent.payload.append).toBe('Dringend');
    }
  });
});
