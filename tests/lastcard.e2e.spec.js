// E2E for Last Card — lobby → deal → a Draw Two's visible effect → a Wild with colour
// declaration → a Wild Draw Four both unchallenged and challenged-and-succeeding → a forced
// draw-then-pass → a genuine Last Card catch → a full hand won → podium, over real PeerJS
// rooms, for both a TV-hosted and a phone-hosted (host-also-plays) table.
//
// Run:  npx playwright test tests/lastcard.e2e.spec.js

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
    await p.goto('/lastcard.html?room=' + code);
    await p.locator('input[placeholder="Enter name"]').fill(name);
    await p.getByRole('button', { name: /Join with your phone/ }).click();
    return p;
}

test('TV-hosted table: deal, action cards, Wild + colour, Wild Draw Four (both outcomes), a forced draw, a Last Card catch, a win, podium', async ({ browser }) => {
    fs.mkdirSync(SHOTS, { recursive: true });
    const errors = [];

    const tv = await browser.newPage({ viewport: TV });
    tv.on('pageerror', e => errors.push('tv: ' + e.message));
    await tv.goto('/lastcard.html');
    await shot(tv, 'lc-01-home');
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
    await shot(tv, 'lc-02-tv-lobby');

    await ann.getByRole('button', { name: /Deal the hands/ }).click();
    await expect.poll(() => tv.evaluate(() => H.phase), { timeout: 20_000 }).toBe('playing');
    const total = await tv.evaluate(() => H.players.reduce((s, p) => s + p.hand.length, 0) + H.stock.length + H.discard.length);
    expect(total).toBe(108);
    expect(await tv.evaluate(() => H.players.map(p => p.name))).toEqual(['Ann', 'Bo']);
    await shot(tv, 'lc-03-tv-dealt');

    // ── Wire-payload check: a player's own state must never contain another player's real
    // hand contents — only counts ──
    await tv.evaluate(() => { H.players[0].hand = [{ color: 'red', kind: 'number', value: 3, id: 'r3' }]; H.players[1].hand = [{ color: 'blue', kind: 'number', value: 9, id: 'b9' }]; H.turnIdx = 0; H.discard = [{ color: 'red', kind: 'number', value: 5, id: 'top1' }]; H.activeColor = 'red'; broadcast(); });
    const annBlob = await ann.evaluate(() => JSON.stringify(D));
    expect(annBlob.includes('"b9"')).toBe(false);
    expect(JSON.parse(annBlob).players.find(p => p.name === 'Bo').handCount).toBe(1);

    // ── Draw Two's visible effect: Bo receives 2 cards and his turn is skipped ──
    await tv.evaluate(() => {
        H.players[0].hand = [{ color: 'red', kind: 'drawTwo', value: null, id: 'd2' }, { color: 'green', kind: 'number', value: 1, id: 'g1' }];
        H.players[1].hand = [{ color: 'blue', kind: 'number', value: 9, id: 'b9' }];
        H.discard = [{ color: 'red', kind: 'number', value: 5, id: 'top1' }]; H.activeColor = 'red';
        H.turnIdx = 0; H.stock = [{ color: 'green', kind: 'number', value: 4, id: 's1' }, { color: 'green', kind: 'number', value: 5, id: 's2' }];
        broadcast();
    });
    await expect.poll(() => ann.evaluate(() => D.isMyTurn), { timeout: 10_000 }).toBe(true);
    await ann.locator('.lc-hand-row .lc-card.red', { hasText: '+2' }).click();
    await expect.poll(() => tv.evaluate(() => H.players[1].hand.length), { timeout: 10_000 }).toBe(3);   // 1 held + 2 drawn
    expect(await tv.evaluate(() => H.turnIdx)).toBe(0);   // stepTurn(2) with 2 players lands back on Ann
    await shot(tv, 'lc-04-tv-draw-two');

    // ── A Wild card with a colour declaration ──
    await tv.evaluate(() => {
        // Two cards, only one of which gets played — going to zero here would win the match
        // immediately and leave nothing for every scenario staged after this one.
        H.players[0].hand = [{ color: null, kind: 'wild', value: null, id: 'w1' }, { color: 'green', kind: 'number', value: 1, id: 'spare1' }];
        H.discard = [{ color: 'green', kind: 'number', value: 2, id: 'top2' }]; H.activeColor = 'green';
        H.turnIdx = 0; broadcast();
    });
    await expect.poll(() => ann.evaluate(() => D.isMyTurn), { timeout: 10_000 }).toBe(true);
    await ann.locator('.lc-hand-row .lc-card.wild').click();
    await expect(ann.locator('.lc-colorpick')).toBeVisible({ timeout: 5000 });
    await ann.locator('.lc-swbtn.blue').click();
    await expect.poll(() => tv.evaluate(() => H.activeColor), { timeout: 10_000 }).toBe('blue');
    await shot(tv, 'lc-05-tv-wild-declared');

    // ── Wild Draw Four, UNCHALLENGED: Bo just lets it ride, draws 4, is skipped ──
    await tv.evaluate(() => {
        H.players[0].hand = [{ color: null, kind: 'wild4', value: null, id: 'w4a' }, { color: 'red', kind: 'number', value: 1, id: 'keep1' }];
        H.players[1].hand = [{ color: 'green', kind: 'number', value: 6, id: 'g6' }];   // no blue card, so this WDF is legit
        H.discard = [{ color: 'blue', kind: 'number', value: 8, id: 'top3' }]; H.activeColor = 'blue';
        H.turnIdx = 0; H.stock = Array.from({ length: 4 }, (_, i) => ({ color: 'red', kind: 'number', value: i, id: 'draw' + i }));
        broadcast();
    });
    await expect.poll(() => ann.evaluate(() => D.isMyTurn), { timeout: 10_000 }).toBe(true);
    await ann.locator('.lc-hand-row .lc-card.wild', { hasText: '+4' }).click();
    await ann.locator('.lc-swbtn.green').click();
    await expect.poll(() => tv.evaluate(() => !!H.pendingWild4), { timeout: 10_000 }).toBe(true);
    await expect(bo.locator('button', { hasText: /Challenge!/ })).toBeVisible({ timeout: 10_000 });
    await shot(tv, 'lc-06-tv-wild4-pending');
    await tv.evaluate(() => resolveWild4(false));   // let it stand
    await expect.poll(() => tv.evaluate(() => H.players[1].hand.length), { timeout: 10_000 }).toBe(5);   // 1 held + 4 drawn
    expect(await tv.evaluate(() => H.turnIdx)).toBe(0);   // Bo skipped, back to Ann
    await shot(tv, 'lc-07-tv-wild4-unchallenged');

    // ── Wild Draw Four, CHALLENGED and SUCCEEDS: Ann bluffed (she had a legal blue card), gets caught ──
    await tv.evaluate(() => {
        H.players[0].hand = [{ color: null, kind: 'wild4', value: null, id: 'w4b' }, { color: 'yellow', kind: 'number', value: 3, id: 'keep2' }];
        H.discard = [{ color: 'yellow', kind: 'number', value: 7, id: 'top4' }]; H.activeColor = 'yellow';
        H.turnIdx = 0; H.players[1].hand = [{ color: 'green', kind: 'number', value: 6, id: 'g6b' }];
        H.stock = Array.from({ length: 4 }, (_, i) => ({ color: 'red', kind: 'number', value: i, id: 'draw2_' + i }));
        broadcast();
    });
    await expect.poll(() => ann.evaluate(() => D.isMyTurn), { timeout: 10_000 }).toBe(true);
    await ann.locator('.lc-hand-row .lc-card.wild', { hasText: '+4' }).click();
    await ann.locator('.lc-swbtn.red').click();
    await expect.poll(() => tv.evaluate(() => !!H.pendingWild4), { timeout: 10_000 }).toBe(true);
    expect(await tv.evaluate(() => H.pendingWild4.hadColorBefore)).toBe(true);   // she really did have a yellow card
    await bo.getByRole('button', { name: /Challenge!/ }).click();
    await expect.poll(() => tv.evaluate(() => H.pendingWild4), { timeout: 10_000 }).toBeNull();
    expect(await tv.evaluate(() => H.players[0].hand.length)).toBe(5);   // 1 held + 4 drawn as the penalty for bluffing
    expect(await tv.evaluate(() => H.turnIdx)).toBe(1);   // the challenger's own turn proceeds normally
    await shot(tv, 'lc-08-tv-wild4-challenged');

    // ── A forced draw-then-pass: no legal card, must draw, drawn card is also illegal, pass ──
    await tv.evaluate(() => {
        H.players[1].hand = [{ color: 'green', kind: 'number', value: 6, id: 'onlygreen' }];
        H.discard = [{ color: 'blue', kind: 'number', value: 2, id: 'top5' }]; H.activeColor = 'blue';
        H.turnIdx = 1; H.stock = [{ color: 'yellow', kind: 'number', value: 4, id: 'unplayable' }];
        broadcast();
    });
    await expect.poll(() => bo.evaluate(() => D.isMyTurn), { timeout: 10_000 }).toBe(true);
    expect(await bo.evaluate(() => D.canDraw)).toBe(true);
    await bo.getByRole('button', { name: /Draw a card/ }).click();
    await expect.poll(() => tv.evaluate(() => H.players[1].hand.length), { timeout: 10_000 }).toBe(2);
    await bo.getByRole('button', { name: /Pass/ }).click();
    await expect.poll(() => tv.evaluate(() => H.turnIdx), { timeout: 10_000 }).toBe(0);
    expect(await tv.evaluate(() => H.drawnCard)).toBeNull();
    await shot(tv, 'lc-09-tv-draw-pass');

    // ── A genuine Last Card catch ──
    await tv.evaluate(() => {
        H.players[1].hand = [{ color: 'red', kind: 'number', value: 5, id: 'lastone' }];
        H.pendingCallout = { playerId: H.players[1].id, called: false };
        H.stock = [{ color: 'red', kind: 'number', value: 1, id: 'pen1' }, { color: 'red', kind: 'number', value: 2, id: 'pen2' }];
        broadcast();
    });
    await expect(ann.getByRole('button', { name: /Caught!/ })).toBeVisible({ timeout: 10_000 });
    await shot(tv, 'lc-10-tv-callout-pending');
    await ann.getByRole('button', { name: /Caught!/ }).click();
    await expect.poll(() => tv.evaluate(() => H.pendingCallout), { timeout: 10_000 }).toBeNull();
    expect(await tv.evaluate(() => H.players[1].hand.length)).toBe(3);   // 1 held + 2 penalty
    await shot(tv, 'lc-11-tv-caught');

    // ── Force a final, legal, unopposed play to win the game ──
    await tv.evaluate(() => {
        H.players[0].hand = [{ color: 'blue', kind: 'number', value: 5, id: 'finalcard' }];
        H.discard = [{ color: 'blue', kind: 'number', value: 9, id: 'top6' }]; H.activeColor = 'blue';
        H.turnIdx = 0; broadcast();
    });
    await expect.poll(() => ann.evaluate(() => D.isMyTurn), { timeout: 10_000 }).toBe(true);
    await ann.locator('.lc-hand-row .lc-card.blue').click();
    await expect.poll(() => tv.evaluate(() => H.phase), { timeout: 10_000 }).toBe('match_over');
    const annId = await tv.evaluate(() => H.players.find(p => p.name === 'Ann').id);
    expect(await tv.evaluate(() => H.winnerId)).toBe(annId);
    await expect(ann.locator('.trophy')).toBeVisible({ timeout: 10_000 });
    await expect(tv.locator('.v-gameover-winner')).toContainText('Ann', { timeout: 10_000 });
    await shot(tv, 'lc-12-tv-podium');
    await shot(ann, 'lc-13-phone-match-over');

    expect(errors, errors.join('\n')).toEqual([]);
    for (const p of [tv, ann, bo]) await p.close();
});

test('phone-hosted table: the host can play too', async ({ browser }) => {
    const errors = [];
    const neil = await browser.newPage({ viewport: PHONE });
    neil.on('pageerror', e => errors.push('host: ' + e.message));
    await neil.goto('/lastcard.html');
    await neil.locator('input[placeholder="Enter name"]').fill('Neil');
    await neil.getByRole('button', { name: /Host & play on this phone/ }).click();
    await expect(neil.locator('.qr-box')).toBeVisible({ timeout: 30_000 });
    expect(await neil.evaluate(() => H.players.length)).toBe(1);
    expect(await neil.evaluate(() => H.players[0].name)).toBe('Neil');
    const code = await neil.evaluate(() => roomCode);

    const jess = await joinPhone(browser, code, 'Jess');
    jess.on('pageerror', e => errors.push('jess: ' + e.message));
    await expect.poll(() => neil.evaluate(() => H.players.length), { timeout: 30_000 }).toBe(2);

    await neil.getByRole('button', { name: /Deal the hands/ }).click();
    await expect.poll(() => neil.evaluate(() => H.phase), { timeout: 20_000 }).toBe('playing');

    const turnName = await neil.evaluate(() => H.players[H.turnIdx].name);
    const turnPage = turnName === 'Neil' ? neil : jess;
    await neil.evaluate(name => {
        const p = H.players.find(x => x.name === name);
        p.hand = [{ color: 'green', kind: 'number', value: 3, id: 'gp3' }];
        H.discard = [{ color: 'green', kind: 'number', value: 8, id: 'topp' }]; H.activeColor = 'green';
        broadcast();
    }, turnName);
    await expect.poll(() => turnPage.evaluate(() => (D.myHand || []).length), { timeout: 10_000 }).toBe(1);
    await turnPage.locator('.lc-hand-row .lc-card.green').click();
    await expect.poll(() => neil.evaluate(() => H.phase), { timeout: 10_000 }).toBe('match_over');
    expect(await neil.evaluate(name => H.winnerId === H.players.find(p => p.name === name).id, turnName)).toBe(true);

    expect(errors, errors.join('\n')).toEqual([]);
    for (const p of [neil, jess]) await p.close();
});
