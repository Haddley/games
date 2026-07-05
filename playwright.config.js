// Playwright config for the games repo E2E tests.
// Serves the repo with a plain static server; the game itself talks to the
// public PeerJS broker, so tests need internet access.
const { defineConfig } = require('@playwright/test');

module.exports = defineConfig({
    testDir: 'tests',
    timeout: 240_000,
    // The game is stateful P2P — one worker, no parallelism
    workers: 1,
    fullyParallel: false,
    retries: 0,
    reporter: [['list']],
    use: {
        baseURL: 'http://localhost:8231',
    },
    webServer: {
        command: 'python3 -m http.server 8231',
        url: 'http://localhost:8231/boggleparty.html',
        reuseExistingServer: true,
        timeout: 15_000,
    },
});
