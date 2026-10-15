const fs = require('fs');
const path = require('path');

const PUBLIC_DIR = path.join(__dirname, '..', 'public');
const GROUND_DEEP = '#0f131b';

const manifest = JSON.parse(
    fs.readFileSync(path.join(PUBLIC_DIR, 'manifest.json'), 'utf8')
);
const html = fs.readFileSync(path.join(PUBLIC_DIR, 'index.html'), 'utf8');

const tags = (name) => html.match(new RegExp(`<${name}\\b[^>]*>`, 'g')) || [];
const attr = (tag, name) => {
    const m = tag.match(new RegExp(`\\s${name}="([^"]*)"`));
    return m ? m[1] : undefined;
};
const metaContent = (name) => {
    const tag = tags('meta').find((t) => attr(t, 'name') === name);
    return tag && attr(tag, 'content');
};
const linkHref = (rel) => {
    const tag = tags('link').find((t) => attr(t, 'rel') === rel);
    return tag && attr(tag, 'href');
};

describe('manifest.json', () => {
    it('installs as a standalone app named OriginalShins opening on /analyze', () => {
        expect(manifest.name).toBe('OriginalShins');
        expect(manifest.short_name).toBe('OriginalShins');
        expect(manifest.start_url).toBe('/analyze');
        expect(manifest.scope).toBe('/');
        expect(manifest.display).toBe('standalone');
        expect(manifest.theme_color).toBe(GROUND_DEEP);
        expect(manifest.background_color).toBe(GROUND_DEEP);
    });

    it('lists exactly the 192 and 512 icons', () => {
        expect(manifest.icons).toEqual([
            { src: 'icon-192.png', sizes: '192x192', type: 'image/png' },
            { src: 'icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
        ]);
    });
});

describe('index.html', () => {
    it('links the favicon, touch icon and manifest', () => {
        expect(linkHref('icon')).toBe('%PUBLIC_URL%/favicon.png');
        expect(linkHref('apple-touch-icon')).toBe('%PUBLIC_URL%/apple-touch-icon.png');
        expect(linkHref('manifest')).toBe('%PUBLIC_URL%/manifest.json');
    });

    it('asks iOS for a standalone, translucent-status-bar app', () => {
        expect(metaContent('apple-mobile-web-app-capable')).toBe('yes');
        expect(metaContent('mobile-web-app-capable')).toBe('yes');
        expect(metaContent('apple-mobile-web-app-status-bar-style')).toBe('black-translucent');
        expect(metaContent('apple-mobile-web-app-title')).toBe('OriginalShins');
        expect(metaContent('theme-color')).toBe(GROUND_DEEP);
    });

    it('extends the viewport under the notch', () => {
        expect(metaContent('viewport')).toContain('viewport-fit=cover');
    });
});

describe('icon files', () => {
    it('exist in public/ for every icon either file names', () => {
        const names = [
            ...manifest.icons.map((i) => i.src),
            linkHref('icon'),
            linkHref('apple-touch-icon'),
        ].map((p) => p.replace('%PUBLIC_URL%/', ''));

        expect(names.length).toBe(4);
        names.forEach((name) => {
            expect(fs.existsSync(path.join(PUBLIC_DIR, name))).toBe(true);
        });
    });
});
