import React from 'react';
import { Navigate } from 'react-router-dom';
import { jwtDecode } from 'jwt-decode';

// Wraps auth pages (login, register) so that already-logged-in users
// are redirected to the first page behind the login instead of seeing the
// form again. That page is /analyze, and it is the same destination Login
// navigates to on success — one landing page, named in both places.
const UnprotectedRoute = ({ children }) => {
    const token = localStorage.getItem('token');

    if (token) {
        try {
            const decoded = jwtDecode(token);

            // Expired or missing exp — a stale/foreign token should not redirect away from login
            if (!decoded.exp || decoded.exp * 1000 < Date.now()) {
                localStorage.removeItem('token');
                return children;
            }
        } catch {
            // Malformed token — clear it and let the user log in normally
            localStorage.removeItem('token');
            return children;
        }

        return <Navigate to="/analyze" />;
    }

    return children;
};

export default UnprotectedRoute;
