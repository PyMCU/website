---
title: CircuitPython Compatibility
description: Write board / digitalio / busio code and compile it to bare-metal firmware for AVR, RP2040 and RP2350.
---

The `pymcu-circuitpython` package provides CircuitPython-compatible module names on top of the
native PyMCU HAL. Most CircuitPython firmware compiles unchanged after adding one line to
`pyproject.toml`. If you are moving an existing project across, start with the step-by-step
[migration guide](/migration/from-circuitpython/).

:::note[Compiled, not interpreted]
There is no CircuitPython interpreter on the device. Every `digitalio.*`, `busio.*` or
`neopixel.*` call is a compile-time shim over the native PyMCU HAL — the MCU runs only native
machine code.
:::

## Installation

```bash
pip install pymcu-circuitpython
```

Or as a project dependency:

```toml
[project]
dependencies = ["pymcu-compiler", "pymcu-circuitpython"]

[tool.pymcu]
stdlib = ["circuitpython"]
board = "arduino_uno"  # Auto-generates board module with pin names
```

**Note:** Use `board = "arduino_uno"` instead of `target = "atmega328p"` to enable the `board`
module with CircuitPython-style pin names. The build driver auto-generates
`dist/_generated/board.py` from the board definition file. `board` and `target` are **mutually
exclusive** — setting both is a hard error.

## Supported boards

`board`, `digitalio` and `busio.UART` compile for AVR **and** for the Raspberry Pi Pico family.
The rest of the flavour is AVR-only — see [Supported modules](#supported-modules).

| `board = …` | Chip |
|---|---|
| `arduino_uno`, `arduino_nano` | ATmega328P |
| `arduino_mega` | ATmega2560 |
| `arduino_micro` | ATmega32U4 |
| `digispark`, `adafruit_trinket` | ATtiny85 |
| `attiny85` / `attiny45` / `attiny25`, `attiny84` / `attiny44` / `attiny24`, `attiny2313` / `attiny4313`, `attiny13` / `attiny13a` | ATtiny family (bare chips) |
| `raspberry_pi_pico`, `pico` | RP2040 (Cortex-M0+) |

:::caution[There is no Pico 2 board module]
The flavour ships a board file for the Pico (RP2040) but **not** for the Pico 2. Building with
`target = "rp2350"` emits no `dist/_generated/board.py` at all, so `import board` will not
resolve; building with `board = "raspberry_pi_pico2"` finds no board file and the driver warns
and writes an empty shim, so `board.LED` and friends are undefined either way.

On the Pico 2, write the program without `import board` — pass GP numbers straight to
`digitalio.DigitalInOut(...)` and `busio.UART(...)`, or drop to `pymcu.hal.*`. That is what
the shipped RP2350 CircuitPython example does.
:::

WiFi through `wifi`, `socketpool` and `adafruit_minimqtt` is **Pico 2 W (RP2350) only** — see
the [Pico examples](/examples/rp2040/).

## Supported modules

| Module | Classes / functions | Status | Notes |
|---|---|---|---|
| `board` | Pin constants (D0-D13, A0-A5, GP0-GP28, LED, TX, RX, SDA, SCL, SCK, MOSI, MISO, …) | Complete | Auto-generated from the selected board; no Pico 2 board file |
| `digitalio` | `DigitalInOut`, `Direction`, `Pull`, `DriveMode` | Complete | Portable. ZCA properties for `.direction`, `.value`, `.pull`, `.drive_mode` |
| `busio` | `UART` | Complete | Portable — the only `busio` class that compiles on the Pico |
| `busio` | `SPI`, `I2C` | AVR only | Imported inside an `arch == "avr"` guard |
| `analogio` | `AnalogIn` | AVR only | 16-bit values, scaled from the 10-bit AVR ADC |
| `analogio` | `AnalogOut` | Not available | Warns and compiles to nothing — no AVR part has a DAC |
| `pwmio` | `PWMOut` | AVR only | 16-bit duty cycle, scaled to the AVR's 8-bit compare |
| `neopixel` | `NeoPixel` | AVR only | The bit-banged WS2812 backend exists for AVR alone; `brightness` accepted but not applied |
| `time` | `sleep(seconds: float)` | Complete | Portable software delay. **No `sleep_ms` / `sleep_us`** — see below |
| `time` | `monotonic()`, `monotonic_ns()` | AVR only | They read `pymcu.hal.timer.millis`, which raises a `CompileError` on ARM |
| `supervisor` | `ticks_add`, `ticks_diff`, `runtime` | Complete | Portable — pure integer arithmetic and compile-time constants |
| `supervisor` | `ticks_ms` | AVR only | Same Timer0 dependency. Ticks wrap at 2^29 ms (~6.2 days), exactly as in CircuitPython |
| `supervisor` | `reload()` | AVR only | Implemented as a watchdog reset; the watchdog HAL is AVR-only |
| `alarm` | `time.TimeAlarm`, `pin.PinAlarm`, `sleep_until_alarms` | Complete on AVR | Sleep modes come from the AVR power HAL |
| `microcontroller` | `cpu.frequency`, `cpu.voltage`, `cpu.uid`, `reset`, `delay_us` | Partial, AVR only | Frequency is a compile-time constant |
| `wifi`, `socketpool`, `adafruit_minimqtt` | `radio.connect`, `SocketPool`, `MQTT.connect` / `publish` | Pico 2 W only | CYW43439 over gSPI; open networks only |

## Usage

```python
import board
import digitalio
import time

led = digitalio.DigitalInOut(board.LED)
led.direction = digitalio.Direction.OUTPUT

while True:
    led.value = True
    time.sleep(0.5)
    led.value = False
    time.sleep(0.5)
```

## Module Reference

### `time`

:::caution[`sleep()` takes float seconds — there is no `sleep_ms()`]
The flavour's `time` module defines exactly three names: `sleep(seconds: float)`,
`monotonic()` and `monotonic_ns()`. `sleep_ms` and `sleep_us` **do not exist** — write
`time.sleep(0.5)` for a 500 ms delay, exactly as you would under real CircuitPython.

The argument is folded at compile time: `sleep(0.5)` lowers to `delay_ms(500)` with no
floating-point code on the device, so the value must be a compile-time constant and the
resulting millisecond count must fit in a `uint16` (about 65 seconds).
:::

```python
import time

time.sleep(0.5)          # 500 ms  -- portable
time.sleep(2)            # 2 s     -- portable
t = time.monotonic()     # seconds since boot, float      -- AVR only
n = time.monotonic_ns()  # nanoseconds since boot, integer -- AVR only
```

`sleep()` is a software delay loop and works on every target. `monotonic()` and
`monotonic_ns()` read the Timer0 millisecond counter through `pymcu.hal.timer`, which has no
RP implementation, so they raise a `CompileError` on the Pico. `monotonic_ns()` is also
`millis() * 1_000_000` in a `uint32`, so it wraps after about 4.3 seconds — fine for
sub-second interval measurement, not for absolute time.

### `digitalio.DigitalInOut`

- `direction` — use `Direction.INPUT` or `Direction.OUTPUT`.
- `value` — read or write (boolean / uint8).
- `pull` — `Pull.UP` or `Pull.DOWN`, or `None` for no pull.
- `drive_mode` — `DriveMode.PUSH_PULL` or `DriveMode.OPEN_DRAIN`.

:::caution[`Pull.DOWN` and `DriveMode.OPEN_DRAIN`]
AVR parts have no internal pull-down, so `pin.pull = Pull.DOWN` raises a `CompileError` at
build time rather than being silently ignored. It works on the RP2040 and RP2350, whose pads
have a real pull-down.

Neither the AVR nor the RP GPIO has true open-drain hardware. `DriveMode.OPEN_DRAIN` is
accepted for API compatibility but does not give you an open-drain output — on the RP it is
explicitly a no-op, and on AVR it configures an ordinary output. Use an external pull-up plus
input/output toggling if you need real open-drain behaviour.
:::

### `busio.UART`

The one `busio` class that compiles on every target.

```python
import busio, board
from pymcu.types import uint8

uart = busio.UART(board.TX, board.RX, baudrate=9600)
uart.write(b"hello")

buf: uint8[1] = bytearray(1)
uart.readinto(buf)          # fills the caller's buffer; returns the count
```

:::caution[`read()` and `readline()` are no-ops]
`busio.UART.read(nbytes)` and `busio.UART.readline()` would have to return a `bytes` object,
which needs a heap. Both are marked `@warning` and compile to nothing — the build prints a
diagnostic pointing you at the replacement. Use `readinto(buf)` with a pre-allocated
`bytearray` instead.
:::

### `analogio.AnalogIn`

:::caution[AVR only]
`analogio` imports the ADC HAL inside an `if __CHIP__.arch == "avr":` guard, so it is not
available on the Pico.
:::

```python
import analogio, board

adc = analogio.AnalogIn(board.A0)
val = adc.value   # uint16, 0-65535 (scaled from 10-bit ADC)
```

`analogio.AnalogOut` exists so that CircuitPython sources parse, but no AVR part has a DAC:
the constructor is marked `@warning` and compiles to nothing. The build emits a diagnostic
suggesting `pwmio.PWMOut`; it is **not** a hard error.

### `pwmio.PWMOut`

:::caution[AVR only]
`pwmio` imports the PWM HAL inside an `if __CHIP__.arch == "avr":` guard.
:::

```python
import pwmio, board

pwm = pwmio.PWMOut(board.D6, duty_cycle=32768)  # 50% duty
pwm.duty_cycle = 49152  # 75% duty (uint16, 0-65535)
pwm.deinit()  # Stop PWM
```

### `microcontroller.cpu`

:::caution[AVR only]
`microcontroller` imports the ADC HAL inside an `if __CHIP__.arch == "avr":` guard — the die
temperature and Vcc readings come from the AVR's internal ADC channels.
:::

```python
import microcontroller

freq = microcontroller.cpu.frequency  # CPU frequency in Hz (compile-time constant)
```

### `supervisor`

`ticks_ms()` is kept modulo 2^29 and `ticks_diff()` returns a signed value, exactly matching
the canonical CircuitPython reference implementation — so the counter wraps after about
6.2 days, not after the ~49 days a plain 32-bit millisecond counter would give you.

`ticks_ms()` reads the Timer0 counter through `pymcu.hal.timer` and is AVR-only;
`ticks_add()`, `ticks_diff()` and `supervisor.runtime` are portable. `supervisor.reload()`
performs a watchdog reset and is therefore AVR-only too.

## On the Raspberry Pi Pico

```toml
[tool.pymcu]
board     = "raspberry_pi_pico"
frequency = 125000000
stdlib    = ["circuitpython"]
```

```python
import board
import digitalio
import busio
from pymcu.types import uint8


def main():
    led = digitalio.DigitalInOut(board.LED)      # GP25
    led.direction = digitalio.Direction.OUTPUT

    uart = busio.UART(board.TX, board.RX, baudrate=115200)   # GP0 / GP1
    uart.write(b"READY\r\n")

    buf: uint8[1] = bytearray(1)
    while True:
        uart.readinto(buf)
        led.value = buf[0] & 1
        uart.write(buf)
```

That is the whole portable surface: `board`, `digitalio` and `busio.UART`. `analogio`,
`pwmio`, `busio.SPI`, `busio.I2C`, `neopixel` and `microcontroller` are not importable on an
RP target — use [the native HAL](/stdlib/) for those peripherals.

On a **Pico 2** there is no board file, so set `target = "rp2350"` with
`frequency = 150000000` and drop `import board`, passing GP numbers directly.

WiFi on a **Pico 2 W** follows the usual CircuitPython shape (`socketpool` +
`adafruit_minimqtt`); the full program is on the [Pico examples page](/examples/rp2040/).

:::caution[Pico 2 W only, open networks only]
The CYW43439 driver is wired for the RP2350 alone — `pymcu.hal.wifi` raises a `CompileError`
on every other chip, including the original Pico W (RP2040). WPA is not implemented: passing a
non-empty key to `connect()` raises a `CompileError`, so only open networks can be joined
today.
:::

## Vetting a port with `pymcu lint`

Before porting an existing CircuitPython project, run the porting assistant. See
[the CLI reference](/driver/#pymcu-lint-path) for the full flag list.

```bash
pymcu lint code.py
pymcu lint src/ --errors-only
```

It parses your sources with CPython's own `ast` and reports each construct PyMCU cannot
compile with a severity and a concrete suggested rewrite. `ERROR` means it is outside PyMCU's
subset — dict/set comprehensions, bare `dict()` / `set()` calls, reflection (`getattr`,
`eval`) and `*args` / `**kwargs`. `WARN` means it is supported only in a limited form and
needs a bounded rewrite — an unbounded `list.append` / `.extend` / `.insert`, runtime type
checks, untyped parameters and return types. `INFO` means it is fine: `board`, `digitalio`,
`busio`, `analogio`, `pwmio`, `microcontroller`, `supervisor` and any `adafruit_*` import are
reported as `INFO` because they map ~1:1 onto the compat API. The command exits non-zero if
any hard error was found.

## Differences from real CircuitPython

These are the actual gaps — anything not listed behaves like standard CircuitPython. If you
are porting a project, the [migration guide](/migration/from-circuitpython/) walks these
changes in order.

| Feature | CircuitPython | PyMCU + pymcu-circuitpython |
|---|---|---|
| Execution model | Bytecode interpreter | Native compiled — no VM, no GC |
| `time.sleep(s)` | Float seconds, runtime value | Float seconds, folded at compile time to a millisecond delay (constant argument, `<= ~65 s`) |
| `time.sleep_ms()` | Not in CircuitPython either | Not provided — use `time.sleep(0.5)` |
| Module scope | Whole flavour on every board | `board`, `digitalio`, `busio.UART` and `time.sleep()` are portable; `analogio`, `pwmio`, `busio.SPI` / `I2C`, `neopixel`, `microcontroller`, `time.monotonic*` and `supervisor.ticks_ms` / `reload()` are AVR-only |
| `f"..."` strings | Runtime evaluation | Supported streamed (`print(f"…")`) and as values (`s = f"…"` into a fixed buffer) |
| `try / except / raise` | Supported | Supported on AVR and ARM — zero-cost flag-propagation model, no heap |
| `float` | Supported | Supported — IEEE-754 f32 (soft-float on AVR, bootrom fast-float on RP2040, M33 FPU on RP2350) |
| `dict` / `set` | Dynamic hash maps | Closed literals are compile-time lookup tables; `pymcu.collections.FixedDict(capacity)` for mutation; unbounded growth is not supported |
| `bytearray` | Dynamic heap | Fixed-size `uint8[N]` only |
| Dynamic pin assignment | Supported | Pin must be a compile-time constant |
| `Pull.DOWN` | Supported where the pad has one | RP2040 / RP2350 only — a `CompileError` on AVR |
| `DriveMode.OPEN_DRAIN` | Real open-drain | Accepted but not honoured — no open-drain hardware on AVR or RP |
| `AnalogOut` | Supported (SAMD DAC) | Warns and compiles to nothing — no DAC on AVR |
| `busio.UART.read(n)` / `.readline()` | Return `bytes` | No-ops that warn; use `readinto(buf)` |
| `busio.I2C.scan()` | List of addresses | A no-op that warns; use `probe(address)` in a loop over the address range |
| `supervisor.ticks_ms()` | Wraps at 2^29 ms | Same — wraps at 2^29 ms (~6.2 days), but AVR-only |
| `time.monotonic()` | Every board | AVR only — no RP millisecond counter in the HAL |
| `wifi.radio` | Every WiFi board | Pico 2 W (RP2350) only, open networks only — no WPA |
| `storage`, `usb_hid`, filesystem | Supported | Not available |
| Target hardware | SAMD21, RP2040, ESP32, … | AVR (ATmega / ATtiny) and ARM (RP2040 / RP2350) |
