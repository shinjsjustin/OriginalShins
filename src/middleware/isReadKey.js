const crypto = require('crypto');

const digest = (value) => crypto.createHash('sha256').update(value).digest();

// Static-key auth for Bourne, scoped to one account. Env is read per request
// and the middleware fails closed when it is misconfigured.
const isReadKey = (req, res, next) => {
    const key = process.env.BOURNE_API_KEY;
    const userId = process.env.BOURNE_USER_ID;

    if (!key || !/^[1-9]\d*$/.test(userId || '')) {
        return res.status(503).json({ error: 'Read key is not configured' });
    }

    const authHeader = req.headers.authorization;
    const token = authHeader && authHeader.split(' ')[1];
    if (!token) {
        return res.status(401).json({ error: 'Token is NULL' });
    }

    // Digests are equal length, so timingSafeEqual cannot throw or leak length.
    if (!crypto.timingSafeEqual(digest(token), digest(key))) {
        return res.status(403).json({ error: 'Token is INVALID' });
    }

    req.user = { id: Number(userId) };
    next();
};

module.exports = isReadKey;
