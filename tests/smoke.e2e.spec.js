// Smoke tests across ALL games — a cheap, broad regression net for the shared
// core (common.js: ICE_CFG, rankByScore, mountScene, tvLobby). These would have
// caught the "stale common.js blanks the game" bug and the "squished QR" bug.
//
//   npx playwright test tests/smoke.e2e.spec.js
const { test, expect } = require('@playwright/test');

const GAMES = [
    'letterstorm', 'familytrivia', 'fibbers', 'doodleparty', 'oddsheep', 'herdmind',
    'categoryclash', 'bestguess', 'brokenpencil', 'moonlightvillage', 'goinggone',
    'bingo', 'liarsdice', 'cornerthemarket', 'ticktacktoe', 'rockpaperscissors', 'lastlaugh',
    'buzzin', 'plumptrek', 'kingscorner', 'blackjack', 'gofish',
];

// noise we don't care about (offline broker, missing favicon, etc.)
const IGNORE = /favicon|net::ERR|Failed to load resource|PeerJS|peerjs|ERR_INTERNET/i;

for (const g of GAMES) {
    test(`${g}: loads clean and builds its ambient scene`, async ({ page }) => {
        const errors = [];
        page.on('pageerror', e => errors.push('pageerror: ' + e.message));
        page.on('console', m => { if (m.type() === 'error' && !IGNORE.test(m.text())) errors.push('console: ' + m.text()); });

        await page.goto(`/${g}.html`, { waitUntil: 'load' });
        await page.waitForTimeout(400);

        // common.js loaded and the guarded mountScene ran → the scene exists with actors
        const info = await page.evaluate(() => ({
            hasMountScene: typeof mountScene === 'function',
            hasTvLobby: typeof tvLobby === 'function',
            hasRankByScore: typeof rankByScore === 'function',
            actors: (() => {
                const m = document.getElementById('meadow');
                return m ? m.querySelectorAll('.ewe, .cow, .bball, .walker').length : 0;
            })(),
        }));

        expect(info.hasMountScene, 'common.js mountScene is available').toBeTruthy();
        expect(info.hasTvLobby, 'common.js tvLobby is available').toBeTruthy();
        expect(info.hasRankByScore, 'common.js rankByScore is available').toBeTruthy();
        expect(info.actors, 'ambient scene built at least one actor').toBeGreaterThan(0);
        expect(errors, `no unexpected console/page errors\n${errors.join('\n')}`).toEqual([]);
    });
}

test('a stale/broken common.js must not blank a game (the guard)', async ({ page }) => {
    // serve an OLD common.js that predates mountScene/tvLobby
    await page.route('**/common.js', route => route.fulfill({
        contentType: 'application/javascript',
        body: "const ICE_CFG = { config: { iceServers: [] } };",
    }));

    const errors = [];
    page.on('pageerror', e => errors.push(e.message));
    await page.goto('/liarsdice.html', { waitUntil: 'load' });
    await page.waitForTimeout(300);

    // drive to the host lobby and confirm the game STILL rendered (not a blank #app)
    const appLen = await page.evaluate(() => {
        try {
            roomCode = 'TEST';
            if (typeof H !== 'undefined') H.players = [{ id: 'me', name: 'You', dice: [1] }];
            ui = 'lobby_h';
            render();
        } catch (e) { /* ignore */ }
        return document.getElementById('app').innerHTML.length;
    });
    expect(appLen, 'game still renders with a stale/broken common.js').toBeGreaterThan(200);
});

test('tvLobby renders a SQUARE QR (never a squished bar) on a short screen', async ({ page }) => {
    await page.setViewportSize({ width: 1200, height: 620 });   // short/wide: the shape that used to squish
    await page.goto('/herdmind.html', { waitUntil: 'load' });
    await page.waitForTimeout(300);
    const qr = await page.evaluate(() => {
        isViewer = true; isTvHost = true; roomCode = 'ZGKN';
        vD = { type: 'viewer_lobby', roomCode: 'ZGKN', players: [{ name: 'Ada', avatar: '🐄' }], tvHost: true, captain: 'Ada', settings: { target: 12 } };
        ui = 'viewer'; document.body.classList.add('viewer-mode'); render();
        const svg = document.querySelector('.cxl-qr svg');
        if (!svg) return null;
        const r = svg.getBoundingClientRect();
        return { w: Math.round(r.width), h: Math.round(r.height) };
    });
    expect(qr, 'the shared TV lobby rendered a QR').not.toBeNull();
    expect(Math.abs(qr.w - qr.h), `QR is square (${qr.w}x${qr.h})`).toBeLessThan(2);
});

// The connection-path badge: p2p.js reports which path ICE settled on, and every
// game shows it once connected — 📡 relayed, 🔗 direct (no relay needed). Can't be
// provoked on localhost, so drive it directly here; relay.e2e.spec.js does it for
// real over TURN.
test('the connection-path badge names the mechanism: relay vs STUN vs local', async ({ page }) => {
    await page.goto('/familytrivia.html', { waitUntil: 'load' });
    await expect(page.locator('#game-controls')).toBeVisible();
    await expect(page.locator('#btn-relay')).toHaveCount(0);        // not in a room yet

    await page.evaluate(() => setNetState('relay'));
    await expect(page.locator('#btn-relay')).toHaveText('📡');
    await page.locator('#btn-relay').click();
    await expect(page.locator('#relay-note')).toContainText('Relay in use');

    await page.evaluate(() => setNetState('stun'));                  // hole-punched, no relay
    await expect(page.locator('#btn-relay')).toHaveText('🌐');
    await page.locator('#btn-relay').click();                        // (closes the old note)
    await page.locator('#btn-relay').click();
    await expect(page.locator('#relay-note')).toContainText('talking directly');

    await page.evaluate(() => setNetState('local'));                 // same wifi
    await expect(page.locator('#btn-relay')).toHaveText('🏠');

    await page.evaluate(() => setNetState('none'));                  // left the room
    await expect(page.locator('#btn-relay')).toHaveCount(0);
    await expect(page.locator('#relay-note')).toHaveCount(0);
});

// The reconnect curtain is self-contained in p2p.js (no per-game markup).
test('the reconnecting curtain covers the screen and clears', async ({ page }) => {
    await page.goto('/cornerthemarket.html', { waitUntil: 'load' });
    await page.evaluate(() => p2pCurtain(true));
    await expect(page.locator('#p2p-curtain')).toContainText('Reconnecting');
    await expect(page.locator('#p2p-curtain')).toContainText('place in the game is saved');
    await page.evaluate(() => p2pCurtain(false));
    await expect(page.locator('#p2p-curtain')).toHaveCount(0);
});

// A television with an incomplete emoji font draws every glyph it lacks as an empty rectangle.
// Fire OS is the common one — Neil's Fire TV boxed the feather (added to Unicode in 2020) while
// happily playing the music. common.js owns the detector because every game paints emoji and they
// all meet the same televisions.
test('an incomplete emoji font gets stand-ins, not boxes', async ({ page }) => {
    const MISSING = ['🪙', '🪶', '🫠', '🫥', '🧐'];
    await page.addInitScript(missing => {
        const proto = CanvasRenderingContext2D.prototype, real = proto.measureText;
        proto.measureText = function (t) { return real.call(this, missing.includes(t) ? '\uFFFF' : t); };
    }, MISSING);
    await page.goto('/goinggone.html?mode=tvsimulation&players=3&rounds=1&lots=2');
    await page.waitForTimeout(2500);

    // the detector is shared, and it swapped every risky glyph for one the font has
    expect(await page.evaluate(() => typeof emojiOK)).toBe('function');
    const icons = await page.evaluate(() => ({ ...ICON }));
    for (const [name, ch] of Object.entries(icons)) {
        expect(MISSING, `${name} kept a glyph this font cannot draw`).not.toContain(ch);
    }
    // …including the ambient scene, which is common.js's own cast
    const onScreen = await page.evaluate(m => m.filter(g => document.body.innerText.includes(g)), MISSING);
    expect(onScreen, 'a tofu box reached the screen').toEqual([]);

    // and with a COMPLETE font nothing is substituted at all
    const page2 = await page.context().newPage();
    await page2.goto('/goinggone.html');
    expect(await page2.evaluate(() => ICON.coin)).toBe('🪙');
    await page2.close();
});
