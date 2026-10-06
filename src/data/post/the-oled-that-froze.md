---
publishDate: 2026-10-06T00:00:00Z
draft: true
author: PyMCU Team
title: 'The OLED That Froze'
excerpt: A Game of Life demo ran for thousands of generations in the emulator without a hitch, then locked up solid on a real Arduino Uno. The cause was not a loose wire. It was a boolean that lived in a register the startup code never promised to zero, and an optimization pass that only ever looked at one function at a time.
image: ~/assets/images/post-the-oled-that-froze.png
category: Story
tags:
  - avr
  - memory-model
  - debugging
  - i2c
  - circuitpython
---

Conway's Game of Life on a 128x32 SSD1306 OLED, driven by the unmodified Adafruit CircuitPython SSD1306 and framebuf libraries, is now one of the examples in the [docs gallery](https://docs.pymcu.org/examples/game-of-life/). Getting it to run reliably on a real Arduino Uno took longer than it should have, and the reason turned out to matter well beyond one demo.

## A demo that would not start

The program itself is simple: seed a 32x8 grid from a small LCG, step it once every tenth of a second, draw live cells with `display.fill_rect()`, reseed when the world dies or freezes. It compiled, it ran for thousands of generations in the AVR emulator without a single dropped frame, and then it did nothing at all on the board it was actually written for. No pixels, no serial output past boot, nothing on the I2C lines a logic analyzer could catch moving.

A second variant of the same idea, close enough that most of the source was identical, ran fine. The difference between the two programs was a handful of lines: one drew each live cell with `fill_rect()` and paced itself with `time.sleep()`, the other did not. Neither difference looks like it should matter to whether an I2C bus comes up.

## Chasing a loose wire

The first suspect was the wiring, and for a little while that looked right: the working variant occasionally threw CircuitPython's `No I2C device at address: 0x3c`, which is exactly what a marginal connection on SCL or SDA produces. Reseating the cable and making sure the module's power pin matched its actual logic level (some SSD1306 breakouts want 3.3V, not 5V) cleared that up entirely for the variant that had been working.

It did nothing for the one that froze. With a solid connection confirmed on the working program, the failing one still sat there doing nothing, forever.

## A boolean with no guaranteed zero

The actual cause lived inside `adafruit_bus_device.I2CDevice`, unmodified, exactly as published: a lock around the bus, `try_lock()` and `unlock()`, backed by a single boolean field, `self._locked = 0` set in `busio.I2C.__init__`. Every I2C transaction in the driver stack starts with:

```python
while not i2c.try_lock():
    pass
```

On the AVR backend, that boolean lived for the whole program in one of the chip's general-purpose registers, the way PyMCU homes other long-lived state when it can. The compiler's startup code zeroed the variables it tracked as globals, but it did not reach into every register a field like this one could end up in. On the emulator used to build and test the firmware, every register starts at zero on a fresh run, so the field was correctly zero whether or not anything had set it. On a real ATmega328P, the datasheet makes no such promise about general-purpose register contents at power-on. If that particular register came up nonzero on a given chip, the program read `self._locked` as already true on its very first check, and the `while not i2c.try_lock(): pass` loop never exited. Not a single byte reached the bus.

## Why an unrelated change decided the outcome

This also explains why `fill_rect()` and `time.sleep()`, which have nothing to do with I2C locking, decided whether a given build worked. Which register ends up holding `self._locked` depends on the register pressure of the whole compiled program, not on anything local to the I2C code. Draw with a pixel-by-pixel loop instead of `fill_rect()`, or drop the `time.sleep()` call, and the compiler's register allocator makes different choices everywhere else, which can easily move that one boolean into a register that happens to power on at zero on a given chip, by accident. The bug was there in both variants. Only one of them was unlucky.

There was a second half to it. `self._locked = 0` has exactly one reader, `try_lock()`, an `@inline` method expanded at a different call site than the assignment. The compiler's dead-store elimination pass looks at one function at a time and, from where it was standing, that store looked unread: nothing in the same function reads it back, so it is safe to drop. For a genuinely local variable that is the right call. For a field that lives for the whole program and is read from somewhere else entirely, it is exactly wrong, and the optimizer had no way to tell the two cases apart.

## Borrowing C++'s storage rules

The fix adopts the storage-duration rules C and C++ have always had: every piece of state is either static (lives for the whole program: module globals, and every instance built at module level, and every field of such an instance, however many objects deep), automatic (lives for one function call: parameters, locals, temporaries), or dynamic (heap or arena, where one exists). With that distinction written down and tracked through the compiler, three things changed at once. Zero-initialization at startup now covers every piece of static-duration state, not just the ones the old bookkeeping happened to count as a global, including whichever register or SRAM slot the backend chose to put it in. Dead-store elimination now leaves static-duration stores alone entirely, so `self._locked = 0` stays. And the startup clear loop grew to cover the registers that hold static state, alongside the SRAM it already zeroed.

The cost is paid only where it is owed. A program with no static-duration state of its own, the canonical blink among them, does not grow by a single byte: there is nothing for the clear loop to do. A program that does have static state pays for exactly the bytes it takes to clear it, a couple of bytes per register, measured and accounted for case by case rather than estimated.

The test harness changed too. The AVR emulator that every automated test runs against now starts a fresh run with every general-purpose register and all of SRAM filled with a poison pattern (0xFF, 0x55, 0xAA across different runs) instead of the always-zero state it used before. A program that only worked by accident of implicit zeroing now fails in the same place the emulator used to hide it, long before anyone has to find it on real silicon.

## Back on the board

With the fix in, the variant that used to freeze came up and stayed up. The serial console counted generations the way the program always meant to: generation 10, 20, 30, all the way past 80, well beyond where the frozen build used to stop responding entirely. No wiring changes, no code changes beyond the compiler itself.

## What you are looking at

The animation below is not a recreation. It comes from decoding the real I2C bytes the compiled firmware sends on the wire, the same `SET_COL_ADDR` / `SET_PAGE_ADDR` / framebuffer-write sequence a real SSD1306 module receives, captured by running the firmware on an emulated Arduino Uno and recording the bus. The firmware was checked pixel for pixel against the same unmodified driver sources run under plain CPython with a fake I2C bus standing in for the hardware, across all 46 frames: it reproduces exactly the board the program computes, not an approximation of it.

<img
  src="/images/examples/game-of-life.gif"
  alt="Conway's Game of Life evolving on a 128x32 SSD1306 OLED, rendered from the I2C bytes an emulated Arduino Uno sends"
/>

Two single frames from the same run, an early generation and a later, sparser one:

<img
  src="/images/examples/game-of-life-frame-early.png"
  alt="An early generation of the Game of Life grid on the OLED"
  width="256"
/>
<img
  src="/images/examples/game-of-life-frame-late.png"
  alt="A later, sparser generation of the Game of Life grid on the OLED"
  width="256"
/>

The full example, with the unmodified Adafruit drivers and instructions for building it, is in the [docs gallery](https://docs.pymcu.org/examples/game-of-life/).
