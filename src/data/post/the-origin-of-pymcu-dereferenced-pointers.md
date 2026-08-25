---
publishDate: 2026-05-02T00:00:00Z
author: PyMCU Team
title: 'The Origin of PyMCU: An Epiphany About Dereferenced Pointers'
excerpt: A mechatronics engineer's journey from a C concept that felt like magic — the dereferenced pointer — to building a Python compiler for microcontrollers accessible to everyone.
image: ~/assets/images/post-the-origin-of-pymcu-dereferenced-pointers.png
category: Story
tags:
  - origin
  - pymcu
  - pointers
  - embedded
  - python
---

## A Concept Hiding in Plain Sight

If you have spent any time writing firmware in C, the following line probably feels completely unremarkable:

```c
*(volatile uint8_t *)0x25 = 0xFF;
```

You dereference a pointer to a specific memory address and write a value to it. A register is written, the port goes high, and you move on without thinking twice. For an experienced C programmer, this is second nature — nothing more than everyday syntax.

I am a mechatronics engineer. My education was built around mechanics, electronics, and control systems. C was always somewhere in the curriculum, but dereferenced pointers and memory-mapped I/O were rarely the focus. So when I stopped one day and truly thought about what that line of code actually _means_, something clicked.

A pointer is just a number. A memory address. And by dereferencing it, you are saying: _go to that exact location in physical memory and do something there_. No abstraction, no driver, no operating system between you and the silicon. Just you and an address.

For a C programmer that is trivial. For me, it was an epiphany.

## The Question That Started Everything

The thought that followed was equally simple: _could Python express this same idea?_

Not MicroPython running a full interpreter on the chip. Not CircuitPython with its runtime overhead. The real question was: could a Python-syntax program compile down to the exact same machine instruction that C produces for a pointer dereference — with zero extra cost?

That question became the seed of PyMCU.

The dream was not to replace C. C is excellent at what it does, and professional embedded developers use it for very good reasons. The dream was different: to give people who already know Python — students, hobbyists, engineers from other disciplines — a genuine way to program a microcontroller using syntax they are comfortable with, and have it run at native speed with no interpreter in between.

MicroPython gets you partway there. You can use Python syntax and run it on an Arduino-class board. But it does so by embedding a full Python runtime in flash, which costs hundreds of kilobytes and introduces non-deterministic execution. That is a real trade-off.

PyMCU takes a different path. The Python source never reaches the microcontroller. The compiler on your PC reads it, type-checks it, and emits native machine code. The chip receives only the binary — lean, deterministic, and runtime-free. The dynamic features of Python that make it so expressive on a desktop — garbage collection, dynamic typing, arbitrary-size integers — do not exist in this model, and that is fine. The goal is not full Python on an MCU. The goal is to make bare-metal programming approachable through Python syntax.

The pointer dereference was the bridge. Translating that concept to Python in a zero-overhead way was where it all began.

## Translating the Concept: `ptr[T]`

The central primitive in PyMCU's type system is `ptr[T]`. It is the direct translation of the dereferenced pointer concept into Python syntax.

In PyMCU, you map a hardware register to a name like this:

```python
from pymcu.types import ptr, uint8

PORTB: ptr[uint8] = ptr(0x25)   # ATmega328P PORTB DATA register
```

`ptr[uint8]` is a typed reference to a memory address. The address `0x25` is the PORTB output register of the ATmega328P. This is not allocating memory — it is declaring that the symbol `PORTB` refers to that exact physical location.

To write the whole register:

```python
PORTB.value = 0xFF   # write all 8 bits
```

To access a single bit:

```python
PORTB[5] = 1              # set bit 5
bit: uint8 = PORTB[5]     # read bit 5
```

Bit-index access is not syntactic sugar over manual masking. The compiler knows the I/O address range of the ATmega328P and emits `SBI` (Set Bit in I/O register) or `CBI` (Clear Bit in I/O register) — single-cycle, single-instruction operations. Outside the I/O range it falls back to `LDS`/`STS` plus a mask, but the Python source looks identical either way.

Under the hood, the PyMCU AOT compiler resolves `ptr(0x25)` at compile time and emits the exact same instruction sequence a C compiler would produce for `*(volatile uint8_t *)0x25`. No runtime indirection. No Python interpreter. No garbage collector. The abstraction is real at the source level and invisible at the machine level.

## A Fuller Picture: Registers in Context

Here is what driving PORTB directly looks like in a real program targeting the ATmega328P (Arduino Uno):

```python
from pymcu.types import ptr, uint8

DDRB:  ptr[uint8] = ptr(0x24)   # Data Direction Register B
PORTB: ptr[uint8] = ptr(0x25)   # Port B Data Register

def init() -> None:
    DDRB[5] = 1      # PB5 (pin 13) as output — CBI/SBI

def toggle() -> None:
    PORTB[5] ^= 1    # toggle bit 5
```

If you have written bare-metal C before, this structure is immediately familiar. If you have not, Python's syntax makes the intent dramatically easier to read and reason about. Either way, the compiled output is identical.

## What This Unlocked

Once `ptr[T]` existed as a primitive, a cascade of capabilities became possible.

**A type system that matches the hardware.** The ATmega328P has 8-bit registers. `ptr[uint8]` expresses that directly. When timers introduce 16-bit values, `uint16` handles them. The full set — `uint8`, `int8`, `uint16`, `int16`, `uint32`, `int32` — maps directly to MCU register widths. The compiler uses these annotations to select the right instruction width; no guessing, no implicit promotion.

**Compile-time constants in flash.** `const[T]` declares a value that must be resolvable at compile time. The compiler folds it into every use site and never allocates SRAM for it. Flash arrays (`const[uint8[N]]`) are placed in PROGMEM and read with `LPM` — which matters a lot on a chip with only 2 KB of SRAM.

```python
from pymcu.types import const, uint8

SINE_TABLE: const[uint8[8]] = [0, 90, 180, 255, 180, 90, 0, 0]
val: uint8 = SINE_TABLE[i]   # LPM Z — reads from flash, not SRAM
```

**Zero-Cost Abstractions with `@inline`.** The `ptr[T]` primitive is powerful but verbose for full peripherals. PyMCU's HAL is built on `@inline` classes — classes that have no SRAM representation at all. Every method expands inline at the call site, exactly like writing the register operations by hand.

```python
from pymcu.hal.gpio import Pin
from pymcu.time import delay_ms

def main():
    led = Pin("PB5", Pin.OUT)   # no struct in SRAM; compiles to DDR/PORT instructions
    while True:
        led.toggle()            # IN + EOR + OUT — three instructions
        delay_ms(500)
```

A full blink program compiled this way is about 142 bytes of flash — vector table and startup stub included — and 0 bytes of SRAM. That sits right next to the 162 bytes `avr-gcc -Os` produces for the same blink: PyMCU emits essentially the C compiler's own output. MicroPython, by contrast, needs hundreds of kilobytes before your code even starts.

**Hardware interrupt handlers.** The `@interrupt` decorator maps a Python function directly onto an AVR interrupt vector. The compiler generates the correct ISR prologue and epilogue — saving and restoring registers, clearing the interrupt flag — all from Python syntax.

**Deterministic, predictable execution.** Because PyMCU compiles to native machine code ahead of time and has no runtime, there is no interpreter loop, no garbage collection pause, no dynamic dispatch. Timing-sensitive code behaves like C timing-sensitive code.

## From One Primitive to a Toolchain

That single idea has since grown into something much larger than a way to poke a register. Everything below exists today, and every piece compiles down to the same kind of lean native code as the `ptr` dereference that started it:

- **A real hardware abstraction layer.** GPIO, UART, SPI, I2C, ADC, PWM, timers, EEPROM, the watchdog, and sleep modes — all `@inline` zero-cost classes — plus device drivers for parts like the DHT11/DHT22, SSD1306 OLED, BMP280, MAX7219, and WS2812B. The `ptr[T]` primitive is still down there; the HAL just gives it a friendly face.
- **Zero-cost error handling.** `try` / `except` / `raise` work on the chip, implemented through a tiny ABI that rides on the AVR T flag — no heap, no `setjmp`/`longjmp`, no exception objects. A `raise` is three instructions, not a runtime.
- **C interoperability.** An `@extern` decorator lets PyMCU call C functions compiled by `avr-gcc` and linked into the same firmware, so you can drop down to C or reuse an existing library exactly where you need to — and stay in Python everywhere else.
- **Familiar front doors.** Compatibility layers let you write in **MicroPython** style (`machine`, `utime`) or **CircuitPython** style (`board`, `digitalio`, `busio`) and compile _that_ to native code. The DHT11 deep-dive on this blog is one such example.
- **Language features that pay for themselves at compile time.** Function overloading, single-class inheritance, `@property`, fixed-size arrays, and `bytes`/`enumerate`/list-comprehension support — all resolved by the compiler, none of them dragging a runtime onto the chip.
- **Built to retarget.** AVR (the ATmega/ATtiny family) is the proven, reference backend the examples in this post run on. The compiler is structured around a small intermediate representation so additional backends — PIC, RISC-V, and RP2040 PIO — can grow from the same front end.

## The Compiler, Not the Interpreter

This distinction is worth stating clearly. MicroPython and CircuitPython embed a full Python interpreter in the microcontroller's flash. That interpreter consumes 200–300 KB and executes bytecode at runtime — the Python you write genuinely runs on the chip, through the interpreter. That is a valid approach and it has served the maker community well.

PyMCU takes a different trade-off. The compiler runs on your PC. It reads your Python source, type-checks it, resolves every `ptr`, inlines every `@inline` class, eliminates dead branches, and emits native AVR assembly for the ATmega328P. The MCU receives only the resulting machine code — no Python runtime, no interpreter, no dynamic features. What you gain is deterministic timing and a minimal flash footprint. What you give up is the flexibility of full Python.

```bash
pymcu build   # → dist/firmware.hex  (~142 B total, 0 bytes SRAM)
pymcu flash   # → avrdude upload to Arduino Uno
```

Neither trade-off is wrong. C is and will remain the gold standard for embedded systems. MicroPython is a fantastic tool for rapid prototyping. PyMCU exists in a different space: for people who want to write firmware with Python syntax, have it run at native speed, and still feel at home coming from the MicroPython or CircuitPython world.

## The Dream, Grounded

What started as one engineer staring at a line of C and asking _can Python do this?_ grew into a compiler, a type system, and a toolchain.

The pointer was always just a number. The address was always just hardware waiting to be written. `ptr[T]` is the answer to that original question, and everything in PyMCU — the type system, the HAL, the zero-cost abstractions — grows outward from that one idea.

If the thought of programming an Arduino in Python, compiling it to native machine code, and flashing ~142 bytes of firmware sounds like something you want to try — this is where that journey begins.
