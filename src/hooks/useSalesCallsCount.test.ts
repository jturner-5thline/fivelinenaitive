import { describe, it, expect } from 'vitest';
import { isSalesCallEventForVariant } from './useSalesCallsCount';

describe('FinServ sales call titles', () => {
  it('still counts "5th Line <> [Company] Financial Review"', () => {
    expect(isSalesCallEventForVariant('5th Line <> Acme Financial Review', 'finserv')).toBe(true);
  });
  it('counts "[Company]<>5th Line: Intro"', () => {
    expect(isSalesCallEventForVariant('Acme<>5th Line: Intro', 'finserv')).toBe(true);
    expect(isSalesCallEventForVariant('Acme <> 5th Line: Intro', 'finserv')).toBe(true);
  });
  it('does not count Intro calls as debt calls, nor debt calls as FinServ', () => {
    expect(isSalesCallEventForVariant('Acme <> 5th Line: Intro', 'debt')).toBe(false);
    expect(isSalesCallEventForVariant('Acme <> 5th Line Financing Review', 'finserv')).toBe(false);
  });
});
