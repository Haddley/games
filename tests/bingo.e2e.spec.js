// E2E screenshot tour of Full House Bingo.
//
// Plays a real game over PeerJS. Covers:
//   1. TV-first — captain lobby, forced deterministic calls, tap-daub, LINE claim,
//      false-call lockout, FULL HOUSE → results, New game
//   2. Phone-first — host phone + TV flashboard viewer, auto-daub toggle
//
// The call order and claims go through the real network path; page.evaluate on the
// HOST page only pauses the caller and forces deterministic ball order.
//
// Screenshots land in screenshots/ (bingo-*.png).
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
    await p.goto('/bingo.html?room=' + code);
    await p.locator('input[placeholder="Enter name"]').fill(name);
    await p.getByRole('button', { name: /Join with your phone/ }).click();
    return p;
}

// Force-call specific numbers on the host page (bypasses pause/hold)
function forceCalls(hostPage, nums) {
    return hostPage.evaluate((ns) => {
        H.callOrder = [...H.called, ...ns, ...H.callOrder.filter(n => !H.called.includes(n) && !ns.includes(n))];
        for (let i = 0; i < ns.length; i++) hostCallNext(true);
    }, nums);
}

test('TV-first: daub a line, false call locks out, full house wins', async ({ browser }) => {
    fs.mkdirSync(SHOTS, { recursive: true });

    // ── TV runs the bingo hall ──
    const tv = await browser.newPage({ viewport: TV });
    await tv.goto('/bingo.html');
    await shot(tv, 'bingo-01-home');
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
    await shot(tv, 'bingo-02-tv-lobby');
    await shot(karen, 'bingo-03-captain-lobby');

    // ── Eyes down — then immediately pause the caller for deterministic play ──
    await karen.getByRole('button', { name: /Eyes down/ }).click();
    await expect(karen.locator('.ticket .cell').first()).toBeVisible({ timeout: 15_000 });
    await tv.evaluate(() => { H.paused = true; });
    await expect(tv.locator('.flashboard')).toBeVisible({ timeout: 15_000 });
    await shot(tv, 'bingo-04-tv-eyes-down');
    await shot(karen, 'bingo-05-phone-ticket');

    // ── Call exactly Karen's top row, she daubs it ──
    const kTicket = await tv.evaluate(() => H.players.find(p => p.name === 'Karen').ticket);
    const row0 = kTicket[0].filter(n => n !== null);
    expect(row0).toHaveLength(5);
    await forceCalls(tv, row0);
    await expect(karen.locator('#ballstrip')).toContainText('Ball 5/90', { timeout: 10_000 });
    for (const n of row0) await karen.locator(`.cell[data-n="${n}"]`).click();
    await shot(karen, 'bingo-06-phone-daubed-row');

    // ── BINGO → LINE ──
    await karen.locator('#bingo-btn').click();
    await expect(tv.locator('#v-event')).toContainText('LINE!', { timeout: 10_000 });
    await expect(tv.locator('#v-event')).toContainText('Karen');
    await shot(tv, 'bingo-07-tv-line');
    await expect(karen.locator('#p-prizes')).toContainText('LINE ✓ Karen', { timeout: 10_000 });

    // ── Ollie mashes BINGO with nothing — false call, locked 3 balls ──
    await ollie.locator('#bingo-btn').click();
    await expect(tv.locator('#v-event')).toContainText('OOH, NO!', { timeout: 10_000 });
    await expect(ollie.locator('#bingo-btn')).toBeDisabled({ timeout: 10_000 });
    await expect(ollie.locator('#bingo-btn')).toContainText('WAIT 3 BALLS');
    await shot(ollie, 'bingo-08-phone-locked');

    // ── Call the rest of Karen's ticket → FULL HOUSE (line + house = 4 pts) ──
    const rest = kTicket.flat().filter(n => n !== null && !row0.includes(n));
    expect(rest).toHaveLength(10);
    await forceCalls(tv, rest);
    for (const n of rest) await karen.locator(`.cell[data-n="${n}"]`).click();
    await karen.locator('#bingo-btn').click();

    await expect(karen.locator('text=FULL HOUSE — Karen!')).toBeVisible({ timeout: 10_000 });
    await expect(tv.locator('.tv-results .big')).toContainText('FULL HOUSE', { timeout: 10_000 });
    await expect(karen.locator('.card.highlight')).toContainText('line +1, house +3');
    // session tally: Karen 4 points
    const karenScore = await tv.evaluate(() => H.players.find(p => p.name === 'Karen').score);
    expect(karenScore).toBe(4);
    await tv.waitForTimeout(1200);
    await shot(tv, 'bingo-09-tv-results');
    await shot(karen, 'bingo-10-phone-results');

    // ── New game deals fresh tickets, tally survives ──
    await karen.getByRole('button', { name: /New game/ }).click();
    await expect(karen.locator('#ballstrip')).toContainText('Ball 0/90', { timeout: 15_000 });
    await expect(tv.locator('.flashboard')).toBeVisible({ timeout: 15_000 });
    const scoreAfter = await tv.evaluate(() => H.players.find(p => p.name === 'Karen').score);
    expect(scoreAfter).toBe(4);

    await Promise.all([tv, karen, ollie].map(p => p.close()));
});

test('phone-first: TV flashboard viewer + auto-daub for little kids', async ({ browser }) => {
    fs.mkdirSync(SHOTS, { recursive: true });

    // ── Neil hosts on his phone ──
    const neil = await browser.newPage({ viewport: PHONE });
    await neil.goto('/bingo.html');
    await neil.locator('input[placeholder="Enter name"]').fill('Neil');
    await neil.getByRole('button', { name: /Host on this phone/ }).click();
    await expect(neil.locator('.room-code')).toBeVisible({ timeout: 30_000 });
    const code = await neil.evaluate(() => roomCode);
    await shot(neil, 'bingo-20-host-lobby');

    // ── TV joins as the flashboard ──
    const tv = await browser.newPage({ viewport: TV });
    await tv.goto('/bingo.html');
    await tv.locator('input[placeholder="4-letter code"]').last().fill(code);
    await tv.getByRole('button', { name: /Open the flashboard/ }).click();
    await expect(tv.locator('.qr-side .room-code')).toHaveText(code, { timeout: 30_000 });

    // ── Jess joins, Neil starts, caller paused for determinism ──
    const jess = await joinPhone(browser, code, 'Jess');
    await expect(neil.locator('.player-row')).toHaveCount(2, { timeout: 30_000 });
    await neil.getByRole('button', { name: /Eyes down/ }).click();
    await expect(neil.locator('.ticket .cell').first()).toBeVisible({ timeout: 15_000 });
    await neil.evaluate(() => { H.paused = true; });

    // ── Three forced calls light the flashboard ──
    const jTicket = await neil.evaluate(() => H.players.find(p => p.name === 'Jess').ticket);
    const jNums = jTicket.flat().filter(n => n !== null);
    await forceCalls(neil, jNums.slice(0, 3));
    await expect(tv.locator('.bcell.lit')).toHaveCount(3, { timeout: 10_000 });
    await expect(neil.locator('#ballstrip')).toContainText('Ball 3/90');

    // ── Jess flips auto-daub: her called numbers mark themselves ──
    await jess.locator('.toggle-row input').check();
    for (const n of jNums.slice(0, 3))
        await expect(jess.locator(`.cell[data-n="${n}"]`)).toHaveClass(/daub/, { timeout: 10_000 });
    await shot(tv, 'bingo-21-tv-flashboard');
    await shot(jess, 'bingo-22-phone-autodaub');

    await Promise.all([tv, neil, jess].map(p => p.close()));
});
