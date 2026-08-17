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
    await tv.getByRole('button', { name: /Host the party on this TV/ }).click();
    await expect(tv.locator('.cxl-code')).toBeVisible({ timeout: 30_000 });
    const code = await tv.evaluate(() => roomCode);
    expect(code).toMatch(/^[A-Z]{4}$/);

    // ── Karen (captain) and Ollie join ──
    const karen = await joinPhone(browser, code, 'Karen');
    await expect(karen.locator('text=Captain\'s Settings')).toBeVisible({ timeout: 30_000 });
    const ollie = await joinPhone(browser, code, 'Ollie');
    await expect(ollie.locator('.player-row')).toHaveCount(2, { timeout: 30_000 });
    await expect(tv.locator('.cxl-chip')).toHaveCount(2, { timeout: 15_000 });
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
    await neil.getByRole('button', { name: /Host & play on this phone/ }).click();
    await expect(neil.locator('.room-code')).toBeVisible({ timeout: 30_000 });
    const code = await neil.evaluate(() => roomCode);
    await shot(neil, 'bingo-20-host-lobby');

    // ── TV joins as the flashboard ──
    const tv = await browser.newPage({ viewport: TV });
    await tv.goto('/bingo.html');
    await tv.locator('.card', { hasText: 'TV / Big Screen' }).locator('input[placeholder="4-letter code"]').fill(code);
    await tv.getByRole('button', { name: /Open the flashboard/ }).click();
    await expect(tv.locator('.cxl-code')).toHaveText(code, { timeout: 30_000 });

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

// The captain can take auto-daub away from the whole room — otherwise a grown-up
// can quietly let the phone play for them.
test('captain switches auto-daub off for everyone', async ({ browser }) => {
    fs.mkdirSync(SHOTS, { recursive: true });

    const tv = await browser.newPage({ viewport: TV });
    await tv.goto('/bingo.html');
    await tv.getByRole('button', { name: /Host the party on this TV/ }).click();
    await expect(tv.locator('.cxl-code')).toBeVisible({ timeout: 30_000 });
    const code = await tv.evaluate(() => roomCode);

    const karen = await joinPhone(browser, code, 'Karen');        // captain
    await expect(karen.locator('text=Captain\'s Settings')).toBeVisible({ timeout: 30_000 });
    const ollie = await joinPhone(browser, code, 'Ollie');
    await expect(tv.locator('.cxl-chip')).toHaveCount(2, { timeout: 15_000 });

    // Ollie is the kind of player who'd leave auto-daub on
    await ollie.evaluate(() => { autoDaub = true; localStorage.setItem('bingo-autodaub', '1'); });

    await karen.getByRole('button', { name: /Everyone daubs/ }).click();
    await expect.poll(() => tv.evaluate(() => H.settings.autoOk), { timeout: 10_000 }).toBe(false);
    await expect(tv.locator('.cxl-side')).toContainText('no auto-daub', { timeout: 10_000 });
    await shot(karen, 'bingo-30-captain-no-autodaub');

    await karen.getByRole('button', { name: /Eyes down|Start/ }).click();
    await expect(ollie.locator('.ticket .cell').first()).toBeVisible({ timeout: 15_000 });

    // no toggle on Ollie's ticket, and his ticket does NOT mark itself
    await expect(ollie.locator('.toggle-row input')).toHaveCount(0);
    await expect(ollie.locator('.toggle-row')).toContainText('off this game');
    await tv.evaluate(() => { H.paused = true; });
    const oNums = await tv.evaluate(() => H.players.find(p => p.name === 'Ollie').ticket.flat().filter(n => n !== null));
    await forceCalls(tv, oNums.slice(0, 3));
    await ollie.waitForTimeout(600);
    await expect(ollie.locator('.ticket .cell.daub')).toHaveCount(0);
    await shot(ollie, 'bingo-31-manual-ticket');

    // but he can still daub by hand
    await ollie.locator(`.ticket .cell[data-n="${oNums[0]}"]`).click();
    await expect(ollie.locator('.ticket .cell.daub')).toHaveCount(1);

    for (const p of [tv, karen, ollie]) await p.close();
});

// The flashboard is laid out the way a bingo hall board is: one DECADE per column
// (1–10 down the first column), not 1–10 across the top row. It also has to FIT —
// 9x10 is taller than the old 10x9, and it used to run off the bottom of a 16:9 TV.
test('flashboard runs 1-10 down the first column, and fits the screen', async ({ browser }) => {
    const tv = await browser.newPage({ viewport: TV });
    await tv.goto('/bingo.html?mode=tvsimulation');
    await expect(tv.locator('.flashboard')).toBeVisible({ timeout: 20_000 });

    const geo = await tv.evaluate(() => {
        const b = n => document.getElementById('bn-' + n).getBoundingClientRect();
        const board = document.querySelector('.flashboard').getBoundingClientRect();
        return { n1: b(1), n2: b(2), n10: b(10), n11: b(11), n90: b(90), board, vh: window.innerHeight,
                 prizesBottom: document.querySelector('.tv-prizes').getBoundingClientRect().bottom,
                 meadowTop: document.getElementById('meadow').getBoundingClientRect().top };
    });

    // 2 sits directly BELOW 1 (same column); 11 sits to its RIGHT on the same row
    expect(geo.n2.top).toBeGreaterThan(geo.n1.top);
    expect(Math.abs(geo.n2.left - geo.n1.left)).toBeLessThan(2);
    expect(geo.n11.left).toBeGreaterThan(geo.n1.left);
    expect(Math.abs(geo.n11.top - geo.n1.top)).toBeLessThan(2);
    // …so the first column ends at 10, and 90 is the bottom-right cell
    expect(Math.abs(geo.n10.left - geo.n1.left)).toBeLessThan(2);
    expect(geo.n90.left).toBeGreaterThan(geo.n11.left);
    expect(Math.abs(geo.n90.top - geo.n10.top)).toBeLessThan(2);

    // the whole board — and the prize bar under it — stays on screen, ABOVE the
    // ambient meadow strip rather than behind the rolling bingo balls
    expect(geo.board.bottom).toBeLessThan(geo.vh);
    expect(geo.prizesBottom).toBeLessThan(geo.meadowTop);
    await expect(tv.locator('.tv-prizes')).toBeInViewport();
    await tv.screenshot({ path: `${SHOTS}/bingo-40-flashboard-columns.png` });

    await tv.close();
});
