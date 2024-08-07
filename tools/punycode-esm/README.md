<div style="text-align:center">

# punycode-esm
ESM native version of punycode.js.

[![npm package](https://badge.fury.io/js/punycode-esm.svg)](https://www.npmjs.com/package/punycode-esm)
[![License](https://img.shields.io/npm/l/punycode-esm.svg)](https://github.com/JacobLey/leyman/blob/main/tools/punycode-esm/LICENSE)

</div>

## Contents
- [Introduction](#introduction)
- [Install](#install)
- [Example](#example)
- [Usage](#usage)
- [API](#api)
  - [decode](#decodestring)
  - [encode](#encodestring)
  - [toUnicode](#tounicodestring)
  - [toASCII](#toasciistring)
  - [ucs2Decode](#ucs2decodestring)
  - [ucs2Encode](#ucs2encodecodepoints)

## Introduction

ESM/Typescript native version of [punycode.js](https://www.npmjs.com/package/punycode).

ESM native users / Typescript `nodenext` users may have some issues with the existing punycode library, so this hopefully serves as a viable alternative.

Logically this package _should_ be the same as punycode.js. The only advantage of this library is ease-of-use for modern typescript/ESM.

Credit goes to [Mathias Bynens](https://mathiasbynens.be/) for original implementation of this logic.

## Install

```sh
npm i punycode-esm
```

## Example

```ts
import { toASCII, toUnicode } from 'punycode-esm';

// encode domain names
toASCII('mañana.com'); // 'xn--maana-pta.com'
toASCII('☃-⌘.com'); // 'xn----dqo34k.com'

// decode domain names
toUnicode('xn--maana-pta.com'); // 'mañana.com'
toUnicode('xn----dqo34k.com'); // '☃-⌘.com'
```

## Usage

`punycode-esm` is an ESM module. That means it _must_ be `import`ed. To load from a CJS module, use dynamic import `const { encode } = await import('punycode-esm');`.

## API

### `decode(string)`

Converts a Punycode string of ASCII symbols to a string of Unicode symbols.

```ts
// decode domain name parts
Punycode.decode('maana-pta'); // 'mañana'
Punycode.decode('--dqo34k'); // '☃-⌘'
```

### `encode(string)`

Converts a string of Unicode symbols to a Punycode string of ASCII symbols.

```ts
// encode domain name parts
Punycode.encode('mañana'); // 'maana-pta'
Punycode.encode('☃-⌘'); // '--dqo34k'
```

### `toUnicode(string)`

Converts a Punycode string representing a domain name or an email address to Unicode. Only the Punycoded parts of the input will be converted, i.e. it doesn’t matter if you call it on a string that has already been converted to Unicode.

```ts
// decode domain names
Punycode.toUnicode('xn--maana-pta.com'); // 'mañana.com'
Punycode.toUnicode('xn----dqo34k.com'); // '☃-⌘.com'

// decode email addresses
Punycode.toUnicode('джумла@xn--p-8sbkgc5ag7bhce.xn--ba-lmcq'); // 'джумла@джpумлатест.bрфa'
```

### `toASCII(string)`

Converts a lowercased Unicode string representing a domain name or an email address to Punycode. Only the non-ASCII parts of the input will be converted, i.e. it doesn’t matter if you call it with a domain that’s already in ASCII.

```ts
Punycode.toASCII('mañana.com'); // 'xn--maana-pta.com'
Punycode.toASCII('☃-⌘.com'); // 'xn----dqo34k.com'

// encode email addresses
Punycode.toASCII('джумла@джpумлатест.bрфa'); // 'джумла@xn--p-8sbkgc5ag7bhce.xn--ba-lmcq'
```

### `ucs2Decode(string)`

Creates an array containing the numeric code point values of each Unicode symbol in the string. While [JavaScript uses UCS-2 internally](https://mathiasbynens.be/notes/javascript-encoding), this function will convert a pair of surrogate halves (each of which UCS-2 exposes as separate characters) into a single code point, matching UTF-16.

```ts
ucs2Decode('abc'); // [0x61, 0x62, 0x63]
// surrogate pair for U+1D306 TETRAGRAM FOR CENTRE:
punycode.ucs2.decode('\uD834\uDF06'); // [0x1D306]
```

### `ucs2Encode(codePoints)`

Creates a string based on an array of numeric code point values.

```ts
punycode.ucs2.encode([0x61, 0x62, 0x63]); // 'abc'
punycode.ucs2.encode([0x1D306]); // '\uD834\uDF06'
```
