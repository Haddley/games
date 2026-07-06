// E2E screenshot tour of Family Trivia.
//
// Plays a real game over PeerJS. Covers both hosting modes:
//   1. TV-first — the TV creates the room, the first phone becomes 👑 Captain
//   2. Phone-first — a phone hosts, the TV joins as a viewer
//   3. Solo host with no TV — the story falls back to the phone screen
//
// Screenshots land in screenshots/ (ft-*.png) — eyeball them per screen.
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
    await p.goto('/familytrivia.html?room=' + code);
    await p.locator('input[placeholder="Enter name"]').fill(name);
    await p.getByRole('button', { name: /Join with your phone/ }).click();
    return p;
}

test('TV-first: captain runs the game — story, question, lone wolf reveal, podium', async ({ browser }) => {
    fs.mkdirSync(SHOTS, { recursive: true });

    // ── TV creates the room ──
    const tv = await browser.newPage({ viewport: TV });
    await tv.goto('/familytrivia.html');
    await shot(tv, 'ft-01-home');
    await tv.getByRole('button', { name: /Create the game on this screen/ }).click();
    await expect(tv.locator('.qr-side .room-code')).toBeVisible({ timeout: 30_000 });
    const code = await tv.evaluate(() => roomCode);
    expect(code).toMatch(/^[A-Z]{4}$/);

    // ── First phone in becomes captain ──
    const karen = await joinPhone(browser, code, 'Karen');
    await expect(karen.locator('text=Captain\'s Settings')).toBeVisible({ timeout: 30_000 });
    const ollie = await joinPhone(browser, code, 'Ollie');
    await expect(ollie.locator('.player-row')).toHaveCount(2, { timeout: 30_000 });
    await expect(tv.locator('.tv-pcard')).toHaveCount(2, { timeout: 15_000 });
    await shot(tv, 'ft-02-tv-lobby');
    await shot(karen, 'ft-03-captain-lobby');
    await shot(ollie, 'ft-04-guest-lobby');

    // Captain trims the game to 5 questions
    await karen.getByRole('button', { name: '5', exact: true }).click();
    await karen.waitForTimeout(400);

    // ── Start: story shows on the TV, phones say eyes-up ──
    await karen.getByRole('button', { name: /Start the game/ }).click();
    await expect(tv.locator('#st-text')).toBeVisible({ timeout: 15_000 });
    await expect(ollie.locator('text=Eyes on the TV!')).toBeVisible({ timeout: 15_000 });
    await tv.waitForTimeout(2500); // let the typewriter get going
    await shot(tv, 'ft-05-tv-story');
    await shot(ollie, 'ft-06-phone-story');

    // ── Captain skips ahead to the question ──
    await karen.getByRole('button', { name: /Ask the question now/ }).click();
    await expect(karen.locator('.ans-grid .ans').first()).toBeVisible({ timeout: 15_000 });
    await expect(tv.locator('.tv-ans').first()).toBeVisible({ timeout: 15_000 });
    await shot(tv, 'ft-07-tv-question');
    await shot(karen, 'ft-08-phone-question');

    // Karen alone gets it right → 🐺 LONE WOLF (100 × 2/1 = 200 pts)
    const correct = await tv.evaluate(() => H.cur.answer);
    const nChoices = await tv.evaluate(() => H.cur.choices.length);
    await karen.locator('.ans-grid .ans').nth(correct).click();
    await expect(karen.locator('.locked-note')).toBeVisible({ timeout: 10_000 });
    await shot(karen, 'ft-09-phone-locked');
    await ollie.locator('.ans-grid .ans').nth((correct + 1) % nChoices).click();

    // ── Reveal (question ends early once everyone locks in) ──
    await expect(karen.locator('text=Correct!')).toBeVisible({ timeout: 15_000 });
    await expect(karen.locator('text=LONE WOLF')).toBeVisible();
    await expect(karen.locator('.vpts')).toHaveText('+200');
    await expect(ollie.locator('text=Not this time')).toBeVisible();
    await expect(tv.locator('.tally-row')).toHaveCount(nChoices, { timeout: 15_000 });
    await tv.waitForTimeout(1200); // tally bars animate in
    await shot(tv, 'ft-10-tv-reveal');
    await shot(karen, 'ft-11-phone-reveal-right');
    await shot(ollie, 'ft-12-phone-reveal-wrong');

    // ── Fast-forward to the podium: pretend this was the last question ──
    await tv.evaluate(() => { H.qIndex = H.questions.length - 1; });
    await karen.getByRole('button', { name: /Next story/ }).click();
    await expect(tv.locator('.podium-wrap')).toBeVisible({ timeout: 15_000 });
    await expect(karen.locator('text=Karen wins!')).toBeVisible({ timeout: 15_000 });
    await tv.waitForTimeout(1500); // pods pop in staggered
    await shot(tv, 'ft-13-tv-podium');
    await shot(karen, 'ft-14-phone-podium');

    // ── Play again returns everyone to the lobby ──
    await karen.getByRole('button', { name: /Play again/ }).click();
    await expect(karen.locator('text=Captain\'s Settings')).toBeVisible({ timeout: 15_000 });
    await expect(tv.locator('.qr-side .room-code')).toBeVisible({ timeout: 15_000 });

    await Promise.all([tv, karen, ollie].map(p => p.close()));
});

test('phone-first: host phone + TV viewer, everyone right → With the Flock', async ({ browser }) => {
    fs.mkdirSync(SHOTS, { recursive: true });

    // ── Neil hosts on his phone ──
    const neil = await browser.newPage({ viewport: PHONE });
    await neil.goto('/familytrivia.html');
    await neil.locator('input[placeholder="Enter name"]').fill('Neil');
    await neil.getByRole('button', { name: /Host on this phone/ }).click();
    await expect(neil.locator('.room-code')).toBeVisible({ timeout: 30_000 });
    const code = await neil.evaluate(() => roomCode);
    await shot(neil, 'ft-20-host-lobby');

    // ── TV joins as a viewer ──
    const tv = await browser.newPage({ viewport: TV });
    await tv.goto('/familytrivia.html');
    await tv.locator('input[placeholder="4-letter code"]').last().fill(code);
    await tv.getByRole('button', { name: /Open TV screen/ }).click();
    await expect(tv.locator('.qr-side .room-code')).toHaveText(code, { timeout: 30_000 });

    // ── Jess joins ──
    const jess = await joinPhone(browser, code, 'Jess');
    await expect(neil.locator('.player-row')).toHaveCount(2, { timeout: 30_000 });

    // ── Start; the host phone also shows eyes-up because a TV is connected ──
    await neil.getByRole('button', { name: /Start the game/ }).click();
    await expect(tv.locator('#st-text')).toBeVisible({ timeout: 15_000 });
    await expect(neil.locator('text=Eyes on the TV!')).toBeVisible({ timeout: 15_000 });

    await neil.getByRole('button', { name: /Ask the question now/ }).click();
    await expect(neil.locator('.ans-grid .ans').first()).toBeVisible({ timeout: 15_000 });

    // Both answer correctly → 🐑 With the Flock, 100 pts each
    const correct = await neil.evaluate(() => H.cur.answer);
    await neil.locator('.ans-grid .ans').nth(correct).click();
    await jess.locator('.ans-grid .ans').nth(correct).click();
    await expect(neil.locator('text=With the Flock')).toBeVisible({ timeout: 15_000 });
    await expect(jess.locator('.vpts')).toHaveText('+100');
    await shot(tv, 'ft-21-tv-reveal-flock');
    await shot(neil, 'ft-22-host-reveal');

    await Promise.all([tv, neil, jess].map(p => p.close()));
});

test('solo host, no TV connected: the story shows on the phone', async ({ browser }) => {
    fs.mkdirSync(SHOTS, { recursive: true });

    const solo = await browser.newPage({ viewport: PHONE });
    await solo.goto('/familytrivia.html');
    await solo.locator('input[placeholder="Enter name"]').fill('Archie');
    await solo.getByRole('button', { name: /Host on this phone/ }).click();
    await expect(solo.locator('.room-code')).toBeVisible({ timeout: 30_000 });

    await solo.getByRole('button', { name: /Start the game/ }).click();
    await expect(solo.locator('.story-paper .st-text')).toBeVisible({ timeout: 15_000 });
    await shot(solo, 'ft-30-phone-story-fallback');

    await solo.close();
});
