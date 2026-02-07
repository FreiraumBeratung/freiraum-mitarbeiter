/**
 * Unit Tests für stripLeadingSubjectEcho
 */
import { describe, it, expect } from 'vitest';
import { stripLeadingSubjectEcho } from './strip_leading_subject_echo';

describe('stripLeadingSubjectEcho', () => {
  it('subject="Rückruf", body="Rückruf. Hi Thomas" => "Hi Thomas"', () => {
    expect(stripLeadingSubjectEcho('Rückruf. Hi Thomas', 'Rückruf')).toBe('Hi Thomas');
  });

  it('subject="Angebot Rückruf", body="Angebot Rückruf Ruf mich zurück" => "Ruf mich zurück"', () => {
    expect(stripLeadingSubjectEcho('Angebot Rückruf Ruf mich zurück', 'Angebot Rückruf')).toBe('Ruf mich zurück');
  });

  it('subject="Rückruf", body="Ruf mich zurück" => unverändert', () => {
    const body = 'Ruf mich zurück';
    expect(stripLeadingSubjectEcho(body, 'Rückruf')).toBe(body);
  });

  it('subject="Rückruf", body="Rückruf, ruf mich zurück." => "ruf mich zurück."', () => {
    expect(stripLeadingSubjectEcho('Rückruf, ruf mich zurück.', 'Rückruf')).toBe('ruf mich zurück.');
  });

  it('subject with comma and space: body starts with subject then comma', () => {
    expect(stripLeadingSubjectEcho('Rückruf, Hi Thomas, kannst du mich zurückrufen?', 'Rückruf')).toBe('Hi Thomas, kannst du mich zurückrufen?');
  });

  it('empty subject returns body unchanged', () => {
    expect(stripLeadingSubjectEcho('Rückruf. Hi Thomas', '')).toBe('Rückruf. Hi Thomas');
    expect(stripLeadingSubjectEcho('Hi Thomas', undefined)).toBe('Hi Thomas');
  });

  it('case-insensitive: body="ruckruf. Hi Thomas" with subject="Rückruf"', () => {
    expect(stripLeadingSubjectEcho('ruckruf. Hi Thomas', 'Rückruf')).toBe('Hi Thomas');
  });
});
