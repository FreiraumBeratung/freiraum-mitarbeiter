/**
 * Unit Tests für Follow-up Send Current Draft Trigger-Erkennung + isUiDraftAvailable
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { isFollowUpSendCurrentDraft, isUiDraftAvailable } from './followup_send_draft';

describe('isFollowUpSendCurrentDraft', () => {
  it('"schick die nachricht aus" => true', () => {
    expect(isFollowUpSendCurrentDraft('schick die nachricht aus')).toBe(true);
  });

  it('"schick thomas raus" => false (weil Empfängername)', () => {
    expect(isFollowUpSendCurrentDraft('schick thomas raus')).toBe(false);
  });

  it('"schick die nachricht aus und sag ihm ..." => false (weil zusätzlicher Inhalt)', () => {
    expect(isFollowUpSendCurrentDraft('schick die nachricht aus und sag ihm hallo')).toBe(false);
  });

  it('alle Trigger als true', () => {
    expect(isFollowUpSendCurrentDraft('schick die nachricht aus')).toBe(true);
    expect(isFollowUpSendCurrentDraft('schick die nachricht raus')).toBe(true);
    expect(isFollowUpSendCurrentDraft('schick sie aus')).toBe(true);
    expect(isFollowUpSendCurrentDraft('schick sie raus')).toBe(true);
    expect(isFollowUpSendCurrentDraft('abschicken')).toBe(true);
    expect(isFollowUpSendCurrentDraft('jetzt abschicken')).toBe(true);
    expect(isFollowUpSendCurrentDraft('raus damit')).toBe(true);
    expect(isFollowUpSendCurrentDraft('sende sie')).toBe(true);
  });

  it('Trigger mit trailing punctuation => true', () => {
    expect(isFollowUpSendCurrentDraft('schick die nachricht aus.')).toBe(true);
    expect(isFollowUpSendCurrentDraft('abschicken!')).toBe(true);
  });

  it('case-insensitive', () => {
    expect(isFollowUpSendCurrentDraft('Schick die Nachricht aus')).toBe(true);
    expect(isFollowUpSendCurrentDraft('ABSCHICKEN')).toBe(true);
  });

  it('Leerer String => false', () => {
    expect(isFollowUpSendCurrentDraft('')).toBe(false);
    expect(isFollowUpSendCurrentDraft('   ')).toBe(false);
  });
});

describe('isUiDraftAvailable', () => {
  let originalSendNow: unknown;

  beforeEach(() => {
    originalSendNow = typeof window !== 'undefined' ? (window as any).__fm_send_mail_now : undefined;
  });

  afterEach(() => {
    if (typeof window !== 'undefined') {
      if (originalSendNow !== undefined) {
        (window as any).__fm_send_mail_now = originalSendNow;
      } else {
        delete (window as any).__fm_send_mail_now;
      }
    }
  });

  it('uiHook=true => true', () => {
    if (typeof window === 'undefined') return;
    (window as any).__fm_send_mail_now = () => {};
    expect(isUiDraftAvailable()).toBe(true);
  });

  it('uiHook=false => false', () => {
    if (typeof window === 'undefined') return;
    delete (window as any).__fm_send_mail_now;
    expect(isUiDraftAvailable()).toBe(false);
  });
});
