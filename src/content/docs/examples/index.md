---
title: Examples
description: The PyMCU example gallery — every program in MicroPython, CircuitPython and the native HAL, grouped by target.
---

Every example that talks to hardware is shown in **MicroPython** first, **CircuitPython**
second and the **native HAL** third. Pick a tab on any page and the choice follows you
across the whole site — open another example and it is already showing your API.

Prefer the compat APIs: `machine` / `utime` and `board` / `digitalio` / `busio` are stable
and community-specified, and they compile to the same firmware as the native HAL. The
`pymcu.hal.*` layer is correct but its API may change between alpha releases, so it is
documented as the advanced layer — the one you reach for when the compat APIs do not cover
something. Where a feature has no compat equivalent at all (`@interrupt` handlers, direct
register access through `ptr[T]`, inline `asm()`, the PIO DSL), the example is native-HAL
only and says so in an "advanced" callout rather than inventing a tab.

A handful of pages are pure language — [tuple-ops](/pymcu/examples/tuple-ops/) is the clearest
case — and carry no tabs at all, because tuples, `enumerate` and multi-return are compiler
features that read identically whichever API you import.

The gallery is grouped by target. The AVR programs build for an **ATmega328P (Arduino Uno)
at 16 MHz** unless noted; the ARM programs build for the **Raspberry Pi Pico (RP2040)** and
**Pico 2 (RP2350)**.

Pages with a link have a full walkthrough on this site. Every name in the AVR tables below
is a complete project in [`pymcu-avr/examples/`](https://github.com/PyMCU/pymcu-avr) — its
own directory with a `pyproject.toml`, a `README.md` and a `src/main.py` — so you can
`cd` into it and run `pymcu build` straight away.

:::note[No flash figures during the alpha]
Earlier revisions of this page printed a byte count next to every example. Those numbers
move between alpha compiler releases, so they are no longer published here — a stale figure
is worse than none. `pymcu build` prints the real size for your build:

```text
Flash: 162 / 32768 bytes (0% of program storage)
```

See [`pymcu build`](/pymcu/driver/#pymcu-build) for what that number does and does not include.
:::

## ARM — Raspberry Pi Pico / Pico 2

These are walked through on the [Raspberry Pi Pico (RP2040 / RP2350)](/pymcu/examples/rp2040/)
page, with the full source for each. `pymcu build` emits `dist/firmware.bin` plus a
`dist/firmware.uf2` for BOOTSEL flashing.

| Example | Target | Description |
|---|---|---|
| [blink](/pymcu/examples/rp2040/) | RP2040 / RP2350 | On-board LED (GP25) toggle with `delay_ms` |
| [uart-echo](/pymcu/examples/rp2040/) | RP2040 / RP2350 | Echo bytes on UART0 (GP0/GP1) |
| [pwm](/pymcu/examples/rp2040/) | RP2040 / RP2350 | 5 kHz PWM at 50% duty on GP2 |
| [adc](/pymcu/examples/rp2040/) | RP2040 / RP2350 | ADC channel 0 (GP26) drives the LED |
| [spi](/pymcu/examples/rp2040/) | RP2040 / RP2350 | Byte writes on SPI0 |
| [i2c](/pymcu/examples/rp2040/) | RP2040 / RP2350 | Byte writes to an I2C0 device |
| [dma](/pymcu/examples/rp2040/) | RP2040 / RP2350 | RAM-to-RAM word transfer, verified |
| [pio-blink](/pymcu/examples/rp2040/) | RP2040 / RP2350 | `@rp2.asm_pio` DSL — blink with the CPU idle |
| [exceptions](/pymcu/examples/rp2040/) | RP2040 / RP2350 | `try` / `except` / `finally` / `raise` |
| [float](/pymcu/examples/rp2040/) | RP2040 / RP2350 | IEEE-754 f32 — bootrom fast-float / M33 FPU |
| [fstring-value](/pymcu/examples/rp2040/) | RP2040 | f-strings as values in a fixed buffer |
| [dict-set](/pymcu/examples/rp2040/) | RP2040 | Closed `dict` / `set` literals, catchable `KeyError` |
| [generators](/pymcu/examples/rp2040/) | RP2040 | `yield` lowered to a state machine |
| [async-v2](/pymcu/examples/rp2040/) | RP2040 | `await asyncio.sleep_ms` in `if` / `while` / `for`, `gather`, return values |
| `async-blink-rp2350` | RP2350 | Two coroutines blinking GP14 / GP15 at a 4:1 ratio |
| [wifi-cyw43](/pymcu/examples/rp2040/) | RP2350 (Pico 2 W) | CYW43439 bring-up, WLAN join, MQTT publish |
| [dht-mqtt](/pymcu/examples/rp2040/) | RP2350 (Pico 2 W) | Sensor reading → MQTT, native / MicroPython / CircuitPython |
| [cp-digitalio-uart](/pymcu/examples/rp2040/) | RP2040 | CircuitPython `board` / `digitalio` / `busio` |
| [mp-uart-echo](/pymcu/examples/rp2040/) | RP2040 | MicroPython `machine.Pin` / `machine.UART` |

The ARM projects live in
[`pymcu-arm/examples/`](https://github.com/PyMCU/pymcu-arm). Several exist in both an
RP2040 and an RP2350 flavour under a `-rp2040` / `-rp2350` suffix; unsuffixed names are the
RP2040 build.

## AVR — ATmega328P (Arduino Uno)

Everything in this section targets the ATmega328P at 16 MHz, except `attiny84-blink` (see
the end of this section).

### Core GPIO

| Example | Description |
|---|---|
| [blink](/pymcu/examples/blink/) | The classic "hello world" of embedded — toggle an LED once per second |
| `multi-pin` | Six LEDs and two buttons — a small interactive light pattern |
| `shift-register` | Bit-banged 74HC595 shift register driving a running light |
| `button-debounce` | Software-debounced button press counter with UART telemetry |
| `random-led` | Random blink intervals seeded from ADC noise |
| `enum-state` | A minimal compile-time constant-folding demo |

### UART

| Example | Description |
|---|---|
| [uart-echo](/pymcu/examples/uart-echo/) | The simplest UART round-trip: echo every received byte |
| `uart-echo-mp` | UART echo written in **MicroPython** style, compiled by PyMCU |
| `uart-echo-cp` | UART echo written in **CircuitPython** style, compiled by PyMCU |
| `uart-str` | UART string and character output helpers |
| `uart-command` | A single-character UART command interpreter |
| `uart-rx-interrupt` | Interrupt-driven UART receive with a 16-byte ring buffer |
| `checksum` | A running XOR checksum accumulator over UART |

### Analog — ADC, PWM, sound and motion

| Example | Description |
|---|---|
| `adc-read` | Single-channel, polled ADC read on the ATmega328P |
| `adc-interrupt` | Interrupt-driven ADC sampling on the ATmega328P |
| `pwm-fade` | Smoothly fade an LED in and out with hardware PWM |
| `pwm-multi` | Three independent hardware PWM channels running at once |
| `soft-pwm` | Software PWM driven by a timer overflow ISR |
| `servo` | Sweep a standard RC servo from 0 to 180 degrees and back |
| `tone-buzzer` | Play a melody on a passive buzzer with zero-CPU hardware tone generation |

### Interrupts and timers

| Example | Description |
|---|---|
| `pin-irq` | Minimal external interrupt: INT0 falling-edge on PD2 |
| `interrupt-counter` | External interrupt (INT0) press counter |
| `pcint-counter` | Pin Change Interrupt (PCINT0) button counter |
| `timer-poll` | Polling a timer overflow flag instead of using an interrupt |
| `timer-interrupt` | Timer1 overflow interrupt blinking an LED at ~1 Hz |
| `timer-ctc` | Timer1 CTC mode for a precise 1 Hz interrupt |
| `stopwatch` | A three-interrupt stopwatch: start/stop, reset, and a timer tick |
| [sensor-dashboard](/pymcu/examples/sensor-dashboard/) | A multi-interrupt sensor monitor with min/max tracking and live display modes |

### Protocols — SPI and I2C

| Example | Description |
|---|---|
| `spi-shift-register` | Hardware SPI driving a 74HC595 with selectable animations |
| `spi-cs` | Hardware SPI with a custom chip-select pin |
| `spi-irq` | Interrupt-driven hardware SPI in **peripheral** mode |
| `softspi` | Bit-banged SPI in **controller** mode via the SoftSPI HAL |
| `softspi-peripheral` | Bit-banged SPI in **peripheral** mode via the SoftSPI HAL |
| `i2c-scanner` | Scan the I2C bus and report every device that ACKs |
| `i2c-irq` | Interrupt-driven I2C **peripheral** (TWI slave) at address 0x42 |

### Device drivers

| Example | Description |
|---|---|
| `dht-sensor` | Read humidity and temperature from a **DHT11** sensor with a custom bit-banged driver |
| `bmp280` | Read temperature and pressure from a Bosch **BMP280** sensor over I2C |
| `ssd1306` | Bring up a 128x64 **SSD1306** OLED over I2C |
| `lcd` | Drive a 16x2 **HD44780** character LCD in 4-bit mode |
| `max7219` | Drive a **MAX7219** 8x8 LED matrix over SPI |
| `neopixel` | Cycle a single **WS2812B** (NeoPixel) through red, green, and blue |

The drivers themselves are documented under
[Device drivers](/pymcu/stdlib/#device-drivers).

### Storage, power and reliability

| Example | Description |
|---|---|
| `eeprom` | Write and read back values from the on-chip EEPROM |
| `watchdog` | Enable, feed, and disable the watchdog timer |
| `sleep-wakeup` | Enter sleep mode and wake on an external interrupt |

### Application patterns

| Example | Description |
|---|---|
| `state-machine` | A UK-style traffic-light finite state machine |
| `clamp-filter` | Multi-argument functions and a multi-level call chain on AVR |
| `rtos-multitask` | A preemptive RTOS with weighted round-robin scheduling — the flagship showcase |

### Language features

| Example | Description |
|---|---|
| [inheritance-zca](/pymcu/examples/inheritance-zca/) | Zero-cost class inheritance and function overloading |
| `error-handling` | Exception-based error handling with `try` / `except` / `raise` |
| `t-flag-demo` | The low-level T-flag error ABI behind `raise` / `return` |
| [tuple-ops](/pymcu/examples/tuple-ops/) | Multi-return, tuple unpacking and `enumerate` |

:::note[tuple-ops is a walkthrough, not a project directory]
`tuple-ops` has a page here but no directory under `examples/`. It — along with
`array-ops`, `list-comp`, `stress-math`, `edge-cases`, `bitwise-ops`, `matrix-math`,
`uint16-math`, `nested-calls`, `callbacks`, `delay-test`, `multi-isr` and
`timer2-interrupt` — is an integration-test fixture under
`pymcu-avr/tests/integration/fixtures/`. The fixtures are compiled and asserted on every CI
run, but they are not packaged as standalone example projects.
:::

### C / C++ interop (FFI)

| Example | Description |
|---|---|
| `extern-call` | Call C functions from PyMCU firmware via the `@extern` FFI |
| `ffi-abi` | Validate the PyMCU to C calling convention (ABI) through FFI probes |
| `ffi-arduino` | Arduino-style utility functions in C, called from PyMCU via FFI |
| `ffi-crc8` | CRC-8 (Dallas/Maxim) via avr-libc, the same algorithm used by the Arduino OneWire library |
| `ffi-dsp` | Multi-file C interop: two C sources linked into one firmware |

The `[tool.pymcu.ffi]` table that drives these builds is documented under
[C / C++ interop](/pymcu/driver/#c--c-interop).

### Not listed above

Five further AVR projects ship without a README, so there is no description to quote for
them here: `analog-inout`, `analog-inout-mp`, `pin-irq-mp`, `smoothing`, and
`attiny84-blink` — the only example in the repository that does not target an ATmega328P
(it builds for an **ATtiny84 at 8 MHz**). Read their `src/main.py` in the repository.

## Building any of these

Each directory is a self-contained project:

```bash
cd examples/blink        # in the pymcu-avr repository
pymcu build
pymcu flash --port /dev/cu.usbmodem*
```

Set `stdlib = ["micropython"]` or `stdlib = ["circuitpython"]` in `[tool.pymcu]` to make the
matching compat flavour importable. Examples whose name ends in `-mp` or `-cp` already do.
The full command and configuration reference is in the
[CLI Driver](/pymcu/driver/) page; if the program uses `print()`, open a serial terminal to
[see the output](/pymcu/getting-started/quickstart/#6-see-the-output).
