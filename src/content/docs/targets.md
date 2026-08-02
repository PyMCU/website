---
title: Supported Targets
description: The chips PyMCU compiles for — AVR (ATmega / ATtiny), ARM (RP2040 / RP2350) and PIC16 — and what each backend supports.
---

PyMCU targets three architectures. Each one is a separate backend, installed through an
extra on the compiler package (see [Installation](/getting-started/installation/)).

| Architecture | Chips |
|---|---|
| **AVR** (ATmega) | ATmega48/88/168/328P, ATmega2560, ATmega32U4 |
| **AVR** (ATtiny) | ATtiny25/45/85, ATtiny24/44/84, ATtiny13/13A, ATtiny2313/4313 |
| **ARM** (Cortex-M0+ / M33) | RP2040 (Pico / Pico W), RP2350 (Pico 2 / Pico 2 W) — PIO on both; CYW43 WiFi on the Pico 2 W (RP2350) only |
| **PIC** (mid-range) | PIC16F84A, PIC16F877A — new in alpha 3 |

```bash
pipx install --pip-args=--pre "pymcu-compiler[avr]"
pipx install --pip-args=--pre "pymcu-compiler[arm]"
pipx install --pip-args=--pre "pymcu-compiler[pic]"
pipx install --pip-args=--pre "pymcu-compiler[all]"
```

## AVR

The reference board is the **Arduino Uno (ATmega328P @ 16 MHz)** — it is the target with the
deepest test coverage and the widest driver set. The backend emits AVR assembly directly and
assembles it in-process; no external `avr-gcc` is required to build.

### HAL modules

| Module | Features |
|---|---|
| `pymcu.hal.gpio` | `Pin` — high / low / toggle / irq / `pulse_in` |
| `pymcu.hal.uart` | `UART` — write / read / println / RX interrupt |
| `pymcu.hal.adc` | `AnalogPin` — polling and interrupt; channels `"PC0"`–`"PC5"`, `"TEMP"`, `"VBG"`, `"ADC8"` |
| `pymcu.hal.timer` | `Timer(n, prescaler)` in CTC mode; `millis()` / `micros()` |
| `pymcu.hal.pwm` | `PWM` — multi-channel, `set_duty` / `set_freq` |
| `pymcu.hal.spi` | `SPI` (hardware peripheral) |
| `pymcu.hal.softspi` | `SoftSPI` — bit-banged SPI on arbitrary pins |
| `pymcu.hal.i2c` | `I2C` (hardware TWI) |
| `pymcu.hal.softi2c` | `SoftI2C` — bit-banged I2C on arbitrary pins |
| `pymcu.hal.eeprom` | `EEPROM` — `write(addr, val)` / `read(addr)` |
| `pymcu.hal.watchdog` | `Watchdog` — `enable` / `disable` / `feed` |
| `pymcu.hal.power` | `sleep_idle` / `sleep_adc_noise` / `sleep_power_down` / `sleep_power_save` / `sleep_standby` / `sleep_extended_standby` |

:::note
During the alpha, prefer the [MicroPython](/compat/micropython/) or
[CircuitPython](/compat/circuitpython/) compat API over `pymcu.hal.*` — they compile to the
same firmware and their surface is stable.
:::

### Device drivers

Seven drivers ship in the standard library: DHT11, DS18B20, HD44780 LCD
(`pymcu.drivers.lcd`), SSD1306 OLED, MAX7219 8x8 LED matrix, BMP280 and WS2812 NeoPixel — see
the full table under [Device drivers](/stdlib/#device-drivers). The
[DHT11 driver](/stdlib/drivers/dht11/) page walks through one end to end.

There is no LM35 driver module: the LM35 is a plain analog sensor, so read it with
[`AnalogPin`](/stdlib/adc/).

### Board modules

Pin-name constants for the common Arduino boards:

- `pymcu.boards.arduino_uno`
- `pymcu.boards.arduino_mega`
- `pymcu.boards.arduino_leonardo`

### C / C++ interop

`@extern` declares a symbol implemented in C or C++, and `[tool.pymcu.ffi]` in
`pyproject.toml` lists the sources to compile and link alongside your firmware — which means
Arduino libraries can be called from PyMCU code. See the [CLI Driver](/driver/) reference.

### Flashing

`pymcu build` produces `dist/firmware.hex`; `pymcu flash` uploads it with **avrdude** over
the Arduino bootloader.

## ARM (RP2040 / RP2350)

Two chips, four boards: **RP2040** (Cortex-M0+) on the Pico and Pico W, and **RP2350**
(Cortex-M33) on the Pico 2 and Pico 2 W.

Unlike AVR and PIC, this backend does not emit assembly directly — it lowers PyMCU's IR to
**LLVM IR** and drives an LLVM toolchain (`opt` → `llc` → `ld.lld` → `llvm-objcopy`),
producing a flat `dist/firmware.bin` image.

### Peripherals

GPIO, UART, SPI, I2C, PWM, ADC and DMA are all available, through the same HAL and compat
APIs as on AVR.

### PIO

Available on **both** the RP2040 and the RP2350. The `@rp2.asm_pio` DSL compiles PIO programs
at build time and wires them to a state machine, so the peripheral runs your protocol without
CPU involvement:

```python
import rp2

@rp2.asm_pio(set_init=rp2.PIO.OUT_LOW)
def blink():
    set(pins, 1)
    set(pins, 0)
```

### WiFi

**Pico 2 W (RP2350) only.** On that board the CYW43439 radio is supported end to end:
bring-up, joining an access point, TCP sockets and MQTT publishing — with both MicroPython
(`network.WLAN`, `umqtt`) and CircuitPython (`wifi`, `socketpool`, `adafruit_minimqtt`)
flavours.

`pymcu.hal.wifi` raises a `CompileError` on every other chip, the Pico W (RP2040) included —
there is no CYW43 driver for the RP2040 yet.

:::caution[Open networks only — no WPA]
WPA / WPA2 is not implemented. `connect(ssid, key)` accepts a `key` argument purely so the
signature matches MicroPython's `WLAN.connect()`; passing a non-empty key is a compile-time
`CompileError` rather than a silent failure. Join an open access point.
:::

### Language parity

As of alpha 3 the ARM targets match AVR on the two features that used to be AVR-only:

- **Exceptions** — `try` / `except` / `raise` / `finally`, including propagation across
  function calls, via the same zero-cost flag model.
- **float** — IEEE-754 f32 on both chips (RP2040 through the bootrom fast-float routines,
  RP2350 natively on the M33 FPU), `print(float)` included.

Inline `asm()` accepts operand constraints on ARM, and `const` tables live in flash rather
than RAM.

### Flashing

Hold **BOOTSEL** while connecting the board — it enumerates as a USB mass-storage device.
Drop the UF2 onto it, or run `pymcu flash` and let the driver handle the copy.

## PIC

New in alpha 3: a mid-range PIC backend covering the **PIC16F84A** and **PIC16F877A**. It
assembles through **gputils / gpasm**, which the `[pic]` extra ships as a wheel — nothing to
install separately.

Supported on this backend:

- Software `*`, `/` and `%` for 8- and 16-bit integers
- Arrays in RAM, with runtime indexing
- A catchable `ZeroDivisionError` on division and modulo
- **EUSART** UART on the PIC16F877A, with the baud divisor derived from the configured clock
- Strings held in flash, and `print()`

:::caution[Use return codes, not exceptions]
General `try` / `except` / `raise` is an AVR and ARM feature. On PIC only the
`ZeroDivisionError` guard is available — structure PIC firmware around return codes instead
of exception propagation.
:::

`pymcu build` produces `dist/firmware.hex`; `pymcu flash` drives a PICkit 2 by default.

## See also

- [Limitations](/limitations/) — the exact shape of the accepted Python subset
- [Roadmap](/roadmap/) — what each backend is getting next
