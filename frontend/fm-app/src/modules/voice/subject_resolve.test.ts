/**
 * Unit Tests für resolveVoiceEmailSubject
 */

import { describe, it, expect } from 'vitest';
import { resolveVoiceEmailSubject } from './subject_resolve';

describe('resolveVoiceEmailSubject', () => {
  describe('AutoSend + sendNow (draftSubject wins when set, e.g. from "Betreff X")', () => {
    it('should return draftSubject when autoSend=true, sendMode="sendNow", subjectHint missing, draftSubject="Rückruf"', () => {
      const result = resolveVoiceEmailSubject({
        subjectHint: undefined,
        draftSubject: 'Rückruf',
        sendMode: 'sendNow',
        autoSend: true,
      });
      expect(result).toBe('Rückruf');
    });

    it('should return draftSubject when autoSend=true, sendMode="sendNow", subjectHint=null, draftSubject="Termin"', () => {
      const result = resolveVoiceEmailSubject({
        subjectHint: null,
        draftSubject: 'Termin',
        sendMode: 'sendNow',
        autoSend: true,
      });
      expect(result).toBe('Termin');
    });

    it('should return draftSubject when autoSend=true, sendMode="sendNow", subjectHint="", draftSubject="Pizza"', () => {
      const result = resolveVoiceEmailSubject({
        subjectHint: '',
        draftSubject: 'Pizza',
        sendMode: 'sendNow',
        autoSend: true,
      });
      expect(result).toBe('Pizza');
    });

    it('should return "Kurze Info" when autoSend=true, sendMode="sendNow", subjectHint missing, draftSubject missing', () => {
      const result = resolveVoiceEmailSubject({
        subjectHint: undefined,
        draftSubject: undefined,
        sendMode: 'sendNow',
        autoSend: true,
      });
      expect(result).toBe('Kurze Info');
    });
  });

  describe('Explicit subjectHint (should always win)', () => {
    it('should return subjectHint when autoSend=true, sendMode="sendNow", subjectHint="Termin morgen"', () => {
      const result = resolveVoiceEmailSubject({
        subjectHint: 'Termin morgen',
        draftSubject: 'Alter Betreff',
        sendMode: 'sendNow',
        autoSend: true,
      });
      
      expect(result).toBe('Termin morgen');
    });

    it('should return trimmed subjectHint when subjectHint has whitespace', () => {
      const result = resolveVoiceEmailSubject({
        subjectHint: '  Termin morgen  ',
        draftSubject: 'Alter Betreff',
        sendMode: 'sendNow',
        autoSend: true,
      });
      
      expect(result).toBe('Termin morgen');
    });
  });

  describe('PreviewOnly (should use draftSubject if available)', () => {
    it('should return draftSubject when autoSend=false, sendMode="previewOnly", draftSubject="Termin morgen"', () => {
      const result = resolveVoiceEmailSubject({
        subjectHint: undefined,
        draftSubject: 'Termin morgen',
        sendMode: 'previewOnly',
        autoSend: false,
      });
      
      expect(result).toBe('Termin morgen');
    });

    it('should return "Kurze Info" when autoSend=false, sendMode="previewOnly", draftSubject missing', () => {
      const result = resolveVoiceEmailSubject({
        subjectHint: undefined,
        draftSubject: undefined,
        sendMode: 'previewOnly',
        autoSend: false,
      });
      
      expect(result).toBe('Kurze Info');
    });

    it('should return "Kurze Info" when autoSend=false, sendMode="previewOnly", draftSubject=""', () => {
      const result = resolveVoiceEmailSubject({
        subjectHint: undefined,
        draftSubject: '',
        sendMode: 'previewOnly',
        autoSend: false,
      });
      
      expect(result).toBe('Kurze Info');
    });
  });

  describe('sendNow + Betreff (draftSubject from stripSubjectCommand)', () => {
    it('should return "Rückruf" when sendNow + draftSubject="Rückruf" (Betreff Rückruf im Body)', () => {
      const result = resolveVoiceEmailSubject({
        subjectHint: undefined,
        draftSubject: 'Rückruf',
        sendMode: 'sendNow',
        autoSend: true,
      });
      expect(result).toBe('Rückruf');
    });

    it('should return "Termin" when sendNow + draftSubject="Termin" (Betreff Termin schick raus)', () => {
      const result = resolveVoiceEmailSubject({
        subjectHint: undefined,
        draftSubject: 'Termin',
        sendMode: 'sendNow',
        autoSend: true,
      });
      expect(result).toBe('Termin');
    });
  });

  describe('Edge cases', () => {
    it('should return "Kurze Info" when all parameters are missing', () => {
      const result = resolveVoiceEmailSubject({});
      
      expect(result).toBe('Kurze Info');
    });

    it('should return "Kurze Info" when autoSend=true but sendMode is not "sendNow"', () => {
      const result = resolveVoiceEmailSubject({
        subjectHint: undefined,
        draftSubject: 'Termin morgen',
        sendMode: 'previewOnly',
        autoSend: true,
      });
      
      // Should use draftSubject because sendMode is not "sendNow"
      expect(result).toBe('Termin morgen');
    });

    it('should return "Kurze Info" when autoSend=false and sendMode="sendNow" (edge case)', () => {
      const result = resolveVoiceEmailSubject({
        subjectHint: undefined,
        draftSubject: 'Termin morgen',
        sendMode: 'sendNow',
        autoSend: false,
      });
      
      // Should use draftSubject because autoSend is false
      expect(result).toBe('Termin morgen');
    });

    it('should handle empty string subjectHint as missing', () => {
      const result = resolveVoiceEmailSubject({
        subjectHint: '   ',
        draftSubject: 'Termin morgen',
        sendMode: 'sendNow',
        autoSend: true,
      });
      // Empty subjectHint => use draftSubject
      expect(result).toBe('Termin morgen');
    });

    it('should handle empty string draftSubject as missing', () => {
      const result = resolveVoiceEmailSubject({
        subjectHint: undefined,
        draftSubject: '   ',
        sendMode: 'previewOnly',
        autoSend: false,
      });
      
      // Empty/whitespace-only draftSubject should be treated as missing
      expect(result).toBe('Kurze Info');
    });
  });
});
