# Trading-pit hand signals (London · New York · Chicago)

Open outcry = shouting + hand signals to transmit buy/sell orders across a roaring
floor. Signals carried the same information as the shout, so a trade could be done
across the pit when nobody could hear a thing. The *grammar* below was broadly shared;
each exchange had local dialect differences.

## The universal grammar (all three cities)

| Element | Signal |
|---|---|
| **BUY** | Palms face **IN** (toward your own face), hands held up/toward body. "I take." |
| **SELL** | Palms face **OUT** (away from you), arms pushed out toward the crowd. "I give." |
| **Price** | Signalled **at/near the face**. |
| **Quantity** | Signalled **away from the face**, arms extended. |
| **1–5** | Fingers held **vertically** (pointing up). |
| **6–9** | Fingers held **horizontally** (sideways, parallel to the ground). |
| **0 / "even"** | Closed fist. |
| **Tens / hundreds / thousands** | Fingers/fist **touched to the forehead**; repeated taps stack the magnitude (10s, 100s, 1,000s). |

So a trader wanting to **buy 3 at a price** turns palms inward and holds three fingers
up; **sell 20** pushes palms out and touches the forehead with two fingers.

## New York (NYMEX / COMEX / NYSE pits)

The "**Hand Signals of the New York Trading Pits**" chart (the green-bordered poster and
*The Trading Pit Handbook*) is the canonical NY reference:

- **Numbers 0–9**: fist = 0; 1–5 vertical fingers; 6–9 the same fingers turned **sideways**.
- **Price 15** etc.: signalled by the hand held near the chest/face.
- **Quantity 1 / 10 / 100 / 1,000**: index finger (or fist) tapped to the **forehead**, magnitude by repetition.
- **Months** each had a distinct sign (Jan–Dec), plus **PUT** (thumbs-down fist) and **CALL** (thumb-up/curled) for options.
- Brokerage/firm identity was also signalled (e.g. "Merrill Lynch", "Goldman Sachs" each had a gesture) so you knew *who* you were trading with.

## Chicago (CBOT / CME)

Same buy-in / sell-out palm grammar. Chicago was the birthplace of the agricultural
futures pit (wheat, corn, soybeans — the commodities the **Pit** card game is built on).

- Price vs quantity split by **distance from the body** (price close, quantity extended) — identical principle to NY.
- The **tiered octagonal pit** (steps rising outward) is the Chicago icon; where you stood signalled the delivery month.
- CME permanently closed most physical pits in **May 2021**.

## London (LIFFE / LME)

- Same core signals, adapted to LIFFE's products (bond futures, short sterling, the **Bund option** pit was huge).
- LIFFE's distinguishing feature was **visual, not gestural**: a carnival of **coloured firm jackets** (see [pit-heritage.md](pit-heritage.md)) so you identified the counterparty's firm by jacket colour rather than a firm gesture.
- LIFFE open outcry closed **24 November 2000**; the **LME** ("the Ring") kept open outcry going far longer (still the last major open-outcry venue into the 2020s).

## Why it matters for the game

`pit.html` renders the **quantity signal** (1–4 fingers, vertical) on the shout button,
the "you're shouting" banner, and over each shouting trader on the TV — a nod to the real
open-outcry quantity grammar. The bundle size in Pit (1–4 cards) maps naturally onto the
1–5 vertical-finger count. BUY/SELL palm direction isn't modelled because a Pit trade is a
**blind equal-count swap** — every player is simultaneously buying and selling.

## Sources

- [Hand signaling (open outcry) — Wikipedia](https://en.wikipedia.org/wiki/Hand_signaling_(open_outcry))
- [Trading Pit Hand Signals — Hacker News discussion](https://news.ycombinator.com/item?id=27094747)
- [CME Group — floor trading](https://www.cmegroup.com/tools-information/floor-trading.html)
- [End of an Era — FIA](https://www.fia.org/marketvoice/articles/end-era)
- [First Time on the CBOT floor (1989)](https://patrickrooney.substack.com/p/first-time-on-the-cbot-floor-1989)
- *The Trading Pit Handbook* hand-signal plates (New York pits reference)
