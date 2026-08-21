import { Navigate } from 'react-router-dom';

import Home from './components/Home';
import Login from './components/Authentication/Login';
import Register from './components/Authentication/Register';
import AccessDenied from './components/Authentication/AccessDenied';
import PostRegisterPage from './components/Authentication/PostRegisterPage';
import Analyze from './components/Analyze/Analyze';
import SearchPage from './components/Search/SearchPage';
import Overview from './components/Overview/Overview';
import Thoughts from './components/Thoughts/Thoughts';

import ProtectedRoute from './config/ProtectedRoute';
import UnprotectedRoute from './config/UnprotectedRoute';

// Route definitions — consumed by index.js via BrowserRouter + Routes.
// Each entry: { path: string, element: JSX }
//
// To add a new page:
//   1. Create the component under src/components/
//   2. Import it here
//   3. Add an entry to this array, wrapping with ProtectedRoute or
//      UnprotectedRoute as appropriate
const routes = [
    // Public pages
    { path: '/',              element: <Home /> },
    { path: '/access-denied', element: <AccessDenied /> },
    { path: '/post-register', element: <PostRegisterPage /> },

    // Auth pages — redirect to /analyze if already logged in
    { path: '/login',    element: <UnprotectedRoute><Login /></UnprotectedRoute> },
    { path: '/register', element: <UnprotectedRoute><Register /></UnprotectedRoute> },

    // Protected pages — redirect to /login if no valid token
    // requiredAccessLevel defaults to 1 (approved user)

    // Analyze — two independent scripture panels plus a notes panel, and the
    // page a login lands on. There was a /dashboard between the two: a page
    // that printed the JWT's email and a "Quick Links" placeholder, so every
    // session began with a click through it to get to the work. Reading is the
    // work, so the login goes straight here.
    // Panel positions live in the query string, e.g. /analyze?l=1.1&r=40.1
    { path: '/analyze',   element: <ProtectedRoute><Analyze /></ProtectedRoute> },

    // One box across all four tiers. A page rather than a Navbar dropdown:
    // the results are four groups of links wanting a page's width, and the
    // Navbar is shown on /analyze too, where the room is spoken for.
    { path: '/search', element: <ProtectedRoute><SearchPage /></ProtectedRoute> },

    // The whole canon on one axis: book and chapter ticks, pan and zoom, and
    // three rails carrying the same references grouped by note, by idea and by
    // topic. Which rails are drawn and which topic the diagram is restricted to
    // live in the query string, e.g. /overview?tiers=notes,topics&topicId=3
    { path: '/overview', element: <ProtectedRoute><Overview /></ProtectedRoute> },

    // The topic -> idea -> note hierarchy as one canvas: topic cards that fan
    // their ideas out on hover, an idea centred with its notes orbiting it, and
    // the pinned panel beside them where anything pinned is edited. Which of
    // the two views is showing lives in the query string, e.g. /thoughts?idea=7
    //
    // It replaced /ideas, /topics and /topics-tree, which were three pages over
    // the same two tiers — one to create, one to file, one to read. The server
    // routes they ran on are unchanged and this page runs on them.
    { path: '/thoughts', element: <ProtectedRoute><Thoughts /></ProtectedRoute> },

    // Anything else, including /dashboard — the page that used to sit between
    // the login and the work. Without this the router matches nothing and
    // renders an empty document, so a stale bookmark or a typo is a white
    // screen with no way out of it. `replace` keeps the dead URL from sitting
    // in history where Back would land on it again.
    { path: '*', element: <Navigate to="/" replace /> },

    // TODO: Add more protected routes here, e.g.:
    // { path: '/jobs',          element: <ProtectedRoute><JobList /></ProtectedRoute> },
    // { path: '/jobs/:id',      element: <ProtectedRoute><JobDetail /></ProtectedRoute> },
    // { path: '/admin/users',   element: <ProtectedRoute requiredAccessLevel={2}><Users /></ProtectedRoute> },
];

export default routes;
