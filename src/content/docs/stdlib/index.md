---
title: Standard Library
description: The MicroPython and CircuitPython compat APIs, the native PyMCU HAL underneath them, and which architectures each module covers.
---

PyMCU ships a platform-abstracted standard library that compiles to zero-overhead assembly on
each supported architecture. Every HAL module is built from `@inline` zero-cost abstractions:
instantiating a `Pin` or a `UART` compiles to register writes, and no runtime library is linked
into your firmware.

There are two ways to reach that hardware, and they are not equal in status.

## Start with the compat APIs

**MicroPython** (`machine`, `utime`) and **CircuitPython** (`board`, `digitalio`, `analogio`,
`busio`, `pwmio`, `time`, `neopixel`) are the **recommended** APIs for application code:

- They are **stable and community-specified** — the shape of `machine.Pin` or
  `digitalio.DigitalInOut` is defined by an ecosystem, not by PyMCU, so it does not move under
  you between alpha releases.
- They **cost nothing**. Each compat class is a thin `@inline` shim over the native HAL, so
  `machine.Pin(13).toggle()` compiles to exactly the same machine code as the native HAL's
  `Pin("PB5").toggle()` — the same instructions, the same flash bytes, no runtime layer.
- Code written against them is **portable in both directions**: a sketch you already run on a
  MicroPython or CircuitPython board is close to compiling as-is, and `pymcu lint` tells you
  which constructs PyMCU cannot compile.

→ [MicroPython compatibility](/pymcu/compat/micropython/) · [CircuitPython compatibility](/pymcu/compat/circuitpython/)

## `pymcu.hal.*` is the advanced layer

The native HAL is the **foundation the compat packages are built on** — every `machine.*` and
`digitalio.*` call ends up here. Reach for it directly when you need something the compat APIs
do not expose:

- register-level work (`ptr[T]`, `ptr(addr)`) and chip introspection (`__CHIP__`, `__FREQ__`)
- `@interrupt(vector)` ISR handlers
- inline `asm(...)` and `@extern` C interop
- peripherals with no community-specified API at all — DMA, servo, tone, the AVR sleep modes

:::caution[The native HAL API may change]
`pymcu.hal.*` is correct and test-covered, but it is **not** covered by a stability promise
during the alpha — signatures can change between releases. For code you intend to keep, write
against `machine` or `digitalio` and drop down to the native HAL only where you must.
:::

## Reading the examples

Code examples across this site are shown in **all three dialects — MicroPython, CircuitPython
and Native HAL — in synced tabs**. The three tabs always do the same thing, so you can flip
between them and read the same program three ways. Your choice follows you from page to page:
pick MicroPython once and every tabbed example on the site stays on MicroPython.

Where a feature has no compat equivalent, there is no tab to switch to — the example is shown in
the native HAL only and says so in an aside. That is deliberate: PyMCU documents the API that
exists rather than inventing a plausible-looking one.

## Targets

PyMCU compiles for three families, and the native HAL coverage below is stated per family:

- **AVR** — ATmega48/88/168/328P, ATmega2560, ATmega32U4, ATtiny25/45/85, ATtiny24/44/84,
  ATtiny13/13A, ATtiny2313/4313. Reference board: Arduino Uno (ATmega328P).
- **ARM** — RP2040 (Pico / Pico W, Cortex-M0+) and RP2350 (Pico 2 / Pico 2 W, Cortex-M33).
- **PIC** — PIC16F84A and PIC16F877A (mid-range).

## Module index

The **Compat API** column names the MicroPython object and the CircuitPython object that cover
each module. `MP:` is MicroPython, `CP:` is CircuitPython, and a dash means that ecosystem has no
equivalent — those modules are native-HAL-only.

| Module | Import | Purpose | Compat API | Architectures |
|---|---|---|---|---|
| [`pymcu.hal.gpio`](/pymcu/stdlib/gpio/) | `from pymcu.hal.gpio import Pin` | Digital I/O, pin interrupts | MP: `machine.Pin` · CP: `digitalio.DigitalInOut` | AVR, ARM, PIC |
| [`pymcu.hal.uart`](/pymcu/stdlib/uart/) | `from pymcu.hal.uart import UART` | Serial communication | MP: `machine.UART` · CP: `busio.UART` | AVR, ARM, PIC |
| [`pymcu.hal.adc`](/pymcu/stdlib/adc/) | `from pymcu.hal.adc import AnalogPin` | Analog-to-digital conversion | MP: `machine.ADC` · CP: `analogio.AnalogIn` | AVR, ARM, PIC (partial) |
| [`pymcu.hal.timer`](/pymcu/stdlib/timer/) | `from pymcu.hal.timer import Timer` | Hardware timer/counter, `millis()` | MP: `machine.Timer` · CP: — | AVR, PIC |
| [`pymcu.hal.pwm`](/pymcu/stdlib/pwm/) | `from pymcu.hal.pwm import PWM` | PWM output | MP: `machine.PWM` · CP: `pwmio.PWMOut` | AVR, ARM, PIC |
| [`pymcu.hal.spi`](/pymcu/stdlib/spi/) | `from pymcu.hal.spi import SPI` | SPI bus | MP: `machine.SPI` · CP: `busio.SPI` | AVR, ARM |
| [`pymcu.hal.i2c`](/pymcu/stdlib/i2c/) | `from pymcu.hal.i2c import I2C` | I2C / TWI bus | MP: `machine.I2C` · CP: `busio.I2C` | AVR, ARM |
| [`pymcu.hal.eeprom`](/pymcu/stdlib/eeprom/) | `from pymcu.hal.eeprom import EEPROM` | Non-volatile byte storage | MP: `avr.EEPROM` (PyMCU extension) · CP: `microcontroller.nvm` | AVR |
| [`pymcu.hal.watchdog`](/pymcu/stdlib/watchdog/) | `from pymcu.hal.watchdog import Watchdog` | Watchdog timer | MP: `machine.WDT` · CP: `microcontroller.watchdog` | AVR |
| [`pymcu.hal.power`](/pymcu/stdlib/power/) | `from pymcu.hal.power import sleep_power_down` | Sleep modes | MP: `machine.idle/lightsleep/deepsleep` · CP: `alarm` | AVR |
| [`pymcu.time`](/pymcu/stdlib/time/) | `from pymcu.time import delay_ms` | Busy-wait delays | MP: `utime` / `time` · CP: `time` | AVR, ARM, PIC, RISC-V |
| `pymcu.hal.dma` | `from pymcu.hal.dma import DMA` | Memory-to-memory DMA channels | — native HAL only | ARM |
| `pymcu.hal.softspi` | `from pymcu.hal.softspi import SoftSPI` | Bit-banged SPI on arbitrary pins | MP: `avr.SoftSPI` (PyMCU extension) · CP: — | Any target with GPIO |
| `pymcu.hal.softi2c` | `from pymcu.hal.softi2c import SoftI2C` | Bit-banged I2C on arbitrary pins | MP: `avr.SoftI2C` (PyMCU extension) · CP: — | Any target with GPIO |
| `pymcu.hal.servo` | `from pymcu.hal.servo import Servo` | Hobby-servo pulse generation | — native HAL only | AVR |
| `pymcu.hal.tone` | `from pymcu.hal.tone import tone, noTone` | Square-wave tone output | — native HAL only | AVR |
| [`pymcu.hal.wifi`](/pymcu/stdlib/wifi/) | `from pymcu.hal.wifi import CYW43` | CYW43439 WiFi (bring-up, join, TCP, MQTT) | MP: `network.WLAN` + `umqtt` · CP: `wifi` + `socketpool` + `adafruit_minimqtt` | **Pico 2 W (RP2350) only** — open networks, no WPA |
| [`rp2`](/pymcu/stdlib/pio/) | `import rp2` + `@rp2.asm_pio(...)` | PIO state-machine DSL, assembled at build time | MP: `rp2` · CP: — | ARM — RP2040 and RP2350 |
| `pymcu.asyncio` | `from pymcu import asyncio` | `async`/`await`, `sleep_ms`, `run`, `gather` | — PyMCU only | AVR, ARM |
| [`pymcu.collections`](/pymcu/stdlib/collections/) | `from pymcu.collections import FixedDict` | Fixed-capacity dict, no heap | — PyMCU only | AVR, ARM |
| `pymcu.math` | `from pymcu.math import map_range, constrain` | Arduino-style `map()` and `constrain()` on integers | — PyMCU only | Any target |
| `pymcu.random` | `from pymcu.random import random, randomSeed` | Pseudo-random numbers | — PyMCU only | All |
| `pymcu.ffi` | `from pymcu.ffi import extern` | `@extern` C interop | — native HAL only | AVR only |
| `pymcu.boards` | `from pymcu.boards.arduino_uno import D13` | Board pin-name constants (Uno, Mega, Leonardo) | MP: `boards/` modules · CP: `board` | AVR |
| `pymcu.types` | `from pymcu.types import uint8, ptr` | Type aliases, `const`, `inline`, `asm`, `ptr` | — native HAL only | All |

Three things worth calling out in that table:

- **`pymcu.math` is not CPython's `math`.** It ships exactly two architecture-neutral `@inline`
  helpers — `map_range(x, in_lo, in_hi, out_lo, out_hi)` and `constrain(x, lo, hi)`, the
  Arduino `map()` and `constrain()` — on integers. There is no `sqrt`, no trigonometry and no
  `pi`. (The `.S` assembly under `math/avr/` is internal compiler runtime, not an importable
  module.)
- **`avr.EEPROM`, `avr.SoftSPI` and `avr.SoftI2C` are a PyMCU extension**, not upstream
  MicroPython — stock MicroPython has no EEPROM class on AVR. They ship inside the
  `pymcu-micropython` package because there is no community-specified alternative.
- **`microcontroller` and `alarm` are real CircuitPython modules**, so `microcontroller.nvm`,
  `microcontroller.watchdog` and `alarm.time.TimeAlarm` are the genuine CircuitPython spelling of
  EEPROM, watchdog and sleep.

Modules without a link do not have a reference page yet — the module docstrings in
`lib/src/pymcu/` are the authority for those.

## Device drivers

Drivers live in `pymcu.drivers`. The class layer is architecture-neutral; the timing-sensitive
back end sits in a private `_<driver>/<arch>.py` module. Today every driver back end targets
AVR, so on ARM and PIC these classes compile but return their error sentinel.

Drivers are **PyMCU stdlib, not part of MicroPython or CircuitPython**. They are imported the
same way whichever API you use for the rest of your program — a `machine.Pin` program and a
`digitalio` program both say `from pymcu.drivers.dht11 import DHT11`. The two exceptions noted in
the table are NeoPixel, which has a real CircuitPython module, and LM35, which has a PyMCU
MicroPython-side module.

| Driver | Import | Description | Compat API | Reference page |
|---|---|---|---|---|
| DHT11 | `from pymcu.drivers.dht11 import DHT11` | Temperature + humidity, single-wire | — PyMCU only | [DHT11](/pymcu/stdlib/drivers/dht11/) |
| DS18B20 | `from pymcu.drivers.ds18b20 import DS18B20` | Precision temperature, 1-Wire, 12-bit | — PyMCU only | [DS18B20](/pymcu/stdlib/drivers/ds18b20/) |
| HD44780 LCD | `from pymcu.drivers.lcd import LCD` | 4-bit parallel character LCD | — PyMCU only | — |
| SSD1306 OLED | `from pymcu.drivers.ssd1306 import SSD1306` | 128x64 OLED over I2C | — PyMCU only | — |
| MAX7219 | `from pymcu.drivers.max7219 import MAX7219` | 8x8 LED matrix over SPI | — PyMCU only | — |
| BMP280 | `from pymcu.drivers.bmp280 import BMP280` | Barometric pressure + temperature over I2C | — PyMCU only | — |
| WS2812 NeoPixel | `from pymcu.drivers.neopixel import NeoPixel` | Addressable RGB LEDs, bit-banged | CP: `neopixel.NeoPixel` | — |
| LM35 | — | Analog temperature sensor; no `pymcu.drivers` module — read it with [`AnalogPin`](/pymcu/stdlib/adc/) | MP: `lm35` | — |

Only DHT11 and DS18B20 have their own reference page so far. For the rest, the class docstring
plus the [roadmap](/pymcu/roadmap/) entry are the current documentation.

## Architecture support matrix

| Module | AVR | ARM (RP2040 / RP2350) | PIC |
|---|---|---|---|
| GPIO | Complete | Complete | Complete |
| UART | Complete | Complete | Complete |
| ADC | Complete | Complete | Partial (`read()` is a stub) |
| PWM | Complete | Complete | Complete |
| SPI | Complete | Complete | — |
| I2C | Complete | Complete (writes only) | — |
| DMA | — | Complete | — |
| Timer | Complete | — | Complete (Timer0) |
| EEPROM | Complete | — | — |
| Watchdog | Complete | — | — |
| Power / sleep | Complete | — | — |
| WiFi (CYW43439) | — | RP2350 / Pico 2 W | — |
| PIO | — | Complete | — |
| Delays (`pymcu.time`) | Complete | Complete | Complete |
| Drivers (DHT11, DS18B20, LCD, ...) | Complete | — | — |

See [Limitations](/pymcu/limitations/) for the language-level constraints that apply on top of this,
and the [Roadmap](/pymcu/roadmap/) for what is queued next.
