---
title: HD44780 LCD Driver
description: Drive a 16x2 HD44780 character LCD in 4-bit mode — init, clear, home, set_cursor, print_str and write_char, with no SRAM used for pins.
---

```python
from pymcu.drivers.lcd import LCD
```

Driver for the **HD44780** character LCD (the ubiquitous 16x2 / 20x4 module) over a
**4-bit parallel** interface. Six GPIO pins carry the whole protocol: `RS`, `EN` and the four
data lines `D4`–`D7`. `RW` is not used — the driver is write-only and expects `RW` tied to
ground.

The module is `pymcu.drivers.lcd` and the class is `LCD`. There is no `pymcu.drivers.hd44780`.

`LCD` is a **PyMCU stdlib driver**, not part of MicroPython or CircuitPython — neither
ecosystem specifies an HD44780 class that PyMCU could mirror, so there is nothing to switch
between and this page shows a single API. You import it exactly as written above whichever API
you use for the rest of your program: a `machine.Pin` sketch and a `digitalio` sketch both say
`from pymcu.drivers.lcd import LCD`, and it compiles to the same code in both.

:::note[AVR only]
The bit-banging back end lives in `pymcu.drivers._lcd.gpio`, so the driver drives a real panel
on AVR targets. Every method dispatches on `__CHIP__.arch` and the non-AVR cases are empty, so
on another architecture the calls compile to nothing rather than failing. The `LCD` class itself
is architecture-neutral: adding a target means dropping a back end alongside the AVR one.
:::

## `LCD(rs, en, d4, d5, d6, d7)`

| Parameter | Type | Description |
|---|---|---|
| `rs` | `const[str]` | Register Select pin, e.g. `"PD4"` |
| `en` | `const[str]` | Enable (strobe) pin, e.g. `"PD5"` |
| `d4` | `const[str]` | Data bit 4 |
| `d5` | `const[str]` | Data bit 5 |
| `d6` | `const[str]` | Data bit 6 |
| `d7` | `const[str]` | Data bit 7 |

All six are `const[str]` — compile-time constants, not runtime values. The driver resolves each
name to a `SBI`/`CBI` on the right port register at compile time, so **no SRAM is allocated for
the pin configuration** and there is no port-lookup table in flash. The consequence is that you
cannot pass a pin name computed at runtime; it must be a literal (or a module-level constant).

On the ATmega328P the usable names are `"PB0"`–`"PB5"`, `"PC0"`–`"PC5"` and `"PD0"`–`"PD7"`.
Any six of them, on any mix of ports, is fine — the example below deliberately splits the data
lines across `PORTD` and `PORTB`.

### LCD methods

| Method | Signature | Description |
|---|---|---|
| `init()` | — | Power-on wait, the 4-bit init handshake, function set (2-line, 5x8), display on, clear, entry mode. Call once before anything else. |
| `clear()` | — | Clear the display and return the cursor home (command `0x01`), then wait 2 ms |
| `home()` | — | Cursor to position 0,0 without clearing (command `0x02`), then wait 2 ms |
| `set_cursor(col, row)` | `col: uint8`, `row: uint8` | Move the cursor. Rows 0–3 map to DDRAM `0x00` / `0x40` / `0x14` / `0x54` |
| `print_str(s)` | `s: const[str]` | Write a string at the cursor |
| `write_char(c)` | `c: uint8` | Write one character code at the cursor |
| `print_fmt(value, base, width, flags)` | `value: int32`, rest `uint8` | Format an integer and emit it through `write_char()` |

`print_str` takes a **`const[str]`** — a string literal known at compile time. The `for c in s`
loop inside is unrolled by the IR generator, so `lcd.print_str("Hello World")` becomes a straight
run of character writes with no loop counter and no string in SRAM.

`print_fmt` is the formatting primitive underneath: `base` is 2, 8, 10 or 16, `width` is the
minimum field width, and `flags` is a bit mask — bit 0 uppercase hex, bit 1 signed, bit 2
zero-pad. It writes through `write_char()`, so it goes to the same cursor position as everything
else.

### Wiring

```text
Arduino Uno          HD44780 (4-bit mode)
-----------          --------------------
PD4 (D4)    <-->     RS
PD5 (D5)    <-->     EN
PD6 (D6)    <-->     D4
PD7 (D7)    <-->     D5
PB0 (D8)    <-->     D6
PB1 (D9)    <-->     D7
GND         <-->     RW      (write-only — must be low)
5V / GND    <-->     VDD / VSS
            <-->     V0 via a 10 kΩ contrast pot
```

`D0`–`D3` on the panel are left unconnected in 4-bit mode.

## Example

This is the [`lcd` example](https://github.com/PyMCU/pymcu-avr/tree/main/examples/lcd) from the
AVR backend repository, which builds and runs on an Arduino Uno at 16 MHz.

```python
from pymcu.types import uint8
from pymcu.hal.uart import UART
from pymcu.drivers.lcd import LCD


def main():
    uart = UART(9600)
    lcd = LCD(rs="PD4", en="PD5", d4="PD6", d5="PD7", d6="PB0", d7="PB1")

    uart.println("LCD")

    lcd.init()

    uart.println("OK")

    lcd.clear()
    lcd.home()
    lcd.print_str("Hello World")
    lcd.set_cursor(0, 1)
    lcd.print_str("PyMCU")

    while True:
        pass
```

Expected UART output at 9600 baud:

```text
LCD
OK
```

…with `Hello World` on row 0 of the panel and `PyMCU` on row 1.

## Notes

- Call `init()` before any other method. It contains the mandatory `>40 ms` power-on wait and the
  three-times-`0x3` handshake that puts the controller into 4-bit mode.
- Every method is blocking. `init()` alone spends over 55 ms in `delay_ms`/`delay_us`, `clear()`
  and `home()` cost 2 ms each, and each character costs roughly 140 µs (two nibble strobes plus
  the post-write settle).
- The strobe timing is built on `delay_us()`. The HD44780 has generous margins, so an ISR firing
  mid-write is far less dangerous than it is for a one-wire sensor — but a long ISR still stretches
  the `EN` pulse.
- `RW` must be tied low. The driver never reads the busy flag; it waits out the datasheet timings
  instead, which is why the delays are there.
- `print_str` will not accept a runtime string. Build the text with `print_fmt`, or emit it
  character by character with `write_char`.

## See also

- [SSD1306](/pymcu/stdlib/drivers/ssd1306/) — a graphical alternative over I2C
- [GPIO](/pymcu/stdlib/gpio/) — the `Pin` class and the port registers underneath
- [Time](/pymcu/stdlib/time/) — `delay_ms()` / `delay_us()`
- [UART](/pymcu/stdlib/uart/) — the status output used in the example
