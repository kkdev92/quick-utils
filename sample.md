# Quick Utils — things to try

Not shipped in the VSIX. This file exists so that pressing `F5` opens something
you can immediately select text in.

Select any block below and press `Ctrl+Alt+T` (`Cmd+Alt+T` on macOS).

## Case conversion

```text
XMLHttpRequest
html5Parser
foo_bar-baz.qux
ÜberGrößeWert
```

With nothing selected, put the cursor inside a word — case transforms take the
word under the cursor.

## Encoding

```text
5pel5pys6Kqe44Gu44OG44Kt44K544OI
```

That is Base64. Decode it, then encode it back. Now try decoding this prose
instead — it should refuse rather than produce garbage:

```text
this is not base64 at all
```

Hex, URL and HTML codecs are in the same picker:

```text
<a href="/search?q=a b&lang=ja">リンク</a>
```

## Lines

Select all four lines, then try sort, numeric sort and remove-duplicates:

```text
item10
item9
Apple
apple
```

## JSON

Select the object and try **Format JSON**, **Minify JSON** and **Sort JSON
Keys**. Then break it — delete a brace — and watch the error name the position
instead of mangling the document.

```json
{"name":"quick-utils","engines":{"vscode":"^1.125.0","node":">=22.0.0"},"private":false,"keywords":["json","regex","hash"]}
```

## Statistics

Select this paragraph and look at the status bar; then run **Quick Utils: Inspect
Selection** for the full breakdown.

日本語の文章は空白で区切られないので、空白分割では単語数が 1 になります。
`Intl.Segmenter` は辞書に基づいて区切るため、ここでは実際の語数が出ます。

Emoji are one grapheme and several code points: 👨‍👩‍👧‍👦 🇯🇵 é

## Hashing

Select the line below and run **Quick Utils: Hash Selection…**. With nothing
selected it copies the digest of this whole file instead.

```text
The quick brown fox jumps over the lazy dog
```

## Generators

Put a cursor on each of the three lines below (`Alt+Click`) and run **Insert
UUID (v4)** — each cursor gets a different value, in one undo step.

```text

```

## Regex Tester

Run **Quick Utils: Open Regex Tester**, click **From editor**, and try:

- `(?<user>\w+)@(\w+\.\w+)` against the addresses below
- `\p{Script=Han}+` with flags `gu` against the Japanese paragraph above
- `(a+)+$` against `aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaab` — this is the
  catastrophic case; it is abandoned after the configured timeout instead of
  freezing the editor

```text
alice@example.com
bob@example.co.jp
carol+tag@sub.example.org
```

## Replace by Pattern

With the addresses above selected, run **Quick Utils: Replace by Pattern…** and
replace `(\w+)@([\w.]+)` with `$2/$1`.
