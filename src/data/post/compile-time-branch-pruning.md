---
publishDate: 2026-06-04T00:00:00Z
author: PyMCU Team
title: 'Branch Pruning: How a 30-Way match Compiles to Nothing'
excerpt: PyMCU's HAL is full of sprawling match and if statements — one Pin class that knows every pin on every supported chip. Yet a blink compiles to 142 bytes and a pin toggle to a single instruction. So where did the thirty branches go? They were pruned at compile time, and never shipped.
image: ~/assets/images/post-compile-time-branch-pruning.png
category: Deep Dive
tags:
  - branch-pruning
  - dead-code-elimination
  - compiler
  - zca
  - avr
---

Open [PyMCU's GPIO HAL](https://docs.pymcu.org/stdlib/gpio/) and you'll find code that looks far too heavy for a microcontroller. The `Pin` class has to know, for every pin on the chip, which port, direction, and input registers it maps to — so its constructor is a thirty-arm `match`:

```python
class _PinRegs:
    @inline
    def __init__(self, name: str):
        match name:
            case 'PB0' | 'PB1' | 'PB2' | 'PB3' | 'PB4' | 'PB5':
                self._port = PORTB; self._ddr = DDRB; self._pin = PINB
            case 'PC0' | 'PC1' | 'PC2' | 'PC3' | 'PC4' | 'PC5':
                self._port = PORTC; self._ddr = DDRC; self._pin = PINC
            case 'PD0' | 'PD1' | ... | 'PD7':
                self._port = PORTD; self._ddr = DDRD; self._pin = PIND
        match name:
            case 'PB0' | 'PC0' | 'PD0': self._bit = 0
            case 'PB1' | 'PC1' | 'PD1': self._bit = 1
            ...
            case 'PD7':                  self._bit = 7
```

And one level up, the HAL picks an _entire implementation_ per architecture:

```python
if __CHIP__.arch == "avr":
    from pymcu.hal.avr.gpio import Pin
elif __CHIP__.arch == "pic14":
    from pymcu.hal.pic14.gpio import Pin
elif __CHIP__.arch == "pic18":
    from pymcu.hal.pic14.gpio import Pin
else:
    raise CompileError("GPIO not supported on this architecture")
```

If this ran on the chip, every `Pin("PB5")` would walk a chain of string comparisons, and the firmware would carry code for ports and pins you never touch. It doesn't — because none of it reaches the chip. This is **branch pruning**.

---

## The condition is known before the chip exists

The trick is that the values these branches switch on are **compile-time constants**:

- `__CHIP__.arch` is fixed by your `pyproject.toml` (`board = "arduino_uno"` → `"avr"`).
- The `name` passed to `Pin("PB5", Pin.OUT)` is a string literal.

PyMCU's compiler runs on your PC, before any firmware exists. When it reaches a `match` or `if` whose condition it can already evaluate, it does exactly that — picks the one arm that applies, keeps it, and **discards the rest as dead code**. The arms that can't be taken aren't compiled to "skipped" instructions; they're compiled to _nothing_. They leave no comparison, no jump, no bytes.

This is the same idea as C's `#ifdef` and the way an optimizer folds `if (0) { ... }` away — except there's no preprocessor and no special syntax. You write ordinary Python `match`/`if`, and because the compiler knows the value, the branch collapses.

---

## Walking `Pin("PB5", Pin.OUT)`

Here is what the compiler does with that one line, while building:

1. `name = "PB5"`. The first `match` has exactly one arm whose pattern includes `'PB5'` — the `PORTB` arm. The `PORTC` and `PORTD` arms are unreachable, so they're dropped. `self._port` becomes the constant address of `PORTB`, `self._ddr` `DDRB`, `self._pin` `PINB`.
2. The second `match` resolves `self._bit` to the constant `5`; the other eight arms vanish.
3. `self._ddr[self._bit] = mode ^ 1` is now `DDRB[5] = 1`, which lowers to a single `SBI`.

Thirty arms in, two constants and one instruction out. There is no `"PB5"` string in the binary, no table of ports, no comparison ladder — just the path this specific call needed.

The disassembly of a complete `led = Pin("PB5", Pin.OUT)` / `led.toggle()` blink confirms it:

```asm
00000068 <main>:
  76:  sbi  0x04, 5     ; Pin("PB5", Pin.OUT)  → DDRB bit 5 (output)
  78:  sbi  0x03, 5     ; led.toggle()         → toggle PB5
  ...                   ; delay
  8c:  rjmp .-22
```

No trace of the other twenty-nine arms. They were pruned. (The whole program is 142 bytes total, vector table included — see [the zero-cost abstractions post](/zero-cost-abstractions-with-python-pointers/) for the full breakdown.)

---

## Why write it that way at all?

If only one arm survives, why not just write the one arm? Because _which_ arm survives depends on the call. The same `Pin` class compiles `Pin("PB5")` to PORTB-bit-5 and `Pin("PD3")` to PORTD-bit-3 — each call site prunes to its own path. You get a single, readable abstraction that covers the whole chip, and every use pays only for the path it takes.

It's the difference between resolving the pin **once, at compile time** and resolving it **every call, at runtime**. A runtime `digitalWrite(13, HIGH)` re-derives the port and bit on every invocation; PyMCU derives it during the build and then deletes the derivation.

---

## It's the same mechanism everywhere

Once the compiler can prune branches on known values, a lot of things become free:

- **Architecture dispatch.** One HAL, many chips. Each build keeps the arm for _your_ `__CHIP__.arch` and drops the others — like compiling a cross-platform driver with every `#ifdef` already resolved.
- **Optional features.** `if cs is not None:` for an optional chip-select pin folds away entirely when you don't pass one; the SPI driver that does and doesn't manage CS is one class.
- **Configuration constants.** A `const[uint8]` flag used in an `if` collapses to whichever side is live, so debug toggles and capability flags cost zero bytes in the build that disables them.
- **Lookup tables that aren't.** Mapping a board's integer pin (`Pin(13)`) to a port name is a `match` that prunes to a single assignment — the MicroPython and CircuitPython compatibility layers lean on this to turn friendly pin numbers into registers with no runtime cost.

---

## Dead branches don't ship

Branch pruning is quiet — it's the absence of code, so there's nothing to point at in the firmware. But it's what lets PyMCU's HAL be written the way good software _should_ be written: one expressive abstraction that handles every case, instead of thirty hand-specialized ones. You describe all the possibilities in plain Python; the compiler keeps the one that applies to each call and throws the rest away before it ever reaches the chip.

The branches you didn't take were never really there.
