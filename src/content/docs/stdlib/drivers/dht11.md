---
title: DHT11 Driver
description: Driver for the DHT11 single-wire temperature and humidity sensor.
---

```python
from pymcu.drivers.dht11 import DHT11
```

Driver for the DHT11 temperature and humidity sensor.

`DHT11` is a **PyMCU stdlib driver**, not part of MicroPython or CircuitPython — neither
ecosystem specifies a DHT class that PyMCU could mirror, so there is nothing to switch between
and this page shows a single API. You import it exactly as written above whichever API you use
for the rest of your program: a `machine.Pin` sketch and a `digitalio` sketch both say
`from pymcu.drivers.dht11 import DHT11`, and it compiles to the same code in both.

:::note[AVR only]
The pulse-timing back end lives in `pymcu.drivers._dht11.avr`, so the driver currently reads
real data on AVR targets. The `DHT11` class itself is architecture-neutral: adding a target
means dropping a `pymcu/drivers/_dht11/<arch>.py` alongside the AVR one and adding a case to
`DHT11.read()`.
:::

## `DHT11(pin)`

| Parameter | Type | Description |
|---|---|---|
| `pin` | `str` | Port/pin name, `"PD2"`–`"PD7"`. Bound at compile time — no SRAM is allocated. |

On the ATmega328P the pin must be `"PD2"` through `"PD7"` — D2 to D7 on an Arduino Uno. `PD0`
and `PD1` are the hardware UART's RX and TX and have no dispatch case, so `DHT11("PD0")`
compiles and then returns the error sentinel `0xFFFF` forever.

### DHT11 methods

| Method | Return type | Description |
|---|---|---|
| `read()` | `uint16` | Read temperature and humidity in one transaction |

The return value packs both readings into a 16-bit integer:

- **High byte:** relative humidity, 0–100 %
- **Low byte:** temperature in Celsius, 0–50 °C
- **`0xFFFF`:** read error (no response, or checksum failure)

## Example

```python
from pymcu.drivers.dht11 import DHT11
from pymcu.hal.uart import UART
from pymcu.time import delay_ms
from pymcu.types import uint8, uint16

def main():
    sensor = DHT11("PD4")
    uart = UART(9600)

    while True:
        result: uint16 = sensor.read()
        if result != 0xFFFF:
            humidity: uint8 = result >> 8
            temp: uint8 = result & 0xFF
            uart.println(f"H={humidity}% T={temp}C")
        else:
            uart.println("dht11 read error")
        delay_ms(2000)
```

### Wiring

```text
Arduino Uno          DHT11
-----------          -----
PD4 (D4)    <-->     DATA
5V          <-->     VCC
GND         <-->     GND
```

Add a **4.7 kΩ–10 kΩ pull-up** between DATA and VCC — the single-wire bus is open-drain and will
not return a presence pulse without it. Some DHT11 breakout boards have the resistor fitted
already; check before adding a second one.

## Notes

- The DHT11 requires a minimum **2-second interval** between reads.
- The single-wire protocol depends on precise `delay_us()` timing; avoid letting interrupts fire
  during a read.
- One sensor per pin — the protocol has no addressing.

## See also

- [DS18B20](/stdlib/drivers/ds18b20/) — 12-bit temperature only, higher precision
- [GPIO](/stdlib/gpio/) — `pulse_in()`, the primitive underneath the protocol
- [Sensor dashboard example](/examples/sensor-dashboard/) — a fuller program built on a sensor
  read loop
