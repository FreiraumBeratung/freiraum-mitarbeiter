/**
 * Unit Tests: Subject-Edit Polishing (Separator, Tokenize, Normalize, Dedupe)
 */

import { describe, it, expect } from "vitest";
import {
  subjectSet,
  subjectAppend,
  subjectReplacePart,
  subjectClear,
} from "./subject_edit";

describe("subjectSet", () => {
  it('1) set: current="" -> subjectSet(" Angebote ") => "Angebote"', () => {
    expect(subjectSet(" Angebote ")).toBe("Angebote");
  });

  it('1b) strips wrapping quotes: subjectSet("\\"Angebot morgen\\"" )', () => {
    expect(subjectSet('"Angebot morgen"')).toBe("Angebot Morgen");
    expect(subjectSet('""Angebot morgen Abend""')).toBe("Angebot Morgen Abend");
  });
});

describe("subjectAppend", () => {
  it('2) append default separator: current="Angebote" + append("dringend") => "Angebote – Dringend"', () => {
    expect(subjectAppend("Angebote", "dringend", "")).toBe("Angebote – Dringend");
  });

  it('3) append keeps existing hyphen: current="Angebote - Dringend" + append("heute") => "Angebote - Dringend - Heute"', () => {
    expect(subjectAppend("Angebote - Dringend", "heute", "")).toBe(
      "Angebote - Dringend - Heute"
    );
  });

  it('4) explicit hyphen command: current="Angebote" + append("heute", rawCommand="häng beim betreff heute dran mit bindestrich") => "Angebote - Heute"', () => {
    expect(
      subjectAppend("Angebote", "heute", "häng beim betreff heute dran mit bindestrich")
    ).toBe("Angebote - Heute");
  });

  it('5) dedupe + punctuation: current="Angebote – Dringend." + append("dringend") => "Angebote – Dringend"', () => {
    expect(subjectAppend("Angebote – Dringend.", "dringend", "")).toBe(
      "Angebote – Dringend"
    );
  });
});

describe("subjectReplacePart", () => {
  it('6) replace token-wise: current="Angebote – Dringend – Heute" replace("Angebote","Angebot") => "Angebot – Dringend – Heute"', () => {
    expect(
      subjectReplacePart("Angebote – Dringend – Heute", "Angebote", "Angebot", "")
    ).toBe("Angebot – Dringend – Heute");
  });

  it('7) replace fallback substring: current="Status: Angebote heute" replace("angebote","angebot") => "Status: Angebot heute"', () => {
    expect(
      subjectReplacePart("Status: Angebote heute", "angebote", "angebot", "")
    ).toBe("Status: Angebot heute");
  });
});

describe("subjectClear", () => {
  it('8) clear: subjectClear() => ""', () => {
    expect(subjectClear()).toBe("");
  });
});
