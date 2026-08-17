---
publishDate: 2026-05-09T00:00:00Z
author: PyMCU Team
title: 'Reading a DHT11 with PyMCU: Same Python, No Interpreter'
excerpt: The DHT11 speaks a timing-sensitive 1-wire protocol. MicroPython handles it with a C function compiled into the firmware — the natural choice for an on-chip interpreter. PyMCU makes a different trade-off — it compiles the same MicroPython-style code to native AVR instructions, so the whole driver (timing and all) stays in your project as readable Python.
image: ~/assets/images/post-reading-a-dht11-with-pymcu.png
category: Deep Dive
tags:
  - dht11
  - sensors
  - micropython
  - avr
---

The DHT11 is one of the first sensors most people wire up to a microcontroller. It's cheap, common, and conceptually simple: pull the data line low for 18 ms, release it, and the sensor responds by clocking out 40 bits of humidity and temperature data — each bit encoded as a pulse of either ~26 µs (logic 0) or ~70 µs (logic 1).

That sounds simple. But measuring those pulses accurately requires native-speed code. This post walks through what MicroPython actually does under the hood, what PyMCU does instead, and why the difference matters when you want to understand — and own — everything running on your hardware.

---

## What MicroPython actually does

On MicroPython, the code to read a DHT11 looks like this:

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

Clean. Familiar. But `sensor.measure()` is a thin wrapper that does exactly two things in Python:

```python
def measure(self):
    buf = self.buf                           # pre-allocated bytearray(5)
    dht_readinto(self.pin, buf)              # ← the real work: a C native function
    if (buf[0] + buf[1] + buf[2] + buf[3]) & 0xFF != buf[4]:
        raise Exception("checksum error")   # ← verify in Python, raise if wrong
```

`dht_readinto` is not Python. It's a C function compiled into the MicroPython firmware (`drivers/dht/dht.c`). MicroPython resolves it at import time with a platform dispatch:

```python
if hasattr(machine, "dht_readinto"):     # ESP32, RP2040, STM32 — modern ports
    from machine import dht_readinto
elif sys.platform.startswith("esp"):     # legacy ESP8266
    from esp import dht_readinto
elif sys.platform == "pyboard":          # STM32 pyboard
    from pyb import dht_readinto
else:
    dht_readinto = __import__(sys.platform).dht_readinto
```

Inside `dht_readinto`, the C code sends the 18 ms start pulse, then calls `mp_hal_quiet_timing_enter()` — a port-specific macro that disables IRQs (or raises their priority on Cortex-M4). It then reads all 40 bits using `machine_time_pulse_us()`, which is also C, called directly at the C level — not through Python's `machine.time_pulse_us`. After the last bit, IRQs are restored.

The `bytearray(5)` buffer is allocated once in `__init__`, not inside `measure()` — a deliberate design choice to avoid triggering the garbage collector during or between measurements.

This is well-engineered, and the design makes perfect sense for what MicroPython _is_. MicroPython runs a full, dynamic Python on the chip: an interpreter, a garbage collector, dynamic typing, runtime imports. That dynamism is the whole point — it's what makes the REPL, live code, and the "just works" experience possible. But interpreting bytecode is far too slow to time a 26-vs-70 µs pulse, so the timing-critical core is dropped into C and compiled into the firmware. The C function and the large runtime aren't shortcomings; they're the natural cost of supporting full dynamic Python on a microcontroller.

That cost simply shows up as two practical facts. The interpreter needs room — hundreds of kilobytes — so MicroPython targets chips like the RP2040, ESP32, or STM32, and there is no AVR port (an ATmega328P's 32 KB couldn't hold the runtime). And the part that does the precise timing, `dht_readinto`, lives in the firmware as C rather than in your project as Python. PyMCU explores a different trade-off — giving up that on-chip dynamism in exchange for putting the whole driver, timing and all, in front of you as compiled Python.

---

## The same code, compiled

PyMCU ships a MicroPython compatibility layer. This is not a runtime shim — it is a set of compile-time type annotations and ZCA wrappers that let you write code in MicroPython style and have PyMCU compile it to native AVR instructions.

The main program for the DHT11 example is identical to what you would write for a real MicroPython board:

```python
from machine import Pin
from utime import sleep_ms
from dht import DHT11

led    = Pin(13, Pin.OUT)
sensor = DHT11(Pin(2, Pin.IN))

print("DHT11 ready")

while True:
    sensor.measure()

    if sensor.failed:
        print("read error")
        led.low()
    else:
        print("H: ", sensor.humidity(), "  T: ", sensor.temperature(), sep="")
        led.high()
        sleep_ms(100)
        led.low()

    sleep_ms(2000)
```

There is no `UART(...)` object and no `if __name__ == "__main__":`. PyMCU detects the `print()` calls and auto-injects UART initialization (USART0 at 115200 baud) before your code runs, and wraps the top-level statements in a `main()` entry point. The result is the same source a MicroPython user already knows, with less boilerplate.

The `dht.py` driver you ship alongside it is readable Python — every line of it. Its timing and pin calls are standard MicroPython (`utime`, `machine`); the only PyMCU-specific additions are the type annotations and the `@inline` decorator, which are what let the compiler turn it into native code:

```python
from pymcu.types import uint8, inline
from machine import Pin, time_pulse_us
from utime import sleep_ms, sleep_us


class DHTBase:
    @inline
    def __init__(self, pin: Pin):
        self._pin     = pin
        self.failed   = False
        self._hum_int = 0
        self._hum_dec = 0
        self._temp_int = 0
        self._temp_dec = 0
```

`@inline` is PyMCU's Zero-Cost Abstraction (ZCA) decorator. It tells the compiler to expand this method body at every call site — there is no function call overhead, no stack frame, no SRAM object. After compilation, `DHT11(Pin(2, Pin.IN))` is a handful of register and DDR writes. Nothing more.

---

### `measure()` — step by step

```python
    @inline
    def measure(self):
        # 1. Start signal ──────────────────────────────────────────────────
        self._pin.mode(Pin.OUT)    # DDR bit → 1 (output)
        self._pin.low()            # PORT bit → 0 (pull line LOW)
        sleep_ms(18)               # hold ≥18 ms to wake the DHT11
        self._pin.high()           # PORT bit → 1 (release line)
        sleep_us(30)               # wait 20–40 µs for sensor to take control
        self._pin.mode(Pin.IN)     # DDR bit → 0, PORT bit still 1 → internal pull-up
```

`self._pin.mode(Pin.OUT)` compiles to a single `SBI` (Set Bit in I/O register) on the DDR register. `self._pin.low()` compiles to `CBI` on the PORT register. `sleep_ms(18)` — the standard MicroPython call — compiles to a nested loop calibrated at build time for 16 MHz. Every one of these is deterministic; there is no interpreter deciding what to do at runtime.

```python
        # 2. ACK from sensor ───────────────────────────────────────────────
        if time_pulse_us(self._pin, 0, 1000) < 0:   # wait for ~80 µs LOW
            self.failed = True
            return
        if time_pulse_us(self._pin, 1, 1000) < 0:   # wait for ~80 µs HIGH
            self.failed = True
            return
```

`time_pulse_us` from the compat layer compiles to a tight AVR loop: `IN` (sample the pin), `BRNE` (branch if not edge), increment counter. At 16 MHz, each iteration is a few nanoseconds. The timeout (1000 µs) is converted to an iteration count at compile time. On MicroPython, `machine.time_pulse_us` is a C function; here it is compiled Python — the result is the same native loop, but the source code is yours.

```python
        # 3. Read 5 bytes ──────────────────────────────────────────────────
        hum_int:  uint8 = self._read_byte()
        hum_dec:  uint8 = self._read_byte()
        temp_int: uint8 = self._read_byte()
        temp_dec: uint8 = self._read_byte()
        checksum: uint8 = self._read_byte()
```

Five sequential byte reads. The `uint8` annotation is mandatory — it tells the compiler to use 8-bit registers and emit 8-bit arithmetic. Unlike the rest of the class, `_read_byte` is intentionally _not_ `@inline`: it is compiled once and called five times. Inlining it would copy the bit-read loop into the firmware five times over; leaving it as a real function trades five `CALL`/`RET` pairs for a single shared copy and a smaller binary. That choice is yours to make per method — the same `@inline`-or-not decision a C programmer makes with `static inline`.

```python
        # 4. Checksum ──────────────────────────────────────────────────────
        expected: uint8 = (hum_int + hum_dec + temp_int + temp_dec) & 0xFF
        if checksum != expected:
            self.failed = True
            return

        self.failed    = False
        self._hum_int  = hum_int
        self._hum_dec  = hum_dec
        self._temp_int = temp_int
        self._temp_dec = temp_dec
```

The checksum is the low byte of the sum of the first four data bytes. If it doesn't match, `self.failed` is set to `True` and the caller can handle it gracefully. This is a deliberate departure from MicroPython's `raise Exception("checksum error")` — but not because PyMCU can't: PyMCU _does_ support `try`/`except`/`raise` via a zero-cost error ABI built on the AVR T flag (no heap, no `setjmp`/`longjmp`). For a hot loop polling a sensor every two seconds, a simple `failed` flag is the leaner idiom, and the driver author gets to make that call.

---

### `_read_byte()` — the timing heart

```python
    def _read_byte(self) -> uint8:
        result: uint8 = 0
        bit:    uint8 = 0

        while bit < 8:
            # Each DHT bit starts with ~50 µs LOW (ignored),
            # then a HIGH whose duration determines the bit value:
            #   ~26 µs HIGH → logical 0
            #   ~70 µs HIGH → logical 1
            # Threshold: 40 µs. A timeout returns -1, which is < 40,
            # so a dropped bit reads as 0 and the checksum rejects the frame.
            high_dur = time_pulse_us(self._pin, 1, 1000)

            result = result << 1
            if high_dur > 40:
                result = result | 1

            bit = bit + 1

        return result
```

This loop runs 8 times per byte, 5 bytes per read — 40 iterations total. Each call to `time_pulse_us` waits for the pin to go HIGH, then counts how long it stays HIGH. The 40 µs threshold is the midpoint between the ~26 µs (0) and ~70 µs (1) pulse lengths.

Note that `high_dur` carries no type annotation. The compiler infers it as `int16` — wide enough to hold the timeout sentinel of `-1` — and tells you so during the build (`'high_dur' inferred as int16; annotate explicitly to suppress`). Type inference fills in the obvious cases; the explicit `uint8` annotations elsewhere are there where the width actually matters.

As noted above, `_read_byte` compiles to a single function. The 8-iteration loop lives in flash once and runs to completion on each of the five calls — the timing is identical whether it is inlined or not, because the inner work is dominated by the `time_pulse_us` measurement, not by the call overhead.

---

### `humidity()` and `temperature()`

```python
class DHT11(DHTBase):
    @inline
    def humidity(self) -> uint8:
        return self._hum_int

    @inline
    def temperature(self) -> uint8:
        return self._temp_int
```

These compile to a register move. One instruction each.

The same `dht.py` file also ships a `DHT22` class that inherits the identical 40-bit `measure()` from `DHTBase` and only overrides `humidity()`/`temperature()` to combine the integer and decimal bytes into a signed `float`. That reuse — one base class, two sensors — is plain single-inheritance, resolved and inlined at compile time. The DHT22 path pulls in PyMCU's soft-float routines only because _it_ uses floats; the DHT11 build above never touches them, which is why it stays at 1,480 bytes.

---

## The compiled result

```
Flash:  1,480 bytes  (4.5% of 32 KB, vector table included)
SRAM:   0 bytes  (data = 0, bss = 0)
```

That is the complete `.hex`. (`pymcu build` prints `1,374 bytes` — it reports your code minus the interrupt-vector table, which is fixed overhead every AVR toolchain emits.) Either way, it includes the full driver, the auto-injected UART output, the millisecond/microsecond delay routines behind `sleep_ms`/`sleep_us`, the 5-byte read loop, and the main loop. SRAM overhead is genuinely zero — the sensor's mutable state (`failed`, the humidity/temperature bytes) lives in registers, so the linker reports no `.data` and no `.bss`. No interpreter. No C extension hidden in firmware. No rebuild required to change the pulse threshold.

---

## Versus a typical Arduino sketch

To keep the comparison grounded, here is the same job written the way most people read a DHT11 on an Arduino — the Adafruit DHT library on an Uno — compiled with `arduino-cli`:

| Build                          | Flash       | SRAM    |
| ------------------------------ | ----------- | ------- |
| Arduino (Adafruit DHT library) | 5,142 B     | 251 B   |
| **PyMCU (MicroPython driver)** | **1,480 B** | **0 B** |

PyMCU's firmware is about **3.5× smaller** and uses **no SRAM at all**. To be fair, it isn't a perfectly even match: the Arduino sketch returns `float` humidity and temperature and pulls in the Adafruit unified-sensor layer, so some of those bytes buy convenience the integer PyMCU driver above doesn't. But it _is_ the way most Arduino projects actually read a DHT11 — and the PyMCU version is smaller, leaner on RAM, and entirely readable Python you own.

---

## Logic analyzer capture

The DHT11 1-wire protocol is straightforward to verify. After the 18 ms start pulse and the sensor ACK, you will see 40 alternating LOW/HIGH pairs. The SHORT HIGHs (~26 µs) are 0s; the LONG HIGHs (~70 µs) are 1s.

<!-- IMAGE PLACEHOLDER: logic analyzer screenshot of DHT11 1-wire capture on D2 -->
<!-- Suggested caption: "40-bit DHT11 frame captured on D2. Short HIGH pulses (~26 µs) are logic 0; long ones (~70 µs) are logic 1." -->

---

## Serial output

After a successful read the firmware prints over UART at 115200 baud:

<!-- IMAGE PLACEHOLDER: serial monitor screenshot showing "H: 45  T: 23" output -->
<!-- Suggested caption: "UART output at 115200 baud — humidity and temperature printed every 2 seconds." -->

---

## Running the example

```bash
cd examples/dht-sensor          # ships with pymcu-micropython

pymcu build    # → dist/firmware.hex  (~1,480 B total)
pymcu flash    # flash to Arduino Uno
```

Wire the DHT11 data line to **D2** (PD2) with a 4.7 kΩ pull-up to +5 V. Open any serial monitor at 115200 baud.

---

## Summary

|                       | MicroPython on RP2040                   | PyMCU on ATmega328P                   |
| --------------------- | --------------------------------------- | ------------------------------------- |
| DHT timing code       | C function in firmware (`dht_readinto`) | Compiled Python in your project       |
| Where it lives        | Compiled into the firmware              | A `.py` file in your project          |
| To change a threshold | Rebuild MicroPython from source         | Edit the `.py` and rebuild in seconds |
| `time_pulse_us`       | C loop, called at C level               | Compiles to the same AVR loop         |
| IRQ handling          | `mp_hal_quiet_timing_enter()` in C      | No ISR overhead — no runtime          |
| Flash footprint       | hundreds of KB interpreter + your code  | 1,480 bytes total                     |
| SRAM overhead         | VM heap + GC                            | 0 bytes (no `.data`, no `.bss`)       |
| Chip requirement      | RP2040 or better                        | ATmega328P (32 KB flash, 2 KB SRAM)   |

MicroPython is an excellent tool, and its DHT implementation is well-engineered. Its model — full dynamic Python on the chip — is what makes it so productive, and dropping the timing core into C is exactly the right call within that model. The trade-off is simply that `sensor.measure()` runs through a C function compiled into the firmware, and it needs a chip with room for the interpreter.

PyMCU makes the other trade-off. There's no on-chip dynamism, but the driver is a `.py` file in your repo, it compiles to ~1,480 bytes, and it runs on a 32 KB ATmega328P. Every threshold, every timing constant, every edge case is right there in front of you — the same Python a MicroPython user already writes, compiled to the metal.
