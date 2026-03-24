<div style="text-align:center">

# punycode-esm
ESM and TypeScript port of the punycode.js library.

[![npm package](https://badge.fury.io/js/punycode-esm.svg)](https://www.npmjs.com/package/punycode-esm)
[![License](https://img.shields.io/npm/l/punycode-esm.svg)](https://github.com/JacobLey/leyman/blob/main/tools/punycode-esm/LICENSE)

</div>

## Contents
- [Install](#install)
- [Example](#example)
- [Usage](#usage)
- [API](#api)
  - [encode](#encodestring)
  - [decode](#decodestring)
  - [toASCII](#toasciistring)
  - [toUnicode](#tounicodestring)
  - [ucs2Decode](#ucs2decodestring)
  - [ucs2Encode](#ucs2encodecodepoints)

## Install

```sh
npm i punycode-esm
```

## Example

```ts
import { toASCII, toUnicode } from 'punycode-esm';

// encode domain names
toASCII('mañana.com');  // 'xn--maana-pta.com'
toASCII('☃-⌘.com');    // 'xn----dqo34k.com'

// decode domain names
toUnicode('xn--maana-pta.com'); // 'mañana.com'
toUnicode('xn----dqo34k.com');  // '☃-⌘.com'
```

## Usage

`punycode-esm` is an ESM module. It must be `import`ed. To load from a CJS module, use dynamic import: `const { encode } = await import('punycode-esm')`.

This is a direct ESM/TypeScript port of [punycode.js](https://www.npmjs.com/package/punycode) by [Mathias Bynens](https://mathiasbynens.be/). The logic is identical; this package exists for compatibility with TypeScript `moduleResolution: nodenext` and pure-ESM projects.

## API

### `encode(string)`

Converts a string of Unicode symbols (a single domain label) to a Punycode string of ASCII-only symbols.

**Parameters**

| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `string` | `string` | — | Required. A Unicode domain label (no dots). |

**Returns** `string` — the Punycode-encoded ASCII label.

```ts
encode('mañana'); // 'maana-pta'
encode('☃-⌘');   // '--dqo34k'
```

---

### `decode(string)`

Converts a Punycode string of ASCII-only symbols (a single domain label) to a string of Unicode symbols.

**Parameters**

| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `string` | `string` | — | Required. A Punycode-encoded ASCII label (no dots). |

**Returns** `string` — the decoded Unicode label.

```ts
decode('maana-pta'); // 'mañana'
decode('--dqo34k');  // '☃-⌘'
```

---

### `toASCII(string)`

Converts a Unicode domain name or email address to its Punycode (ASCII) representation. Only non-ASCII labels are converted; already-ASCII labels are left unchanged.

**Parameters**

| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `string` | `string` | — | Required. A Unicode domain name or email address. |

**Returns** `string` — the ASCII-compatible encoding of the domain or email.

```ts
toASCII('mañana.com');                     // 'xn--maana-pta.com'
toASCII('☃-⌘.com');                       // 'xn----dqo34k.com'
toASCII('джумла@джpумлатест.bрфa');        // 'джумла@xn--p-8sbkgc5ag7bhce.xn--ba-lmcq'
```

---

### `toUnicode(string)`

Converts a Punycode domain name or email address to Unicode. Only Punycode-encoded labels (prefixed with `xn--`) are converted; others are left unchanged.

**Parameters**

| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `string` | `string` | — | Required. A Punycode domain name or email address. |

**Returns** `string` — the Unicode representation of the domain or email.

```ts
toUnicode('xn--maana-pta.com');                          // 'mañana.com'
toUnicode('xn----dqo34k.com');                           // '☃-⌘.com'
toUnicode('джумла@xn--p-8sbkgc5ag7bhce.xn--ba-lmcq');   // 'джумла@джpумлатест.bрфa'
```

---

### `ucs2Decode(string)`

Creates an array of Unicode code point values from a string. Surrogate pairs (as used internally by JavaScript's UCS-2 encoding) are combined into a single code point, matching UTF-16 semantics.

**Parameters**

| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `string` | `string` | — | Required. A UCS-2 encoded string. |

**Returns** `number[]` — array of Unicode code point integers.

```ts
ucs2Decode('abc');           // [0x61, 0x62, 0x63]
ucs2Decode('\uD834\uDF06');  // [0x1D306]
```

---

### `ucs2Encode(codePoints)`

Creates a string from an array of Unicode code point values.

**Parameters**

| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `codePoints` | `readonly number[]` | — | Required. Array of Unicode code point integers. |

**Returns** `string` — the UCS-2 encoded string.

```ts
ucs2Encode([0x61, 0x62, 0x63]); // 'abc'
ucs2Encode([0x1D306]);          // '\uD834\uDF06'
```
