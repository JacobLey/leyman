import { expect } from 'chai';
import { suite, test } from 'mocha-chain';
import * as Punycode from 'punycode-esm';

const testData = {
    strings: {
        'a single basic code point': {
            decoded: 'Bach',
            encoded: 'Bach-',
        },
        'a single non-ASCII character': {
            decoded: '\u00FC',
            encoded: 'tda',
        },
        'multiple non-ASCII characters': {
            decoded: '\u00FC\u00EB\u00E4\u00F6\u2665',
            encoded: '4can8av2009b',
        },
        'mix of ASCII and non-ASCII characters': {
            decoded: 'b\u00FCcher',
            encoded: 'bcher-kva',
        },
        'long string with both ASCII and non-ASCII characters': {
            decoded:
                'Willst du die Bl\u00FCthe des fr\u00FChen, die Fr\u00FCchte des sp\u00E4teren Jahres',
            encoded: 'Willst du die Blthe des frhen, die Frchte des spteren Jahres-x9e96lkal',
        },
        // https://tools.ietf.org/html/rfc3492#section-7.1
        'Arabic (Egyptian)': {
            decoded:
                '\u0644\u064A\u0647\u0645\u0627\u0628\u062A\u0643\u0644\u0645\u0648\u0634\u0639\u0631\u0628\u064A\u061F',
            encoded: 'egbpdaj6bu4bxfgehfvwxn',
        },
        'Chinese (simplified)': {
            decoded: '\u4ED6\u4EEC\u4E3A\u4EC0\u4E48\u4E0D\u8BF4\u4E2D\u6587',
            encoded: 'ihqwcrb4cv8a8dqg056pqjye',
        },
        'Chinese (traditional)': {
            decoded: '\u4ED6\u5011\u7232\u4EC0\u9EBD\u4E0D\u8AAA\u4E2D\u6587',
            encoded: 'ihqwctvzc91f659drss3x8bo0yb',
        },
        Czech: {
            decoded: 'Pro\u010Dprost\u011Bnemluv\u00ED\u010Desky',
            encoded: 'Proprostnemluvesky-uyb24dma41a',
        },
        Hebrew: {
            decoded:
                '\u05DC\u05DE\u05D4\u05D4\u05DD\u05E4\u05E9\u05D5\u05D8\u05DC\u05D0\u05DE\u05D3\u05D1\u05E8\u05D9\u05DD\u05E2\u05D1\u05E8\u05D9\u05EA',
            encoded: '4dbcagdahymbxekheh6e0a7fei0b',
        },
        'Hindi (Devanagari)': {
            decoded:
                '\u092F\u0939\u0932\u094B\u0917\u0939\u093F\u0928\u094D\u0926\u0940\u0915\u094D\u092F\u094B\u0902\u0928\u0939\u0940\u0902\u092C\u094B\u0932\u0938\u0915\u0924\u0947\u0939\u0948\u0902',
            encoded: 'i1baa7eci9glrd9b2ae1bj0hfcgg6iyaf8o0a1dig0cd',
        },
        'Japanese (kanji and hiragana)': {
            decoded:
                '\u306A\u305C\u307F\u3093\u306A\u65E5\u672C\u8A9E\u3092\u8A71\u3057\u3066\u304F\u308C\u306A\u3044\u306E\u304B',
            encoded: 'n8jok5ay5dzabd5bym9f0cm5685rrjetr6pdxa',
        },
        'Korean (Hangul syllables)': {
            decoded:
                '\uC138\uACC4\uC758\uBAA8\uB4E0\uC0AC\uB78C\uB4E4\uC774\uD55C\uAD6D\uC5B4\uB97C\uC774\uD574\uD55C\uB2E4\uBA74\uC5BC\uB9C8\uB098\uC88B\uC744\uAE4C',
            encoded: '989aomsvi5e83db1d2a355cv1e0vak1dwrv93d5xbh15a0dt30a5jpsd879ccm6fea98c',
        },
        /**
         * As there's no way to do it in JavaScript, Punycode.js doesn't support
         * mixed-case annotation (which is entirely optional as per the RFC).
         * So, while the RFC sample string encodes to:
         * `b1abfaaepdrnnbgefbaDotcwatmq2g4l`
         * Without mixed-case annotation it has to encode to:
         * `b1abfaaepdrnnbgefbadotcwatmq2g4l`
         * https://github.com/bestiejs/punycode.js/issues/3
         */
        'Russian (Cyrillic)': {
            decoded:
                '\u043F\u043E\u0447\u0435\u043C\u0443\u0436\u0435\u043E\u043D\u0438\u043D\u0435\u0433\u043E\u0432\u043E\u0440\u044F\u0442\u043F\u043E\u0440\u0443\u0441\u0441\u043A\u0438',
            encoded: 'b1abfaaepdrnnbgefbadotcwatmq2g4l',
        },
        Spanish: {
            decoded: 'Porqu\u00E9nopuedensimplementehablarenEspa\u00F1ol',
            encoded: 'PorqunopuedensimplementehablarenEspaol-fmd56a',
        },
        Vietnamese: {
            decoded: 'T\u1EA1isaoh\u1ECDkh\u00F4ngth\u1EC3ch\u1EC9n\u00F3iti\u1EBFngVi\u1EC7t',
            encoded: 'TisaohkhngthchnitingVit-kjcr8268qyxafd2f1b9g',
        },
        '3B-ww4c5e180e575a65lsy2b': {
            decoded: '3\u5E74B\u7D44\u91D1\u516B\u5148\u751F',
            encoded: '3B-ww4c5e180e575a65lsy2b',
        },
        '-with-SUPER-MONKEYS-pc58ag80a8qai00g7n9n': {
            decoded: '\u5B89\u5BA4\u5948\u7F8E\u6075-with-SUPER-MONKEYS',
            encoded: '-with-SUPER-MONKEYS-pc58ag80a8qai00g7n9n',
        },
        'Hello-Another-Way--fc4qua05auwb3674vfr0b': {
            decoded: 'Hello-Another-Way-\u305D\u308C\u305E\u308C\u306E\u5834\u6240',
            encoded: 'Hello-Another-Way--fc4qua05auwb3674vfr0b',
        },
        '2-u9tlzr9756bt3uc0v': {
            decoded: '\u3072\u3068\u3064\u5C4B\u6839\u306E\u4E0B2',
            encoded: '2-u9tlzr9756bt3uc0v',
        },
        'MajiKoi5-783gue6qz075azm5e': {
            decoded: 'Maji\u3067Koi\u3059\u308B5\u79D2\u524D',
            encoded: 'MajiKoi5-783gue6qz075azm5e',
        },
        'de-jg4avhby1noc0d': {
            decoded: '\u30D1\u30D5\u30A3\u30FCde\u30EB\u30F3\u30D0',
            encoded: 'de-jg4avhby1noc0d',
        },
        d9juau41awczczp: {
            decoded: '\u305D\u306E\u30B9\u30D4\u30FC\u30C9\u3067',
            encoded: 'd9juau41awczczp',
        },
        /**
         * This example is an ASCII string that breaks the existing rules for host
         * name labels. (It's not a realistic example for IDNA, because IDNA never
         * encodes pure ASCII labels.)
         */
        'ASCII string that breaks the existing rules for host-name labels': {
            decoded: '-> $1.00 <-',
            encoded: '-> $1.00 <--',
        },
    },
    ucs2: {
        // Every Unicode symbol is tested separately. These are just the extra
        // tests for symbol combinations:
        'Consecutive astral symbols': {
            decoded: [127_829, 119_808, 119_558, 119_638],
            encoded: '\uD83C\uDF55\uD835\uDC00\uD834\uDF06\uD834\uDF56',
        },
        'U+D800 (high surrogate) followed by non-surrogates': {
            decoded: [55_296, 97, 98],
            encoded: '\uD800ab',
        },
        'U+DC00 (low surrogate) followed by non-surrogates': {
            decoded: [56_320, 97, 98],
            encoded: '\uDC00ab',
        },
        'High surrogate followed by another high surrogate': {
            decoded: [0xd800, 0xd800],
            encoded: '\uD800\uD800',
        },
        'Unmatched high surrogate, followed by a surrogate pair, followed by an unmatched high surrogate':
            {
                decoded: [0xd800, 0x1d306, 0xd800],
                encoded: '\uD800\uD834\uDF06\uD800',
            },
        'Low surrogate followed by another low surrogate': {
            decoded: [0xdc00, 0xdc00],
            encoded: '\uDC00\uDC00',
        },
        'Unmatched low surrogate, followed by a surrogate pair, followed by an unmatched low surrogate':
            {
                decoded: [0xdc00, 0x1d306, 0xdc00],
                encoded: '\uDC00\uD834\uDF06\uDC00',
            },
    },
    domains: {
        'xn--maana-pta.com': {
            decoded: 'ma\u00F1ana.com',
            encoded: 'xn--maana-pta.com',
        },
        // https://github.com/bestiejs/punycode.js/issues/17
        'example.com.': {
            decoded: 'example.com.',
            encoded: 'example.com.',
        },
        'xn--bcher-kva.com': {
            decoded: 'b\u00FCcher.com',
            encoded: 'xn--bcher-kva.com',
        },
        'xn--caf-dma.com': {
            decoded: 'caf\u00E9.com',
            encoded: 'xn--caf-dma.com',
        },
        'xn----dqo34k.com': {
            decoded: '\u2603-\u2318.com',
            encoded: 'xn----dqo34k.com',
        },
        'xn----dqo34kn65z.com': {
            decoded: '\uD400\u2603-\u2318.com',
            encoded: 'xn----dqo34kn65z.com',
        },
        emoji: {
            decoded: '\uD83D\uDCA9.la',
            encoded: 'xn--ls8h.la',
        },
        'Non-printable ASCII': {
            decoded: '\0\u0001\u0002foo.bar',
            encoded: '\0\u0001\u0002foo.bar',
        },
        'Email address': {
            decoded:
                '\u0434\u0436\u0443\u043C\u043B\u0430@\u0434\u0436p\u0443\u043C\u043B\u0430\u0442\u0435\u0441\u0442.b\u0440\u0444a',
            encoded: '\u0434\u0436\u0443\u043C\u043B\u0430@xn--p-8sbkgc5ag7bhce.xn--ba-lmcq',
        },
    },
    separators: {
        'Using U+002E as separator': {
            decoded: 'ma\u00F1ana\u002Ecom',
            encoded: 'xn--maana-pta.com',
        },
        'Using U+3002 as separator': {
            decoded: 'ma\u00F1ana\u3002com',
            encoded: 'xn--maana-pta.com',
        },
        'Using U+FF0E as separator': {
            decoded: 'ma\u00F1ana\uFF0Ecom',
            encoded: 'xn--maana-pta.com',
        },
        'Using U+FF61 as separator': {
            decoded: 'ma\u00F1ana\uFF61com',
            encoded: 'xn--maana-pta.com',
        },
    },
} as const;

suite('punycode', () => {
    suite('ucs2Decode', () => {
        for (const [description, { decoded, encoded }] of Object.entries(testData.ucs2)) {
            suite(description, () => {
                test('success', () => {
                    expect(Punycode.ucs2Decode(encoded)).to.deep.equal(decoded);
                });

                test('idempotent', () => {
                    expect(Punycode.ucs2Decode(String.fromCodePoint(...decoded))).to.deep.equal(
                        decoded
                    );
                });
            });
        }
    });

    suite('ucs2Encode', () => {
        for (const [description, { decoded, encoded }] of Object.entries(testData.ucs2)) {
            suite(description, () => {
                test('success', () => {
                    expect(Punycode.ucs2Encode(decoded)).to.equal(encoded);
                });

                test('idempotent', () => {
                    expect(
                        Punycode.ucs2Encode([...encoded].map(txt => txt.codePointAt(0)!))
                    ).to.equal(encoded);
                });
            });
        }

        test('Does not mutate argument array', () => {
            const codePoints = [0x61, 0x62, 0x63];
            expect(Punycode.ucs2Encode(codePoints)).to.equal('abc');
            expect(codePoints).to.deep.equal([0x61, 0x62, 0x63]);
        });
    });

    suite('decode', () => {
        for (const [description, { decoded, encoded }] of Object.entries(testData.strings)) {
            test(description, () => {
                expect(Punycode.decode(encoded)).to.equal(decoded);
            });
        }

        test('Handles uppercase Z', () => {
            expect(Punycode.decode('ZZZ')).to.equal('\u7BA5');
        });

        test('Throws RangeError: Illegal input >= 0x80 (not a basic code point)', () => {
            expect(() => Punycode.decode('\u0081-')).to.throw(RangeError);
        });
        test('Throws RangeError: Overflow: input needs wider integers to process', () => {
            expect(() => Punycode.decode('\u0081')).to.throw(RangeError);
        });
    });

    suite('encode', () => {
        for (const [description, { decoded, encoded }] of Object.entries(testData.strings)) {
            test(description, () => {
                expect(Punycode.encode(decoded)).to.equal(encoded);
            });
        }
    });

    suite('toUnicode', () => {
        for (const [description, { decoded, encoded }] of Object.entries(testData.domains)) {
            suite(description, () => {
                test('success', () => {
                    expect(Punycode.toUnicode(encoded)).to.equal(decoded);
                });

                test('idempotent', () => {
                    expect(Punycode.toUnicode(decoded)).to.equal(decoded);
                });
            });
        }

        suite("Does not convert names (or other strings) that don't start with `xn--`", () => {
            for (const [description, { decoded, encoded }] of Object.entries(testData.strings)) {
                suite(description, () => {
                    test('decoded', () => {
                        expect(Punycode.toUnicode(decoded)).to.equal(decoded);
                    });

                    test('encoded', () => {
                        expect(Punycode.toUnicode(encoded)).to.equal(encoded);
                    });
                });
            }
        });
    });

    suite('toASCII', () => {
        for (const [description, { decoded, encoded }] of Object.entries(testData.domains)) {
            suite(description, () => {
                test('success', () => {
                    expect(Punycode.toASCII(decoded)).to.equal(encoded);
                });

                test('idempotent', () => {
                    expect(Punycode.toASCII(encoded)).to.equal(encoded);
                });
            });
        }

        suite('Does not convert domain names (or other strings) that are already in ASCII', () => {
            for (const [description, { encoded }] of Object.entries(testData.strings)) {
                test(description, () => {
                    expect(Punycode.toASCII(encoded)).to.equal(encoded);
                });
            }
        });

        suite('Supports IDNA2003 separators for backwards compatibility', () => {
            for (const [description, { decoded, encoded }] of Object.entries(testData.separators)) {
                test(description, () => {
                    expect(Punycode.toASCII(decoded)).to.equal(encoded);
                });
            }
        });
    });
});
