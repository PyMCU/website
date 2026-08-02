---
title: Migrating from CircuitPython
description: Port an existing CircuitPython project to PyMCU — lint it, annotate it, and build for AVR or the Pico.
---

The `pymcu-circuitpython` compat package makes CircuitPython migration nearly transparent for
most firmware, on **AVR (ATmega / ATtiny)** and on the **Raspberry Pi Pico / Pico 2**. How much
of the flavour you get depends on the target: `board`, `digitalio` and `busio.UART` are
portable, the rest is AVR-only. See the
[module table](/compat/circuitpython/#supported-modules) for the exact split. Follow these
steps:

## Step 0: Lint the project first

`pymcu lint` is a porting assistant: it parses your sources with CPython's own `ast` and
lists every construct PyMCU cannot compile, each with a severity and a suggested rewrite.

```bash
pymcu lint code.py
pymcu lint src/ --errors-only     # only the hard blockers
```

`ERROR` means it is outside PyMCU's subset — dict/set comprehensions, bare `dict()` / `set()`
calls, reflection (`getattr`, `eval`) and `*args` / `**kwargs`. `WARN` means it is supported
in a limited form and needs a bounded rewrite: an unbounded `list.append` / `.extend` /
`.insert`, runtime type checks, and untyped parameters or return types all land here. `INFO`
means it maps ~1:1 onto the compat API — `board`, `digitalio`, `busio`, `analogio`, `pwmio`
and `adafruit_*` imports all land in that last bucket. Work the errors first, then the
warnings: an unbounded `append` still has to become a fixed-size buffer before the program
will build. Full flag list in [the CLI reference](/driver/#pymcu-lint-path).

## Step 1: Install the compat package

```bash
pip install pymcu-circuitpython
```

Add to `pyproject.toml`:

```toml
[tool.pymcu]
stdlib = ["circuitpython"]
board  = "arduino_uno"
```

For a Raspberry Pi Pico, select its board file instead — `board.LED`, `board.TX` and
friends then resolve to the standard Pico pinout:

```toml
[tool.pymcu]
stdlib    = ["circuitpython"]
board     = "raspberry_pi_pico"
frequency = 125000000
```

For a Pico 2 there is no board file, so name the target and skip `import board`:

```toml
[tool.pymcu]
stdlib    = ["circuitpython"]
target    = "rp2350"
frequency = 150000000
```

`board` and `target` are mutually exclusive — setting both is a hard error. With `target`
set, the driver emits no `dist/_generated/board.py`, so `import board` will not resolve; pass
GP numbers straight to `digitalio.DigitalInOut(...)` and `busio.UART(...)` instead.

## Step 2: Copy your CircuitPython source

Your `code.py` becomes `src/main.py`. Top-level statements are supported — the compiler
synthesizes a `main()` from the module's executable statements — so a CircuitPython script
that runs straight from top to bottom compiles as written. An explicit `def main():` is still
recommended for anything non-trivial.

## Step 3: Add type annotations

PyMCU requires explicit integer widths. Add them to every variable declaration:

```python
# CircuitPython
count = 0
val = sensor.value

# PyMCU
count: uint16 = 0
val: uint8 = sensor.value
```

## Step 4: Adjust the few things that differ

### `time.sleep()` — keep it exactly as written

This is the change most CircuitPython porting guides get wrong, so to be explicit: **there is
nothing to change**. `time.sleep(0.5)` compiles as-is.

```python
# CircuitPython
time.sleep(0.5)

# PyMCU — identical
time.sleep(0.5)
```

The flavour's `time` module defines exactly three names — `sleep(seconds: float)`,
`monotonic()` and `monotonic_ns()`. There is **no** `sleep_ms()` or `sleep_us()`; writing one
is a `NameError` at build time.

The argument is folded at compile time: `sleep(0.5)` lowers to `delay_ms(500)`, so no
floating-point code reaches the device. That does impose two limits — the value must be a
compile-time constant, and the resulting millisecond count must fit in a `uint16` (about
65 seconds). For a runtime-computed or longer delay, call `pymcu.time.delay_ms()` in a loop.

### Check which half of the flavour you are using

`board`, `digitalio`, `busio.UART` and `time.sleep()` compile on every target. `analogio`,
`pwmio`, `busio.SPI`, `busio.I2C`, `neopixel` and `microcontroller` are imported inside an
`if __CHIP__.arch == "avr":` guard and therefore **do not exist on the Pico**. If your program
uses them and you are targeting an RP chip, move those peripherals to
[the native HAL](/stdlib/).

Anything that needs a millisecond counter splits the same way: `time.monotonic()`,
`time.monotonic_ns()` and `supervisor.ticks_ms()` all read `pymcu.hal.timer`, which has no RP
implementation, so they raise a `CompileError` on the Pico. `supervisor.ticks_add()` /
`ticks_diff()` are portable; `supervisor.reload()` is a watchdog reset and so AVR-only.

### `busio.UART.read()` and `busio.I2C.scan()` are no-ops

Both would have to return a heap object. They are marked `@warning` and compile to nothing —
the build tells you so — and each has a buffer-based replacement:

```python
# CircuitPython
data = uart.read(1)
addrs = i2c.scan()

# PyMCU
buf: uint8[1] = bytearray(1)
uart.readinto(buf)          # fills the caller's buffer; returns the count

if i2c.probe(0x3C):         # test one address at a time
    ...
```

### `Pull.DOWN` and `DriveMode.OPEN_DRAIN`

`pin.pull = Pull.DOWN` raises a `CompileError` on AVR — the parts have no internal pull-down.
It works on the RP2040 and RP2350. `DriveMode.OPEN_DRAIN` is accepted everywhere but honoured
nowhere: neither the AVR nor the RP GPIO has open-drain hardware, so use an external pull-up
and toggle between input and output if you need it.

### `analogio.AnalogOut` warns rather than failing

No AVR part has a DAC, so the constructor is a `@warning` no-op: the build prints a
diagnostic pointing you at `pwmio.PWMOut` and carries on. It is not a hard error, which means
it is easy to miss — check the build output.

### `float` works — integers are still cheaper

`float` is IEEE-754 single precision on AVR (soft-float helpers) and on ARM (bootrom
fast-float on RP2040, the M33 FPU on RP2350):

```python
temp_c: float = raw * 3.3 / 1024.0 * 100.0
print(temp_c)
```

On an 8-bit AVR each operation costs a few hundred cycles, so integer fixed-point
(multiply first, divide last) is still the better choice in a hot loop:

```python
temp_c: uint16 = raw * 330 // 1024
```

### `try / except` works

Exceptions are supported on AVR and ARM through a zero-cost flag-propagation model — no
heap, no unwinder, no tables:

```python
from pymcu.exceptions import ValueError

try:
    val = sensor.read()
except ValueError:
    val = 0
```

An error sentinel remains a perfectly good bare-metal idiom if you prefer it, and it is
portable to the PIC backend, where only `ZeroDivisionError` guards exist.

### `f"..."` format strings work

```python
print(f"temp={temp}")               # streamed
s = f"temp={temp:03d}"              # value form, built into a fixed buffer
print(s)
```

Format specs `{x:02x}`, `{x:X}`, `{x:08b}`, `{x:o}`, `{x:5d}` and `{x:04d}` are supported.
Float interpolations in the value form and comparing an f-string result to a literal are
not supported yet.

### `print()` writes to the UART

`print()` works as-is — the build driver detects it and injects the UART initialisation:

```python
print("hello")              # -> "hello\n" on UART0
```

An explicit UART object also works when you want to control the port and baud rate:

```python
uart.println("hello")
```

### Replace unbounded containers

Closed `dict` / `set` **literals** compile to lookup tables (`d[k]`, `k in d`, `len(d)`),
and `pymcu.collections.FixedDict(capacity)` gives you a mutable mapping with no heap. What
has no equivalent is a container that grows without a bound — size it up front. This is the
`list-grow` warning `pymcu lint` raises.

## Common patterns

### Blink (CircuitPython)

```python
import board, digitalio, time

led = digitalio.DigitalInOut(board.LED)
led.direction = digitalio.Direction.OUTPUT
while True:
    led.value = True
    time.sleep(0.5)
    led.value = False
    time.sleep(0.5)
```

### Blink (PyMCU + pymcu-circuitpython)

```python
import board, digitalio, time

led = digitalio.DigitalInOut(board.LED)
led.direction = digitalio.Direction.OUTPUT
while True:
    led.value = True
    time.sleep(0.5)    # no change at all
    led.value = False
    time.sleep(0.5)
```

Byte for byte the same file. Add `board = "arduino_uno"` and
`stdlib = ["circuitpython"]` to `pyproject.toml` and it builds.

### Blink (Raspberry Pi Pico)

The same source again, with `board = "raspberry_pi_pico"` — `board.LED` is GP25:

```python
import board, digitalio, time

led = digitalio.DigitalInOut(board.LED)
led.direction = digitalio.Direction.OUTPUT
while True:
    led.value = True
    time.sleep(0.5)
    led.value = False
    time.sleep(0.5)
```

On a **Pico 2** there is no board module, so drop `import board` and pass the GP number:

```python
import digitalio, time

led = digitalio.DigitalInOut(25)
led.direction = digitalio.Direction.OUTPUT
while True:
    led.value = True
    time.sleep(0.5)
    led.value = False
    time.sleep(0.5)
```

## What stays the same

- `import board, digitalio, busio` — identical API on every target
- `import analogio, pwmio, neopixel, alarm, microcontroller` — identical API, **AVR only**
- `import supervisor` — `ticks_add` / `ticks_diff` / `runtime` are portable; `ticks_ms()` and
  `reload()` are **AVR only**
- `time.monotonic()` / `time.monotonic_ns()` — identical API, **AVR only**
- `led.value = True/False` — works
- `led.direction = digitalio.Direction.OUTPUT` — works with `@property`
- `time.sleep(0.5)` — works, float seconds, folded at compile time
- `uart.write(bytes)` — works; `uart.read(n)` is a no-op, use `uart.readinto(buf)`
- `adc.value` — works (returns `uint16`), AVR only
- `Pin.pull` — works, except `Pull.DOWN` on AVR
- `try` / `except` / `raise`, `float`, f-strings, generators and `await asyncio.sleep_ms()`
- `wifi` + `socketpool` + `adafruit_minimqtt` — WiFi and MQTT on the **Pico 2 W (RP2350)
  only**, and only for open networks: `connect()` raises a `CompileError` on a non-empty key
  because WPA is not implemented yet

See the [CircuitPython compatibility reference](/compat/circuitpython/) for the full module
surface and the [Pico examples](/examples/rp2040/) for runnable programs.
