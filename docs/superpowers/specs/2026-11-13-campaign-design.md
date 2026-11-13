# Campaign mode: "Isän joulu" (design)

## Intent

Ruokarobo today is an endless loop of shifts with no story. The campaign adds a
finite, story-driven mode: one Christmas Eve night told in eight chapters plus a
prologue and an ending. It gives players a reason to play to an end, and gives
the game a heart.

The story (from the owner): on Christmas Eve a dad crashes his car on the way
home and dies. His spirit wakes up inside a Salepa delivery robot. The robot sets
out to bring presents to his children, now orphaned, who never learn that the
robot is their dad. At the end there is only a hint: the robot does something
only dad did, and the youngest child notices.

## Goals

- A playable story mode, start to finish, about 8 short chapters (each one shift).
- Works solo, local co-op (1–4) and online co-op, like a normal run.
- Story told with text cards between chapters and in-world speech bubbles. No cutscenes.
- Ending is a hint only (owner's choice): the kids never find out for sure.

## Non-goals

- No branching, no chapter-select screen (Continue / New story only).
- No new 3D cutscenes, voice, or new music.
- No campaign achievements or leaderboard entries in v1.
- PvP stays out of the campaign.

## Anti-goals (failure even if it works)

- Showing the crash or the death. It happens off-screen, in a text card.
- Melodrama that breaks the game's tone. The premise is sad; the writing stays
  warm and dry, with the same deadpan humour as the rest of the game.
- The robot saying outright "I am your dad". The hint must stay a hint.
- Breaking the endless mode, co-op or online play.

## Constraints

- Everything lives in the single `index.html`. Keep the diff small and reuse
  existing systems (`setupLevel`, `startLevel`, `ORDERS`, `#sign`, `say()`, `pop()`, hook, avanto, weather, plow).
- Online: the host runs the campaign. Guests must get the chapter number in
  `levelMsg()` and any new entities (presents, kid in the avanto), and render
  story text from their own copy of the chapter table.
- Language (owner's choice): story cards are **English**, like the rest of the UI.
  In-world speech bubbles stay **Finnish** (Eetu's "Isi tööttäs aina noin." is a
  bubble). Chapter titles are English with the Finnish name in brackets, the way
  `LEVEL_NAMES` does it ("Kaamos (polar night)"). The Finnish titles in the
  table below are those bracketed names.

## Approaches

- **A. Scripted shifts with a goal field (picked).** A `CHAPTERS` data table;
  each entry overrides what `setupLevel`/`startLevel` would compute from `n`
  (order mix, hazards, quota, time, darkness, weather) and carries story text.
  A few chapters set a `goal` with a small check in the update loop.
  Smallest diff, co-op/online mostly for free.
- **B. Bespoke chapters**, each with its own mechanics. More memorable, much more
  code in one big file, every mechanic needs net sync. Rejected for v1.
- **C. Branching campaign map.** Heavy UI and writing for a quick-shift game. Rejected.

Owner went along with A (recommended); the two special goals (collecting presents,
avanto rescue) carry most of what B would give.

## Story bible

- **The robot:** S-1, Salepa's oldest delivery robot. Players drive it (in co-op,
  the other robots are its Salepa colleagues who help without knowing why).
- **Dad's habit (the hint):** when he got home he always honked three times,
  *tö-tö-tööt*. Set up in the prologue, paid off in the ending.
- **The kids:** two siblings, older Aino (10) and younger Eetu (5) *(names are a
  proposal)*. They live in one fixed house on the street: **the kids' home**,
  marked with a paper star in the window.
- **Time:** one night. Lighting goes dusk → kaamos → blizzard → dawn, set per
  chapter instead of the shift formula.
- **Dad's present:** a red sled (pulkka) for Eetu, lost in the crash, delivered last.

## Chapters

Each chapter: an intro card (title + 1–3 sentences), one shift, and an optional
one-line outro. Failing (battery out) offers *Try again* on the same chapter.

| # | Title | Play | Special |
|---|-------|------|---------|
| 0 | Prologi | Card only | Dad drives home on an icy road with presents and honks *tö-tö-tööt* out of habit as he turns onto the street. Cut. "In the Salepa warehouse, something switches on." |
| 1 | Herääminen | Tutorial: 3 groceries, no ice/holes, few peds, daylight-dusk | S-1's speech: "Miksi mulla on pyörät?" |
| 2 | Kolaripaikka | Collect scattered presents on the road while cars drive | **goal: collect** — N 🎁 pickups lie on the road; driving over one collects it; quota = presents |
| 3 | Ensimmäinen lahja | Gift orders to the kids' home; kids throw snowballs at the strange robot | 🎁 orders always go to the kids' home; kids spawn near it |
| 4 | Vuoro kutsuu | Salepa boss: hit quota or be scrapped; gifts in between | Mixed groceries + required gifts; card text from the boss |
| 5 | Avanto | Eetu falls through the ice | **goal: rescue** — a kid entity in the avanto; hook it (Q) to pull it out, then deliver it home before the timer |
| 6 | Kuusi | Christmas tree for the kids (duo order, like the sofa) | Solo: the tree crawls but can be delivered alone |
| 7 | Myräkkä | Blizzard forced on, plow active, dark | Weather forced to blizzard from the start |
| 8 | Joulun aamu | Last presents, dawn; final delivery is dad's sled | On the sled delivery: play *tö-tö-tööt*, Eetu says "Isi tööttäs aina noin." End card. |

Ending card: S-1 drives back to the warehouse at dawn. Eetu waves. No reveal.

## How it fits the code

- `CHAPTERS` table near `LEVEL_NAMES`. Fields (all optional except `title`):
  `title, intro, outro, quota, time, darkness, orders (allowed ORDERS indices or weights), ice, holes, cars, peds, dogs, kids, plow, weather, goal`.
- `campaign` flag + `chapter` index. `setupLevel`/`startLevel`/`applyLevel` read
  the chapter entry when `campaign` is on, otherwise behave exactly as now.
- New order `🎁 Lahja` whose destination is always the kids' home. The sled is
  the same order with a different icon/name in chapter 8.
- New state `'story'` showing a card (reuse `#over`-style plate + *Continue*
  button). Host advances; guests follow via a net message.
- Workshop stays between chapters. Save `{chapter, money, up}` to
  `localStorage` (`ruokarobo-story`) after each cleared chapter.
- Title screen: a *Story* button; if a save exists, *Continue: chapter N* and *New story*.
- Solo duo orders: in campaign, allow and deliver duo orders without a helper.
- Campaign runs skip `recordRun()` and the best score.

## Rules settled after the builder check (designer's calls)

- **Gifts count toward the quota.** Chapters 3–4 just weight the order mix
  (ch 3: gifts only; ch 4: mixed). No second counter.
- **Chapter 8 clears only on the sled.** The sled order appears at the Salepa
  door once `delivered >= quota - 1`; until then shops hand out normal gifts.
- **S-1 is robot 0** (player 1 locally, the host online). Only S-1 can pick up
  or be handed the sled ("Tää on sun, S-1."), and S-1's story speech bubbles
  appear only on it. Colleagues still help with everything else.
- **Chapter 5 cannot be failed by the kid.** Eetu clings to the ice edge and
  shouts; only the battery is a timer. Rescue is the clear condition (no quota).
  Solo the hook targets the kid entity, so `hook()` must accept it as a target.
  The rescued kid rides as cargo to the kids' home.
- **Story orders stay out of endless mode** (gift, tree, sled), so the
  "every kind of order" achievement still works.
- A retry restarts the chapter with the money and upgrades it started with.

## Left to the builder

- Exact quotas, timers and hazard counts per chapter (tune by playing).
- Which house is the kids' home and how the star looks.
- How the collect pickups and the avanto kid look (reuse existing meshes where possible).
- Honk sound: synthesise with the existing `sfx` setup.
- Final wording of cards, within the tone rules above.
