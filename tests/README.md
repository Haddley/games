# Boggle Party E2E tests

Plays a real multi-device game in one browser — host phone, two player
phones, and a 1080p TV scoreboard as separate pages talking over PeerJS —
and screenshots every screen so you can eyeball the UI.

## One-time setup

```sh
npm install
npx playwright install chromium
```

## Run

```sh
npm run test:e2e          # headless
npm run test:e2e:headed   # watch it play
```

Needs internet: the game uses the public PeerJS broker and fetches the
dictionary from GitHub.

## Output

Screenshots land in `screenshots/` (gitignored):

| File | Screen |
|---|---|
| 01-home | Home / join screen |
| 02–04 | Host, guest, and TV lobbies (big QR) |
| 05 | 3-2-1-GO round countdown |
| 06–07 | Phone board + TV game view (START GAME) |
| 08–09 | TV live feed (streak, lead change) + phone mid-round |
| 10 | TV final-10-seconds countdown |
| 11–13 | Phone + host + TV round results (END OF ROUND, reveal theater, join QR) |
| 14–16 | Phone + host + TV game over (END OF GAME, podium, hall of fame) |

## Notes

- The test sets rounds to 1 so round results double as final results.
- Words are submitted through the real guest→host network path; the host
  judges them against the dictionary (board adjacency is not enforced
  host-side, so the test can use fixed words on any rolled board).
- The round is fast-forwarded by setting the host's `H.timeLeft` — no
  90-second waits.
