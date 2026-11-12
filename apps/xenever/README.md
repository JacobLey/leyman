# xenever

Parse XML into typed objects, validated against a schema written in TypeScript or generated from an XSD.

Not yet published: the API is being built. The design is the XML counterpart of [genever](../genever/ts/): the schema decides the shape of every value (which children repeat, which are optional, which keep their order), so nothing is guessed from the document.
