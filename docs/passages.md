# Race passage design

The host can choose English, Spanish, or Java before each round. One original passage is selected on the server and sent to every racer. The language is locked through the countdown and race; changing it in the lobby clears readiness. The next round retains the choice until the host changes it.

English and Spanish use short, friendly racing and standup stories. Java uses six small classes with complete method bodies and basic Java 8 syntax. These are copying challenges, not coding questions: no solution, compilation, or execution is required in the game.

| Java class            | Miniature story                           | Typing ingredients                                    |
| --------------------- | ----------------------------------------- | ----------------------------------------------------- |
| `Race.advance`        | Move a car without passing the finish     | `class`, `static`, `int`, `if`, `return`, comparisons |
| `Race.winner`         | Find the first car across the line        | Arrays, indexed `for`, increment, `boolean`           |
| `Grid.countReady`     | Count the racers at the starting grid     | Enhanced `for`, `boolean[]`, `&&`, equality           |
| `Timer.countdown`     | Count down the starting lights            | `while`, decrement, guard clause                      |
| `Lap.distance`        | Add up correctly typed distance           | Enhanced `for`, accumulation, `+=`                    |
| `Standup.nextSpeaker` | Continue around the team after the winner | Bounds checks, addition, wraparound                   |

Java passages deliberately fit on one logical line. Display wraps visually; racers never need to guess indentation, insert newlines, or use tabs. Monospace text distinguishes braces, parentheses, brackets, operators, and semicolons. Spaces, case, punctuation, and accented characters in prose all count exactly. Code is rendered as text and is never evaluated.

The initial catalog contains roughly 200–260 characters per passage. Lengths and punctuation density vary, so different passages and modes are not comparable speed benchmarks. Tune length with the team toward the 45–60 second goal; the existing 90-second timeout applies to every mode.

Java reduces reliance on native-language prose, but Java familiarity and keyboard layouts still matter. Everyone receives the same code within a round. Rotating the mode and discussing actual completion times with the team is more useful than promising perfect language neutrality.

Keep additions in `shared/passages.ts` original, short, and easy to recognize. Avoid external libraries, long identifiers, comments, localized string literals, generics, and intricate syntax in the initial Java bank. When editing Java challenges, compile each class independently with a Java compiler; the two `Race` examples intentionally share a class name and belong to separate rounds.
