import Home from './components/Home';
import Login from './components/Authentication/Login';
import Register from './components/Authentication/Register';
import AccessDenied from './components/Authentication/AccessDenied';
import PostRegisterPage from './components/Authentication/PostRegisterPage';
import Dashboard from './components/Dashboard/Dashboard';
import Analyze from './components/Analyze/Analyze';
import IdeasPage from './components/Library/IdeasPage';
import TopicsPage from './components/Library/TopicsPage';
import TopicTree from './components/Topics/TopicTree';
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

    // Auth pages — redirect to /dashboard if already logged in
    { path: '/login',    element: <UnprotectedRoute><Login /></UnprotectedRoute> },
    { path: '/register', element: <UnprotectedRoute><Register /></UnprotectedRoute> },

    // Protected pages — redirect to /login if no valid token
    // requiredAccessLevel defaults to 1 (approved user)
    { path: '/dashboard', element: <ProtectedRoute><Dashboard /></ProtectedRoute> },

    // Analyze — two independent scripture panels plus a notes panel.
    // Panel positions live in the query string, e.g. /analyze?l=1.1&r=40.1
    { path: '/analyze',   element: <ProtectedRoute><Analyze /></ProtectedRoute> },

    // The two tiers above notes. Each is a list plus a form: where an idea or
    // a topic is created, edited and deleted.
    { path: '/ideas',   element: <ProtectedRoute><IdeasPage /></ProtectedRoute> },
    { path: '/topics',  element: <ProtectedRoute><TopicsPage /></ProtectedRoute> },

    // The Topic page: the three-level tree that walks topic -> idea -> note,
    // plus the two unfiled buckets. It files things; /topics creates them, so
    // the two are separate pages rather than one page with two jobs.
    { path: '/topics-tree', element: <ProtectedRoute><TopicTree /></ProtectedRoute> },

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
    { path: '/thoughts', element: <ProtectedRoute><Thoughts /></ProtectedRoute> },

    // TODO: Add more protected routes here, e.g.:
    // { path: '/jobs',          element: <ProtectedRoute><JobList /></ProtectedRoute> },
    // { path: '/jobs/:id',      element: <ProtectedRoute><JobDetail /></ProtectedRoute> },
    // { path: '/admin/users',   element: <ProtectedRoute requiredAccessLevel={2}><Users /></ProtectedRoute> },
];

export default routes;
