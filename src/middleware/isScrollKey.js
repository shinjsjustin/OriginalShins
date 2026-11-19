const { findKeyOwner, touchKey } = require('../lib/apiKeys');

// Per-user API key auth. Keys are looked up by hash, so there is no env key to
// consult and no fail-closed config state; the Bourne key is a separate door.
const createIsScrollKey = (lookup = findKeyOwner, touch = touchKey) => async (req, res, next) => {
    const authHeader = req.headers.authorization;
    const token = authHeader && authHeader.split(' ')[1];
    if (!token) {
        return res.status(401).json({ error: 'Token is NULL' });
    }

    let owner;
    try {
        owner = await lookup(token);
    } catch (err) {
        console.error('Scroll key lookup failed:', err);
        return res.status(500).json({ error: 'Could not check key' });
    }
    if (!owner) {
        return res.status(403).json({ error: 'Token is INVALID' });
    }

    req.user = { id: owner.userId };
    // Not awaited: a slow or failed bookkeeping write must not fail the request.
    Promise.resolve()
        .then(() => touch(owner.keyId))
        .catch((err) => console.error('Scroll key touch failed:', err));
    next();
};

module.exports = createIsScrollKey();
module.exports.createIsScrollKey = createIsScrollKey;
