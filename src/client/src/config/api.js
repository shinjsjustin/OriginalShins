// Thin fetch wrapper for the protected JSON API.
//
// Every call attaches the Bearer token and turns a non-2xx response into an
// Error carrying a message fit to show a user — so callers handle one failure
// path instead of re-deriving status handling at each call site.

// Maps the status codes this API actually returns to user-facing copy.
// Anything unlisted falls through to a generic message rather than leaking a
// raw status line into the UI.
const MESSAGE_BY_STATUS = {
    400: 'That request was not valid.',
    401: 'Your session has expired. Please log in again.',
    403: 'Your session is no longer valid. Please log in again.',
    404: 'We could not find that.',
    // A topic slug is unique per user; the server rejects a repeat rather than
    // quietly renaming one of them.
    409: 'You already have one of those. Try a different name.',
    500: 'The server ran into a problem. Please try again.',
    503: 'Scripture data is not available yet.',
};

// 204 No Content is the success answer to every delete; there is no body to
// parse and asking for one would throw.
const NO_CONTENT = 204;

const messageForStatus = (status) =>
    MESSAGE_BY_STATUS[status] || `Request failed (${status}).`;

// Calls `path` (relative to REACT_APP_URL) and resolves its parsed JSON body,
// or null for a 204. Defaults to GET; pass `method` and `body` to write.
// `body` is a plain object and is serialized here, so no call site repeats the
// Content-Type header or the stringify.
//
// Rejects with an Error whose `message` is displayable, or re-throws the
// AbortError untouched so callers can distinguish a cancelled request.
export const fetchJson = async (path, { signal, method = 'GET', body } = {}) => {
    const token = localStorage.getItem('token');
    const hasBody = body !== undefined;

    let response;
    try {
        response = await fetch(`${process.env.REACT_APP_URL}${path}`, {
            method,
            headers: {
                Authorization: `Bearer ${token}`,
                ...(hasBody ? { 'Content-Type': 'application/json' } : {}),
            },
            body: hasBody ? JSON.stringify(body) : undefined,
            signal,
        });
    } catch (err) {
        if (err.name === 'AbortError') {
            throw err;
        }
        throw new Error('Could not reach the server. Check your connection.');
    }

    if (!response.ok) {
        throw new Error(messageForStatus(response.status));
    }

    if (response.status === NO_CONTENT) {
        return null;
    }

    try {
        return await response.json();
    } catch {
        throw new Error('The server returned a response we could not read.');
    }
};
