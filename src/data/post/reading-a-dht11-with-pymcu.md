---
publishDate: 2026-05-09T00:00:00Z
author: PyMCU Team
title: "Reading a DHT11 with PyMCU: Same Python, No Interpreter"
excerpt: The DHT11 speaks a timing-sensitive 1-wire protocol. MicroPython handles it through a C function compiled into the firmware — one you cannot see, audit, or change without rebuilding MicroPython from source. PyMCU compiles the same Python-style code to native AVR instructions. The driver is yours.
image: https://images.unsplash.com/photo-1581091226825-a6a2a5aee158?ixlib=rb-4.0.3&auto=format&fit=crop&w=2070&q=80
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

The engineering here is solid. MicroPython's DHT implementation is correct and reliable. But notice what you, as the developer, do not have:

- You cannot read the timing logic — it is inside the firmware binary.
- You cannot modify the pulse threshold (currently hardcoded to 48 µs in C).
- You cannot run this on hardware that MicroPython doesn't support.
- You cannot run it on an ATmega328P — MicroPython does not have an AVR port, and even if it did, 32 KB of flash is not enough for the ~640 KB interpreter firmware.

---

## The same code, compiled

PyMCU ships a MicroPython compatibility layer. This is not a runtime shim — it is a set of compile-time type annotations and ZCA wrappers that let you write code in MicroPython style and have PyMCU compile it to native AVR instructions.

The main program for the DHT11 example is identical to what you would write for a real MicroPython board:

```python
from machine import Pin, UART
from utime import sleep_ms
from dht import DHT11

uart   = UART(0, 9600)
led    = Pin(13, Pin.OUT)
sensor = DHT11(Pin(2, Pin.IN))

uart.println("DHT11 ready")

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

The `dht.py` driver you ship alongside it is pure Python — every line of it:

```python
from pymcu.types import uint8, inline
from machine import Pin as _Pin, time_pulse_us
from pymcu.time import delay_ms, delay_us


class DHTBase:
    @inline
    def __init__(self, pin: _Pin):
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
        self._pin.mode(_Pin.OUT)   # DDR bit → 1 (output)
        self._pin.low()            # PORT bit → 0 (pull line LOW)
        delay_ms(18)               # hold ≥18 ms to wake the DHT11
        self._pin.high()           # PORT bit → 1 (release line)
        delay_us(30)               # wait 20–40 µs for sensor to take control
        self._pin.mode(_Pin.IN)    # DDR bit → 0, PORT bit still 1 → internal pull-up
```

`self._pin.mode(_Pin.OUT)` compiles to a single `SBI` (Set Bit in I/O register) on the DDR register. `self._pin.low()` compiles to `CBI` on the PORT register. `delay_ms(18)` compiles to a nested loop calibrated at build time for 16 MHz. Every one of these is deterministic — there is no interpreter deciding what to do at runtime.

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

Five sequential byte reads. The `uint8` annotation is mandatory — it tells the compiler to use 8-bit registers and emit 8-bit arithmetic. Because `_read_byte` is also `@inline`, each of these five calls is expanded in place — no `CALL`/`RET` instructions, no stack allocation.

```python
        # 4. Checksum ──────────────────────────────────────────────────────
        expected: uint8 = (hum_int + hum_dec + temp_int + temp_dec) & 0xFF
        if checksum != expected:
            self.failed = True
            return

        self.failed    = False
        self._hum_int  = hum_int
        self._temp_int = temp_int
```

The checksum is the low byte of the sum of the first four data bytes. If it doesn't match, `self.failed` is set to `True` and the caller can handle it gracefully — no exception, no heap allocation. This is a deliberate departure from MicroPython's `raise Exception("checksum error")`: on an AVR with 2 KB of SRAM, exception objects are a luxury.

---

### `_read_byte()` — the timing heart

```python
    @inline
    def _read_byte(self) -> uint8:
        result: uint8 = 0
        bit:    uint8 = 0

        while bit < 8:
            # Each DHT bit starts with ~50 µs LOW (ignored),
            # then a HIGH whose duration determines the bit value:
            #   ~26 µs HIGH → logical 0
            #   ~70 µs HIGH → logical 1
            # Threshold: 40 µs.
            high_dur = time_pulse_us(self._pin, 1, 1000)

            result = result << 1
            if high_dur > 40:
                result = result | 1

            bit = bit + 1

        return result
```

This loop runs 8 times per byte, 5 bytes per read — 40 iterations total. Each call to `time_pulse_us` waits for the pin to go HIGH, then counts how long it stays HIGH. The 40 µs threshold is a midpoint between the ~26 µs (0) and ~70 µs (1) pulse lengths.

Because `_read_byte` is `@inline`, the compiler sees through the abstraction and emits the entire 40-iteration sequence as a flat block of AVR instructions. There is no loop overhead from function calls.

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

---

## The compiled result

```
Flash:  3,750 bytes  (11.7% of 32 KB)
SRAM:   0 bytes overhead
```

That 3,750 bytes includes the full driver, UART, `delay_ms`/`delay_us` routines, and the main loop. No interpreter. No C extension hidden in firmware. No rebuild of MicroPython required to change the pulse threshold.

---

## Logic analyzer capture

The DHT11 1-wire protocol is straightforward to verify. After the 18 ms start pulse and the sensor ACK, you will see 40 alternating LOW/HIGH pairs. The SHORT HIGHs (~26 µs) are 0s; the LONG HIGHs (~70 µs) are 1s.

<!-- IMAGE PLACEHOLDER: logic analyzer screenshot of DHT11 1-wire capture on D2 -->
<!-- Suggested caption: "40-bit DHT11 frame captured on D2. Short HIGH pulses (~26 µs) are logic 0; long ones (~70 µs) are logic 1." -->

---

## Serial output

After a successful read the firmware prints over UART at 9600 baud:

<!-- IMAGE PLACEHOLDER: serial monitor screenshot showing "H: 45  T: 23" output -->
<!-- Suggested caption: "UART output at 9600 baud — humidity and temperature printed every 2 seconds." -->

---

## Running the example

```bash
cd examples/avr/dht-sensor-mp

pymcu build    # → dist/firmware.hex  (3,750 bytes)
pymcu flash    # flash to Arduino Uno
```

Wire the DHT11 data line to **D2** (PD2) with a 4.7 kΩ pull-up to +5 V. Open any serial monitor at 9600 baud.

---

## Summary

| | MicroPython on RP2040 | PyMCU on ATmega328P |
|---|---|---|
| DHT timing code | C function in firmware (`dht_readinto`) | Compiled Python in your project |
| Can you read it? | No — binary blob in the firmware | Yes — it's a `.py` file |
| Can you modify it? | Only by rebuilding MicroPython | Edit and rebuild in seconds |
| `time_pulse_us` | C loop, called at C level | Compiles to the same AVR loop |
| IRQ handling | `mp_hal_quiet_timing_enter()` in C | No ISR overhead — no runtime |
| Flash footprint | ~640 KB interpreter + your code | 3,750 bytes total |
| Chip requirement | RP2040 or better | ATmega328P (32 KB flash, 2 KB SRAM) |

MicroPython is a great tool. The DHT implementation is well-engineered and correct. But when you call `sensor.measure()`, you are trusting a C function you did not write, cannot read in your project, and cannot change without a full firmware rebuild.

With PyMCU, the driver is a `.py` file in your repo. Every threshold, every timing constant, every edge case — visible, auditable, and yours.
