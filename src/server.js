const express = require('express');
const bodyParser = require('body-parser');
const dotenv = require('dotenv');
const path = require('path');
const session = require('express-session');
const cors = require('cors');

const authRoutes = require('./routes/auth');
const userRoutes = require('./routes/user');
const bookRoutes = require('./routes/books');
const chapterRoutes = require('./routes/chapter');
const noteRoutes = require('./routes/notes');
const referenceRoutes = require('./routes/references');
const ideaRoutes = require('./routes/ideas');
const topicRoutes = require('./routes/topics');
const searchRoutes = require('./routes/search');
const overviewRoutes = require('./routes/overview');
const pinRoutes = require('./routes/pins');
// TODO: Import additional route files here as you build out the app:
//   const itemRoutes = require('./routes/item');

const isAuth = require('./middleware/isAuth');
const invalidatesOverview = require('./middleware/invalidateOverview');

dotenv.config();

const app = express();

// Allow requests from the React dev server.
// In production the server serves the built React app directly, so CORS
// is only needed during development.
app.use(cors({
    origin: process.env.CLIENT_URL || 'http://localhost:3000',
    credentials: true,
}));

app.use(bodyParser.json());

// Session is used by OAuth strategies (e.g. passport-google-oauth20).
// If you're not adding OAuth, you can remove this block.
app.use(session({
    // TODO: SESSION_SECRET must be set in .env
    secret: process.env.SESSION_SECRET || 'TODO_replace_with_strong_secret',
    resave: false,
    saveUninitialized: false,
    cookie: {
        secure: process.env.NODE_ENV === 'production',
        httpOnly: true,
        maxAge: 24 * 60 * 60 * 1000,
    },
}));

// ── Public routes (no auth required) ────────────────────────────────────────
app.use('/api/auth', authRoutes);

// ── Protected routes (JWT required via isAuth middleware) ────────────────────
// All routes mounted after isAuth will require a valid Bearer token.
app.use('/api/user', isAuth, userRoutes);

// Scripture reads. The build plan fixes these paths as /api/books and
// /api/chapter/:bookId/:chapter, so each gets its own top-level mount rather
// than sharing a prefix.
app.use('/api/books', isAuth, bookRoutes);
app.use('/api/chapter', isAuth, chapterRoutes);

// Notes and their scripture anchors. A reference is addressed by its own id at
// the top level (DELETE /api/references/:id), so it gets its own mount rather
// than nesting under /api/notes.
//
// `invalidatesOverview` sits between isAuth and the router on all four of the
// content mounts below. Those four routers are the only place the six tables
// the Overview payload is built from are written, so mounting it here — rather
// than calling it from each of their ~15 write handlers — is what makes it
// impossible for a handler added in a later phase to leave the cache stale.
// See src/middleware/invalidateOverview.js.
app.use('/api/notes', isAuth, invalidatesOverview, noteRoutes);
app.use('/api/references', isAuth, invalidatesOverview, referenceRoutes);

// The two tiers above notes. Each owns its own link table endpoint —
// PUT /api/notes/:id/ideas and PUT /api/ideas/:id/topics — because a link set
// is always replaced whole, from the tier that holds the multi-select.
app.use('/api/ideas', isAuth, invalidatesOverview, ideaRoutes);
app.use('/api/topics', isAuth, invalidatesOverview, topicRoutes);

// One search across all four tiers. Its own mount rather than a query on any of
// the lists above: those answer questions about one chapter or one tier, and
// "where does this word appear at all?" is a question about the whole app.
app.use('/api/search', isAuth, searchRoutes);

// The Overview page's whole dataset in one request: every anchor point, tier
// by tier, precomputed and cached. It is invalidated by the middleware above
// rather than expiring, because the only thing that can make it wrong is a
// write the same server just handled.
app.use('/api/overview', isAuth, overviewRoutes);

// The Thoughts page's pinned set. Deliberately WITHOUT `invalidatesOverview`,
// unlike the four content mounts above: `pins` is not one of the six tables the
// Overview payload is built from, so a pin can never make that cache wrong.
// Running the middleware here would throw away a fully valid cached payload on
// every pin click — the pin toggle is the most-clicked control on the page —
// and buy nothing. If a later phase puts pinned state into the Overview
// payload, this mount joins the list above; until then it must not.
app.use('/api/pins', isAuth, pinRoutes);
// TODO: Add more protected route groups here:
//   app.use('/api/items', isAuth, itemRoutes);

// ── Serve the built React app in production ──────────────────────────────────
// During development `npm run dev` runs the React dev server separately.
app.use(express.static(path.join(__dirname, 'client/build')));

// Catch-all: send any unmatched GET to the React app so client-side routing works.
app.get('*', (req, res) => {
    res.sendFile(path.join(__dirname, 'client/build', 'index.html'));
});

// ── 404 handler ──────────────────────────────────────────────────────────────
app.use((req, res) => {
    console.error(`404: ${req.method} ${req.url}`);
    res.status(404).json({ error: 'Endpoint not found' });
});

const PORT = process.env.PORT || 3001;
app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
});
