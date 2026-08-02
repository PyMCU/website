---
title: NeoPixel Driver
description: Bit-banged WS2812/WS2812B output on AVR — cycle-exact GRB streaming with no framebuffer, plus the richer CircuitPython neopixel API built on top.
---

```python
from pymcu.drivers.neopixel import NeoPixel
```

Driver for **WS2812 / WS2812B** addressable LEDs ("NeoPixels"). The protocol is a single data
line with cycle-exact bit timing — 1.25 µs per bit, 800 kHz — bit-banged in hand-written assembly
by the AVR back end.

There are **two different NeoPixel APIs** in the PyMCU ecosystem and they are not the same thing.
This page documents both, separately:

| API | Import | Shape |
|---|---|---|
| PyMCU stdlib driver | `from pymcu.drivers.neopixel import NeoPixel` | Immediate streaming, no buffer, you manage interrupts |
| CircuitPython compat | `import neopixel` | `fill()`, `pixels[i] = (r, g, b)`, `show()`, per-strip SRAM framebuffer |

The compat class is built *on top of* the stdlib driver — it owns the framebuffer and the
interrupt masking that the stdlib driver deliberately leaves to you. If you want the familiar
CircuitPython surface, use it and skip the rest of this page's first half.

:::note[AVR only]
The bit-banging back end lives in `pymcu.drivers._neopixel.avr` and its timing is written for an
**ATmega328P at 16 MHz** — the bit periods are counted in instruction cycles. On any other
architecture the `if __CHIP__.arch == "avr"` guards leave nothing behind and the calls compile
away.
:::

## The PyMCU stdlib driver

### `NeoPixel(pin, n)`

| Parameter | Type | Description |
|---|---|---|
| `pin` | `str` | Data pin name, e.g. `"PD6"`. Bound at compile time — no SRAM is allocated |
| `n` | `uint8` | Number of pixels on the strip |

The constructor also configures the pin as an output and drives it low.

:::caution[`n` is recorded, not enforced]
The driver stores `n` but never uses it. Nothing counts how many pixels you have sent, and nothing
stops you sending more or fewer. **You** are responsible for calling `set_pixel()` exactly `n`
times before `show()`. Sending fewer leaves the tail of the strip showing its previous frame;
sending more simply spills into whatever is chained after it.
:::

Supported pin names on the ATmega328P are `"PB0"`–`"PB5"` and `"PD2"`–`"PD7"`. The dispatch is a
`match` with a `case _: pass` fallback, so an unsupported pin name **compiles cleanly and does
nothing at all** — no error, no output. Double-check the spelling.

### NeoPixel methods

| Method | Signature | Description |
|---|---|---|
| `set_pixel(r, g, b)` | all `uint8` | Stream one pixel's colour immediately, in WS2812 wire order (green, red, blue) |
| `write_byte(val)` | `val: uint8` | Stream one raw byte — for hand-sequencing GRB yourself |
| `show()` | — | Hold the line low for `>50 µs` to latch everything sent since the last latch |

That is the entire API. Note what is *not* there:

:::danger[No framebuffer, and interrupts are your problem]
**There is no pixel buffer.** `set_pixel()` does not store a colour — it clocks three bytes out of
the pin, right now, at 800 kHz. `show()` is not a flush; it is just the reset pulse that tells the
strip "the frame is over". To light pixel 5 you must send pixels 0 through 4 first, every time.

**The driver does not touch the interrupt flag.** WS2812 bit timing is counted in CPU cycles, so a
single ISR firing mid-transmission stretches a bit period and the strip latches garbage — usually
seen as a random flash of the wrong colour. The driver's own header states it plainly: *the user is
responsible* for masking interrupts around the transmission.

Wrap every `set_pixel()`/`show()` sequence in `disable_interrupts()` / `enable_interrupts()`, and
keep the critical section as short as you can — at 30 µs per pixel, a 60-LED strip means nearly
2 ms with interrupts off.
:::

### Wiring

```text
Arduino Uno          WS2812B strip
-----------          -------------
PD6 (D6)    <-->     DIN
5V          <-->     5V
GND         <-->     GND
```

For more than a handful of LEDs, power the strip from a separate 5 V supply and tie the grounds
together — a full-white 60-LED strip draws over 3 A, far past what a board's regulator can source.

### Example

This is the [`neopixel` example](https://github.com/PyMCU/pymcu-avr/tree/main/examples/neopixel)
from the AVR backend repository, which builds and runs on an Arduino Uno at 16 MHz. It cycles a
single pixel through red, green and blue, and shows the interrupt masking in the right place —
around the write and the latch, and nothing else.

```python
from pymcu.types import uint8
from pymcu.hal.irq import disable_interrupts, enable_interrupts
from pymcu.hal.uart import UART
from pymcu.time import delay_ms
from pymcu.drivers.neopixel import NeoPixel


def main():
    uart  = UART(9600)
    strip = NeoPixel("PD6", 1)

    uart.println("NEO")

    phase: uint8 = 0

    while True:
        disable_interrupts()   # timing-critical: no ISR during pixel write

        if phase == 0:
            strip.set_pixel(255, 0, 0)   # Red
            strip.show()
        elif phase == 1:
            strip.set_pixel(0, 255, 0)   # Green
            strip.show()
        elif phase == 2:
            strip.set_pixel(0, 0, 255)   # Blue
            strip.show()

        enable_interrupts()

        uart.write(phase)
        uart.write('\n')

        phase += 1
        if phase >= 3:
            phase = 0

        delay_ms(500)
```

The UART output is a single raw byte per cycle (`0`, `1`, `2`) followed by a newline, so a serial
terminal shows control characters rather than digits — the visible result is on the strip.

### Driving several pixels

With no buffer, a multi-pixel frame is just consecutive `set_pixel()` calls inside one critical
section:

```python
from pymcu.types import uint8
from pymcu.hal.irq import disable_interrupts, enable_interrupts
from pymcu.time import delay_ms
from pymcu.drivers.neopixel import NeoPixel

NUM = 8


def main():
    strip = NeoPixel("PD6", NUM)
    lit: uint8 = 0

    while True:
        disable_interrupts()
        i: uint8 = 0
        while i < NUM:
            if i == lit:
                strip.set_pixel(0, 32, 0)   # one green pixel
            else:
                strip.set_pixel(0, 0, 0)    # the rest off
            i = i + 1
        strip.show()
        enable_interrupts()

        lit = lit + 1
        if lit >= NUM:
            lit = 0
        delay_ms(80)
```

## The CircuitPython `neopixel` API

`pymcu-circuitpython` ships a `neopixel` module whose `NeoPixel` class mirrors CircuitPython's,
and it is a genuinely different — and richer — surface. It allocates a per-strip SRAM framebuffer
of `n * 3` bytes, so pixels are addressable and a frame can be composed before it is latched. It
also masks interrupts inside `show()` for you.

```python
import board
import neopixel
from time import sleep

NUM = 8


def main():
    # auto_write=False: build the whole frame in the buffer, then show() once.
    pixels = neopixel.NeoPixel(board.D6, NUM, auto_write=False)

    while True:
        i = 0
        while i < NUM:
            pixels.fill((0, 0, 0))      # clear every pixel
            pixels[i] = (0, 32, 0)      # light pixel i green (addressable)
            pixels.show()               # latch the frame
            sleep(0.08)
            i = i + 1
```

| Member | Description |
|---|---|
| `NeoPixel(pin, n, bpp=3, brightness=1.0, auto_write=True, pixel_order=None)` | `pin` is a `board` constant or a raw pin string |
| `fill(color)` | Set every pixel from an `(r, g, b)` tuple. The packed `0xRRGGBB` integer form CircuitPython also accepts is **not** supported — an integer literal and a tuple literal are indistinguishable to the `@inline` overload resolver |
| `pixels[i] = (r, g, b)` | Write one pixel into the framebuffer |
| `show()` | Stream the framebuffer and latch. Masks interrupts for the whole transmission |
| `len(pixels)`, `pixels.n` | Pixel count |
| `auto_write` | Whether writes latch immediately (default `True`) |
| `brightness` | Always reports `1.0`. Accepted for API compatibility; **per-pixel brightness scaling is not applied** |
| `deinit()` | No-op on bare metal |
| `RGB`, `GRB`, `RGBW`, `GRBW` | Colour-order constants, matching the CircuitPython names |

The differences from the stdlib driver worth holding onto: the compat class **has** a framebuffer
(costing `n * 3` bytes of SRAM), **does** its own interrupt masking, and **does** let you address
pixel `i` directly. It does not give you real brightness scaling, and it is the same AVR-only
bit-banger underneath.

## Notes

- Wire order is **GRB**, not RGB. `set_pixel(r, g, b)` takes its arguments in RGB order and emits
  them in the right order for you; `write_byte()` does not — sequence it yourself.
- The latch pulse must be `>50 µs` of line-low. `show()` provides it; back-to-back frames without a
  `show()` between them are treated by the strip as one long frame.
- Timing is cycle-counted for **16 MHz**. On an AVR clocked differently the bit periods will be
  wrong and the strip will not latch correctly.
- WS2812B LEDs expect a 5 V data line. A 3.3 V microcontroller usually needs a level shifter; on a
  5 V AVR this is not an issue.

## See also

- [CircuitPython compatibility](/pymcu/compat/circuitpython/) — the `board` and `neopixel` modules
- [GPIO](/pymcu/stdlib/gpio/) — the pin naming used by the `pin` argument
- [Time](/pymcu/stdlib/time/) — `delay_ms()` / `delay_us()`
- [Limitations](/pymcu/limitations/) — what interrupt masking costs you elsewhere in a program
