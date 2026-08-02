---
title: MicroPython Compatibility
description: Write machine / utime / network code and compile it to bare-metal firmware for AVR, RP2040 and RP2350.
---

The `pymcu-micropython` package provides MicroPython-compatible module names on top of the
native PyMCU HAL. Most MicroPython firmware compiles with minimal changes. If you are moving an
existing project across, start with the step-by-step
[migration guide](/migration/from-micropython/).

:::note[Compiled, not interpreted]
There is no MicroPython interpreter on the device. Every `machine.*` call is a compile-time
shim that expands to HAL instructions, so the MCU receives only the resulting machine code —
typically a few hundred bytes of flash and 0 bytes of SRAM overhead.
:::

**Targets:** `machine.Pin`, `machine.UART`, the `utime` delays, `micropython` and `print()` /
`input()` compile for **AVR (ATmega / ATtiny)** and for the **Raspberry Pi Pico and Pico 2**
(`target = "rp2040"` / `"rp2350"`, with plain GP pin numbers). The rest of `machine` —
`ADC`, `PWM`, `SPI`, `I2C`, `Timer`, `WDT` — is **AVR-only**; see
[Supported modules](#supported-modules) below. WiFi through `network.WLAN` and `umqtt.simple`
is **Pico 2 W (RP2350) only**. See the [Pico examples](/examples/rp2040/).

## Installation

```bash
pip install pymcu-micropython
```

Or as a project dependency:

```toml
[project]
dependencies = ["pymcu-compiler", "pymcu-micropython"]

[tool.pymcu]
stdlib = ["micropython"]
```

## Supported boards

`machine.Pin` takes plain integer pin numbers, so a board file is optional. Set `board = …`
to pin the chip and its clock in one key, or set `target = …` when you would rather name the
chip directly. **`board` and `target` are mutually exclusive** — setting both is a hard error.

| `board = …` | Chip |
|---|---|
| `arduino_uno`, `arduino_nano` | ATmega328P |
| `arduino_mega` | ATmega2560 |
| `arduino_micro` | ATmega32U4 |
| `digispark`, `adafruit_trinket` | ATtiny85 |
| `attiny85` / `attiny45` / `attiny25`, `attiny84` / `attiny44` / `attiny24`, `attiny2313` / `attiny4313`, `attiny13` / `attiny13a` | ATtiny family (bare chips) |
| `raspberry_pi_pico`, `pico`, `rp2040` | RP2040 (Cortex-M0+) |
| `raspberry_pi_pico2`, `pico2`, `rp2350` | RP2350 (Cortex-M33) |

:::note[Names that will not build]
For source compatibility the flavour's board map also carries `pyboard`, `pyboard_v11`,
`esp32_generic` and `esp8266_generic`. PyMCU has no chip definition or backend for STM32,
ESP32 or ESP8266, so those keys cannot be built — they exist only so a shared `pyproject.toml`
parses.
:::

## Supported modules

| Module | Classes / functions | Status | Notes |
|---|---|---|---|
| `machine` (portable) | `Pin`, `UART`, `Signal`, `mem8` / `mem16`, `freq()`, `disable_irq` / `enable_irq`, `time_pulse_us` | Complete | Compiles for AVR, RP2040 and RP2350 |
| `machine` (AVR only) | `ADC`, `PWM`, `SPI`, `I2C`, `Timer`, `WDT`, `reset()`, `idle` / `lightsleep` / `deepsleep` | Complete on AVR | Imported inside an `arch == "avr"` guard; unavailable on the Pico |
| `utime` | `sleep_ms`, `sleep_us`, `sleep`, `ticks_diff`, `ticks_add` | Complete | Portable — the delays are software loops, the tick arithmetic is pure integer maths |
| `utime` | `ticks_ms`, `ticks_us`, `ticks_cpu` | AVR only | They read `pymcu.hal.timer.millis` / `micros`, which raises a `CompileError` on ARM |
| `micropython` | `const()` (treated as an integer literal); `@native` / `@viper` accepted and ignored | Complete | Portable |
| `avr` | AVR port module — `EEPROM`, `SoftSPI`, `SoftI2C` | Complete on AVR | AVR-only by design |
| `rp2` | RP2040 / RP2350 PIO — `@rp2.asm_pio`, `PIO`, `StateMachine` | Partial | PIO0 / SM0 only; RP-only |
| `network` | `WLAN(STA_IF)` — `active`, `connect`, `isconnected` | Pico 2 W only | Open networks only — see below |
| `umqtt.simple` | `MQTTClient` — `connect`, `publish`, `disconnect` | Pico 2 W only | Over the CYW43439 radio |
| `print()` / `input()` | UART output / input | Complete | The driver auto-injects the UART init |

## Usage

```python
from machine import Pin, UART
from utime import sleep_ms

led = Pin(13, Pin.OUT)       # Arduino Uno D13
uart = UART(0, 9600)

while True:
    led.value(1)
    sleep_ms(500)
    led.value(0)
    sleep_ms(500)
```

## Module Reference

### `machine.Pin`

Portable — this is one of the two `machine` classes that compiles on every target.

```python
from machine import Pin

# Create with integer Arduino pin number
led = Pin(13, Pin.OUT)         # D13 = PB5
btn = Pin(2, Pin.IN, Pin.PULL_UP)   # D2 = PD2 with pull-up

# Mode constants (note the values: these match the compat package, not CPython intuition)
Pin.IN       # 1
Pin.OUT      # 0
Pin.PULL_UP  # 1
Pin.PULL_DOWN  # 2 — see the caution below

# Methods (same as pymcu.hal.gpio.Pin)
led.high()
led.low()
led.toggle()
v = led.value()
led.value(1)
```

A port-string form is also accepted on AVR: `Pin("PB5", Pin.OUT)`.

:::caution[`Pin.PULL_DOWN` is not available on AVR]
AVR parts have no internal pull-down resistor, so `Pin(n, Pin.IN, Pin.PULL_DOWN)` raises a
`CompileError` at build time rather than silently doing nothing. `Pin.PULL_DOWN` works on the
RP2040 and RP2350, whose pads have a real pull-down.
:::

**Pin number mapping (Arduino Uno):**

| Arg | Arduino pin | Port/bit |
|---|---|---|
| 0 | D0 / RX | PD0 |
| 1 | D1 / TX | PD1 |
| 2 | D2 | PD2 |
| ... | ... | ... |
| 13 | D13 / LED | PB5 |
| 14 | A0 | PC0 |
| ... | ... | ... |
| 19 | A5 | PC5 |

On the RP2040 / RP2350 the integer *is* the GP number — no mapping table is involved.

### `machine.UART`

Portable — compiles on AVR, RP2040 and RP2350.

```python
from machine import UART

uart = UART(0, 9600)        # id=0 → USART0
uart.write(b"hello")
data = uart.read()          # one byte; read() takes no argument
```

:::caution[`read()` takes no argument]
Unlike MicroPython, `UART.read()` has the signature `read(self) -> uint8` and returns a single
byte — there is no `read(n)` overload, because returning a `bytes` object would need a heap.
To fill a buffer use `uart.readline(buf)`, which reads until `\n` (or until `buf` is full) and
returns the byte count.
:::

### `machine.ADC`

:::caution[AVR only]
`machine.ADC` is imported inside an `if __CHIP__.arch == "avr":` guard, so it does not exist
on the Pico. Use `machine.Pin` plus the native HAL for RP analog input.
:::

```python
from machine import ADC, Pin

adc = ADC(Pin(14))         # A0 on the Arduino Uno = PC0
# equivalently: ADC(Pin("PC0"))
val = adc.read_u16()       # 0-65535 (0-1023 scaled)
val = adc.read()           # 0-1023 (10-bit)
```

`ADC` has exactly one constructor, `ADC(pin: Pin)` — there is no `ADC(0)` channel-number
overload. Pass a `Pin` built from the analog pin number (14-19 on the Uno) or from the port
string. `Pin("A0")` is **not** a valid pin name: the AVR GPIO HAL rejects it with
`NotImplementedError('Unsupported Pin')`. Valid analog names are `"PC0"`-`"PC5"`, plus the
internal `"TEMP"`, `"VBG"` and `"ADC8"` channels via `pymcu.hal.adc.AnalogPin`.

### `utime`

```python
from utime import sleep_ms, sleep_us

sleep_ms(500)
sleep_us(100)
```

The delays are software loops and work on every target. `ticks_ms()`, `ticks_us()` and
`ticks_cpu()` read the Timer0 counter through `pymcu.hal.timer`, which is **AVR-only** — on
an RP target they raise a `CompileError`. `ticks_diff()` and `ticks_add()` are pure integer
arithmetic and work everywhere.

### `micropython.const`

```python
import micropython

BAUD = micropython.const(9600)   # treated as integer constant 9600
```

## On the Raspberry Pi Pico

Pins are plain GP numbers, so no board file is needed — set `target = "rp2040"` (or
`"rp2350"`) and go:

```python
from machine import Pin, UART
from pymcu.types import uint8

def main():
    uart = UART(0, 115200)
    led = Pin(25, Pin.OUT)
    uart.println("READY")
    while True:
        c: uint8 = uart.read()
        led.toggle()
        uart.write(c)
```

Only the portable half of `machine` is available here. `ADC`, `PWM`, `SPI`, `I2C`, `Timer` and
`WDT` are not importable on an RP target — reach for `pymcu.hal.*` instead, and see
[the stdlib reference](/stdlib/).

WiFi uses the standard MicroPython shape, but only on the **Pico 2 W (RP2350)**:

```python
import network
from umqtt.simple import MQTTClient
from pymcu.types import uint32

def main():
    wlan = network.WLAN(network.STA_IF)
    wlan.active(True)
    wlan.connect("my-ssid")          # open networks only

    client = MQTTClient(wlan, "pm", "192.168.4.1")
    client.connect()
    reading: uint32 = 42
    client.publish(reading)
```

:::caution[Pico 2 W only, open networks only]
The CYW43439 driver is wired for the RP2350 alone — `pymcu.hal.wifi` raises a `CompileError`
on every other chip, including the original Pico W (RP2040). WPA is not implemented either:
passing a non-empty `key` to `connect()` raises a `CompileError`, so only open networks can be
joined today. The `key` parameter exists purely for MicroPython signature compatibility.
:::

The PIO DSL is also part of this flavour — see
[PIO on the Pico examples page](/examples/rp2040/).

## Vetting a port with `pymcu lint`

`pymcu lint` is the natural first step when moving an existing MicroPython project across.
It parses your sources with CPython's own `ast` and reports every construct PyMCU cannot
compile, each with a severity and a concrete suggested rewrite. See
[the CLI reference](/driver/#pymcu-lint-path) for the full flag list.

```bash
pymcu lint src/
pymcu lint src/main.py --errors-only
```

Findings are `ERROR` (will not compile in PyMCU's subset), `WARN` (supported only in a
limited form) or `INFO` (fine — covered by a compat API). `ERROR` covers dict/set
comprehensions, bare `dict()` / `set()` calls, reflection (`getattr`, `eval`, `globals`) and
`*args` / `**kwargs`. `WARN` covers the things that need a bounded rewrite rather than a
rethink — an unbounded `list.append` / `.extend` / `.insert`, runtime type checks, untyped
parameters and return types, and f-strings in positions with no lowering. `machine`, `rp2`,
`micropython`, `neopixel` and `framebuf` imports are reported as `INFO` because they map ~1:1
onto the compat API. The command exits non-zero if any hard error was found.

## Differences from real MicroPython

These are the actual gaps and trade-offs — anything not listed behaves like standard
MicroPython.

| Feature | MicroPython | PyMCU + pymcu-micropython |
|---|---|---|
| Execution model | Bytecode interpreter | Native compiled — no VM, no GC, ~0 bytes RAM overhead |
| `machine` module scope | Whole module on every port | `Pin` / `UART` / `Signal` / `mem8` / `time_pulse_us` everywhere; `ADC`, `PWM`, `SPI`, `I2C`, `Timer`, `WDT` on AVR only |
| `Pin.PULL_DOWN` | Supported where the pad has one | RP2040 / RP2350 only — a `CompileError` on AVR |
| `UART.read(n)` | Returns `bytes` | `read()` takes no argument and returns one byte; use `readline(buf)` for a buffer |
| `Pin.irq()` callbacks | Supported | Supported — `btn.irq(handler=cb, trigger=Pin.IRQ_FALLING)` registers the real ISR |
| `Timer` callbacks | Supported | Supported on AVR — `Timer(1, freq=10, callback=on_tick)` auto-selects the prescaler |
| `machine.mem8[addr]` | Supported | Supported; `ptr(addr).value` is the typed, compile-time-checked alternative |
| `ticks_ms()` / `ticks_us()` | Supported on every port | AVR only — the driver injects `millis_init()` (Timer0) automatically. `pymcu.hal.timer` has no RP implementation, so these raise a `CompileError` on the Pico; `ticks_diff()` / `ticks_add()` are portable |
| `f"..."` strings | Runtime evaluation | Supported streamed (`print(f"…")`, `uart.write_str(f"…")`) and as values (`s = f"…"` into a fixed buffer) |
| `float` | Supported | Supported — IEEE-754 f32 (soft-float on AVR, bootrom fast-float on RP2040, M33 FPU on RP2350) |
| `try / except / raise` | Supported (heap-based) | Supported on AVR and ARM — zero-cost flag-propagation model, no heap |
| `dict` / `set` | Dynamic hash maps | Closed literals are compile-time lookup tables; `pymcu.collections.FixedDict(capacity)` for mutation; unbounded growth is not supported |
| `yield` / generators | Supported | Supported at top level (lowered to a state machine); not inside `@inline` functions or methods |
| `async` / `await` | Supported (`uasyncio`) | `await asyncio.sleep_ms(…)` anywhere in a body, plus `asyncio.run` / `gather`; awaiting another coroutine is not supported yet |
| `bytearray` | Dynamic heap allocation | Fixed-size `uint8[N]` only |
| `UART.any()` | Byte count | Returns `1` / `0`, not an exact count |
| `I2C.scan()` | List of addresses | Returns a count; `scan(buf, max_count)` fills a caller-owned buffer |
| `network.WLAN` | Every WiFi port | Pico 2 W (RP2350) only, open networks only — no WPA |
| Target hardware | STM32, RP2040, ESP32, … | AVR (ATmega / ATtiny) and ARM (RP2040 / RP2350) |
