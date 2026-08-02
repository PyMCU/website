---
title: Migrating from MicroPython
description: Port an existing MicroPython project to PyMCU — lint it, annotate it, and build for AVR or the Pico.
---

The `pymcu-micropython` compat package provides `machine`, `utime`, `micropython`, `rp2`,
`network` and `umqtt` module names, so most MicroPython firmware ports with minimal edits —
for **AVR (ATmega / ATtiny)** and for the **Raspberry Pi Pico / Pico 2** alike. How much of
`machine` you get depends on the target: `Pin` and `UART` are portable, the rest is AVR-only.
See the [module table](/pymcu/compat/micropython/#supported-modules) for the exact split.

## Step 0: Lint the project first

`pymcu lint` is a porting assistant: it parses your sources with CPython's own `ast` and
lists every construct PyMCU cannot compile, each with a severity and a suggested rewrite.

```bash
pymcu lint src/
pymcu lint src/ --errors-only     # only the hard blockers
```

`ERROR` means it is outside PyMCU's subset — dict/set comprehensions, bare `dict()` / `set()`
calls, reflection (`getattr`, `eval`, `globals`) and `*args` / `**kwargs`. `WARN` means it is
supported in a limited form and needs a bounded rewrite: an unbounded `list.append` /
`.extend` / `.insert`, runtime type checks, and untyped parameters or return types all land
here. `INFO` means it maps ~1:1 onto the compat API. Start with the errors — they are the
whole delta between "runs under MicroPython" and "compiles with PyMCU" — then work the
warnings, because an unbounded `append` still has to become a fixed-size buffer before the
program will build. Full flag list in [the CLI reference](/pymcu/driver/#pymcu-lint-path).

## Step 1: Install the compat package

```bash
pip install pymcu-micropython
```

Add to `pyproject.toml`:

```toml
[tool.pymcu]
stdlib = ["micropython"]
board  = "arduino_uno"     # AVR: implies the chip and the pin map
```

For a Raspberry Pi Pico, pick the target instead — `machine.Pin` takes plain GP numbers
there, so no board file is needed:

```toml
[tool.pymcu]
stdlib    = ["micropython"]
target    = "rp2040"
frequency = 125000000
```

And for a Pico 2:

```toml
[tool.pymcu]
stdlib    = ["micropython"]
target    = "rp2350"
frequency = 150000000
```

`board` and `target` are mutually exclusive — setting both is a hard error.

## Step 2: Copy your MicroPython source

Your `main.py` stays as `src/main.py`. Top-level statements are supported: the compiler
synthesizes a `main()` from the module's executable statements, so a MicroPython script that
runs straight from top to bottom compiles as written. Writing an explicit `def main():` is
still recommended for anything non-trivial — it keeps declarations and executable code apart
and makes dead-code elimination easier to reason about — but it is not required.

## Step 3: Add type annotations

```python
# MicroPython
count = 0
data = bytearray(8)

# PyMCU
count: uint16 = 0
data: uint8[8] = [0, 0, 0, 0, 0, 0, 0, 0]
```

## Step 4: Adjust the few things that differ

### Check which half of `machine` you are using

`machine.Pin`, `machine.UART`, `machine.Signal`, `machine.mem8` / `mem16`, `machine.freq()`,
`disable_irq` / `enable_irq` and `time_pulse_us` compile on every target. `machine.ADC`,
`PWM`, `SPI`, `I2C`, `Timer`, `WDT`, `reset()` and the `idle` / `lightsleep` / `deepsleep`
helpers are imported inside an `if __CHIP__.arch == "avr":` guard and therefore **do not exist
on the Pico**. If your program uses them and you are targeting an RP chip, move those
peripherals to [the native HAL](/pymcu/stdlib/).

`utime` splits the same way: `sleep_ms` / `sleep_us` / `sleep` are software delay loops and
work everywhere, but `ticks_ms()`, `ticks_us()` and `ticks_cpu()` read the Timer0 counter
through `pymcu.hal.timer` and raise a `CompileError` on an RP target. `ticks_diff()` and
`ticks_add()` are portable.

### `UART.read()` takes no argument

```python
# MicroPython
data = uart.read(1)

# PyMCU — read() returns a single byte
data = uart.read()

# For a buffer, readline() fills a caller-owned bytearray and returns the count
n = uart.readline(buf)
```

Returning a `bytes` object would need a heap, so there is no `read(n)` overload.

### `Pin.irq()` callbacks — keep them

`btn.irq(handler=cb, trigger=Pin.IRQ_FALLING)` works as written: the build driver registers
`cb` as the real hardware ISR for the matching vector.

```python
from machine import Pin
from pymcu.types import uint8

count: uint8 = 0

def on_press():
    global count
    count += 1

def main():
    btn = Pin(2, Pin.IN, Pin.PULL_UP)
    btn.irq(handler=on_press, trigger=Pin.IRQ_FALLING)
    while True:
        pass
```

The low-level `@interrupt(vector)` decorator is still available when you want to name the
vector yourself.

Note that `Pin.PULL_DOWN` is a `CompileError` on AVR — the parts have no internal pull-down.
It works on the RP2040 and RP2350.

### `Timer` callbacks — keep them (on AVR)

```python
# Both forms are supported, exactly as in MicroPython
t = Timer(1, freq=10, callback=on_tick)       # 10 Hz
t = Timer(1, period=100, callback=on_tick)    # every 100 ms
```

The prescaler and compare value are selected at compile time. Use a **named function** for
the callback (not a lambda) so the ISR has a real entry point. `machine.Timer` is AVR-only;
on the Pico use `pymcu.hal.timer` instead.

### Replace `machine.mem8`

```python
# MicroPython
machine.mem8[0x25] = 0xFF

# PyMCU
from pymcu.types import ptr, uint8
PORTB: ptr[uint8] = ptr(0x25)
PORTB.value = 0xFF
```

`machine.mem8` / `mem16` do work as written; `ptr` is the typed, compile-time-checked
alternative.

### Replace `micropython.const`

```python
# MicroPython
BAUD = micropython.const(9600)

# PyMCU — micropython.const() is a no-op; just use the value or const[T]
BAUD: const[uint16] = 9600
```

### `try / except` works

Exceptions are supported on AVR and ARM through a zero-cost flag-propagation model — no heap,
no unwinder, no tables:

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
print(f"count={count}")             # streamed
s = f"count={count:03d}"            # value form, built into a fixed buffer
print(s)
```

Format specs `{x:02x}`, `{x:X}`, `{x:08b}`, `{x:o}`, `{x:5d}` and `{x:04d}` are supported.
Float interpolations in the value form and comparing an f-string result to a literal are not
supported yet.

### `print()` writes to the UART

`print()` works as-is — the build driver detects it and injects the UART initialisation, the
same way MicroPython's REPL has an output device ready before your code runs:

```python
print("hello")              # -> "hello\n" on UART0
```

An explicit UART object also works when you want to control the port and baud rate:

```python
uart.println("hello")
```

### `float` works — integers are still cheaper

`float` is IEEE-754 single precision on AVR (soft-float helpers) and on ARM (bootrom
fast-float on RP2040, the M33 FPU on RP2350), and `print(x)` of a float works on both:

```python
temp: float = adc.read() * 3.3 / 4096.0 * 100.0
print(temp)
```

On an 8-bit AVR each float operation still costs a few hundred cycles, so integer
fixed-point remains the better choice in hot loops:

```python
# multiply first, divide last — exact and a couple of instructions
temp: uint16 = adc.read() * 330 // 4096
```

### Replace unbounded containers

Closed `dict` / `set` **literals** compile to lookup tables (`d[k]`, `k in d`, `len(d)`),
and `pymcu.collections.FixedDict(capacity)` gives you a mutable mapping with no heap. What
has no equivalent is a dict, set or list that grows without a bound — size it up front. This
is the `list-grow` warning `pymcu lint` raises.

## Common patterns

### Blink (MicroPython)

```python
from machine import Pin
from utime import sleep_ms

led = Pin(13, Pin.OUT)
while True:
    led.value(1)
    sleep_ms(500)
    led.value(0)
    sleep_ms(500)
```

### Blink (PyMCU + pymcu-micropython)

```python
from machine import Pin       # identical
from utime import sleep_ms    # identical

def main():
    led = Pin(13, Pin.OUT)    # integer pin numbers work
    while True:
        led.value(1)
        sleep_ms(500)
        led.value(0)
        sleep_ms(500)
```

Wrapping in `def main():` is optional — top-level statements are wrapped automatically, so
the MicroPython version above compiles unchanged too.

### Blink (Raspberry Pi Pico)

The same source, with the Pico's GP25 instead of D13:

```python
from machine import Pin
from utime import sleep_ms

led = Pin(25, Pin.OUT)
while True:
    led.value(1)
    sleep_ms(500)
    led.value(0)
    sleep_ms(500)
```

## What stays the same

- `from machine import Pin, UART` — identical API on every target
- `from machine import ADC, PWM, SPI, I2C, Timer, WDT` — identical API, **AVR only**
- `Pin(13, Pin.OUT)` on AVR, `Pin(25, Pin.OUT)` on the Pico — integer pin numbers
- `uart.write(b"...")` — works; `uart.read()` takes no argument and returns one byte
- `adc.read_u16()` — returns a scaled 16-bit value (AVR)
- `from utime import sleep_ms, sleep_us, sleep, ticks_diff, ticks_add` — identical, portable
- `from utime import ticks_ms, ticks_us, ticks_cpu` — identical API, **AVR only** (they read
  the Timer0 counter through `pymcu.hal.timer`, which has no RP implementation)
- `micropython.const(N)` — treated as integer literal `N`
- `try` / `except` / `raise`, `float`, f-strings, generators and `await asyncio.sleep_ms()`
- `import rp2` — the PIO DSL on RP2040 / RP2350
- `network.WLAN` + `umqtt.simple` — WiFi and MQTT on the **Pico 2 W (RP2350) only**, and only
  for open networks: `connect()` raises a `CompileError` on a non-empty key because WPA is not
  implemented yet

See the [MicroPython compatibility reference](/pymcu/compat/micropython/) for the full module
surface and the [Pico examples](/pymcu/examples/rp2040/) for runnable programs.
