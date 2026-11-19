// The OpenAPI 3.1 document for the AI's scroll API. GPT Actions read it, so the
// descriptions are plain sentences. routes/agent.test.js checks it against the
// router, so a route added without an entry here fails.
const { KINDS } = require('./scrollInput');

const ref = (name) => ({ $ref: `#/components/schemas/${name}` });
const json = (schema) => ({ 'application/json': { schema } });
const reply = (description, schema) => (schema ? { description, content: json(schema) } : { description });
const errorReply = (description) => reply(description, ref('Error'));

const idParam = (name, description) => ({
    name, in: 'path', required: true, description, schema: { type: 'integer', minimum: 1 },
});
const SCROLL_ID = idParam('id', 'The scroll id.');
const BLOCK_ID = idParam('blockId', 'The block id.');

const scrollReply = (description) => reply(description, {
    type: 'object', properties: { scroll: ref('Scroll') }, required: ['scroll'],
});
const body = (schema) => ({ required: true, content: json(schema) });

const BAD_INPUT = errorReply('The input is not valid.');
const NOT_FOUND = errorReply('No such scroll or block.');
const ANSWERED = errorReply('The question already has an answer, so it cannot change.');

const schemas = () => ({
    Error: {
        type: 'object',
        properties: { error: { type: 'string' } },
        required: ['error'],
    },
    Passage: {
        type: 'object',
        description: 'The verses a scroll covers. Chapters and verses are numbers, books are ids 1 to 66.',
        properties: {
            bookId: { type: 'integer', minimum: 1, maximum: 66 },
            bookName: { type: 'string', description: 'Only present when reading.' },
            startChapter: { type: 'integer', minimum: 1 },
            startVerse: { type: 'integer', minimum: 1, description: 'Defaults to 1.' },
            endChapter: { type: 'integer', minimum: 1, description: 'Defaults to startChapter.' },
            endVerse: { type: ['integer', 'null'], minimum: 1, description: 'Null means the end of the chapter.' },
        },
        required: ['bookId', 'startChapter'],
    },
    Answer: {
        type: 'object',
        description: 'The reader\'s answer to a question block. Read only.',
        properties: {
            text: { type: 'string' },
            answeredAt: { type: 'string', format: 'date-time' },
            updatedAt: { type: 'string', format: 'date-time' },
        },
    },
    Block: {
        type: 'object',
        properties: {
            id: { type: 'integer', description: 'Only present when reading.' },
            position: { type: 'integer', description: 'Only present when reading.' },
            kind: { type: 'string', enum: KINDS },
            body: { type: 'string', description: 'Markdown text.' },
            reference: {
                type: ['object', 'null'],
                description: 'Only for a reference block: the verses it points at.',
                properties: {
                    bookId: { type: 'integer' },
                    chapter: { type: 'integer' },
                    startVerse: { type: 'integer' },
                    endVerse: { type: 'integer' },
                },
            },
            answer: { anyOf: [ref('Answer'), { type: 'null' }], description: 'Only present when reading.' },
        },
        required: ['kind', 'body'],
    },
    Scroll: {
        type: 'object',
        properties: {
            id: { type: 'integer' },
            title: { type: 'string' },
            passage: ref('Passage'),
            blockCount: { type: 'integer' },
            questionCount: { type: 'integer' },
            answeredCount: { type: 'integer' },
            createdAt: { type: 'string', format: 'date-time' },
            updatedAt: { type: 'string', format: 'date-time' },
            blocks: { type: 'array', items: ref('Block'), description: 'Only when one scroll is read.' },
        },
    },
});

const paths = () => ({
    '/scrolls': {
        get: {
            operationId: 'listScrolls',
            description: 'List your scrolls, newest first. Filter by book, and by chapter within a book.',
            parameters: [
                { name: 'book', in: 'query', description: 'Book id from 1 to 66.', schema: { type: 'integer' } },
                { name: 'chapter', in: 'query', description: 'Chapter number. Needs book.', schema: { type: 'integer' } },
            ],
            responses: {
                200: reply('The scrolls, without their blocks.', {
                    type: 'object', properties: { scrolls: { type: 'array', items: ref('Scroll') } },
                }),
                400: BAD_INPUT,
            },
        },
        post: {
            operationId: 'createScroll',
            description: 'Create a scroll on a passage with its first blocks. A chapter can belong to only one scroll.',
            requestBody: body({
                type: 'object',
                properties: {
                    title: { type: 'string', maxLength: 200 },
                    passage: ref('Passage'),
                    blocks: { type: 'array', items: ref('Block'), minItems: 1, maxItems: 100 },
                },
                required: ['title', 'passage', 'blocks'],
            }),
            responses: {
                201: scrollReply('The new scroll.'),
                400: BAD_INPUT,
                409: reply('A chapter in the passage already has a scroll. The conflict names it.', {
                    type: 'object',
                    properties: {
                        error: { type: 'string' },
                        conflict: { type: 'object', properties: { id: { type: 'integer' }, title: { type: 'string' } } },
                    },
                }),
            },
        },
    },
    '/scrolls/{id}': {
        get: {
            operationId: 'getScroll',
            description: 'Read one scroll with all its blocks and any answers.',
            parameters: [SCROLL_ID],
            responses: { 200: scrollReply('The scroll.'), 400: BAD_INPUT, 404: NOT_FOUND },
        },
        patch: {
            operationId: 'renameScroll',
            description: 'Change the title of a scroll.',
            parameters: [SCROLL_ID],
            requestBody: body({ type: 'object', properties: { title: { type: 'string' } }, required: ['title'] }),
            responses: { 200: scrollReply('The updated scroll.'), 400: BAD_INPUT, 404: NOT_FOUND },
        },
    },
    '/scrolls/{id}/blocks': {
        post: {
            operationId: 'appendBlocks',
            description: 'Add blocks to the end of a scroll.',
            parameters: [SCROLL_ID],
            requestBody: body({
                type: 'object',
                properties: { blocks: { type: 'array', items: ref('Block'), minItems: 1, maxItems: 100 } },
                required: ['blocks'],
            }),
            responses: { 201: scrollReply('The scroll with the new blocks.'), 400: BAD_INPUT, 404: NOT_FOUND },
        },
    },
    '/scrolls/{id}/blocks/{blockId}': {
        patch: {
            operationId: 'updateBlock',
            description: 'Change the kind, body or reference of a block. Send at least one. A reference must be sent with kind "reference". A question that has an answer cannot change.',
            parameters: [SCROLL_ID, BLOCK_ID],
            requestBody: body({
                type: 'object',
                properties: { kind: { type: 'string', enum: KINDS }, body: { type: 'string' }, reference: { type: 'object' } },
            }),
            responses: { 200: scrollReply('The updated scroll.'), 400: BAD_INPUT, 404: NOT_FOUND, 409: ANSWERED, 422: { description: 'Only reference blocks take a reference.' } },
        },
        delete: {
            operationId: 'deleteBlock',
            description: 'Remove a block. A question that has an answer cannot be removed.',
            parameters: [SCROLL_ID, BLOCK_ID],
            responses: { 204: reply('The block was removed.'), 400: BAD_INPUT, 404: NOT_FOUND, 409: ANSWERED },
        },
    },
});

const buildOpenApi = (baseUrl) => ({
    openapi: '3.1.0',
    info: {
        title: 'Scrolls API',
        version: '1.0.0',
        description: 'Create and read study scrolls: a passage with ordered blocks of notes, questions, references and ideas.',
    },
    servers: [{ url: baseUrl }],
    security: [{ bearerAuth: [] }],
    paths: paths(),
    components: {
        securitySchemes: { bearerAuth: { type: 'http', scheme: 'bearer' } },
        schemas: schemas(),
    },
});

module.exports = { buildOpenApi };
