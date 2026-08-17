// E2E for Go Fish — lobby → deal → a hit ask (go again) → a miss ask ("Go Fish", turn
// passes) → a forced book completion → match over → podium, over real PeerJS rooms, for
// both a TV-hosted and a phone-hosted (host-also-plays) table.
//
// Run:  npx playwright test tests/gofish.e2e.spec.js

const { test, expect } = require('@playwright/test');
const fs = require('fs');

// A burst of PeerJS registrations in one test file occasionally gets throttled by
// the public broker — external-service flake, not a game bug. One retry covers it.
test.describe.configure({ retries: 1 });

const PHONE = { width: 390, height: 844 };
const TV = { width: 1920, height: 1080 };
const SHOTS = 'screenshots';
const shot = (p, n) => p.screenshot({ path: `${SHOTS}/${n}.png` });

async function joinPhone(browser, code, name) {
    const p = await browser.newPage({ viewport: PHONE });
    await p.goto('/gofish.html?room=' + code);
    await p.locator('input[placeholder="Enter name"]').fill(name);
    await p.getByRole('button', { name: /Join with your phone/ }).click();
    return p;
}

test('TV-hosted table: deal, a hit (go again), a miss (Go Fish, turn passes), a book, match over, podium', async ({ browser }) => {
    fs.mkdirSync(SHOTS, { recursive: true });
    const errors = [];

    const tv = await browser.newPage({ viewport: TV });
    tv.on('pageerror', e => errors.push('tv: ' + e.message));
    await tv.goto('/gofish.html');
    await shot(tv, 'gf-01-home');
    await tv.getByRole('button', { name: /Host the party on this TV/ }).click();
    await expect(tv.locator('.cxl-code')).toBeVisible({ timeout: 30_000 });
    const code = await tv.evaluate(() => roomCode);
    expect(code).toMatch(/^[A-Z]{4}$/);

    const ann = await joinPhone(browser, code, 'Ann');
    ann.on('pageerror', e => errors.push('ann: ' + e.message));
    const bo = await joinPhone(browser, code, 'Bo');
    bo.on('pageerror', e => errors.push('bo: ' + e.message));
    await expect.poll(() => tv.evaluate(() => H.players.length), { timeout: 30_000 }).toBe(2);
    await expect(tv.locator('.cxl-chip')).toHaveCount(2, { timeout: 15_000 });
    await shot(tv, 'gf-02-tv-lobby');

    // Ann is the captain (first to join).
    await ann.getByRole('button', { name: /Deal the hands/ }).click();
    await expect.poll(() => tv.evaluate(() => H.phase), { timeout: 20_000 }).toBe('playing');
    expect(await tv.evaluate(() => H.players.every(p => p.hand.length === 7))).toBe(true);   // 2 players → 7 each

    // Another player's actual cards must never cross the wire — only the count.
    const boBlob = await bo.evaluate(() => JSON.stringify(D));
    expect(boBlob.includes('"myHand"')).toBe(true);
    const annHandIds = await tv.evaluate(() => H.players.find(p => p.name === 'Ann').hand.map(c => c.id));
    expect(annHandIds.some(id => boBlob.includes(`"${id}"`))).toBe(false);
    await shot(tv, 'gf-03-tv-dealt');
    await shot(ann, 'gf-04-phone-hand');

    // ── Force a known hand: Ann holds a 7, Bo holds two 7s — a guaranteed HIT ──
    await tv.evaluate(() => {
        const ann = H.players.find(p => p.name === 'Ann');
        const bo = H.players.find(p => p.name === 'Bo');
        ann.hand = [{ rank: 7, suit: 'S', id: '7S' }, { rank: 3, suit: 'H', id: '3H' }];
        bo.hand = [{ rank: 7, suit: 'H', id: '7H' }, { rank: 7, suit: 'D', id: '7D' }, { rank: 9, suit: 'C', id: '9C' }];
        H.turnIdx = H.players.indexOf(ann);
        broadcast();
    });
    await expect.poll(() => ann.evaluate(() => D.isMyTurn), { timeout: 10_000 }).toBe(true);

    await ann.locator('button.gf-rankbtn', { hasText: '7' }).click();
    await ann.locator('button.gf-opp', { hasText: 'Bo' }).click();
    await expect.poll(() => tv.evaluate(() => H.players.find(p => p.name === 'Ann').hand.length), { timeout: 10_000 }).toBe(4);
    expect(await tv.evaluate(() => H.players.find(p => p.name === 'Bo').hand.map(c => c.id))).toEqual(['9C']);
    expect(await tv.evaluate(() => H.turnIdx)).toBe(await tv.evaluate(() => H.players.findIndex(p => p.name === 'Ann')));
    await expect(ann.locator('#gf-toasts')).toBeVisible({ timeout: 5000 });
    await shot(tv, 'gf-05-tv-after-hit');

    // ── Now force a guaranteed MISS: Ann asks for a rank Bo doesn't hold, empty stock so the
    // outcome (turn passing, no draw) is fully deterministic ──
    await tv.evaluate(() => {
        const ann = H.players.find(p => p.name === 'Ann');
        const bo = H.players.find(p => p.name === 'Bo');
        ann.hand = [{ rank: 2, suit: 'S', id: '2S' }];
        bo.hand = [{ rank: 9, suit: 'C', id: '9C' }];
        H.stock = [];
        H.turnIdx = H.players.indexOf(ann);
        broadcast();
    });
    await expect.poll(() => ann.evaluate(() => (D.myHand || []).length), { timeout: 10_000 }).toBe(1);
    await ann.locator('button.gf-rankbtn', { hasText: '2' }).click();
    await ann.locator('button.gf-opp', { hasText: 'Bo' }).click();
    await expect.poll(() => tv.evaluate(() => H.turnIdx), { timeout: 10_000 })
        .toBe(await tv.evaluate(() => H.players.findIndex(p => p.name === 'Bo')));
    await shot(bo, 'gf-06-phone-after-miss');

    // ── Force the 13th and final book to end the match immediately ──
    await tv.evaluate(() => {
        const ann = H.players.find(p => p.name === 'Ann');
        const bo = H.players.find(p => p.name === 'Bo');
        ann.hand = [{ rank: 5, suit: 'S', id: '5S' }, { rank: 5, suit: 'C', id: '5C' }];
        bo.hand = [{ rank: 5, suit: 'H', id: '5H' }, { rank: 5, suit: 'D', id: '5D' }];
        H.turnIdx = H.players.indexOf(ann);
        H.booksClaimed = 12;
        broadcast();
    });
    await expect.poll(() => ann.evaluate(() => D.isMyTurn), { timeout: 10_000 }).toBe(true);
    await ann.locator('button.gf-rankbtn', { hasText: '5' }).click();
    await ann.locator('button.gf-opp', { hasText: 'Bo' }).click();

    await expect.poll(() => tv.evaluate(() => H.phase), { timeout: 10_000 }).toBe('match_over');
    expect(await tv.evaluate(() => H.booksClaimed)).toBe(13);
    await expect(ann.locator('.trophy')).toBeVisible({ timeout: 10_000 });
    await expect(tv.locator('.v-gameover-winner')).toBeVisible({ timeout: 10_000 });
    await shot(tv, 'gf-07-tv-podium');
    await shot(ann, 'gf-08-phone-match-over');

    expect(errors, errors.join('\n')).toEqual([]);
    for (const p of [tv, ann, bo]) await p.close();
});

test('phone-hosted table: the host can play too, and an empty-handed player auto-draws on their turn', async ({ browser }) => {
    const errors = [];
    const neil = await browser.newPage({ viewport: PHONE });
    neil.on('pageerror', e => errors.push('host: ' + e.message));
    await neil.goto('/gofish.html');
    await neil.locator('input[placeholder="Enter name"]').fill('Neil');
    await neil.getByRole('button', { name: /Host & play on this phone/ }).click();
    await expect(neil.locator('.qr-box')).toBeVisible({ timeout: 30_000 });
    // Unlike Blackjack, the host itself is a seated player here.
    expect(await neil.evaluate(() => H.players.length)).toBe(1);
    const code = await neil.evaluate(() => roomCode);

    const jess = await joinPhone(browser, code, 'Jess');
    jess.on('pageerror', e => errors.push('jess: ' + e.message));
    await expect.poll(() => neil.evaluate(() => H.players.length), { timeout: 30_000 }).toBe(2);

    await neil.getByRole('button', { name: /Deal the hands/ }).click();
    await expect.poll(() => neil.evaluate(() => H.phase), { timeout: 20_000 }).toBe('playing');

    // Force Neil to have an empty hand and a non-empty stock, then hand the turn to him via
    // advanceTurn — his turn should open with exactly one auto-drawn card, no extra tap needed.
    await neil.evaluate(() => {
        const me = H.players.find(p => p.name === 'Neil');
        const jess = H.players.find(p => p.name === 'Jess');
        me.hand = [];
        H.stock = [{ rank: 8, suit: 'H', id: '8H' }];   // exactly one card, so the draw is unambiguous
        advanceTurn(H.players.indexOf(jess));
    });
    await expect.poll(() => neil.evaluate(() => H.players.find(p => p.name === 'Neil').hand.length), { timeout: 10_000 }).toBe(1);
    expect(await neil.evaluate(() => H.turnIdx)).toBe(await neil.evaluate(() => H.players.findIndex(p => p.name === 'Neil')));
    // Only the one drawn rank is selectable — everything else stays disabled.
    const drawnRank = await neil.evaluate(() => H.players.find(p => p.name === 'Neil').hand[0].rank);
    await expect(neil.locator(`.gf-rankrow button:not(:disabled)`)).toHaveCount(1, { timeout: 10_000 });
    await expect(neil.locator(`.gf-rankrow button:not(:disabled)`)).toContainText(String(drawnRank === 1 ? 'A' : drawnRank));

    expect(errors, errors.join('\n')).toEqual([]);
    for (const p of [neil, jess]) await p.close();
});
