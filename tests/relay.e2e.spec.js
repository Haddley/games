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
    await host.getByRole('button', { name: /Host on this phone/ }).click();
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
