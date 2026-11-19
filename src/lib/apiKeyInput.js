// Request-body validation for creating an API key.
const { fail, isPlainObject, parseRequiredTextField } = require('./textInput');

const MAX_KEY_NAME_LENGTH = 60;

const parseKeyName = (body) => {
    if (!isPlainObject(body)) {
        return fail('body must be an object');
    }
    return parseRequiredTextField('name', body.name, {
        fallback: '',
        maxLength: MAX_KEY_NAME_LENGTH,
        trim: true,
    });
};

module.exports = { MAX_KEY_NAME_LENGTH, parseKeyName };
