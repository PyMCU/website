---
title: CLI Driver
description: The pymcu command — new, build, flash, clean, lint, boards, toolchain, backend, sync and upgrade, plus every pyproject.toml key and the compiler's error types.
---

The `pymcu` command-line tool manages PyMCU projects: creation, building, flashing and
linting. It comes with `pymcu-compiler` — see
[Installation](/pymcu/getting-started/installation/).

## Commands

| Command | Description |
|---|---|
| [`pymcu new <name>`](#pymcu-new-name) | Scaffold a new project |
| [`pymcu build`](#pymcu-build) | Compile `src/` into firmware |
| [`pymcu flash`](#pymcu-flash) | Upload the firmware to a device |
| [`pymcu clean`](#pymcu-clean) | Remove build artefacts |
| [`pymcu lint <path>`](#pymcu-lint-path) | Vet a MicroPython / CircuitPython port |
| [`pymcu boards`](#pymcu-boards) | List the supported boards and chips |
| [`pymcu toolchain`](#pymcu-toolchain) | Manage assemblers and linkers |
| [`pymcu backend`](#pymcu-backend) | Manage code-generation backend plugins |
| [`pymcu sync`](#pymcu-sync) | Regenerate the board module from `pyproject.toml` |
| [`pymcu upgrade`](#pymcu-upgrade) | Update PyMCU packages in the project and the global tool |
| [`pymcu stubs`](#pymcu-stubs) | Emit PEP 561 `.pyi` stubs for the installed packages |

## Global options

These sit on `pymcu` itself, before the subcommand:

| Flag | Description |
|---|---|
| `-v`, `--verbose` | Verbose logging for the whole run. Recognised anywhere on the command line, so `pymcu build -v` turns on the global debug output too |
| `--version` | Print version information and exit |

```bash
pymcu --version
```

prints a table of `pymcu-compiler`, `pymcu-stdlib` and the Python interpreter with the
version of each — not a single version string. A package that is not installed is shown as
**Not Installed** rather than omitted, which makes it the quickest way to check whether the
stdlib is actually on the path.

:::note[`pymcu version` is not a command]
Version information is only reachable through the `--version` flag. `pymcu version` exits
with "No such command".
:::

## `pymcu new <name>`

Creates a new PyMCU project.

```bash
pymcu new my_project
```

### Interactive prompts

- **Compatibility layer** — `micropython` or `circuitpython`
- **Target board** — manufacturer, then model (or `--chip` for a raw chip identifier)
- **Initialise a git repository?** — defaults to **no**
- **Install dependencies now?** — defaults to **no**

The **package manager is not a prompt**. `pymcu new` detects `uv` on your PATH, then
`poetry`, and uses whichever it finds, printing `Detected package manager: <name>`. Only if
neither is present does it ask anything — and the single question is whether to install
`uv`; declining falls back to `pip`. Pass `--pkg-manager` to decide it yourself.

### Generated files

| File | Contents |
|---|---|
| `src/main.py` | Starter firmware in the compat API you chose (`app.py` at the root with `--no-src`) |
| `pyproject.toml` | Project config with a `[tool.pymcu]` section |
| `Makefile` | Always written; a `sync` / `install` target that runs your package manager followed by `pymcu sync` |
| `requirements.txt` | **pip flavour only** — pinned `pymcu-stdlib`, `pymcu-compiler[extra]` and each compat package |
| `.gitignore` | Git ignore rules (`dist/`, `__pycache__/`, `*.hex`, `.venv/`, ...) |

If you accept the git prompt, `post-merge` and `post-checkout` hooks are installed that
re-run `pymcu sync` whenever `pyproject.toml` changes.

### Options

| Flag | Description |
|---|---|
| `--board NAME` | Pick the board non-interactively (`arduino_uno`, `arduino_mega`, `raspberry_pi_pico`, ...) |
| `--stdlib FLAVOUR` | Compat flavour to enable — `micropython` or `circuitpython`. Repeatable |
| `--pkg-manager NAME` | `uv`, `poetry` or `pip` instead of auto-detection |
| `--no-git` | Skip the git prompt and the repository entirely |
| `--no-src` | Flat layout — the entry point becomes `./app.py` instead of `src/main.py` |
| `--chip ID` | Advanced: target a chip directly, bypassing board selection. **Hidden from `--help`** |
| `--freq HZ` | Advanced: override the CPU clock. **Hidden from `--help`** |

:::caution[`--freq`, not `--frequency`]
The flag is spelled `--freq`. It writes the `frequency` key into `pyproject.toml`, which is
where the mismatch comes from. Both `--chip` and `--freq` are marked hidden, so neither
appears in `pymcu new --help` — they exist, they are simply not advertised.
:::

The frequency written for you comes from a per-board table, and falls back to a per-chip
default when the board is not in it. `--board raspberry_pi_pico` is one of those fallbacks:
there is no Pico entry in the board table, so it takes the RP2040 chip default and writes
`frequency = 125000000` — which is the correct `clk_sys` the RP HAL assumes, so there is
nothing to fix. A Pico 2 (`rp2350`) defaults to `150000000` the same way.

## Configuration

Everything the driver needs lives under `[tool.pymcu]` in `pyproject.toml`.

```toml
[project]
name = "blink"
version = "0.1.0"
dependencies = [
    "pymcu-stdlib",
    "pymcu-compiler[avr]",
    "pymcu-micropython",
]

[tool.pymcu]
board     = "arduino_uno"
frequency = 16000000
sources   = "src"
entry     = "main.py"
stdlib    = ["micropython"]

[tool.pymcu.flash]
programmer = "avrdude"
port       = "/dev/cu.usbmodem1401"
baud       = 115200
```

The **minimum** viable configuration is one line — everything else has a default:

```toml
[tool.pymcu]
board = "arduino_uno"
```

| Key | Default | Meaning |
|---|---|---|
| `board` | — | Development board; the chip, toolchain and programmer defaults follow from it |
| `target` | — | Alternative to `board` — a chip identifier such as `atmega328p`, `rp2040`, `rp2350` |
| `chip` | — | **Deprecated** alias for `target`. Still honoured, but the build prints a rename notice |
| `frequency` | `4000000` | CPU clock in Hz; delays and UART baud rates are derived from it |
| `sources` | `"src"` | Source directory |
| `entry` | `"main.py"` | Entry-point file inside `sources` |
| `stdlib` | *(none)* | Compat flavours to make importable — `["micropython"]` or `["circuitpython"]` |
| `stdlib_path` | — | Point the build at a checkout of the stdlib instead of the installed package. Relative to the `pyproject.toml`; a warning is printed if the directory does not exist |
| `stdout` | `"uart0"` | Which device `print()` writes to — see [Serial output](#serial-output-and-print) |
| `stdout_baud` | `115200` | Baud rate for that device |
| `[tool.pymcu.config]` | `{}` | Chip configuration bits (e.g. PIC `FOSC`), passed through to the compiler |
| `[tool.pymcu.vectors]` | — | `reset` and `interrupt` vector addresses, for building behind a bootloader |
| `[tool.pymcu.flash]` | — | Programmer, port and baud for `pymcu flash` — see [below](#pymcu-flash) |
| `[tool.pymcu.ffi]` | — | C / C++ sources to compile and link — see [below](#c--c-interop) |

:::caution[`board` and `target` are mutually exclusive]
Setting both is a hard error, not a precedence rule:

```text
Error: Cannot set both 'target' and 'board' in [tool.pymcu].
  'board = "arduino_uno"' implies target = "atmega328p". Remove the 'target' key.
```

`board` additionally enables the generated `board` module that CircuitPython code imports;
`target` alone does not. See [`pymcu sync`](#pymcu-sync).
:::

:::note[`[tool.pymcu.toolchain]` is scaffolded but ignored]
`pymcu new` writes a `[tool.pymcu.toolchain] name = "..."` table, and older projects have
one, but **nothing reads it**. The assembler and linker are chosen from the chip at build
time. Removing the table changes nothing; editing it also changes nothing, which is the
more surprising half.
:::

**PIC example**

```toml
[tool.pymcu]
target    = "pic16f84a"
frequency = 4000000

[tool.pymcu.config]
FOSC = "XT"

[tool.pymcu.flash]
programmer = "pk2cmd"
```

## Serial output and `print()`

`print()` and f-strings are compiler builtins — they work whichever API you import, and
they write to a UART. To *see* that output you need a serial terminal on the host at a
matching baud rate.

**The default is 115200 baud on UART0.** Two keys control it:

```toml
[tool.pymcu]
stdout      = "uart0"     # default
stdout_baud = 115200      # default
```

When the build sees a `print()` (or `input()`) in your sources and you have **not**
constructed a `UART` yourself, it injects a preamble that opens the console UART at
`stdout_baud` before your code runs — the same convenience MicroPython gives you, resolved
at compile time:

```python
# Auto-injected by pymcu build: stdout=uart0 at 115200 baud for print()
from pymcu.hal.uart import UART as _pymcu_stdout
from pymcu.hal.console import print_str
```

If your program **does** construct a `UART` of its own, the build injects only the console
helpers and no initialisation, so your `UART(9600)` keeps ownership of the hardware — and
`print()` then comes out at *your* baud rate, not `stdout_baud`. The rewritten entry point
is written to `dist/_generated/` if you want to read exactly what was added.

:::note[`stdout` selects the device in name only]
Today the injected import is always `pymcu.hal.uart.UART`, so `stdout` reaches the generated
comment but not the generated code. `stdout_baud` is the key with a functional effect.
:::

### Reading the output

There is **no `pymcu monitor` command**. Use any serial terminal:

```bash
screen /dev/cu.usbmodem1401 115200     # macOS - quit with Ctrl-A then K
picocom -b 115200 /dev/ttyACM0         # Linux
minicom -D /dev/ttyACM0 -b 115200      # Linux
```

On Windows, PuTTY or the Arduino IDE's Serial Monitor work equally well — the Arduino
monitor has a baud-rate dropdown in the bottom-right corner that must be set to match.

Two things catch people out:

- The board resets when the serial port is opened, so **open the terminal first**, then
  press reset, or you will miss the first lines.
- Match the baud rate to whichever value is actually in effect: `stdout_baud` when the build
  injected the preamble, or your own `UART(...)` argument when it did not.

### Where `print()` works

| Target | Strings | Numbers | Floats |
|---|---|---|---|
| AVR | Yes | Yes | Yes |
| RP2040 / RP2350 | Yes | Yes | Yes |
| PIC14 | Yes | No | No |
| PIC12, PIC18, RISC-V | **Nothing** | **Nothing** | **Nothing** |

:::caution[`print()` fails silently on pic12, pic18 and riscv]
`pymcu.hal.console` deliberately compiles `print()` to a no-op on targets that have no
console implementation, so the program links and runs but emits nothing at all — there is no
compile error and no warning to tell you. On PIC14, string output works but numeric output
is not wired, so `print("temp")` appears and `print(t)` does not.
:::

## `pymcu build`

Compiles the project.

```bash
pymcu build
pymcu build -v                       # verbose: assembler output and the full build log
pymcu build --stdlib micropython     # override the pyproject stdlib flavour
pymcu build --debug                  # emit debug symbols and a source line map
```

| Flag | Description |
|---|---|
| `-v`, `--verbose` | Assembler output and the full build log |
| `--stdlib FLAVOUR` | **Replaces** the `stdlib` key from `pyproject.toml` for this build. Repeatable |
| `--debug` | Emit debug symbols and a line map alongside the firmware |

**Output files**

| File | Description |
|---|---|
| `dist/firmware.hex` | Intel HEX — AVR and PIC |
| `dist/firmware.bin` | Flat flash image — ARM (RP2040 / RP2350) |
| `dist/firmware.uf2` | Drag-and-drop image for BOOTSEL mode — ARM |
| `dist/firmware.asm` | Assembly listing with source annotations |
| `dist/firmware.mir` | Mid-level IR — useful when investigating code generation |
| `dist/_generated/` | Any entry point the build rewrote, plus the generated `board` module |

The only requirement is a valid `pyproject.toml` in the project root; the toolchain for the
selected target is bundled with the corresponding compiler extra.

### The reported flash size

A successful build ends with a line like:

```text
Flash: 162 / 32768 bytes (0% of program storage)
```

On AVR that number is **not** what `avr-size` reports for the same `.hex`. The driver
subtracts a constant **106-byte startup preamble** — 26 interrupt-vector slots at 4 bytes
each, plus a 2-byte `__bad_interrupt` jump — that every PyMCU binary carries whether it uses
interrupts or not. The deduction exists so the figure is comparable with an `avr-gcc -Os`
build, whose `crt0` costs the same. Add 106 back to compare against a raw tool.

The ARM path reports the raw size of `dist/firmware.bin` with no deduction, so the two
architectures' figures are not measured the same way.

### Compiler error output

When the compiler rejects your program it prints a diagnostic with source context, line
numbers and a `^~~` underline on the offending token:

```text
src/main.py:12:9: error: TypeError: cannot assign float to uint8
11 | count: uint8 = 0
12 | count = 3.14
         ^~~~
13 | led.toggle()
```

The header line follows the conventional `file:line:col: severity: ErrorType: message`
format, so editors and CI log parsers can pick it up. Output is coloured when stderr is a
TTY and plain otherwise, which keeps CI logs readable.

### Error types

The `ErrorType` field is one of a small closed set. Knowing which one you got tells you what
kind of fix to reach for:

| Type | What it means |
|---|---|
| `SyntaxError` | Malformed Python the parser cannot accept — including constructs PyMCU restricts, such as `await` outside statement position |
| `IndentationError` | Inconsistent indentation |
| `LexicalError` | The tokenizer choked on a character or literal. A non-ASCII character in a source file is the usual cause |
| `CompileError` | Valid Python that cannot exist on this target — an `@export_c` function or an ISR that can propagate an exception, or an explicit `raise CompileError(...)` from a HAL guard telling you the feature is unsupported on your chip |
| `ValueError` | An illegal compile-time constant — division or modulo by zero, a shift count outside `0..31`, `chr()` out of range |
| `TypeError` | Operand or assignment type mismatch. The largest category by far |
| `RecursionError` | A recursive call cycle. PyMCU uses a static stack layout with no per-call frames, so recursion cannot be lowered — rewrite it as a loop. The message names the full cycle |
| `NameError` | An unresolvable name, including `.append()` on an untyped `[]` that has no runtime list behind it |
| `IndexError` | A constant subscript outside the array bounds, caught at compile time |

There is one more you may see:

:::note[`InternalCompilerError` is a bug, not your mistake]
```text
src/main.py:1:1: error: InternalCompilerError: <message>
```
This is the catch-all for an unhandled exception inside the compiler, reported with no real
source location. It means the compiler failed to do its job on input it should have handled
— or should at least have rejected with a proper diagnostic. Please
[file a bug](https://github.com/PyMCU/PyMCU/issues) with the source that triggered it.
:::

## `pymcu flash`

Uploads the built firmware to the connected device.

```bash
pymcu flash
pymcu flash --port /dev/cu.usbmodem*    # macOS
pymcu flash -P /dev/ttyACM0             # Linux; -P is the short form
pymcu flash --port COM3                 # Windows
```

| Flag | Description |
|---|---|
| `-P`, `--port` | Serial port. Overrides `[tool.pymcu.flash] port` |
| `-v`, `--verbose` | Verbose logging |

The port is resolved in this order: `--port`/`-P`, then `[tool.pymcu.flash] port`, then
auto-detection of the first matching USB-serial device, and finally an error with
configuration instructions.

The artefact follows the target family: HEX for AVR and PIC, `.uf2` / `.bin` for the RP
parts. **AVR** uses avrdude over the Arduino bootloader (avrdude must be installed on the
host). **PIC** drives a PICkit 2 through `pk2cmd`, downloaded on first use. **ARM** copies
the UF2 to a Pico in BOOTSEL mode — hold BOOTSEL while plugging the board in so it
enumerates as a mass-storage device.

### `[tool.pymcu.flash]`

```toml
[tool.pymcu.flash]
programmer = "avrdude"                    # avrdude | pk2cmd | a backend plugin
port       = "/dev/cu.usbmodem1401"       # optional; --port wins
baud       = 115200                       # optional
```

Those three are the only keys read. When `programmer` is absent, a sensible default is
chosen from the chip, so most projects never need the table at all.

:::caution[`[tool.pymcu.programmer]` is the old spelling]
Projects scaffolded before 0.15 have a `[tool.pymcu.programmer]` table instead. Its `name`
key is **still honoured**, but only as a fallback used when `[tool.pymcu.flash] programmer`
is unset, and using it prints a deprecation notice telling you to migrate:

```text
Deprecated: [tool.pymcu.programmer] is read only as a fallback. Move it to:
  [tool.pymcu.flash]
  programmer = "avrdude"
```

The `protocol` and `baudrate` keys that some older documentation showed under that table
were never read by anything — delete them. Port and baud belong in `[tool.pymcu.flash]` as
`port` and `baud`.
:::

## `pymcu clean`

Removes `dist/` and all build artefacts, including `dist/_generated/`.

```bash
pymcu clean
```

## `pymcu lint <path>`

New in alpha 3: a **porting assistant**. It parses existing MicroPython or CircuitPython
source with CPython's own `ast` and flags the idioms that do not fit PyMCU's statically
typed, heap-free subset — each with a concrete suggested rewrite.

```bash
pymcu lint src/                  # a directory, recursively
pymcu lint main.py               # a single file
pymcu lint src/ --errors-only    # hard blockers only
pymcu lint src/ --flavor micropython
pymcu lint src/ --json           # machine-readable findings
```

| Flag | Description |
|---|---|
| `--flavor NAME` | Override the detected flavour — `micropython` or `circuitpython` |
| `--errors-only` | Show only hard `ERROR` findings |
| `--json` | Emit findings as JSON on stdout |

Findings come in three severities:

| Severity | Meaning |
|---|---|
| `ERROR` | Will not compile in PyMCU's subset — must be rewritten |
| `WARN` | Supported only in a limited form; needs care |
| `INFO` | Fine as-is — usually an import that maps to a compat API |

Hardware imports (`machine`, `rp2`, `board`, `digitalio`, `busio`, ...) map roughly one to
one through the compat packages, so they are reported as `INFO`, not problems. The command
exits non-zero when there is at least one `ERROR`, which makes it usable as a CI gate.

See also the migration guides for
[MicroPython](/pymcu/migration/from-micropython/) and
[CircuitPython](/pymcu/migration/from-circuitpython/).

## `pymcu boards`

Lists every board and chip this installation supports — the valid values for the `board` and
`target` keys, and for `pymcu new --board`.

```bash
pymcu boards
pymcu boards --json     # machine-readable catalogue
```

## `pymcu toolchain`

Manages the assemblers and linkers cached under `~/.pymcu/tools/`. In normal use the
toolchain is fetched automatically on the first build for a target, so these are
troubleshooting commands.

```bash
pymcu toolchain list              # every toolchain family and its install status
pymcu toolchain install avr       # fetch one into the local cache
pymcu toolchain update avr        # re-download to pick up a newer version
```

`list` prints family, description, version and status.

## `pymcu backend`

Manages the code-generation backend plugins — the per-architecture halves of the compiler
that arrive with the `[avr]`, `[arm]` and `[pic]` extras.

```bash
pymcu backend list            # family, version, license status, binary path
pymcu backend list --json
pymcu backend install avr     # wraps pip install pymcu-backend-avr
pymcu backend check           # validate every installed backend's license
```

`backend check` exits non-zero if any installed backend fails validation, so it works as a
CI or packaging gate.

## `pymcu sync`

Regenerates `dist/_generated/board.py` from the `board` key in `pyproject.toml`. Run it
after changing boards; the git hooks that `pymcu new` optionally installs run it for you
when `pyproject.toml` changes on a merge or checkout, and the generated `Makefile` target
ends with it.

```bash
pymcu sync
```

This is what makes `import board` resolve. A project configured with `target` rather than
`board` has no board module to generate.

## `pymcu upgrade`

Updates the PyMCU packages in the current project **and** the globally installed
`pymcu-compiler` tool.

```bash
pymcu upgrade
pymcu upgrade --check       # report what is available, install nothing
pymcu upgrade --no-tool     # project packages only, leave the global tool alone
pymcu upgrade --no-pre      # stable releases only
```

Pre-releases are included **by default** (`--pre` is on), because PyMCU is in alpha and the
stable channel has nothing in it yet.

## `pymcu stubs`

Generates PEP 561 `.pyi` stub files from the installed `pymcu` packages, so a type checker
can see the API of code that only exists at compile time.

```bash
pymcu stubs                                  # -> dist/_generated/stubs
pymcu stubs -o typings -p pymcu_micropython
```

| Flag | Description |
|---|---|
| `-o`, `--out DIR` | Output directory (default `dist/_generated/stubs`) |
| `-p`, `--package NAME` | Restrict to one package. Repeatable |
| `--remap-types` | Rewrite PyMCU's fixed-width types to their closest CPython equivalents |

## C / C++ interop

```toml
[tool.pymcu.ffi]
sources       = ["src/sensor.c", "src/ArduinoLib.cpp"]
include_dirs  = ["src/include"]
cflags        = ["-O2"]
linker_script = "src/custom.ld"
```

A non-empty `sources` list is what switches the build onto the GNU binutils pipeline;
`include_dirs`, `cflags` and `linker_script` are all optional. Paths are resolved relative
to the project root.

On AVR, C sources are compiled with `avr-gcc` and C++ sources (`.cpp`, `.cc`, `.cxx`) with
`avr-g++` under `-fno-exceptions -fno-rtti`, which is what makes calling Arduino libraries
from PyMCU firmware possible. Declare the symbols on the Python side with `@extern`.

The `extern-call`, `ffi-abi`, `ffi-arduino`, `ffi-crc8` and `ffi-dsp`
[examples](/pymcu/examples/#c--c-interop-ffi) are complete working projects using this table.

## Troubleshooting

**`pymcu: command not found`**

Reinstall with an isolated installer and make sure its bin directory is on your PATH:

```bash
pipx install --pip-args=--pre "pymcu-compiler[avr]"
pipx ensurepath
```

Then open a new shell. `uv tool install --pre "pymcu-compiler[avr]"` works the same way.

**`avrdude: stk500_recv(): programmer is not responding`**

- Check that `--port` matches your board's serial device.
- macOS: `/dev/cu.usbmodem*` — note `cu.`, not `tty.`
- Linux: `/dev/ttyACM0` or `/dev/ttyUSB0`. For permission errors, add yourself to the
  `dialout` group: `sudo usermod -a -G dialout $USER`, then log out and back in.
- Windows: `COM3`, `COM4`, ...
- Close any serial terminal you left open on that port first — it holds the device.

**A Pico is not detected**

Hold **BOOTSEL** while plugging the board in. It should mount as a USB drive; if it does
not, try another cable — some USB cables are power-only.

**The program builds and flashes but `print()` shows nothing**

- Check the baud rate on both ends — the default is **115200**, not 9600.
- Check your target: `print()` is a silent no-op on pic12, pic18 and riscv, and prints
  strings but not numbers on pic14. See [Serial output](#serial-output-and-print).
- If your program constructs its own `UART(...)`, that constructor's baud rate wins over
  `stdout_baud`.
