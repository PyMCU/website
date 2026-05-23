---
publishDate: 2026-05-09T00:00:00Z
author: PyMCU Team
title: "Reading a DHT11 with PyMCU: Same Python, No Interpreter"
excerpt: The DHT11 speaks a timing-sensitive 1-wire protocol. MicroPython reads it through a compiled C extension you can't see or modify. PyMCU compiles your Python driver directly to cycle-accurate AVR instructions — the whole thing is readable, auditable, and deterministic.
image: https://images.unsplash.com/photo-1581091226825-a6a2a5aee158?ixlib=rb-4.0.3&auto=format&fit=crop&w=2070&q=80
category: Deep Dive
tags:
  - dht11
  - sensors
  - micropython
  - avr
---

The DHT11 is one of the first sensors most people wire up to a microcontroller. It's cheap, common, and conceptually simple: pull the data line low for 18 ms, release it, and the sensor responds by clocking out 40 bits of humidity and temperature data — each bit encoded as a pulse of either ~26 µs (logic 0) or ~70 µs (logic 1).

That sounds simple. But there's a catch: you have to measure those pulses accurately. If anything interrupts your timing mid-read, the bit stream is corrupted, the checksum fails, and you get nothing.

This post is about what happens when you try to read a DHT11 in MicroPython versus what PyMCU does differently — and why it matters.

---

## How MicroPython reads a DHT11

On MicroPython, reading a DHT11 looks like this:

```python
from dht import DHT11
from machine import Pin
from utime import sleep_ms

sensor = DHT11(Pin(2, Pin.IN))

while True:
    sensor.measure()
    print(sensor.temperature(), sensor.humidity())
    sleep_ms(2000)
```

Clean and readable. But what actually happens when you call `sensor.measure()`?

The `dht` module in MicroPython is not written in Python. It's a C extension compiled into the firmware. The actual pulse measurement — the part that requires microsecond precision — is done inside `_dht.read()`, a native function you cannot see or change without rebuilding the firmware from source.

This is a pragmatic decision. Python bytecode is too slow for microsecond-level timing; you need native code. MicroPython solves this by hiding the hard part behind a C boundary.

There's another issue: the garbage collector. MicroPython's GC can pause execution at any point to reclaim heap memory. If that pause happens while the sensor is clocking out bits — and 40 bits at ~120 µs per bit takes about 5 ms — the pulse measurement gets corrupted. The checksum fails. You get a `read error`.

In practice, MicroPython users work around this with `micropython.disable_gc()` around the critical section, or by pre-allocating everything so the GC has nothing to collect. It works. But it means you are fighting the runtime to read a $1 sensor.

---

## How PyMCU reads a DHT11

PyMCU takes a different approach. There is no interpreter on the chip. There is no GC. When you write a DHT11 driver in PyMCU, the compiler translates every line of Python directly to AVR instructions — including the pulse measurement.

```python
from pymcu.types import uint8, uint16, inline
from pymcu.hal.gpio import Pin
from pymcu.time import delay_ms, delay_us


class DHT11:
    @inline
    def __init__(self, pin: Pin):
        self.pin = pin
        self.temperature = 0
        self.humidity = 0
        self.failed = False

    @inline
    def measure(self):
        # Start signal: pull low 18 ms, release, switch to input
        self.pin.mode(Pin.OUT)
        self.pin.low()
        delay_ms(18)
        self.pin.high()
        delay_us(30)
        self.pin.mode(Pin.IN)

        # Wait for sensor ACK
        ack_low = self.pin.pulse_in(0, 1000)
        if ack_low == 0:
            self.failed = True
            return

        ack_high = self.pin.pulse_in(1, 1000)
        if ack_high == 0:
            self.failed = True
            return

        # Read 5 bytes
        hum_int  = self._read_byte()
        hum_dec  = self._read_byte()
        temp_int = self._read_byte()
        temp_dec = self._read_byte()
        checksum = self._read_byte()

        expected: uint8 = (hum_int + hum_dec + temp_int + temp_dec) & 0xFF
        if checksum != expected:
            self.failed = True
            return

        self.failed = False
        self.humidity    = hum_int
        self.temperature = temp_int

    @inline
    def _read_byte(self) -> uint8:
        result: uint8 = 0
        i: uint8 = 0
        while i < 8:
            # Each bit: ~50 µs LOW start, then HIGH whose length decides 0 or 1
            # ~26 µs = 0, ~70 µs = 1. Threshold: 40 µs.
            duration: uint16 = self.pin.pulse_in(1, 1000)
            result = result << 1
            if duration > 40:
                result = result | 1
            i = i + 1
        return result
```

Every method is decorated with `@inline`. This is PyMCU's Zero-Cost Abstraction (ZCA) mechanism: the decorator tells the compiler to expand the method body at every call site, exactly as if you had written the instructions inline. The class itself has no representation in SRAM — no struct, no vtable, nothing. After compilation, `sensor.measure()` is just a sequence of AVR instructions, indistinguishable from what a skilled C developer would write by hand.

`pulse_in()` is not a C function hiding behind a Python wrapper. It compiles to a tight AVR loop — `IN` + `BRNE` + counter increment — that runs at clock speed. At 16 MHz, each loop iteration is a handful of nanoseconds. The threshold comparison at 40 µs maps to a specific iteration count, and the compiler calculates it at build time.

The entire DHT11 driver compiles to **3,006 bytes of flash** on an ATmega328P. 0 bytes of SRAM overhead. No C, no firmware rebuild, no GC.

---

## The key difference

| | MicroPython on RP2040 | PyMCU on ATmega328P |
|---|---|---|
| DHT driver language | C (compiled into firmware) | Pure Python (compiled by you) |
| Pulse measurement | Native C function | Compiled Python → AVR loop |
| GC during read? | Possible — can corrupt timing | No GC — never happens |
| Driver flash footprint | ~640 KB interpreter + your code | 3,006 bytes total |
| Can you read the driver? | No — it's inside the firmware | Yes — it's in your project |
| Can you modify it? | Only by rebuilding MicroPython | Edit the `.py` file and rebuild |

The RP2040 is a far more powerful chip than the ATmega328P. It has 264 KB of SRAM and a 2 MB flash chip on most boards. It can absolutely afford to run a Python interpreter. But for a DHT11 read, all that power is spent on the interpreter, the GC, and the runtime — not on your sensor.

---

## Logic analyzer capture

The DHT11 1-wire protocol is easy to verify with a logic analyzer. A successful read looks like this: a long LOW start pulse (~18 ms), then a series of alternating LOW/HIGH pairs — the shorter HIGHs are 0s, the longer HIGHs are 1s.

<!-- IMAGE PLACEHOLDER: logic analyzer screenshot of DHT11 1-wire capture on D2 -->
<!-- Suggested caption: "40-bit DHT11 frame captured on D2. The ~70 µs HIGH pulses are logic 1s; the ~26 µs ones are logic 0s." -->

---

## Serial output

After a successful read, the firmware prints humidity and temperature over UART at 9600 baud:

<!-- IMAGE PLACEHOLDER: serial monitor screenshot showing "H: 45  T: 23" output -->
<!-- Suggested caption: "Serial output from the DHT11 example — humidity and temperature printed every 2 seconds." -->

---

## Running the example

```bash
# Clone and enter the dht-sensor example
cd examples/avr/dht-sensor

# Build — output in dist/firmware.hex
pymcu build

# Flash to an Arduino Uno
pymcu flash
```

Wire the DHT11 data line to **D2** (PD2) with a 4.7 kΩ pull-up to +5 V. Open any serial monitor at 9600 baud to see readings.

---

## What this is not

PyMCU is not trying to replace MicroPython. MicroPython is the right tool when you want to prototype quickly on an ESP32 or RP2040, iterate in a REPL, and ship something without caring about every byte. It is excellent at that.

PyMCU is for the cases where the chip is small, the timing is tight, or you simply want to understand — and own — every instruction running on your hardware. The DHT11 is a good example of when that matters.
