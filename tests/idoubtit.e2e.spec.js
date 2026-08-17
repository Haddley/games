// E2E for I Doubt It — lobby (toggle the sequence-mode setting) → deal → an unchallenged
// play (pile grows, turn advances) → a challenge that catches a bluff → a challenge that
// backfires on the challenger → a forced final play that wins the game → podium, over real
// PeerJS rooms, for both a TV-hosted and a phone-hosted (host-also-plays) table.
//
// Run:  npx playwright test tests/idoubtit.e2e.spec.js

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
    await p.goto('/idoubtit.html?room=' + code);
    await p.locator('input[placeholder="Enter name"]').fill(name);
    await p.getByRole('button', { name: /Join with your phone/ }).click();
    return p;
}

test('TV-hosted table: sequence toggle, deal, unchallenged play, a caught bluff, a backfired challenge, a win, podium', async ({ browser }) => {
    fs.mkdirSync(SHOTS, { recursive: true });
    const errors = [];

    const tv = await browser.newPage({ viewport: TV });
    tv.on('pageerror', e => errors.push('tv: ' + e.message));
    await tv.goto('/idoubtit.html');
    await shot(tv, 'id-01-home');
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
    await shot(tv, 'id-02-tv-lobby');

    // Ann is the captain (first to join) — flip the sequence-mode toggle on, then back off,
    // proving the control actually reaches the host both ways. The real checkbox is
    // deliberately 0×0/opacity:0 (a custom toggle styled off the sibling `.tog-track`, same
    // pattern as Kings Corner's assist toggle), so even `force:true` can't click a point on
    // it — click the visible track instead, exactly what a real tap lands on; a label click
    // natively toggles the checkbox it wraps.
    await expect(ann.locator('.tog-row')).toBeVisible({ timeout: 15_000 });
    const seqToggle = ann.locator('.tog input[type="checkbox"]');
    const seqTrack = ann.locator('.tog-track');
    await seqTrack.click();
    await expect.poll(() => seqToggle.isChecked(), { timeout: 5000 }).toBe(true);
    await expect.poll(() => tv.evaluate(() => H.sequenceMode), { timeout: 10_000 }).toBe(true);
    await seqTrack.click();
    await expect.poll(() => tv.evaluate(() => H.sequenceMode), { timeout: 10_000 }).toBe(false);

    await ann.getByRole('button', { name: /Deal the hands/ }).click();
    await expect.poll(() => tv.evaluate(() => H.phase), { timeout: 20_000 }).toBe('playing');
    const total = await tv.evaluate(() => H.players.reduce((s, p) => s + p.hand.length, 0));
    expect(total).toBe(52);
    await shot(tv, 'id-03-tv-dealt');

    // Turn order is join order: Ann, then Bo.
    expect(await tv.evaluate(() => H.players.map(p => p.name))).toEqual(['Ann', 'Bo']);

    // ── An UNCHALLENGED play: force Ann's hand, play a card, resolve directly (bypassing the
    // real 6s timer for speed — this exercises the exact same resolvePlay() the timer calls) ──
    await tv.evaluate(() => {
        // Two cards, only one of which gets played — if she went down to zero here, this
        // (unchallenged) play would immediately win her the match and every step after this
        // one would have nothing left to test against.
        H.players[0].hand = [{ rank: 3, suit: 'S', id: '3S' }, { rank: 6, suit: 'C', id: '6C' }];
        H.turnIdx = 0;
        broadcast();
    });
    await expect.poll(() => ann.evaluate(() => D.isMyTurn), { timeout: 10_000 }).toBe(true);
    await ann.locator('.id-card', { hasText: '3♠' }).click();
    await ann.locator('.id-rankbtn', { hasText: '7' }).click();   // bluff: plays a 3, claims Sevens
    await ann.getByRole('button', { name: /Play 1 card/ }).click();
    await expect.poll(() => tv.evaluate(() => !!H.lastPlay), { timeout: 10_000 }).toBe(true);
    expect(await tv.evaluate(() => H.lastPlay.claimedRank)).toBe(7);
    await shot(tv, 'id-04-tv-pending-play');
    await shot(bo, 'id-05-phone-doubt-button');

    await tv.evaluate(() => resolvePlay(null));   // nobody doubted it
    await expect.poll(() => tv.evaluate(() => H.pile.length), { timeout: 10_000 }).toBe(1);
    expect(await tv.evaluate(() => H.lastPlay)).toBeNull();
    expect(await tv.evaluate(() => H.turnIdx)).toBe(1);   // moved on to Bo

    // ── Wire-payload check: a non-turn player's own state must never contain another
    // player's real cards or the pile's real contents — only counts ──
    const annBlob = await ann.evaluate(() => JSON.stringify(D));
    const boRealCardId = await tv.evaluate(() => H.players[1].hand[0]?.id || null);
    if (boRealCardId) expect(annBlob.includes(`"${boRealCardId}"`)).toBe(false);
    expect(JSON.parse(annBlob).pileCount).toBe(1);

    // ── A challenge that CATCHES a bluff: force Bo's hand and turn, he lies, Ann doubts him ──
    await tv.evaluate(() => {
        H.players[1].hand = [{ rank: 4, suit: 'D', id: '4D' }];
        H.turnIdx = 1;
        broadcast();
    });
    await expect.poll(() => bo.evaluate(() => D.isMyTurn), { timeout: 10_000 }).toBe(true);
    await bo.locator('.id-card', { hasText: '4♦' }).click();
    await bo.locator('.id-rankbtn', { hasText: 'K' }).click();   // lies: plays a 4, claims Kings
    await bo.getByRole('button', { name: /Play 1 card/ }).click();
    await expect.poll(() => ann.evaluate(() => D.canChallenge), { timeout: 10_000 }).toBe(true);
    // Bo's own just-played card is already counted in the pile at this point (hostPlay
    // pushed it before broadcasting) — so the whole pile, pileBefore cards, is exactly what
    // lands back in his hand.
    const pileBefore = await tv.evaluate(() => H.pile.length);
    await ann.getByRole('button', { name: /I DOUBT IT/ }).click();
    await expect.poll(() => tv.evaluate(() => H.lastPlay), { timeout: 10_000 }).toBeNull();
    expect(await tv.evaluate(() => H.players[1].hand.length)).toBe(pileBefore);   // Bo, caught, picks it all up
    expect(await tv.evaluate(() => H.players[0].hand.length)).toBe(1);   // Ann's hand untouched (still holds 6C)
    await shot(tv, 'id-06-tv-bluff-caught');

    // ── A challenge that BACKFIRES: Ann tells the truth, Bo doubts her anyway ──
    await tv.evaluate(() => {
        // Two cards again, same reason as the first play — going to zero here would win it
        // immediately (correctly — she'd be vindicated) and leave nothing for the final,
        // deliberate win forced below.
        H.players[0].hand = [{ rank: 8, suit: 'H', id: '8H' }, { rank: 2, suit: 'C', id: '2C' }];
        H.turnIdx = 0;
        broadcast();
    });
    await expect.poll(() => ann.evaluate(() => D.isMyTurn), { timeout: 10_000 }).toBe(true);
    await ann.locator('.id-card', { hasText: '8♥' }).click();
    await ann.locator('.id-rankbtn', { hasText: '8' }).click();   // honest this time
    await ann.getByRole('button', { name: /Play 1 card/ }).click();
    await expect.poll(() => bo.evaluate(() => D.canChallenge), { timeout: 10_000 }).toBe(true);
    const boHandBefore = await tv.evaluate(() => H.players[1].hand.length);
    await bo.getByRole('button', { name: /I DOUBT IT/ }).click();
    await expect.poll(() => tv.evaluate(() => H.lastPlay), { timeout: 10_000 }).toBeNull();
    expect(await tv.evaluate(() => H.players[0].hand.length)).toBe(1);   // Ann, vindicated, keeps her remaining 2C
    expect(await tv.evaluate(() => H.phase)).toBe('playing');   // not a win — she still holds a card
    expect(await tv.evaluate(() => H.players[1].hand.length)).toBeGreaterThan(boHandBefore);   // Bo picks up the pile
    await shot(tv, 'id-07-tv-challenge-backfired');

    // ── Force a final, truthful, unchallenged play to win the game ──
    await tv.evaluate(() => {
        H.players[0].hand = [{ rank: 5, suit: 'C', id: '5C' }];
        H.turnIdx = 0;
        broadcast();
    });
    await expect.poll(() => ann.evaluate(() => D.isMyTurn), { timeout: 10_000 }).toBe(true);
    await ann.locator('.id-card', { hasText: '5♣' }).click();
    await ann.locator('.id-rankbtn', { hasText: '5' }).click();
    await ann.getByRole('button', { name: /Play 1 card/ }).click();
    await expect.poll(() => tv.evaluate(() => !!H.lastPlay), { timeout: 10_000 }).toBe(true);
    await tv.evaluate(() => resolvePlay(null));

    await expect.poll(() => tv.evaluate(() => H.phase), { timeout: 10_000 }).toBe('match_over');
    const annId = await tv.evaluate(() => H.players.find(p => p.name === 'Ann').id);
    expect(await tv.evaluate(() => H.winnerId)).toBe(annId);
    await expect(ann.locator('.trophy')).toBeVisible({ timeout: 10_000 });
    await expect(tv.locator('.v-gameover-winner')).toContainText('Ann', { timeout: 10_000 });
    await shot(tv, 'id-08-tv-podium');
    await shot(ann, 'id-09-phone-match-over');

    expect(errors, errors.join('\n')).toEqual([]);
    for (const p of [tv, ann, bo]) await p.close();
});

test('phone-hosted table: the host can play too', async ({ browser }) => {
    const errors = [];
    const neil = await browser.newPage({ viewport: PHONE });
    neil.on('pageerror', e => errors.push('host: ' + e.message));
    await neil.goto('/idoubtit.html');
    await neil.locator('input[placeholder="Enter name"]').fill('Neil');
    await neil.getByRole('button', { name: /Host & play on this phone/ }).click();
    // renderLobby() shows the room code inline in `.slbl`, not a dedicated `.room-code`
    // element — `.qr-box` is what's actually there to wait on (same as Blackjack's
    // "Deal me in" solo-host test).
    await expect(neil.locator('.qr-box')).toBeVisible({ timeout: 30_000 });
    // Unlike Blackjack's dealer-only hosting, the host itself is a seated player here.
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
        p.hand = [{ rank: 2, suit: 'S', id: '2S' }];
        broadcast();
    }, turnName);
    await expect.poll(() => turnPage.evaluate(() => (D.myHand || []).length), { timeout: 10_000 }).toBe(1);
    await turnPage.locator('.id-card', { hasText: '2♠' }).click();
    await turnPage.locator('.id-rankbtn', { hasText: '2' }).click();
    await turnPage.getByRole('button', { name: /Play 1 card/ }).click();
    await expect.poll(() => neil.evaluate(() => !!H.lastPlay), { timeout: 10_000 }).toBe(true);
    await neil.evaluate(() => resolvePlay(null));
    await expect.poll(() => neil.evaluate(() => H.phase), { timeout: 10_000 }).toBe('match_over');
    expect(await neil.evaluate(name => H.winnerId === H.players.find(p => p.name === name).id, turnName)).toBe(true);

    expect(errors, errors.join('\n')).toEqual([]);
    for (const p of [neil, jess]) await p.close();
});
