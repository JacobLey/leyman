# iso-crypto

## 2.1.0

### Minor Changes

- 788f0e0: Add AES-GCM (`{ mode: 'GCM' }`), which detects tampering: `decrypt` rejects altered content or the wrong secret. Node.js and browser output interoperate, with the authentication tag appended to the encrypted content as Web Crypto does. GCM never pads a short key with zeros, as CBC and CTR do: a `'raw'` secret must be exactly the key size, and a hash at least that long, or `encrypt` and `decrypt` throw a `RangeError`. `eccEncrypt` and `eccDecrypt` with GCM derive the AES key from the ECDH shared secret with HKDF-SHA256, rather than using the shared secret directly as CBC and CTR do.
  
  Add `deriveKey`, for PBKDF2 (passwords, 600,000 iterations by default) and HKDF (high-entropy secrets) key derivation.

### Patch Changes

- af3e088: Browser AES-128 and AES-192 CTR now increment the full 128 bit counter block, matching Node.js. Previously only the low 64 or 96 bits incremented, so in the rare case those bits overflowed mid-message the output differed from (and could not be decrypted by) Node.js.
- 63f769f: Deprecate 192-bit AES keys (`Sizes.KEY_192`), which Chromium-based browsers do not support. They still work for CBC and CTR on Node.js, Firefox and Safari, so existing data stays readable. AES-GCM only accepts 128 or 256 bit keys.
- c8a2cd0: `encode` to base64 or base64url no longer overflows the stack on large inputs.
- 4b095b8: Browser `randomBytes` supports sizes above 65,536 bytes, matching Node.js.
- 15f5262: Fix README links that were broken on npm: relative links (such as WHY files and sibling packages) are now absolute, table-of-contents anchors match their headings, LICENSE badges point at the right path, and `repository` now names the package's directory in the monorepo.
- ac478a2: Make the package easier to find and evaluate: a clearer npm description and keywords, and a README that opens with highlights and how it compares to alternatives.

## 2.0.0

### Major Changes

- eaae490: Increase node engine requirement

### Patch Changes

- 9b882be: Export `Ciphers`, `Modes`, `Sizes` and `Algorithms` as regular enums. As `const enum`s, the published declarations could not be used by consumers compiling with `isolatedModules` (e.g. swc, esbuild, Vite). The emitted JavaScript is unchanged.

## 1.2.4

### Patch Changes

- 9694f33: Bump dependencies

## 1.2.3

### Patch Changes

- 282a5b7: Bump license version
- 75d9ae4: Migrate to using per-package eslint CLI instead of Nx plugin

## 1.2.2

### Patch Changes

- 18cfe17: Add dev dependency on pnpm-dedicated-lockfile
- efd163f: Remove local files from publishing
- 37b2ec5: Move from nx-tsc to swc + tsc CLI
- 36d1c12: Bump dependencies

## 1.2.1

### Patch Changes

- e718f38: Update dependencies

## 1.2.0

### Minor Changes

- 24d8e87: Enforce no-magic numbers/strings

### Patch Changes

- 1bd9dc0: Add barrelify to iso-crypto
- bcd9e61: Bump dependencies

## 1.1.3

### Patch Changes

- 3b3f77f: Bump dependencies
- 3285cb6: Bump biome version
- 9b58c82: Bump typescript version
- ff72123: Bump typescript eslint, apply/ignore rules

## 1.1.2

### Patch Changes

- 1de1659: Omit CHANGELOG from publish
- 725510a: Include npmignore ignore file

## 1.1.1

### Patch Changes

- 31f81fa: Internal dependency updates
- 3e7ee18: Dependency bumps
- f6a4729: Update year in LICENSE
- 9c786d0: Update dependencies
