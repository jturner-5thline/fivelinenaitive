import { describe, it, expect } from 'vitest';
import { cleanEmailSnippet, splitTextByUrls, URL_REGEX } from '@/lib/emailNotesCleanup';

describe('cleanEmailSnippet', () => {
  it('returns empty string for empty input', () => {
    expect(cleanEmailSnippet('')).toBe('');
  });

  it('converts <br> and <br/> to newlines', () => {
    expect(cleanEmailSnippet('hi<br>there<br/>friend')).toBe('hi\nthere\nfriend');
  });

  it('strips arbitrary HTML tags but preserves their text', () => {
    expect(cleanEmailSnippet('<p>Hello <b>world</b></p>')).toBe('Hello world');
  });

  it('decodes the common HTML entities', () => {
    expect(cleanEmailSnippet('Tom&nbsp;&amp;&nbsp;Jerry &lt;3 &quot;tests&quot; &#39;ok&#39;'))
      .toBe('Tom & Jerry <3 "tests" \'ok\'');
  });

  it('collapses 3+ blank lines into a single blank line', () => {
    expect(cleanEmailSnippet('a\n\n\n\nb')).toBe('a\n\nb');
  });

  it('trims trailing whitespace before newlines', () => {
    expect(cleanEmailSnippet('foo   \nbar')).toBe('foo\nbar');
  });

  it('trims leading and trailing whitespace from the whole string', () => {
    expect(cleanEmailSnippet('   \n hello \n  ')).toBe('hello');
  });

  it('produces no raw < or > or & artifacts from realistic Gmail snippet', () => {
    const messy = '<div>Hi&nbsp;James,<br><br>Please review&nbsp;&amp; reply.</div>';
    const out = cleanEmailSnippet(messy);
    expect(out).toBe('Hi James,\n\nPlease review & reply.');
    expect(out).not.toMatch(/[<>]/);
    expect(out).not.toMatch(/&[a-z#0-9]+;/i);
  });
});

describe('splitTextByUrls', () => {
  it('returns empty array for empty input', () => {
    expect(splitTextByUrls('')).toEqual([]);
  });

  it('returns the input as a single text part when no URLs are present', () => {
    expect(splitTextByUrls('just some words')).toEqual([
      { type: 'text', value: 'just some words' },
    ]);
  });

  it('extracts a single URL surrounded by text', () => {
    expect(splitTextByUrls('see https://example.com now')).toEqual([
      { type: 'text', value: 'see ' },
      { type: 'url', value: 'https://example.com' },
      { type: 'text', value: ' now' },
    ]);
  });

  it('extracts http and https URLs and preserves order', () => {
    const out = splitTextByUrls('a http://x.io b https://y.io c');
    expect(out.map((p) => p.value)).toEqual(['a ', 'http://x.io', ' b ', 'https://y.io', ' c']);
    expect(out.filter((p) => p.type === 'url').map((p) => p.value))
      .toEqual(['http://x.io', 'https://y.io']);
  });

  it('does not include trailing parens, quotes, or angle brackets in the URL', () => {
    const out = splitTextByUrls('see (https://example.com) and "https://foo.bar"');
    const urls = out.filter((p) => p.type === 'url').map((p) => p.value);
    expect(urls).toEqual(['https://example.com', 'https://foo.bar']);
  });

  it('handles a URL at the very start and end of the string', () => {
    expect(splitTextByUrls('https://a.com middle https://b.com')).toEqual([
      { type: 'url', value: 'https://a.com' },
      { type: 'text', value: ' middle ' },
      { type: 'url', value: 'https://b.com' },
    ]);
  });

  it('handles the source-email link shape produced by CreateTaskFromEmailDialog', () => {
    const desc = 'From: Jane <jane@x.io>\nSubject: Hi\n\nbody\n\nSource email: https://app.example.com/dashboard?widget=email&thread=T1&message=M1';
    const parts = splitTextByUrls(desc);
    const urls = parts.filter((p) => p.type === 'url').map((p) => p.value);
    expect(urls).toEqual([
      'https://app.example.com/dashboard?widget=email&thread=T1&message=M1',
    ]);
  });
});

describe('URL_REGEX', () => {
  it('is a global regex so matchAll works repeatedly', () => {
    expect(URL_REGEX.flags).toContain('g');
  });
});