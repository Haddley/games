// E2E screenshot tour of Doodle Party.
//
// Plays a real game over PeerJS. Covers:
//   1. TV-first — captain lobby, word pick, real stroke streaming to the TV,
//      wrong guess / near-miss nudge / correct guess, turn end, podium, play again
//   2. Phone-first — host phone + TV viewer, stroke + correct guess
//
// The drawer is random, so tests look up who drew via page.evaluate on the host
// page; strokes and guesses travel the real guest→host→viewer network path.
//
// Screenshots land in screenshots/ (doodle-*.png).
//
// Run:  npm run test:e2e        (needs internet: PeerJS broker)

const { test, expect } = require('@playwright/test');
const fs = require('fs');

const PHONE = { width: 390, height: 844 };
const TV = { width: 1920, height: 1080 };
const SHOTS = 'screenshots';

function shot(page, name) {
    return page.screenshot({ path: `${SHOTS}/${name}.png` });
}

async function joinPhone(browser, code, name) {
    const p = await browser.newPage({ viewport: PHONE });
    await p.goto('/doodleparty.html?room=' + code);
    await p.locator('input[placeholder="Enter name"]').fill(name);
    await p.getByRole('button', { name: /Join with your phone/ }).click();
    return p;
}

async function drawSquiggle(page) {
    const box = await page.locator('#doodle-cv').boundingBox();
    const cx = box.x + box.width / 2, cy = box.y + box.height / 2;
    await page.mouse.move(cx - 80, cy - 40);
    await page.mouse.down();
    await page.mouse.move(cx - 20, cy + 40, { steps: 8 });
    await page.mouse.move(cx + 40, cy - 30, { steps: 8 });
    await page.mouse.move(cx + 90, cy + 20, { steps: 8 });
    await page.mouse.up();
    await page.waitForTimeout(400);   // stroke batches flush every ~120ms
}

test('TV-first: pick, stroke streaming, guesses, turn end, podium', async ({ browser }) => {
    fs.mkdirSync(SHOTS, { recursive: true });

    // ── TV creates the game ──
    const tv = await browser.newPage({ viewport: TV });
    await tv.goto('/doodleparty.html');
    await shot(tv, 'doodle-01-home');
    await tv.getByRole('button', { name: /Host the party on this screen/ }).click();
    await expect(tv.locator('.qr-side .room-code')).toBeVisible({ timeout: 30_000 });
    const code = await tv.evaluate(() => roomCode);
    expect(code).toMatch(/^[A-Z]{4}$/);

    // ── Karen (captain) and Ollie join ──
    const karen = await joinPhone(browser, code, 'Karen');
    await expect(karen.locator('text=Captain\'s Settings')).toBeVisible({ timeout: 30_000 });
    const ollie = await joinPhone(browser, code, 'Ollie');
    await expect(ollie.locator('.player-row')).toHaveCount(2, { timeout: 30_000 });
    await expect(tv.locator('.tv-pcard')).toHaveCount(2, { timeout: 15_000 });
    await shot(tv, 'doodle-02-tv-lobby');
    await shot(karen, 'doodle-03-captain-lobby');

    // ── Start (1 round default) — the drawer is random, so look them up ──
    await karen.getByRole('button', { name: /Start doodling/ }).click();
    await expect(tv.locator('text=is choosing a word')).toBeVisible({ timeout: 15_000 });
    const drawerName = await tv.evaluate(() => H.players.find(p => p.id === H.cur.drawerId).name);
    const drawer = drawerName === 'Karen' ? karen : ollie;
    const guesser = drawerName === 'Karen' ? ollie : karen;

    await expect(drawer.locator('text=Pick a secret word')).toBeVisible({ timeout: 15_000 });
    await expect(guesser.locator('text=is choosing a word')).toBeVisible({ timeout: 15_000 });
    await shot(drawer, 'doodle-04-phone-pick');

    // ── Pick the first word, then draw ──
    await drawer.locator('.word-choice .btn').first().click();
    const word = await tv.evaluate(() => H.cur.word);
    await expect(drawer.locator('#doodle-cv')).toBeVisible({ timeout: 15_000 });
    await expect(guesser.locator('#guess-inp')).toBeVisible({ timeout: 15_000 });
    await expect(tv.locator('#tv-cv')).toBeVisible({ timeout: 15_000 });

    await drawSquiggle(drawer);
    const strokeCount = await tv.evaluate(() => H.strokes.length);
    expect(strokeCount).toBeGreaterThan(0);
    await shot(drawer, 'doodle-05-phone-drawing');
    await shot(tv, 'doodle-06-tv-canvas');
    await shot(guesser, 'doodle-07-phone-guessing');

    // ── Wrong guess shows in the feed; near-miss nudges privately ──
    await guesser.locator('#guess-inp').fill('zzzz');
    await guesser.locator('#guess-inp').press('Enter');
    await expect(tv.locator('#v-feed')).toContainText('zzzz', { timeout: 10_000 });

    const nearMiss = word.slice(0, -1) + (word.endsWith('q') ? 'z' : 'q');
    await guesser.locator('#guess-inp').fill(nearMiss);
    await guesser.locator('#guess-inp').press('Enter');
    await expect(guesser.locator('#nudge')).toContainText('So close', { timeout: 10_000 });

    // ── Correct guess ends the turn (everyone guessed) ──
    await guesser.locator('#guess-inp').fill(word);
    await guesser.locator('#guess-inp').press('Enter');
    await expect(guesser.locator('text=The word was')).toBeVisible({ timeout: 15_000 });
    await expect(guesser.locator('.vword')).toHaveText(word.toUpperCase());
    await expect(tv.locator('.tv-center .word')).toHaveText(word.toUpperCase(), { timeout: 15_000 });
    await shot(tv, 'doodle-08-tv-turnend');
    await shot(guesser, 'doodle-09-phone-turnend');

    // Scores: guesser got base+bonus, drawer got 30
    const scores = await tv.evaluate(() => Object.fromEntries(H.players.map(p => [p.name, p.score])));
    expect(scores[drawerName === 'Karen' ? 'Ollie' : 'Karen']).toBeGreaterThanOrEqual(100);
    expect(scores[drawerName]).toBe(30);

    // ── Fast-forward: pretend that was the last turn → podium (auto-advance fires) ──
    await tv.evaluate(() => { H.turnPtr = H.turnList.length - 1; });
    await expect(tv.locator('.podium-wrap')).toBeVisible({ timeout: 15_000 });
    await expect(karen.locator('text=wins!')).toBeVisible({ timeout: 15_000 });
    await tv.waitForTimeout(1500);
    await shot(tv, 'doodle-10-tv-podium');
    await shot(karen, 'doodle-11-phone-podium');

    // ── Play again returns everyone to the lobby ──
    await karen.getByRole('button', { name: /Play again/ }).click();
    await expect(karen.locator('text=Captain\'s Settings')).toBeVisible({ timeout: 15_000 });
    await expect(tv.locator('.qr-side .room-code')).toBeVisible({ timeout: 15_000 });

    await Promise.all([tv, karen, ollie].map(p => p.close()));
});

test('phone-first: host phone + TV viewer, stroke + correct guess', async ({ browser }) => {
    fs.mkdirSync(SHOTS, { recursive: true });

    // ── Neil hosts on his phone ──
    const neil = await browser.newPage({ viewport: PHONE });
    await neil.goto('/doodleparty.html');
    await neil.locator('input[placeholder="Enter name"]').fill('Neil');
    await neil.getByRole('button', { name: /Host on this phone/ }).click();
    await expect(neil.locator('.room-code')).toBeVisible({ timeout: 30_000 });
    const code = await neil.evaluate(() => roomCode);
    await shot(neil, 'doodle-20-host-lobby');

    // ── TV joins as a viewer ──
    const tv = await browser.newPage({ viewport: TV });
    await tv.goto('/doodleparty.html');
    await tv.locator('input[placeholder="4-letter code"]').last().fill(code);
    await tv.getByRole('button', { name: /Open TV screen/ }).click();
    await expect(tv.locator('.qr-side .room-code')).toHaveText(code, { timeout: 30_000 });

    // ── Jess joins, Neil starts ──
    const jess = await joinPhone(browser, code, 'Jess');
    await expect(neil.locator('.player-row')).toHaveCount(2, { timeout: 30_000 });
    await neil.getByRole('button', { name: /Start doodling/ }).click();

    const drawerName = await neil.evaluate(() => H.players.find(p => p.id === H.cur.drawerId).name);
    const drawer = drawerName === 'Neil' ? neil : jess;
    const guesser = drawerName === 'Neil' ? jess : neil;
    await expect(drawer.locator('text=Pick a secret word')).toBeVisible({ timeout: 15_000 });
    await drawer.locator('.word-choice .btn').first().click();
    const word = await neil.evaluate(() => H.cur.word);

    await expect(tv.locator('#tv-cv')).toBeVisible({ timeout: 15_000 });
    await drawSquiggle(drawer);
    const strokeCount = await neil.evaluate(() => H.strokes.length);
    expect(strokeCount).toBeGreaterThan(0);
    await shot(tv, 'doodle-21-tv-viewer-canvas');

    await guesser.locator('#guess-inp').fill(word);
    await guesser.locator('#guess-inp').press('Enter');
    await expect(tv.locator('.tv-center .word')).toHaveText(word.toUpperCase(), { timeout: 15_000 });
    await shot(tv, 'doodle-22-tv-viewer-turnend');

    await Promise.all([tv, neil, jess].map(p => p.close()));
});
