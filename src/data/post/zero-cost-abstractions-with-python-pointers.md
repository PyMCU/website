---
publishDate: 2026-06-02T00:00:00Z
author: PyMCU Team
title: "Zero-Cost Abstractions: A Python Class That Compiles to One Instruction"
excerpt: On a chip with 2 KB of RAM you cannot afford a "Pin object." PyMCU's answer is the zero-cost abstraction — an @inline class built on the ptr[T] primitive that has no struct, no method call, and no runtime. led.toggle() compiles to a single AVR instruction. Here is exactly how, with the disassembly to prove it.
image: https://images.unsplash.com/photo-1518770660439-4636190af475?ixlib=rb-4.0.3&auto=format&fit=crop&w=2070&q=80
category: Deep Dive
tags:
  - zca
  - inline
  - pointers
  - hal
  - avr
---

Abstractions normally cost something. A `Pin` class wraps a port and a bit; calling `pin.toggle()` is a method call; the object lives somewhere in memory. On a desktop that overhead is invisible. On an ATmega328P — 32 KB of flash, **2 KB of SRAM**, no cache, no MMU — every byte of RAM and every wasted cycle is real.

So embedded developers have historically faced a choice: write clean, abstracted code and pay for it, or write raw register pokes and live with the noise. PyMCU's answer is to refuse the choice. Its hardware abstraction layer is built entirely from **zero-cost abstractions (ZCAs)**: classes that read like ordinary Python but leave *nothing* behind at runtime — no struct in SRAM, no `CALL`/`RET`, no dispatch. The high-level call and the hand-written register op compile to the same machine code.

This post shows how that works, starting from the one primitive everything is built on.

> If you haven't read [the origin story of `ptr[T]`](/the-origin-of-pymcu-dereferenced-pointers), it's a good five-minute primer on the pointer concept this post builds on.

---

## The primitive: `ptr[T]`

PyMCU's whole type system grows from a single idea — a typed reference to a physical address:

```python
from pymcu.types import ptr, uint8

PORTB: ptr[uint8] = ptr(0x25)   # ATmega328P PORT B data register
DDRB:  ptr[uint8] = ptr(0x24)   # data direction register
PINB:  ptr[uint8] = ptr(0x23)   # input register (and toggle register — more on that later)
```

`ptr[uint8]` is not an allocation. It's a compile-time promise that the name `PORTB` *is* the byte at address `0x25`. Bit-indexing it lowers to the AVR's single-cycle bit instructions:

```python
DDRB[5]  = 1      # SBI 0x04, 5  — set PB5 as output
PORTB[5] = 1      # SBI 0x05, 5  — drive PB5 high
PORTB[5] = 0      # CBI 0x05, 5  — drive PB5 low
```

That's the floor: Python syntax, one instruction each, zero overhead. The problem is that real programs don't want to memorize that `PB5` means "PORTB, DDRB, PINB, bit 5." They want a `Pin`.

---

## The abstraction: an `@inline` class

Here is the actual PyMCU `Pin` class — trimmed, but this is real stdlib code, not a simplification:

```python
class Pin:
    IN  = 1
    OUT = 0

    @inline
    def __init__(self, name: str, mode: const[uint8], ...):
        # Resolve the register set + bit from the name, at compile time
        match name:
            case 'PB0' | 'PB1' | ... :
                self._port = PORTB; self._ddr = DDRB; self._pin = PINB
            case 'PC0' | ... :
                self._port = PORTC; self._ddr = DDRC; self._pin = PINC
            case 'PD0' | ... :
                self._port = PORTD; self._ddr = DDRD; self._pin = PIND
        match name:
            case 'PB5' | 'PC5' | 'PD5': self._bit = 5
            ...
        self._ddr[self._bit] = mode ^ 1     # configure direction

    @inline
    def high(self):
        self._port[self._bit] = 1           # SBI on PORTx

    @inline
    def low(self):
        self._port[self._bit] = 0           # CBI on PORTx

    @inline
    def toggle(self):
        self._pin[self._bit] = 1            # SBI on PINx — see below
```

Two things make this a *zero-cost* abstraction rather than just a class:

1. **`@inline`** tells the compiler to expand each method body at its call site. There is no function to call — the body of `toggle()` is pasted in wherever you write `led.toggle()`.
2. **The `self._port` / `self._bit` members are compile-time values, not SRAM.** `name` is a `str` known at compile time, so the `match` statements are resolved by the compiler — `self._port` becomes the constant address of `PORTB`, `self._bit` becomes the constant `5`. Nothing about the `Pin` object survives to runtime. There is no struct to allocate.

---

## Compile-time resolution in action

When you write:

```python
led = Pin("PB5", Pin.OUT)
```

the compiler walks the `__init__` with `name = "PB5"` and `mode = 0` *while compiling*:

- The first `match` folds `self._port → PORTB (0x25)`, `self._ddr → DDRB (0x24)`, `self._pin → PINB (0x23)`.
- The second `match` folds `self._bit → 5`.
- `self._ddr[self._bit] = mode ^ 1` becomes `DDRB[5] = 1` becomes `SBI 0x04, 5`.

The string `"PB5"` never exists in the firmware. There is no lookup table, no `Pin` struct, no pointer chasing. By the time code generation runs, `led` is not a value at all — it's a set of constants the compiler has already substituted everywhere you used it.

---

## The proof: source vs. disassembly

Here is a complete blink program using the ZCA `Pin`:

```python
from pymcu.hal.gpio import Pin
from pymcu.time import delay_ms

def main():
    led = Pin("PB5", Pin.OUT)
    while True:
        led.toggle()
        delay_ms(500)
```

And here is the actual disassembly of `main`, straight from `avr-objdump` on the built firmware:

```asm
00000068 <main>:
  76:  sbi  0x04, 5     ; Pin("PB5", Pin.OUT)  → set DDRB bit 5 (output)
  78:  sbi  0x03, 5     ; led.toggle()         → toggle PB5 (one instruction)
  ...                   ; delay_ms(500)
  8c:  rjmp .-22        ; loop back to the toggle
```

`led.toggle()` — a method call on an object, in Python — is **a single `sbi 0x03, 5` instruction**. No prologue, no stack, no indirection. The whole firmware on the chip is:

```
Flash:  142 bytes   (vector table + startup included)
SRAM:   0 bytes     (data = 0, bss = 0)
```

(`pymcu build` prints `36 bytes` for this program — it reports your code *minus* the interrupt-vector table, which is fixed overhead every AVR toolchain emits. The 142 bytes above is the complete `.hex`.) That puts it right next to hand-written C — `avr-gcc -Os` produces 176 bytes for the same blink — and a fraction of Arduino's ~1 KB. Except you wrote `led.toggle()`.

---

## Why `toggle()` is one instruction

This is a small but lovely detail. The AVR has a hardware trick: **writing a `1` to a bit in the `PINx` register toggles the corresponding `PORTx` bit.** Most people learn this years into AVR programming.

PyMCU's `Pin.toggle()` is exactly that knowledge, captured once in the HAL:

```python
@inline
def toggle(self):
    self._pin[self._bit] = 1     # write 1 to PINB → toggles PORTB → SBI 0x03, 5
```

You don't have to know the trick. You call `toggle()`, and the abstraction hands you the single-cycle instruction. The naive alternative — read `PORTB`, XOR bit 5, write it back — would be three instructions and a register; the HAL gives you the one-instruction form for free, because it was written by someone who knew, and `@inline` means using it costs nothing.

---

## A friendly word about Arduino

If you've written Arduino code, you've toggled a pin like this:

```cpp
digitalWrite(13, HIGH);
```

That one line is a big part of why a generation of people — including many of us — got into embedded at all. It is wonderfully approachable, and it is *portable*: the exact same sketch runs on an Uno, a Mega, a Leonardo, or a Nano. The reason it's portable is that `digitalWrite` figures out, **at runtime**, which port and bit pin 13 maps to — it reads pin-to-port and pin-to-bitmask tables from flash, fetches the output register, disables interrupts around the write, and turns off any PWM that might be on the pin. That work is what lets one line mean the right thing on every board.

The cost of doing it every call is dozens of cycles, where a direct `PORTB |= (1 << 5)` is two. It's a deliberate trade — Arduino spends cycles to buy you portability and a gentle on-ramp, and for most projects that's exactly the right call.

PyMCU doesn't take anything away from that idea; it just moves the lookup. `Pin("PB5", Pin.OUT)` does the *same* pin-to-port-and-bit resolution Arduino does — but the `match` statements run in the **compiler**, not on the chip. By the time the firmware exists, all that's left is the `sbi`:

| | Arduino `digitalWrite(13, HIGH)` | PyMCU `led.toggle()` |
|---|---|---|
| Pin → port/bit resolution | every call, at runtime | once, at compile time |
| Per-call cost | dozens of cycles | one instruction (2 cycles) |
| Readability | high | high |
| Portability across boards | built in | recompile for the target chip |

You keep the friendly, readable call. You just don't pay for the lookup over and over. (The same holds for footprint: the stock Arduino *Blink* sketch is around a kilobyte once the core's timers and `millis()` are set up for you — conveniences PyMCU only includes if your code actually uses them, which is how the blink here lands at 142 bytes total.)

## Abstractions compose — still at zero cost

The real payoff is that ZCAs stack. A higher-level class can *hold* a `Pin` and stay just as free:

```python
class Led:
    @inline
    def __init__(self, name: str):
        self._pin = Pin(name, Pin.OUT)

    @inline
    def blink(self):
        self._pin.toggle()
        delay_ms(500)
```

`Led` has no more runtime presence than `Pin` did. `self._pin` is not a stored object — it's the same folded constants, one level up. `led.blink()` inlines `self._pin.toggle()`, which inlines to `sbi 0x03, 5`. Single inheritance, `@property` setters, and methods calling sibling methods all behave the same way: the compiler flattens the whole tower before it emits a single instruction.

This is what lets an entire device driver be a ZCA. In [the DHT11 deep-dive](/reading-a-dht11-with-pymcu), a complete temperature-and-humidity driver — a base class, two subclasses, a five-byte protocol read — compiles to ~1,480 bytes and **0 bytes of SRAM**. The sensor's mutable state lives in registers; the class hierarchy exists only in the source.

---

## The mental model

Two rules describe the whole system:

- **`ptr[T]` means "this name is this address."** It collapses to the AVR's `SBI`/`CBI`/`LDS`/`STS` instructions with nothing in between.
- **`@inline` means "expand this here."** It removes the function boundary, so an abstraction has no call cost and no object to store.

Put them together and you can write code that reads like Python — `led = Pin("PB5", Pin.OUT)`, `led.toggle()` — and ships code that reads like hand-tuned assembly — `sbi 0x04, 5`, `sbi 0x03, 5`. The abstraction is real where you work, in the source, and gone where it would cost you, on the chip.

That is the whole idea behind PyMCU's HAL: every peripheral — GPIO, UART, SPI, I2C, ADC, PWM, timers — is a zero-cost abstraction over `ptr[T]`. You get to think in objects. The ATmega328P only ever sees instructions.
