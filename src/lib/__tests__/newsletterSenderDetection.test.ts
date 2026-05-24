import { describe, it, expect } from 'vitest';
import {
  isNewsletterSender,
  hasListUnsubscribe,
  NEWSLETTER_DENY_DOMAINS,
} from '../newsletterSenderDetection';

describe('isNewsletterSender', () => {
  it('flags substack.com sender', () => {
    expect(isNewsletterSender('samfjacobs@substack.com')).toBe(true);
  });
  it('flags linkedin.com sender', () => {
    expect(isNewsletterSender('noreply@linkedin.com')).toBe(true);
  });
  it('does not flag legitimate lender domain', () => {
    expect(isNewsletterSender('vp@founders-first.com')).toBe(false);
  });
  it('flags subdomain of substack', () => {
    expect(isNewsletterSender('bounce@email.substack.com')).toBe(true);
  });
  it('returns false for empty / missing / malformed', () => {
    expect(isNewsletterSender(undefined)).toBe(false);
    expect(isNewsletterSender(null)).toBe(false);
    expect(isNewsletterSender('')).toBe(false);
    expect(isNewsletterSender('no-at')).toBe(false);
  });
  it('exports the canonical deny set', () => {
    expect(NEWSLETTER_DENY_DOMAINS.has('substack.com')).toBe(true);
    expect(NEWSLETTER_DENY_DOMAINS.has('medium.com')).toBe(true);
  });
});

describe('hasListUnsubscribe', () => {
  it('detects lowercase list-unsubscribe', () => {
    expect(hasListUnsubscribe({ 'list-unsubscribe': '<mailto:unsub@x.co>' })).toBe(true);
  });
  it('detects mixed-case List-Id', () => {
    expect(hasListUnsubscribe({ 'List-Id': '<news.x.co>' })).toBe(true);
  });
  it('returns false when headers absent', () => {
    expect(hasListUnsubscribe(undefined)).toBe(false);
    expect(hasListUnsubscribe(null)).toBe(false);
    expect(hasListUnsubscribe({})).toBe(false);
  });
  it('returns false when header present but empty', () => {
    expect(hasListUnsubscribe({ 'list-unsubscribe': '' })).toBe(false);
  });
});
