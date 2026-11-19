import React, { useState } from 'react';
import Navbar from '../Navbar';
import ConfirmButton from '../Thoughts/ConfirmButton';
import useApiKeys from './useApiKeys';
import '../Styling/Thoughts.css';
import '../Styling/Settings.css';

const formatDate = (iso) => (iso ? new Date(iso).toLocaleDateString() : null);

// /settings — make and revoke the keys your own AI writes scrolls with.
const Settings = () => {
    const { keys, isLoading, error, newKey, create, revoke, dismissNewKey } = useApiKeys();
    const [name, setName] = useState('');
    const [hasCopied, setHasCopied] = useState(false);

    const handleSubmit = async (event) => {
        event.preventDefault();
        if (!name.trim()) return;
        await create(name);
        setName('');
    };

    const handleCopy = async () => {
        await navigator.clipboard.writeText(newKey.secret);
        setHasCopied(true);
    };

    const handleDismiss = () => {
        setHasCopied(false);
        dismissNewKey();
    };

    return (
        <div className="settings-page">
            <Navbar />
            <main className="settings-main">
                <h1 className="settings-title">Settings</h1>

                <section className="settings-card">
                    <h2 className="settings-heading">API keys</h2>
                    <p className="settings-note">
                        A key lets your own AI write scrolls for you. Make one per tool, and revoke it when you stop using it.
                    </p>

                    <form className="settings-form" onSubmit={handleSubmit}>
                        <label className="settings-label" htmlFor="key-name">Key name</label>
                        <input
                            id="key-name"
                            className="settings-input"
                            value={name}
                            maxLength={60}
                            onChange={(event) => setName(event.target.value)}
                            placeholder="e.g. My GPT"
                            autoComplete="off"
                        />
                        <button type="submit" className="settings-button" disabled={!name.trim()}>Create</button>
                    </form>

                    {error && <p className="settings-error" role="alert">{error}</p>}

                    {newKey && (
                        <div className="settings-secret" role="status">
                            <p className="settings-secret-title">Key “{newKey.name}” created</p>
                            <code className="settings-secret-value">{newKey.secret}</code>
                            <p className="settings-secret-warning">Copy it now. You will not see this again.</p>
                            <div className="settings-secret-actions">
                                <button type="button" className="settings-button" onClick={handleCopy}>
                                    {hasCopied ? 'Copied' : 'Copy'}
                                </button>
                                <button type="button" className="settings-button settings-button--quiet" onClick={handleDismiss}>
                                    Done
                                </button>
                            </div>
                        </div>
                    )}

                    {isLoading && <p className="settings-note">Loading…</p>}
                    {!isLoading && keys.length === 0 && <p className="settings-note">You have no keys yet.</p>}

                    <ul className="settings-keys">
                        {keys.map((key) => (
                            <li key={key.id} className="settings-key">
                                <div className="settings-key-info">
                                    <span className="settings-key-name">{key.name}</span>
                                    <span className="settings-key-meta">
                                        …{key.hint} · created {formatDate(key.createdAt)} ·{' '}
                                        {key.lastUsedAt ? `last used ${formatDate(key.lastUsedAt)}` : 'never used'}
                                    </span>
                                </div>
                                <ConfirmButton
                                    label="Revoke"
                                    question={`Revoke ${key.name}?`}
                                    confirmLabel="Revoke key"
                                    onConfirm={() => revoke(key.id)}
                                />
                            </li>
                        ))}
                    </ul>
                </section>
            </main>
        </div>
    );
};

export default Settings;
