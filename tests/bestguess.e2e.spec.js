// E2E screenshot tour of Best Guess.
//
// Plays a real game over PeerJS. Covers:
//   1. TV-first — captain lobby, keypad guesses, betting board, payout maths
//      (+100 author, +50/chip), podium, play again
//   2. Phone-first — host phone + TV viewer, one full round
//
// The question is forced via page.evaluate on the host (the draw is random),
// but guesses, chips and payouts all travel the real guest→host network path.
//
// Screenshots land in screenshots/ (guess-*.png).
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
    await p.goto('/bestguess.html?room=' + code);
    await p.locator('input[placeholder="Enter name"]').fill(name);
    await p.getByRole('button', { name: /Join with your phone/ }).click();
    return p;
}

// force a known question on the host page so the maths is deterministic;
// a fresh qid makes every screen re-render cleanly
function forceQuestion(hostPage, q, a, unit) {
    return hostPage.evaluate(([q, a, unit]) => {
        H.cur = { ...H.cur, qid: H.cur.qid + 'f', q, a, unit };
        H.players.forEach(p => { p.guess = null; p.bets = []; });
        broadcastPhase();
    }, [q, a, unit]);
}

async function typeGuess(page, digits) {
    for (const d of digits) await page.getByRole('button', { name: d, exact: true }).click();
    await page.getByRole('button', { name: /Lock it in/ }).click();
}

test('TV-first: guesses, betting board, payout maths, podium', async ({ browser }) => {
    fs.mkdirSync(SHOTS, { recursive: true });

    // ── TV creates the game ──
    const tv = await browser.newPage({ viewport: TV });
    await tv.goto('/bestguess.html');
    await shot(tv, 'guess-01-home');
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
    await shot(tv, 'guess-02-tv-lobby');
    await shot(karen, 'guess-03-captain-lobby');

    // Sanity-check the pure winning-slot rule
    const wins = await tv.evaluate(() => {
        const slots = [{ value: null }, { value: 150 }, { value: 300 }];
        return [winningSlot(slots, 206), winningSlot(slots, 100), winningSlot(slots, 300)];
    });
    expect(wins).toEqual([1, 0, 2]);   // closest-not-over · all-too-high · exact

    // Captain trims to 5 questions and starts
    await karen.getByRole('button', { name: '5', exact: true }).click();
    await karen.waitForTimeout(400);
    await karen.getByRole('button', { name: /Start the game/ }).click();
    await expect(tv.locator('.tv-q .qq')).toBeVisible({ timeout: 15_000 });

    // ── Force a known question: 206 bones ──
    await forceQuestion(tv, 'How many bones are in the adult human body?', 206, 'bones');
    await expect(karen.locator('text=How many bones')).toBeVisible({ timeout: 10_000 });
    await shot(tv, 'guess-04-tv-question');
    await shot(karen, 'guess-05-phone-keypad');

    // Karen guesses 150, Ollie guesses 300
    await typeGuess(karen, ['1', '5', '0']);
    await expect(karen.locator('text=Locked in: 150')).toBeVisible({ timeout: 10_000 });
    await shot(karen, 'guess-06-phone-locked');
    await typeGuess(ollie, ['3', '0', '0']);

    // ── Betting board: [ALL TOO HIGH, 150, 300] ──
    await expect(karen.locator('.slot-btn')).toHaveCount(3, { timeout: 15_000 });
    await expect(tv.locator('.slot-card')).toHaveCount(3, { timeout: 15_000 });
    await shot(tv, 'guess-07-tv-board');

    // Karen stacks both chips on her own 150 (the winner: 150 ≤ 206 < 300)
    await karen.locator('.slot-btn').nth(1).click();
    await karen.locator('.slot-btn').nth(1).click();
    await expect(karen.locator('text=All in')).toBeVisible({ timeout: 10_000 });
    await shot(karen, 'guess-08-phone-bets');
    // Ollie backs his own 300
    await ollie.locator('.slot-btn').nth(2).click();
    await ollie.locator('.slot-btn').nth(2).click();

    // ── Payout: Karen = 100 (author) + 2×50 (chips) = 200; Ollie = 0 ──
    await expect(karen.locator('.vpts')).toHaveText('+200', { timeout: 15_000 });
    await expect(karen.locator('text=Best guess +100')).toBeVisible();
    await expect(karen.locator('text=2 winning chips +100')).toBeVisible();
    await expect(ollie.locator('text=The house thanks you')).toBeVisible();
    await expect(tv.locator('.tv-answer')).toContainText('206');
    await expect(tv.locator('#vslot-1')).toHaveClass(/winner/, { timeout: 5_000 });
    await shot(tv, 'guess-09-tv-payout');
    await shot(karen, 'guess-10-phone-payout-win');
    await shot(ollie, 'guess-11-phone-payout-lose');

    // ── Fast-forward to the podium ──
    await tv.evaluate(() => { H.qIndex = H.questions.length - 1; });
    await karen.getByRole('button', { name: /Next question/ }).click();
    await expect(tv.locator('.podium-wrap')).toBeVisible({ timeout: 15_000 });
    await expect(karen.locator('text=Karen wins!')).toBeVisible({ timeout: 15_000 });
    await expect(tv.locator('.award')).toContainText(['Oracle']);
    await tv.waitForTimeout(1200);
    await shot(tv, 'guess-12-tv-podium');
    await shot(karen, 'guess-13-phone-podium');

    // ── Play again returns everyone to the lobby ──
    await karen.getByRole('button', { name: /Play again/ }).click();
    await expect(karen.locator('text=Captain\'s Settings')).toBeVisible({ timeout: 15_000 });
    await expect(tv.locator('.qr-side .room-code')).toBeVisible({ timeout: 15_000 });

    await Promise.all([tv, karen, ollie].map(p => p.close()));
});

test('phone-first: host phone + TV viewer, one full round', async ({ browser }) => {
    fs.mkdirSync(SHOTS, { recursive: true });

    // ── Neil hosts on his phone ──
    const neil = await browser.newPage({ viewport: PHONE });
    await neil.goto('/bestguess.html');
    await neil.locator('input[placeholder="Enter name"]').fill('Neil');
    await neil.getByRole('button', { name: /Host on this phone/ }).click();
    await expect(neil.locator('.room-code')).toBeVisible({ timeout: 30_000 });
    const code = await neil.evaluate(() => roomCode);
    await shot(neil, 'guess-20-host-lobby');

    // ── TV joins as the board ──
    const tv = await browser.newPage({ viewport: TV });
    await tv.goto('/bestguess.html');
    await tv.locator('input[placeholder="4-letter code"]').last().fill(code);
    await tv.getByRole('button', { name: /Open the board/ }).click();
    await expect(tv.locator('.qr-side .room-code')).toHaveText(code, { timeout: 30_000 });

    // ── Jess joins, Neil starts ──
    const jess = await joinPhone(browser, code, 'Jess');
    await expect(neil.locator('.player-row')).toHaveCount(2, { timeout: 30_000 });
    await neil.getByRole('button', { name: /Start the game/ }).click();
    await expect(tv.locator('.tv-q .qq')).toBeVisible({ timeout: 15_000 });
    await forceQuestion(neil, 'How many players are on a rugby union team?', 15, 'players');

    // Neil 10 (winner: ≤15), Jess 20
    await expect(neil.locator('text=rugby union')).toBeVisible({ timeout: 10_000 });
    await typeGuess(neil, ['1', '0']);
    await typeGuess(jess, ['2', '0']);
    await expect(neil.locator('.slot-btn')).toHaveCount(3, { timeout: 15_000 });

    await neil.locator('.slot-btn').nth(1).click();
    await neil.locator('.slot-btn').nth(1).click();
    await jess.locator('.slot-btn').nth(2).click();
    await jess.locator('.slot-btn').nth(2).click();

    await expect(neil.locator('.vpts')).toHaveText('+200', { timeout: 15_000 });
    await expect(tv.locator('.tv-answer')).toContainText('15');
    await shot(tv, 'guess-21-tv-viewer-payout');
    await shot(neil, 'guess-22-host-payout');

    await Promise.all([tv, neil, jess].map(p => p.close()));
});
