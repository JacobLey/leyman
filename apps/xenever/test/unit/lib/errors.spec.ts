import { expect } from '@leyman/expect';
import { suite, test } from 'mocha-chain';
import {
    XeneverDocumentError,
    XeneverError,
    XeneverInvalidSchemaError,
    XeneverLoadError,
    XeneverSchemaError,
    XeneverUnsupportedError,
    XeneverValidationError,
    XeneverXmlError,
} from 'xenever';

const location = { line: 3, column: 5, offset: 20, path: '/order/item[2]/@sku' };

suite('errors', () => {
    suite('XeneverXmlError', () => {
        test('Ends its message with the path, line and column', () => {
            const error = new XeneverXmlError('Bad', location);
            expect(error.message).to.equal('Bad (at /order/item[2]/@sku, line 3, column 5)');
        });

        test('Carries its location', () => {
            expect(new XeneverXmlError('Bad', location)).to.include(location);
        });

        test('Is a named document error', () => {
            const error = new XeneverXmlError('Bad', location);
            expect(error).to.be.instanceOf(XeneverDocumentError).and.instanceOf(XeneverError);
            expect(error.name).to.equal('XeneverXmlError');
        });

        test('Keeps its cause', () => {
            const cause = new Error('tokenizer');
            const error = new XeneverXmlError('Bad', { ...location, cause });
            expect(error.cause).to.equal(cause);
        });
    });

    suite('XeneverValidationError', () => {
        test('Is a named document error with a location', () => {
            const error = new XeneverValidationError('Unknown element', location);
            expect(error).to.be.instanceOf(XeneverDocumentError).and.include(location);
            expect(error.name).to.equal('XeneverValidationError');
            expect(error.message).to.equal(
                'Unknown element (at /order/item[2]/@sku, line 3, column 5)'
            );
        });
    });

    suite('XeneverInvalidSchemaError', () => {
        test('Ends its message with the path', () => {
            const error = new XeneverInvalidSchemaError('Bad facet', { path: '/children/price' });
            expect(error).to.be.instanceOf(XeneverError).and.include({
                name: 'XeneverInvalidSchemaError',
                path: '/children/price',
                message: 'Bad facet (at /children/price)',
            });
        });

        test('Has no file location without one', () => {
            const error = new XeneverInvalidSchemaError('Bad facet', { path: '/children/price' });
            expect(error).to.be.instanceOf(XeneverSchemaError);
            expect(error).not.to.have.any.keys('filePath', 'line', 'column');
        });

        test('Ends its message with the file, line and column of an XSD', () => {
            const xsdLocation = {
                filePath: '/schemas/order.xsd',
                line: 4,
                column: 9,
                path: '/xs:schema',
            };
            const error = new XeneverInvalidSchemaError('Bad facet', xsdLocation);
            expect(error).to.include({
                ...xsdLocation,
                message: 'Bad facet (at /xs:schema in /schemas/order.xsd, line 4, column 9)',
            });
        });
    });

    suite('XeneverUnsupportedError', () => {
        test('Ends its message with the path', () => {
            const error = new XeneverUnsupportedError('Substitution groups', {
                path: '/xs:element',
            });
            expect(error).to.be.instanceOf(XeneverError).and.include({
                name: 'XeneverUnsupportedError',
                path: '/xs:element',
                message: 'Substitution groups (at /xs:element)',
            });
        });
    });

    suite('XeneverLoadError', () => {
        test('Ends its message with the file path', () => {
            const error = new XeneverLoadError('Not found', { filePath: '/schemas/order.xsd' });
            expect(error).to.be.instanceOf(XeneverError).and.include({
                name: 'XeneverLoadError',
                filePath: '/schemas/order.xsd',
                message: 'Not found (at /schemas/order.xsd)',
            });
        });
    });
});
