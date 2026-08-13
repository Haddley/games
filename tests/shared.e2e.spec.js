// Cross-cutting tests: the things common.js promises EVERY game, checked against every
// game, so one game quietly dropping the shared core can't go unnoticed.
//
// The per-game specs prove their own rules; this one proves the shared furniture — the
// control strip, the day/night theme, the shared name, the focus-preserving render, and
// that every attract mode actually plays itself.
//
// Run:  npx playwright test tests/shared.e2e.spec.js

const { test, expect } = require('@playwright/test');

const PHONE = { width: 390, height: 844 };
const TV = { width: 1920, height: 1080 };

const GAMES = [
    'letterstorm', 'familytrivia', 'fibbers', 'doodleparty', 'oddsheep', 'herdmind',
    'categoryclash', 'bestguess', 'brokenpencil', 'moonlightvillage', 'goinggone',
    'bingo', 'liarsdice', 'cornerthemarket', 'ticktacktoe', 'rockpaperscissors',
    'lastlaugh', 'buzzin', 'plumptrek', 'kingscorner', 'blackjack', 'gofish',
];
// noise we don't care about (offline broker, missing favicon, …)
const IGNORE = /favicon|net::ERR|Failed to load resource|PeerJS|peerjs|ERR_INTERNET/i;

// ── the control strip, on every game and the launcher ─────────────────────────
for (const g of [...GAMES, 'index']) {
    test(`${g}: the shared control strip is mounted`, async ({ page }) => {
        await page.goto(`/${g}.html`, { waitUntil: 'load' });
        await expect(page.locator('#game-controls')).toBeVisible();
        // fullscreen and day/night come from common.js; music/sound are the game's own
        await expect(page.locator('#btn-fullscreen')).toBeVisible();
        await expect(page.locator('#theme-btn')).toBeVisible();
        // and nothing is in a room yet, so no connection badge
        await expect(page.locator('#btn-relay')).toHaveCount(0);
    });
}

// ── prefs really are shared between games ─────────────────────────────────────
test('day/night: chosen in one game, honoured in another', async ({ page }) => {
    await page.goto('/bingo.html', { waitUntil: 'load' });
    const startedDark = await page.evaluate(() => !document.body.classList.contains('day'));
    expect(startedDark, 'dark is the default').toBe(true);

    await page.locator('#theme-btn').click();
    await expect.poll(() => page.evaluate(() => document.body.classList.contains('day'))).toBe(true);
    expect(await page.evaluate(() => localStorage.getItem('games-theme'))).toBe('day');

    // a completely different game, same browser → still light
    await page.goto('/plumptrek.html', { waitUntil: 'load' });
    await expect.poll(() => page.evaluate(() => document.body.classList.contains('day'))).toBe(true);

    // and back again
    await page.locator('#theme-btn').click();
    await page.goto('/fibbers.html', { waitUntil: 'load' });
    await expect.poll(() => page.evaluate(() => document.body.classList.contains('day'))).toBe(false);
});

test('your name follows you from game to game', async ({ page }) => {
    await page.goto('/herdmind.html', { waitUntil: 'load' });
    await page.locator('input[data-save-name]').first().fill('Ottoline');
    await expect.poll(() => page.evaluate(() => localStorage.getItem('games-name'))).toBe('Ottoline');

    for (const g of ['plumptrek', 'bingo', 'lastlaugh']) {
        await page.goto(`/${g}.html`, { waitUntil: 'load' });
        await expect(page.locator('input[data-save-name]').first()).toHaveValue('Ottoline', { timeout: 10_000 });
    }
});

test('every game exposes a name input wired to the shared key', async ({ page }) => {
    for (const g of GAMES) {
        await page.goto(`/${g}.html`, { waitUntil: 'load' });
        const n = await page.locator('input[data-save-name]').count();
        expect(n, `${g} has a data-save-name input`).toBeGreaterThan(0);
    }
});

// ── setHTML: a re-render must not strand the on-screen keyboard ───────────────
test('re-rendering keeps focus and the caret in the field you were typing in', async ({ page }) => {
    await page.goto('/plumptrek.html', { waitUntil: 'load' });
    const input = page.locator('input[data-save-name]').first();
    await input.click();
    await input.fill('Neil');
    await input.evaluate(el => el.setSelectionRange(2, 2));     // caret mid-word

    // force the kind of re-render a lobby update causes while you're still typing
    await page.evaluate(() => render());
    await expect.poll(() => page.evaluate(() => document.activeElement && document.activeElement.hasAttribute('data-save-name')))
        .toBe(true);
    const caret = await page.evaluate(() => document.activeElement.selectionStart);
    expect(caret, 'caret preserved across the swap').toBe(2);
    expect(await page.evaluate(() => document.activeElement.value)).toBe('Neil');
});

test('setHTML leaves focus alone when the field is gone after the swap', async ({ page }) => {
    await page.goto('/bingo.html', { waitUntil: 'load' });
    await page.locator('input[data-save-name]').first().click();
    // swap in markup with no inputs at all — must not throw, must not keep phantom focus
    await page.evaluate(() => setHTML(document.getElementById('app'), '<div class="card">nothing here</div>'));
    expect(await page.evaluate(() => document.activeElement.tagName)).not.toBe('INPUT');
    await expect(page.locator('.card')).toContainText('nothing here');
});

// ── the attract modes: every game plays itself without falling over ───────────
for (const g of GAMES) {
    test(`${g}: the self-playing demo runs clean`, async ({ browser }) => {
        const page = await browser.newPage({ viewport: TV });
        const errors = [];
        page.on('pageerror', e => errors.push('pageerror: ' + e.message));
        page.on('console', m => { if (m.type() === 'error' && !IGNORE.test(m.text())) errors.push('console: ' + m.text()); });

        await page.goto(`/${g}.html?mode=tvsimulation&players=4`, { waitUntil: 'load' });
        await page.waitForTimeout(6000);                        // let it actually play a bit

        // something is on screen, and it isn't the home screen
        const app = await page.evaluate(() => {
            const el = document.getElementById('app');
            return { len: el ? el.innerHTML.length : 0, ui: typeof ui === 'string' ? ui : '?' };
        });
        expect(app.len, `${g} rendered something`).toBeGreaterThan(200);
        expect(app.ui, `${g} left the home screen`).not.toBe('home');
        expect(errors, `${g} demo errors:\n${errors.join('\n')}`).toEqual([]);
        await page.close();
    });
}

// ── the launcher ──────────────────────────────────────────────────────────────
test('every launcher card points at a game that exists and loads', async ({ page }) => {
    await page.goto('/index.html', { waitUntil: 'load' });
    const hrefs = await page.locator('a.game').evaluateAll(as => as.map(a => a.getAttribute('href')));
    expect(hrefs.length).toBeGreaterThanOrEqual(19);
    for (const href of hrefs) {
        const res = await page.request.get('/' + href);
        expect(res.status(), `${href} loads`).toBe(200);
    }
});

test('the launcher credits its inspirations and carries the disclaimer', async ({ page }) => {
    await page.goto('/index.html', { waitUntil: 'load' });
    const inspo = await page.locator('.inspo').count();
    expect(inspo, 'the inspired games say so').toBeGreaterThanOrEqual(13);
    await expect(page.locator('.foot .tm')).toContainText('Not affiliated');
    await expect(page.locator('.foot .tm')).toContainText('trademarks');
});
