import { describe, expect, it } from 'vitest';

import {
  DecodeError,
  applyCodec,
  base64Decode,
  base64Encode,
  base64UrlEncode,
  hexDecode,
  hexEncode,
  htmlEscape,
  htmlUnescape,
  jsonStringEscape,
  jsonStringUnescape,
  urlDecode,
  urlEncode,
} from '../../src/lib/codec';

describe('base64', () => {
  it('round-trips UTF-8 text, including CJK and emoji', () => {
    for (const text of ['hello', '日本語のテキスト', 'family: 👨‍👩‍👧‍👦', '']) {
      if (text === '') {
        continue;
      }
      expect(base64Decode(base64Encode(text))).toBe(text);
    }
  });

  it('decodes URL-safe Base64', () => {
    // "??>>" encodes to bytes that produce '+' and '/' in standard Base64.
    const text = 'ûÿþ';
    const urlSafe = base64UrlEncode(text);
    expect(urlSafe).not.toMatch(/[+/=]/);
    expect(base64Decode(urlSafe)).toBe(text);
  });

  it('tolerates surrounding whitespace', () => {
    expect(base64Decode('  aGVsbG8=\n')).toBe('hello');
  });

  it('rejects empty input', () => {
    expect(() => base64Decode('   ')).toThrow(DecodeError);
  });

  it('rejects text outside the alphabet rather than silently skipping it', () => {
    expect(() => base64Decode('hello world!')).toThrow(/outside the Base64 alphabet/);
  });

  it('rejects a length that cannot encode any byte', () => {
    // A 5-character body is one 4-character group plus a 1-character remainder,
    // and a lone Base64 character carries only 6 bits — not a whole byte.
    expect(() => base64Decode('YWJjZ')).toThrow(/length is not valid/);
  });

  it('tolerates missing or loose padding, which plenty of encoders omit', () => {
    expect(base64Decode('aGVsbG8')).toBe('hello');
    expect(base64Decode('aGVsbG8=')).toBe('hello');
  });

  it('rejects bytes that are not valid UTF-8', () => {
    // 0xFF is never a valid UTF-8 lead byte.
    expect(() => base64Decode(Buffer.from([0xff, 0xfe]).toString('base64'))).toThrow(
      /not valid UTF-8/
    );
  });
});

describe('url encoding', () => {
  it('round-trips', () => {
    expect(urlDecode(urlEncode('a b&c=d/e?f'))).toBe('a b&c=d/e?f');
    expect(urlEncode('a b')).toBe('a%20b');
  });

  it('rejects a malformed escape', () => {
    expect(() => urlDecode('%E0%A4%A')).toThrow(DecodeError);
  });
});

describe('html escaping', () => {
  it('escapes the five unsafe characters', () => {
    expect(htmlEscape(`<a href="x">'&'</a>`)).toBe(
      '&lt;a href=&quot;x&quot;&gt;&#39;&amp;&#39;&lt;/a&gt;'
    );
  });

  it('round-trips through unescape', () => {
    const text = `<script>alert("hi & 'bye'")</script>`;
    expect(htmlUnescape(htmlEscape(text))).toBe(text);
  });

  it('resolves named, decimal and hex references', () => {
    expect(htmlUnescape('&amp;&lt;&gt;&quot;&apos;')).toBe('&<>"\'');
    expect(htmlUnescape('&#72;&#105;')).toBe('Hi');
    expect(htmlUnescape('&#x1F600;')).toBe('\u{1F600}');
  });

  it('recovers a non-breaking space as U+00A0, not a plain space', () => {
    expect(htmlUnescape('a&nbsp;b')).toBe('a b');
  });

  it('leaves unrecognised or invalid references alone rather than dropping them', () => {
    expect(htmlUnescape('&hearts;')).toBe('&hearts;');
    expect(htmlUnescape('&#xD800;')).toBe('&#xD800;');
    expect(htmlUnescape('&#x110000;')).toBe('&#x110000;');
  });
});

describe('hex', () => {
  it('round-trips', () => {
    expect(hexEncode('hi')).toBe('6869');
    expect(hexDecode('6869')).toBe('hi');
  });

  it('ignores whitespace between bytes', () => {
    expect(hexDecode('68 69\n')).toBe('hi');
  });

  it('rejects empty, non-hex, odd-length and non-UTF-8 input', () => {
    expect(() => hexDecode('  ')).toThrow(/empty/);
    expect(() => hexDecode('zz')).toThrow(/not hexadecimal/);
    expect(() => hexDecode('686')).toThrow(/odd number/);
    expect(() => hexDecode('fffe')).toThrow(/not valid UTF-8/);
  });
});

describe('json string escaping', () => {
  it('round-trips, without the surrounding quotes', () => {
    const text = 'line1\nline2\t"quoted"\\';
    const escaped = jsonStringEscape(text);
    expect(escaped).not.toContain('\n');
    expect(jsonStringUnescape(escaped)).toBe(text);
  });

  it('rejects a body that is not a valid JSON string', () => {
    expect(() => jsonStringUnescape('unescaped "quote"')).toThrow(DecodeError);
    expect(() => jsonStringUnescape('\\u12')).toThrow(DecodeError);
  });
});

describe('applyCodec', () => {
  it('dispatches by name', () => {
    expect(applyCodec('base64Encode', 'hi')).toBe('aGk=');
    expect(applyCodec('hexEncode', 'hi')).toBe('6869');
    expect(applyCodec('jsonEscape', '"')).toBe('\\"');
  });

  it('propagates decode failures', () => {
    expect(() => applyCodec('base64Decode', '!!')).toThrow(DecodeError);
  });
});
