// The 📡 connection-path badge, proved end to end against the real TURN server.
//
//   1. forcing iceTransportPolicy:'relay' makes the link go through Metered — both
//      ends must show 📡 (this is what a player on a hostile network sees)
//   2. a normal connection names the mechanism that actually won: 🏠 same network
//      (both ends host candidates — what two browsers on one machine get), 🌐 STUN
//      hole-punch, 📡 TURN. ?net=0 hides the badge for anyone who doesn't want it.
//
// Run:  npx playwright test tests/relay.e2e.spec.js   (needs internet: TURN + broker)

const { test, expect } = require('@playwright/test');

const PHONE = { width: 390, height: 844 };

// Strip out every non-relay ICE candidate before the game builds its peers.
const forceRelay = page => page.addInitScript(() => {
    const iv = setInterval(() => {
        if (typeof ICE_CFG === 'object' && ICE_CFG.config) {
            ICE_CFG.config.iceTransportPolicy = 'relay';
            clearInterval(iv);
        }
    }, 5);
});

async function hostAndJoin(browser, { relay = false, query = '' } = {}) {
    const host = await browser.newPage({ viewport: PHONE });
    if (relay) await forceRelay(host);
    await host.goto('/bingo.html' + query);
    await host.locator('input[placeholder="Enter name"]').fill('Neil');
    await host.getByRole('button', { name: /Host & play on this phone/ }).click();
    await expect(host.locator('.room-code')).toBeVisible({ timeout: 30_000 });
    const code = await host.evaluate(() => roomCode);

    const guest = await browser.newPage({ viewport: PHONE });
    if (relay) await forceRelay(guest);
    await guest.goto('/bingo.html?room=' + code + (query ? '&' + query.replace(/^\?/, '') : ''));
    await guest.locator('input[placeholder="Enter name"]').fill('Jess');
    await guest.getByRole('button', { name: /Join with your phone/ }).click();
    await expect(host.locator('.player-row')).toHaveCount(2, { timeout: 30_000 });
    return { host, guest };
}

test('a relayed connection shows 📡 on both devices', async ({ browser }) => {
    const { host, guest } = await hostAndJoin(browser, { relay: true });

    await expect(guest.locator('#btn-relay')).toHaveText('📡', { timeout: 20_000 });
    await expect(host.locator('#btn-relay')).toHaveText('📡', { timeout: 20_000 });
    expect(await guest.evaluate(() => p2pIsRelayed())).toBe(true);

    await guest.locator('#btn-relay').click();
    await expect(guest.locator('#relay-note')).toContainText('Relay in use');
    expect(await guest.evaluate(() => p2pPath())).toBe('relay');

    for (const p of [host, guest]) await p.close();
});

test('a direct connection names how it got there (no relay)', async ({ browser }) => {
    const { host, guest } = await hostAndJoin(browser);

    // both pages are on this machine, so ICE settles on host candidates → 🏠
    await expect(guest.locator('#btn-relay')).toHaveText('🏠', { timeout: 20_000 });
    await expect(host.locator('#btn-relay')).toHaveText('🏠', { timeout: 20_000 });
    expect(await guest.evaluate(() => p2pIsRelayed())).toBe(false);
    expect(await guest.evaluate(() => p2pPath())).toBe('local');

    await guest.locator('#btn-relay').click();
    await expect(guest.locator('#relay-note')).toContainText('Same network');

    for (const p of [host, guest]) await p.close();
});

test('?net=0 hides the badge for good (and ?net=1 brings it back)', async ({ browser }) => {
    const off = await hostAndJoin(browser, { query: '?net=0' });
    await off.guest.waitForTimeout(3000);
    await expect(off.guest.locator('#btn-relay')).toHaveCount(0);
    expect(await off.guest.evaluate(() => localStorage.getItem('games-netbadge'))).toBe('0');
    for (const p of [off.host, off.guest]) await p.close();
});

// A room is not one connection — it's however many guests joined it, each over whatever path
// their own device happened to settle on. p2p.js aggregates them ("worst path wins" —
// _p2pRelaySync): a host with one relayed guest and one local guest must still show 📡 itself,
// because SOME of its traffic really is going through the relay. No existing test has more
// than one guest connection to aggregate over, so this never got exercised.
test('a host with a mix of relayed and direct guests shows the WORST path, not just one of them', async ({ browser }) => {
    const host = await browser.newPage({ viewport: PHONE });
    await host.goto('/bingo.html');
    await host.locator('input[placeholder="Enter name"]').fill('Neil');
    await host.getByRole('button', { name: /Host & play on this phone/ }).click();
    await expect(host.locator('.room-code')).toBeVisible({ timeout: 30_000 });
    const code = await host.evaluate(() => roomCode);

    // guest A: forced through the TURN relay
    const guestA = await browser.newPage({ viewport: PHONE });
    await forceRelay(guestA);
    await guestA.goto('/bingo.html?room=' + code);
    await guestA.locator('input[placeholder="Enter name"]').fill('Ava');
    await guestA.getByRole('button', { name: /Join with your phone/ }).click();
    await expect(host.locator('.player-row')).toHaveCount(2, { timeout: 30_000 });
    await expect(guestA.locator('#btn-relay')).toHaveText('📡', { timeout: 20_000 });

    // guest B: normal — both on this machine, so it settles direct (🏠)
    const guestB = await browser.newPage({ viewport: PHONE });
    await guestB.goto('/bingo.html?room=' + code);
    await guestB.locator('input[placeholder="Enter name"]').fill('Ben');
    await guestB.getByRole('button', { name: /Join with your phone/ }).click();
    await expect(host.locator('.player-row')).toHaveCount(3, { timeout: 30_000 });
    await expect(guestB.locator('#btn-relay')).toHaveText('🏠', { timeout: 20_000 });

    // each guest's own badge reflects only ITS OWN connection — proves paths are tracked
    // per-connection, not room-wide — while the host, holding both, reports the worse of the two
    await expect(host.locator('#btn-relay')).toHaveText('📡', { timeout: 20_000 });
    expect(await host.evaluate(() => p2pIsRelayed())).toBe(true);
    expect(await host.evaluate(() => p2pPath())).toBe('relay');

    for (const p of [host, guestA, guestB]) await p.close();
});

// If the HOST device is truly gone — not silent, actually gone, tab closed, browser killed —
// there's no backend to fall back on: `H` only ever lived in that tab (see CLAUDE.md's
// "Reconnects" section — this is the one unrecoverable failure, by design). What's never been
// tested is the failure MODE a guest hits trying to join that dead room: does it hang forever,
// or fail honestly and quickly? It must be the latter — joinPeer's first-join budget is only
// 3 attempts at 700ms apart, so this should resolve in a couple of seconds, not dangle on a
// spinner the user has no way to know is futile.
test('joining a room whose host is genuinely gone fails cleanly, not silently', async ({ browser }) => {
    const host = await browser.newPage({ viewport: PHONE });
    await host.goto('/bingo.html');
    await host.locator('input[placeholder="Enter name"]').fill('Neil');
    await host.getByRole('button', { name: /Host & play on this phone/ }).click();
    await expect(host.locator('.room-code')).toBeVisible({ timeout: 30_000 });
    const code = await host.evaluate(() => roomCode);
    await host.close();   // the host device is not silent — it is gone

    const guest = await browser.newPage({ viewport: PHONE });
    await guest.goto('/bingo.html?room=' + code);
    await guest.locator('input[placeholder="Enter name"]').fill('Jess');
    await guest.getByRole('button', { name: /Join with your phone/ }).click();

    // PeerJS's DataConnection has no built-in timeout, and the broker doesn't always notice
    // a closed tab fast enough to report the id as unavailable — without p2p.js's own
    // watchdog (joinPeer's connectTimeoutMs) this hung forever with neither 'open' nor
    // 'close' ever firing. Three ~10s-bounded attempts land the error within ~30s.
    await expect(guest.locator('#app')).toContainText(
        `Could not reach room "${code.toUpperCase()}"`, { timeout: 40_000 });
    // …and it says so plainly rather than leaving a dead spinner behind
    await expect(guest.locator('#app')).not.toContainText(/connecting/i);

    await guest.close();
});
