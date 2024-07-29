import { dedent } from 'ts-dedent';

export default {
    json: {
        extension: 'json',
        raw: JSON.stringify({
            foo: [1, 2],
            bar: '<bar>',
            baz: {
                bing: true,
                bong: false,
                bingbong: ['bong', 'bing'],
            },
        }),
        formatted: dedent`
            {
              "foo": [
                1,
                2
              ],
              "bar": "<bar>",
              "baz": {
                "bing": true,
                "bong": false,
                "bingbong": [
                  "bong",
                  "bing"
                ]
              }
            }

        `,
    },
    ts: {
        extension: 'ts',
        raw: dedent`
            export type     { Bing   } from 'bong';

            export      const radix    :number = 16  ;const foo: IFoo = (
            param:    number
            ): string =>       param.toString(  radix   ) ;
        `,
        formatted: dedent`
            export type { Bing } from 'bong';

            export const radix: number = 16;
            const foo: IFoo = (param: number): string => param.toString(radix);

        `,
    },
    js: {
        extension: 'js',
        raw: dedent`
            export      { Bing   } from 'bong';

            export      const radix    = 16  ;const foo = (
            param
            ) =>       param.toString(  radix  ) ;
        `,
        formatted: dedent`
            export { Bing } from 'bong';

            export const radix = 16;
            const foo = param => param.toString(radix);

        `,
    },
};
