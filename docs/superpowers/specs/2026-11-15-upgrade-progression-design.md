# Upgrade progression: slower, bigger, needed

## Why

Upgrades arrive too fast and each one is a small bump. The goal is the Hill Climb Racing feel: every purchase changes how the robot drives, and later shifts cannot be cleared without the right ones.

## Today

- 8 upgrades, 3 levels, every one priced 60 / 120 / 200 € (3,040 € for everything).
- A shift ends when the quota (2 + shift) is met, at about 55 € per delivery plus the battery bonus. That is roughly 700 € after three shifts, so 6 or 7 purchases out of 24.
- Effects per level: motor +10 % speed, suspension −22 % damage, battery +12 s, thermobox +10 % pay.
- Nothing is gated. Later shifts only add more ice, holes and traffic.

## Approaches

1. **Persistent garage across runs.** Rejected by Joni: the leaderboard would reward grinding.
2. **Reset each run, pick a build (chosen).** Steep prices mean a run affords 2 or 3 maxed lines by shift 8 and never everything. What you buy decides how far you get.
3. **Reset each run, more levels (5 to 10 small steps).** Dropped: more steps of small bumps is the current problem again.

## Design

**Prices:** 100 / 300 / 700 € per upgrade (1,100 € to max one, 8,800 € for all). Expected: one level 1 after shift 1, one maxed line around shift 5, four maxed around shift 10.

**Effects per level (old in brackets):**

| Upgrade | New |
|---|---|
| Studded tyres | Ice grip +1.2 and ice acceleration +90 (was +0.9, +60). At level 3 ice handles like snow. |
| Motor | +20 % top speed, +25 % acceleration (was +10 %, +12 %). |
| Suspension | −30 % damage. Level 2: pop out of a pothole almost at once. Level 3: drive straight over potholes, with a bump and a little cargo damage. |
| Battery | +20 s (was +12 s). |
| Rocket booster | Boost lasts +1.2 s and refills 1.8 s faster (was +0.7, 1.5). At level 3 it is close to always on. |
| Tesla coil | +2 zaps and +50 reach (was +1, +30). |
| Heated wheels | Level 1 melts a patch in 1.2 s, level 2 in 0.4 s, level 3 on touch. Level 3 also ignores freezing rain. |
| Thermobox | +25 % pay and +25 % deadline (was +10 %, +15 %). The investment pick. |

**Walls:** no new hazards. The existing ramps (ice and holes 2 + 2 per shift, quota growing faster than battery time) get tuned so a robot with no upgrades runs out of battery around shift 5 or 6, and a focused build reaches shift 10 and beyond.

As built: battery time is 80 + 3 s per shift (was 75 + 5), hazards unchanged. A round trip is 7.8 s flat out on a clear path with no upgrades; the shift gives 13.6 s per order at shift 5, 11.2 s at shift 7 and 9.2 s at shift 10. `?selftest` logs these numbers.

**Workshop:** a line under the title says what the next shift brings (orders, seconds, ice patches, potholes), so the purchase is an informed bet. Cards show the effect of the next level, not a generic description.

## My calls, not Joni's

- Story mode shares the shop, so it gets the new prices and effects too. Its chapters have fixed quotas and hazards, so no walls are added there.
- Boost, zap and hook stay available at level 0. Locking them would break story chapters that need them.
- Achievements are unchanged. "Max out four upgrades in one run" stays reachable, around shift 10.

## Non-goals

No persistent money, no new upgrade types, no new hazards, no PvP changes (PvP has no workshop).

## Check

A `?selftest` assert that total income through shift 3 buys under 4 levels and that all 8 maxed costs more than income through shift 10. Wall positions are checked by driving, with the existing debug hooks.
