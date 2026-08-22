import React from 'react';
import { useNavigate } from 'react-router-dom';
import Navbar from './Navbar';
import './Styling/Home.css';

// The public landing page — the one screen someone sees before they have an
// account, and the only one outside the app's two-accent system that has room
// to state what the app is.
//
// It says one thing and offers two doors. There is no feature list, no tour and
// no third button: everything this site does happens behind the login, so copy
// describing it here would be describing a page the reader cannot reach yet.
function Home() {
    const navigate = useNavigate();

    return (
        <div className="home">
            {/* Renders nothing without a token, which is the usual case here.
                It is kept so that arriving on / while still logged in leaves a
                way back into the app. */}
            <Navbar />

            <main className="home-panel">
                <h1 className="home-title">Study the Bible</h1>

                <div className="home-rule" aria-hidden="true" />

                <p className="home-body">I built a bible note taking website</p>
                <p className="home-signature">— Justin Shin</p>

                <div className="home-actions">
                    <button
                        type="button"
                        className="home-button home-button--primary"
                        onClick={() => navigate('/login')}
                    >
                        Log in
                    </button>
                    <button
                        type="button"
                        className="home-button home-button--secondary"
                        onClick={() => navigate('/register')}
                    >
                        Register
                    </button>
                </div>
            </main>
        </div>
    );
}

export default Home;
