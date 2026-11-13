# PvP: play as a snowball kid

## Why
In PvP one player can be a nuisance on foot instead of a robot: a kid who runs around pelting the robots with snowballs, purely for the fun of being in the way. The robots still race each other for €.

## Goals
- In PvP, any player (couch or online) can choose to be a kid instead of a robot.
- The kid walks, turns instantly and throws snowballs at robots.
- The kid has no score. It never wins, never shows on the € scoreboard and never counts in the winner.

## Non-goals
- No kid points, no kid-vs-team win condition (options A and B were considered and dropped).
- No kid in co-op, the campaign or free roam.
- No new art: the kid reuses the existing street-kid figure.

## Approaches
- A: kid earns € per hit and competes on the same board. Dropped: the user wants no score.
- B: kid vs a robot team with a shared quota. Dropped: more new logic than the idea needs.
- **C (picked): kid with no score.** Smallest change; the kid is a robot entry with a `kid` flag.

## Design
- **Choosing:** in PvP on the title, each player presses their own snowball key to switch between robot and kid (works couch and online). Chips show 🧒.
- **Movement:** slower than a robot, no ice slide or drift, no boost, zap or hook. It can't pick up orders or fall into holes.
- **Throwing:** the X button throws with the same auto-aim and arc as a robot's snowball. Balls hit any other player, kids included.
- **Getting hit:** a zap, a robot driving into it or another kid's snowball knocks it over for about 2 s. It has no battery or damage.
- **Scoreboard and end screen:** the kid is left out of the ranking and of the winner. "Wins" and achievements only count robots.
- **PvP needs at least 2 players**, as now. A kid counts as one.

## Left to the builder
- The exact speeds, knock-down time and throw cooldown. Tune them by playing.
