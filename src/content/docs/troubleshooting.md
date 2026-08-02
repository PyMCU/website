---
title: Troubleshooting
description: Common PyMCU failures and what causes them - compiler error types, silent serial ports, config mistakes and stale stdlib edits.
---

Things that go wrong often, and the actual reason each one happens. For installation and
flashing problems (`pymcu: command not found`, `avrdude` not responding, a Pico that will
not mount), see the [CLI driver page](/pymcu/driver/#troubleshooting).

## Reading a compiler error

Every diagnostic follows the same shape, so editors and CI log parsers can pick it up:

```
src/main.py:12:9: error: TypeError: cannot assign float to uint8
11 | count: uint8 = 0
12 | count = 3.14
         ^~~~
13 | led.toggle()
```

`file:line:column: severity: ErrorType: message`, then the surrounding source with the
offending token underlined. The **error type** tells you which stage rejected the program:

| Type | Stage | What it usually means |
|---|---|---|
| `LexicalError` | Lexer | A character the lexer cannot read. Non-ASCII text outside a comment is the classic cause |
| `IndentationError` | Lexer | Mixed or inconsistent indentation, same as CPython |
| `SyntaxError` | Parser | The grammar rejected the construct. Often a Python feature PyMCU does not implement - check [Limitations](/pymcu/limitations/) |
| `NameError` | IR generation | Assigning a module-level global inside a function without a `global` declaration (Python would have made a local - the compiler makes you say which you meant), or calling `.append()` and friends on an untyped `[]` |
| `TypeError` | IR generation | An assignment or call whose types do not line up - assigning `None` to a scalar, passing a float where a `uint8` is expected |
| `ValueError` | IR generation | A value that is well-typed but impossible, such as a literal outside its type's range |
| `IndexError` | IR generation | A constant index the compiler can prove is out of bounds |
| `RecursionError` | IR generation | Recursion, which bare metal has no stack budget for. The diagnostic prints the full cycle |
| `CompileError` | HAL / backend | The construct is valid Python but not supported on **this target** - see below |

`CompileError` is the interesting one. It is what the HAL raises when your code asks the
silicon for something it does not have: `Pull-down resistor not supported on AVR`,
`IRQ not yet supported on ATtiny`,
`WiFi (CYW43439) is only supported on the Pico 2 W (rp2350) so far`. The message names the
limitation, and the fix is nearly always to pick a different pin, peripheral or target
rather than to change the Python.

### `InternalCompilerError` is not your fault

```
src/main.py:1:1: error: InternalCompilerError: ...
```

This means the compiler crashed rather than rejecting your program. Whatever you wrote, you
should not have been able to trigger it, and there is no workaround you are expected to
find. **Please file a bug at
[github.com/PyMCU/PyMCU/issues](https://github.com/PyMCU/PyMCU/issues)** with the source
that triggered it - a minimal reproduction is ideal but not required.

## Nothing appears on the serial port

Work down this list.

**1. Are you connected at the right baud rate?** When your program calls `print()` without
constructing a `UART()` yourself, the build injects a stdout preamble that initialises the
UART before your code runs - mirroring the way MicroPython has a console ready at boot. The
defaults are **UART0 at 115200 baud**, configurable in `pyproject.toml`:

```toml
[tool.pymcu]
stdout      = "uart0"
stdout_baud = 9600
```

If instead you construct `UART(9600)` yourself, *that* is the baud rate - the build detects
your `UART()` and injects only the console formatting helpers, without re-initialising the
port. A terminal set to 115200 against a program that opened 9600 shows nothing but noise.

Run `pymcu build -v` to see the decision reported: it logs whether the preamble was
injected and at what rate.

:::note[`stdout` is recorded but not yet dispatched]
Only `stdout_baud` changes what is emitted today. The injected preamble always initialises
the default UART regardless of the `stdout` value, so setting `stdout = "uart1"` will not
move the output.
:::

**2. There is no `pymcu monitor` command.** PyMCU builds and flashes; it does not ship a
serial terminal. Use whatever your platform has:

```bash
screen /dev/cu.usbmodem14101 115200      # macOS - Ctrl-A then K to quit
minicom -D /dev/ttyACM0 -b 115200        # Linux
picocom -b 115200 /dev/ttyUSB0           # Linux, lighter
```

On macOS use the `cu.` device, not `tty.`.

**3. Close the terminal before flashing.** A serial monitor holding the port will make
`pymcu flash` fail to open it.

**4. Check the wiring on a bare chip.** A USB-to-serial adapter needs its RX on the MCU's
TX, and a shared ground.

## `print()` outputs nothing on PIC or RISC-V

`print()` is dispatched through `pymcu.hal.console`, and the console has a different amount
of support per architecture:

| Target | `print("text")` | `print(number)` |
|---|---|---|
| AVR | yes | yes |
| RP2040 / RP2350 | yes | yes |
| PIC14 (mid-range) | yes | **no** |
| PIC12, PIC18, RISC-V | **no** | **no** |

Where a target is unsupported the call is **dropped silently** rather than failing to link -
so the build succeeds and the board says nothing. That is deliberate, so a portable program
still compiles everywhere, but it does mean a missing line is not always a wiring fault.

On those targets, drive the UART directly instead:

```python
from pymcu.hal.uart import UART

uart = UART(9600)
uart.println("READY")
uart.write(value)
```

## "Cannot set both 'target' and 'board'"

```
Error: Cannot set both 'target' and 'board' in [tool.pymcu].
  'board = "arduino_uno"' implies target = "atmega328p". Remove the 'target' key.
```

The two keys are mutually exclusive, and **only one of them is required**. `board` is the
friendly form - it implies the chip, the toolchain and the programmer defaults. `target` is
the advanced form, naming a chip identifier such as `atmega328p` or `rp2350` directly. Pick
one and delete the other; the error message tells you which chip your board implies, so you
can switch to `target` without guessing.

The full key reference is on the [CLI driver page](/pymcu/driver/#configuration).

## Delays and baud rates are wildly wrong

`frequency` in `[tool.pymcu]` is what every timing calculation is derived from - delay
loops, UART divisors, timer prescalers. If it does not match the clock the chip actually
runs at, everything drifts by the same ratio.

`pymcu new` writes the right value for the board you picked, but a hand-written
`pyproject.toml` that omits `frequency` entirely falls back to **4 MHz**. On a 16 MHz
Arduino Uno that makes every delay four times too long and puts the UART well outside its
tolerance. Set it explicitly:

```toml
[tool.pymcu]
board     = "arduino_uno"
frequency = 16000000
```

Bare chips are the other common trap: an ATtiny straight from the factory runs its internal
RC oscillator at 8 MHz (often divided to 1 MHz by the `CKDIV8` fuse), not at whatever
crystal is on the board next to it.

## My edits to the stdlib have no effect

You edited something under `lib/src/pymcu/`, rebuilt, and the change did not appear in the
firmware.

The cause is almost always a **physical copy of the stdlib in `site-packages`** shadowing
the editable install. The editable install works through a `.pth` file that points back at
your checkout; a real `site-packages/pymcu/` directory sits earlier in the import path and
wins, so your edits are silently ignored.

Confirm it:

```bash
python -c "import pymcu; print(pymcu.__file__)"
```

If that prints a path inside `site-packages`, you have an orphan copy. Delete it, then
reinstall editable:

```bash
uv pip install --no-deps -e lib/
```

**Never `cp` or `rsync` `lib/src/pymcu` into `site-packages`.** It appears to work once and
then quietly stops tracking your changes. The editable install is the supported workflow -
after it is in place, stdlib edits are picked up on the next build with no copying at all.

## `avr-size` reports a bigger binary than `pymcu build`

Both numbers are right; they are measuring different things.

`pymcu build` parses the Intel HEX and then **subtracts a constant 106-byte startup
preamble** - 26 interrupt vector slots at 4 bytes each, plus a 2-byte `__bad_interrupt`
jump. Every PyMCU binary carries it whatever the program does, and deducting it keeps
size comparisons between two builds (or against an avr-gcc build, whose crt0 footprint is
the same shape) about *your* code rather than about the fixed runtime.

`avr-size` reports the whole image, preamble included. So expect `avr-size` to be about 106
bytes larger on AVR. If you need the raw flash figure, use `avr-size` - and remember that
the `.hex` file's data bytes are the real number that gets programmed.

## Related

- [CLI driver](/pymcu/driver/) - every command and every `pyproject.toml` key
- [Limitations](/pymcu/limitations/) - what the language and the HAL do not do yet
- [Targets](/pymcu/targets/) - per-architecture support
- [Language reference](/pymcu/language-reference/)
