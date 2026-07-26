# 10 Crowd-Pleasing Multiplayer Games for the Platform

Researched candidates for new phone+TV PeerJS games, ranked by **crowd appeal × phone+TV fit ÷ build effort**. Key legal note that shapes the naming: game *mechanics/rules are not copyrightable* — only names (trademark), rulebook text, and art are protected — so classic mechanics are fair game under our own names and words.

| # | Game | Mechanic lineage | Effort |
|---|------|------------------|--------|
| 1 | **Fibbers!** | Fibbage / Balderdash → PD parlour game *Fictionary* | **S** |
| 2 | **Doodle Party** | Pictionary / skribbl.io | **M** |
| 3 | **The Odd Sheep** | The Chameleon / Spyfall | **S–M** |
| 4 | **Herd Mind** | Herd Mentality | **S** |
| 5 | **Category Clash** | Scattergories → PD parlour game *Guggenheim* | **S** |
| 6 | **Best Guess** | Wits & Wagers | **M** |
| 7 | **Broken Pencil** | Gartic Phone / Telestrations → PD *Eat Poop You Cat* | **L** |
| 8 | **Moonlight Village** | Werewolf / Mafia (PD parlour game) | **M** |
| 9 | **Going, Going, GONE!** | Generic auction mechanic | **M** |
| 10 | **Full House Bingo** | Bingo (public domain) | **S** |

---

### 1. Fibbers! — bluff trivia *(build this first)*
Everyone invents a fake answer to an obscure question, then votes for the truth among the lies. **3–12 players.** Fibbage is Jackbox's flagship for a reason: reviewers consistently cite its lie-and-vote loop as the easiest, funniest format for mixed groups — you score both for finding the truth *and* for fooling others. **TV:** question, then the shuffled answer wall, then the reveal theatre (who fell for whose lie). **Phones:** type your lie in secret; vote (can't pick your own). **Host validates:** dedupes lies that match the truth, tallies votes, scores. Hidden input + shared reveal is exactly our superpower. **IP:** bluffing parlour trivia (*Fictionary*) is public domain; avoid the names Fibbage/Balderdash. **Effort: S** — it's familytrivia's skeleton with a write-in phase; the Family Chronicles pack could even seed a "family edition."

### 2. Doodle Party — draw on your phone, guess on the TV
One player sketches a secret word on their phone; the drawing appears stroke-by-stroke on the TV; everyone else races to type the guess. **3–12.** skribbl.io's whole appeal is "quick to start, competitive, level playing field regardless of drawing skill" — and Netflix just shipped exactly this as *Pictionary: Game Night* (phone sketch → TV in real time), validating the format for our architecture. **TV:** live canvas + masked word + guess feed. **Phones:** drawer gets a canvas; guessers get a text box. **Host validates:** guess matching (close-enough/no-spoiler feed), speed-based scoring, drawer rotation. **IP:** "draw and guess" is a generic charades mechanic; don't use the Pictionary name. **Effort: M** — pointer-event canvas + batched stroke messages over PeerJS.

### 3. The Odd Sheep — who's faking it?
Everyone secretly sees the same word — except one player, who must bluff. Each gives a one-word clue; then the table votes on who the odd sheep is. **4–12.** The Chameleon is a repeat "best party game" listing because rounds are 5 minutes, resets are instant, and a 7-year-old can play. **TV:** the clue wall and the vote reveal. **Phones:** your secret word (or "YOU ARE THE ODD SHEEP 🐑"), clue entry, vote buttons. **Host validates:** role deal, clue order, vote tally; odd sheep gets a comeback guess. **IP:** hidden-outsider mechanic is generic; rename. **Effort: S–M.** Secret roles on phones = pure platform superpower.

### 4. Herd Mind — think like the family
Open question ("Best pizza topping?"), everyone answers secretly, majority answers score; a lone unique answer gets the Pink Cow (blocks your win). **4–12.** Reviewers place Herd Mentality "best with 6–12 at family gatherings where not everyone is a gamer." **TV:** answer reveal grouped into herds, cow animations. **Phones:** free-text answer. **Host validates:** fuzzy answer grouping (host or captain can merge near-matches with a tap — a nice captain-mode use). **IP:** majority-vote mechanic is generic; rename. **Effort: S.** Complements Family Trivia's minority-wins scoring with the exact opposite incentive — fun pairing.

### 5. Category Clash — the letter race
A letter and 8 categories; type an answer per category before the timer dies; **unique answers score, duplicates cancel** — same judging drama as our Boggle. **2–12.** **TV:** letter, categories, countdown, then category-by-category reveal with duplicate strikeouts. **Phones:** 8 text boxes. **Host validates:** starts-with-letter check, duplicate detection, captain adjudicates disputed answers (vote button = classic Scattergories argument, digitized). **IP:** the underlying parlour game *Guggenheim* long predates Scattergories; rename only. **Effort: S.**

### 6. Best Guess — trivia for people who don't know trivia
Numeric question ("How long is the Great Wall?"); everyone submits a guess; guesses line up on the TV smallest→largest; then everyone **bets** on which guess is closest without going over. **3–10.** Wits & Wagers' genius (per its reviews) is that grandma can win by betting on Jess's answer — you never need to know anything. **TV:** the betting board and payout reveal. **Phones:** number pad, then bet chips. **Host validates:** ordering, payout odds, scores. **IP:** estimate-betting mechanic, rename. **Effort: M.**

### 7. Broken Pencil — the telephone game in drawings
Write a prompt → next player draws it → next describes the drawing → next draws that… then the TV replays every chain to howls of laughter. **4–12.** Gartic Phone exploded through streamers precisely because the *reveal* is the show — perfect for a TV. **TV:** mostly idle during rounds ("everyone's scribbling…" + progress), then the reveal theatre. **Phones:** alternating draw canvas / describe box. **Host validates:** chain routing so everyone works simultaneously on a different chain. **IP:** based on the public-domain parlour game *Eat Poop You Cat*; avoid Telestrations/Gartic names. **Effort: L** (canvas + chain orchestration + reveal player) — but the biggest laugh-per-minute payoff on this list.

### 8. Moonlight Village — werewolf night for the living room
Secret roles; wolves eliminate by night, the village votes by day. **5–12.** One Night-style fast resets are why it tops large-group lists. **TV:** atmospheric narrator ("Night falls…"), day-vote tallies, dramatic reveals. **Phones:** your secret role, night actions, day vote. **Host validates:** role deal, night resolution, win conditions. The TV-as-narrator replaces the human moderator — a real upgrade over the parlour version. **IP:** Mafia/Werewolf is a public-domain parlour game (avoid *Ultimate Werewolf* branding). **Effort: M.** Best for the 8+ crowd; add a gentle "no-elimination points mode" for little kids.

### 9. Going, Going, GONE! — the auction house
Quirky lots ("A dragon's weekend cottage", mystery boxes with hidden values) hit the block; everyone has a secret budget and taps to bid live; overpaying for duds is the comedy. **3–10.** Auction bidding is a board-game-night staple mechanic and pure adrenaline on a shared screen. **TV:** the lot, live price climbing, gavel countdown, "SOLD to Ben!" **Phones:** bid button + secret remaining budget. **Host validates:** bid ordering, budgets, end-of-auction values. **IP:** generic. **Effort: M.** Real-time bidding reuses Pit's instant-message muscle.

### 10. Full House Bingo — the grandparent magnet
TV is the ball machine and caller; phones hold auto-checkable cards; first to a line/full house smashes the BINGO button — host verifies and the TV erupts. **2–12+.** Zero skill floor, works for a 5-year-old and a 95-year-old simultaneously; themed number packs (family birthdays, "Ollie's age × 10") keep it personal. **IP:** public domain. **Effort: S.** Lowest ceiling on this list, but the cheapest way to get the widest age span playing at once.

---

**Suggested build order for maximum payoff:** Fibbers! (S, reuses familytrivia), then Doodle Party (the drawing canvas it introduces unlocks Broken Pencil later), then The Odd Sheep.

Sources: [TheGamer — Jackbox packs ranked](https://www.thegamer.com/every-jackbox-games-party-packs-best-ranked/) · [whatNerd — every Jackbox pack reviewed](https://whatnerd.com/every-jackbox-party-pack-ranked/) · [Netflix Tudum — party games on TV](https://www.netflix.com/tudum/articles/netflix-party-games-play-on-tv) · [What's on Netflix — Boggle/party games launch](https://www.whats-on-netflix.com/news/netflix-games/party-games-launch-on-netflix/) · [The National — Netflix TV party games vs Jackbox](https://www.thenationalnews.com/arts-culture/pop-culture/2025/11/14/review-can-netflixs-new-tv-party-games-compete-with-jackbox/) · [Forbes — best party board games](https://www.forbes.com/advisor/t/party-board-games/) · [The Tabletop Family — best family games 2025](https://thetabletopfamily.com/best-family-board-games-of-2025/) · [Kevin Lin — online games for gatherings](https://kevinlinxc.medium.com/10-online-games-for-virtual-gatherings-dc243c1b5f3a) · [ABA — board games & IP law](https://www.americanbar.org/groups/intellectual_property_law/resources/landslide/archive/not-playing-around-board-games-intellectual-property-law/) · [Meeple Mountain — designer's guide to IP](https://www.meeplemountain.com/articles/the-board-game-designers-guide-to-intellectual-property-law/) · [Co-op Board Games — Herd Mentality review](https://coopboardgames.com/cooperative-board-game-reviews/herd-mentality-game) · [Wits & Wagers rules](https://officialgamerules.org/game-rules/wits-and-wagers/)
