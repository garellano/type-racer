# Race passage design

The host chooses English, Spanish, or Java before each round. One original passage is selected on the server and sent to every racer. The language is locked through the countdown and race; changing it in the lobby clears readiness. The next round retains the choice until the host changes it.

Each mode contains **24 distinct challenges**. English and Spanish use short, friendly stories about racing, daily updates, distributed teamwork, and application security. Contrast Security appears as the team's setting, without proprietary details, borrowed marketing text, or claims about products. The final race position opens standup; no passage assigns that role to the winner or mocks another racer.

## Rotation

Each Mexico City calendar day receives three passages from a disjoint group. The server randomly selects among that group, using all three before recycling within the room and avoiding an immediate repeat. The day boundary is shared by participants in the US, Ireland, and Mexico; their browser time zones cannot select different texts.

Tomorrow's group contains no text from today's group, even in a newly created room. The eight-day cycle eventually repeats; this is not an unlimited uniqueness guarantee. Separate rooms on the same day can choose the same passage. Recent room choices are persisted across reset, refresh, and hibernation. Changing modes starts that mode's daily deck; returning to a mode can revisit its earlier text. Keep banks in complete groups of three and retain at least two groups. Changing the catalog changes the rotation.

## Java challenges

Java uses 24 small classes with complete method bodies and basic Java 8 syntax. These are copying challenges, not coding questions: no solution, compilation, or execution is required in the game.

| Theme                | Examples                                                 | Typing ingredients                                |
| -------------------- | -------------------------------------------------------- | ------------------------------------------------- |
| Race movement        | `Race.advance`, `Lap.distance`, `Circuit.distance`       | Guards, arrays, arithmetic, enhanced `for`        |
| Shared starting grid | `Grid.countReady`, `Timer.countdown`, `Signal.green`     | `boolean`, `while`, decrement, logical conditions |
| Team handoffs        | `Standup.openingLap`, `Turn.next`, `Handoff.next`        | Least-distance selection, modulo, bounds checks   |
| Daily updates        | `Brief.updates`, `Team.available`, `Update.remaining`    | Counts, loops, `continue`, guard clauses          |
| Application security | `Contrast.findings`, `Trace.calls`, `Finding.unresolved` | Accumulation, boolean arrays, `if`, `return`      |
| Garage and pit lane  | `Garage.free`, `Pit.fuel`, `Radar.nearby`                | Comparisons, indexed loops, subtraction           |

Java passages fit on one logical line. Display wraps visually; racers never need to guess indentation, insert newlines, or use tabs. Monospace text distinguishes braces, parentheses, brackets, operators, and semicolons. Spaces, case, punctuation, and accented characters in prose all count exactly. Code is rendered as text and never evaluated.

All passages contain 200–300 characters. Length and punctuation density vary, so different passages and modes are not comparable speed benchmarks. Tune length with the team toward the 45–60 second goal; the existing 90-second timeout applies to every mode. Java reduces reliance on native-language prose, but Java familiarity and keyboard layouts still matter. Everyone receives identical text within a round.

Keep additions in `shared/passages.ts` original, short, and recognizable. Avoid external libraries, intricate syntax, generics, long identifiers, and localized string literals. When editing Java challenges, compile each class independently; the two `Race` examples intentionally share a class name and belong to separate rounds. The 24 current challenges compile with Java 8.
