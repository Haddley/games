// E2E screenshot tour of Fibbers! (bluff trivia).
//
// Plays a real game over PeerJS:
//   1. TV-first — captain lobby, truth-match bonus (+50), real lie/vote round,
//      reveal theatre, podium, play again
//   2. Phone-first — host phone + TV viewer, full lie→vote→reveal round
//
// The truth is read via page.evaluate on the host page (questions are drawn
// randomly), but all lies and votes travel the real guest→host network path.
//
// Screenshots land in screenshots/ (fibbers-*.png).
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
    await p.goto('/fibbers.html?room=' + code);
    await p.locator('input[placeholder="Enter name"]').fill(name);
    await p.getByRole('button', { name: /Join with your phone/ }).click();
    return p;
}

test('TV-first: truth bonus, lies, votes, reveal theatre, podium', async ({ browser }) => {
    fs.mkdirSync(SHOTS, { recursive: true });

    // ── TV creates the game ──
    const tv = await browser.newPage({ viewport: TV });
    await tv.goto('/fibbers.html');
    await shot(tv, 'fibbers-01-home');
    await tv.getByRole('button', { name: /Create the game on this screen/ }).click();
    await expect(tv.locator('.qr-side .room-code')).toBeVisible({ timeout: 30_000 });
    const code = await tv.evaluate(() => roomCode);
    expect(code).toMatch(/^[A-Z]{4}$/);

    // ── Karen (captain) and Ollie join ──
    const karen = await joinPhone(browser, code, 'Karen');
    await expect(karen.locator('text=Captain\'s Settings')).toBeVisible({ timeout: 30_000 });
    const ollie = await joinPhone(browser, code, 'Ollie');
    await expect(ollie.locator('.player-row')).toHaveCount(2, { timeout: 30_000 });
    await expect(tv.locator('.tv-pcard')).toHaveCount(2, { timeout: 15_000 });
    await shot(tv, 'fibbers-02-tv-lobby');
    await shot(karen, 'fibbers-03-captain-lobby');

    // Captain picks a 5-question game and starts
    await karen.getByRole('button', { name: '5', exact: true }).click();
    await karen.waitForTimeout(400);
    await karen.getByRole('button', { name: /Start fibbing/ }).click();

    // ── LIE phase ──
    await expect(karen.locator('#lie-input')).toBeVisible({ timeout: 15_000 });
    await expect(tv.locator('.tv-qcard .q')).toBeVisible({ timeout: 15_000 });
    await shot(tv, 'fibbers-04-tv-lie-phase');
    await shot(karen, 'fibbers-05-phone-lie-input');

    const truth = await tv.evaluate(() => H.cur.a);

    // Karen accidentally writes the truth → +50 bonus, must write a decoy
    await karen.locator('#lie-input').fill(truth);
    await karen.getByRole('button', { name: /Lock in my lie/ }).click();
    await expect(karen.locator('.truth-banner')).toBeVisible({ timeout: 10_000 });
    await shot(karen, 'fibbers-06-phone-truth-bonus');
    await karen.locator('#lie-input').fill('a suspicious decoy');
    await karen.getByRole('button', { name: /Lock in my lie/ }).click();
    await expect(karen.locator('.lie-note')).toBeVisible({ timeout: 10_000 });

    // Ollie writes an honest lie
    await ollie.locator('#lie-input').fill('obvious nonsense');
    await ollie.getByRole('button', { name: /Lock in my lie/ }).click();

    // ── VOTE phase (starts early once all lies are in) ──
    await expect(karen.locator('.wall-card')).toHaveCount(3, { timeout: 15_000 });
    await expect(tv.locator('.tv-lie')).toHaveCount(3, { timeout: 15_000 });
    // Karen's own lie is disabled on her phone
    await expect(karen.locator('.wall-card.mine')).toContainText('a suspicious decoy');
    await shot(tv, 'fibbers-07-tv-answer-wall');
    await shot(karen, 'fibbers-08-phone-vote');

    // Karen votes the truth; Ollie falls for Karen's lie
    await karen.locator('.wall-card', { hasText: truth }).click();
    await expect(karen.locator('.wall-card.picked')).toBeVisible({ timeout: 10_000 });
    await ollie.locator('.wall-card', { hasText: 'a suspicious decoy' }).click();

    // ── Reveal: Karen = 100 truth + 50 bonus + 60 fool = +210 ──
    await expect(karen.locator('text=You found the truth!')).toBeVisible({ timeout: 15_000 });
    await expect(karen.locator('.vpts')).toHaveText('+210');
    await expect(ollie.locator('text=Fooled by Karen')).toBeVisible({ timeout: 15_000 });
    // TV theatre flips lies first, truth last (~2.6s per card)
    await expect(tv.locator('.tv-lie.is-truth:not(.hidden-card)')).toBeVisible({ timeout: 15_000 });
    await tv.waitForTimeout(600);
    await shot(tv, 'fibbers-09-tv-reveal-theatre');
    await shot(karen, 'fibbers-10-phone-reveal-win');
    await shot(ollie, 'fibbers-11-phone-reveal-fooled');

    // ── Fast-forward: pretend that was the last question → podium ──
    await tv.evaluate(() => { H.qIndex = H.questions.length - 1; });
    await karen.getByRole('button', { name: /Next question/ }).click();
    await expect(tv.locator('.podium-wrap')).toBeVisible({ timeout: 15_000 });
    await expect(karen.locator('text=Karen wins!')).toBeVisible({ timeout: 15_000 });
    await tv.waitForTimeout(1500); // pods pop in staggered
    await shot(tv, 'fibbers-12-tv-podium');
    await shot(karen, 'fibbers-13-phone-podium');

    // ── Play again returns everyone to the lobby ──
    await karen.getByRole('button', { name: /Play again/ }).click();
    await expect(karen.locator('text=Captain\'s Settings')).toBeVisible({ timeout: 15_000 });
    await expect(tv.locator('.qr-side .room-code')).toBeVisible({ timeout: 15_000 });

    await Promise.all([tv, karen, ollie].map(p => p.close()));
});

test('phone-first: host phone + TV viewer, full round', async ({ browser }) => {
    fs.mkdirSync(SHOTS, { recursive: true });

    // ── Neil hosts on his phone ──
    const neil = await browser.newPage({ viewport: PHONE });
    await neil.goto('/fibbers.html');
    await neil.locator('input[placeholder="Enter name"]').fill('Neil');
    await neil.getByRole('button', { name: /Host on this phone/ }).click();
    await expect(neil.locator('.room-code')).toBeVisible({ timeout: 30_000 });
    const code = await neil.evaluate(() => roomCode);
    await shot(neil, 'fibbers-20-host-lobby');

    // ── TV joins as viewer ──
    const tv = await browser.newPage({ viewport: TV });
    await tv.goto('/fibbers.html');
    await tv.locator('input[placeholder="4-letter code"]').last().fill(code);
    await tv.getByRole('button', { name: /Open TV screen/ }).click();
    await expect(tv.locator('.qr-side .room-code')).toHaveText(code, { timeout: 30_000 });

    // ── Jess joins, Neil starts ──
    const jess = await joinPhone(browser, code, 'Jess');
    await expect(neil.locator('.player-row')).toHaveCount(2, { timeout: 30_000 });
    await neil.getByRole('button', { name: /Start fibbing/ }).click();

    await expect(neil.locator('#lie-input')).toBeVisible({ timeout: 15_000 });
    await expect(tv.locator('.tv-qcard .q')).toBeVisible({ timeout: 15_000 });

    // Both submit lies through the real path (host's own lie goes direct)
    await neil.locator('#lie-input').fill('a cunning fib');
    await neil.getByRole('button', { name: /Lock in my lie/ }).click();
    await jess.locator('#lie-input').fill('a tall tale');
    await jess.getByRole('button', { name: /Lock in my lie/ }).click();

    // Vote: each falls for the other's lie
    await expect(neil.locator('.wall-card')).toHaveCount(3, { timeout: 15_000 });
    await neil.locator('.wall-card', { hasText: 'a tall tale' }).click();
    await jess.locator('.wall-card', { hasText: 'a cunning fib' }).click();

    // Reveal: both fooled each other → +60 each
    await expect(neil.locator('text=Fooled by Jess')).toBeVisible({ timeout: 15_000 });
    await expect(neil.locator('.vpts')).toHaveText('+60');
    await expect(tv.locator('.tv-lie.is-truth:not(.hidden-card)')).toBeVisible({ timeout: 15_000 });
    await shot(tv, 'fibbers-21-tv-viewer-reveal');
    await shot(neil, 'fibbers-22-host-reveal');

    await Promise.all([tv, neil, jess].map(p => p.close()));
});
