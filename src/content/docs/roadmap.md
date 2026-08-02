---
title: Roadmap
description: What PyMCU already implements across AVR, ARM and PIC, and what is planned next.
---

This page tracks which language and HAL features are implemented, how far each target has
come, and what is planned next. The current release is **v0.1.0a3**
([release notes](https://github.com/PyMCU/PyMCU/releases/tag/v0.1.0a3)).

:::note[Alpha status]
Core compilation is stable and test-covered, but tooling and error messages still have rough
edges. Prefer the [MicroPython](/pymcu/compat/micropython/) or
[CircuitPython](/pymcu/compat/circuitpython/) compat APIs wherever they cover your use case — they
are stable and community-specified, while the native HAL (`pymcu.hal.*`) may change between
alpha releases. Drop to `pymcu.hal.*` for what the compat APIs do not expose, and run
`pymcu lint` to vet a port before you build it.
:::

---

## Implemented

### Language

| Feature | Notes |
|---|---|
| `if / elif / else` | Compile-time DCE on `__CHIP__` branches |
| `while` + `break` / `continue` | |
| `for i in range(n)` | Runtime or compile-time bound; `range(start, stop, step)` |
| `for x in array` / `for x in [1, 2, 3]` | Fixed-size array or constant list literal |
| `for i, x in enumerate(iterable)` | Compile-time index counter |
| `for x, y in zip(a, b)` | Compile-time unroll over paired lists |
| `reversed(iterable)` | Compile-time reverse unroll |
| `match / case` | Literal, wildcard, OR (`\|`), guard `if cond`, sequence, capture and dotted-name patterns; DCE on `__CHIP__` |
| `def` | Typed params, defaults, keyword args, overloading by type, tuple multi-return |
| Type inference for unannotated `def` params / returns | Outlined functions infer missing annotations from call sites, defaults and return expressions (safe integer-widening join); `@inline` functions keep their compile-time polymorphism |
| Top-level scripts (no `def main():`) | The compiler synthesizes `main` from top-level statements |
| Module-level statements alongside an explicit `def main()` | Module-scope constructions and calls run at startup before `main()`'s body, mirroring Python |
| `class` | Zero-cost abstraction (ZCA) `@inline` flattening, constructors, `@property` / `@name.setter` |
| Single-level class inheritance | ZCA base + derived; `super()` calls |
| Nested class-typed ZCA fields | Method calls and field reads on a class-typed field (a `machine.Pin` wrapping the native HAL `Pin`) dispatch correctly, including through facade re-exports |
| `class Foo(Enum)` | Zero-cost integer constants; no SRAM |
| `with obj:` / `with a as x, b as y:` | `__enter__` / `__exit__`; zero-cost for `@inline` methods |
| `assert condition, msg` | Compile-time only; statically false → `CompileError` |
| `global` / `nonlocal` | Cross-function variable access; `nonlocal` in `@inline` |
| `try / except / else / finally`, `raise`, bare `raise` | AVR + ARM (RP2040 / RP2350); zero-cost flag propagation (AVR: `SET` / `CLT` / `BRTS`; ARM: an internal flag+code global pair — no `setjmp` / `longjmp` on either); errors propagate across calls to any depth and are caught at the call site; `finally` runs on every exit path; an unhandled raise prints `"E:TypeName\r\n"` to UART0, then halts |
| Generators (`yield`) | A top-level function containing `yield` lowers to a zero-cost state machine (`poll()` returns 2 = yielded / 1 = working / 0 = done, value in `._value`); `for x in gen(...)` desugars to a poll loop with Python-exact `break` / `continue`. No `asyncio` required |
| `async def` / `await` (v2) | Compile-time state machine, no heap; requires `import asyncio`. `await asyncio.sleep()` / `sleep_ms()` anywhere in the body — inside `if` / `elif` / `else`, `while <cond>` and `for i in range(...)` at any nesting, with `break` / `continue`; `return expr` surfaces via `._value`. Executors `asyncio.run(coro)` / `asyncio.gather(a, b)` |
| Closed `dict` / `set` literals | `d = {0: 10, "mid": 2}` / `OK = {1, 3, 5}` bind compile-time lookup tables with no storage: `d[const]` folds, `d[runtime]` lowers to a compare chain raising a catchable `KeyError`, `x in d` membership, `len(d)` folds. Read-only |
| `pymcu.collections.FixedDict` | Mutable fixed-capacity integer dict (open addressing over per-instance fixed arrays — no heap, no GC): `d[k]` / `d[k] = v`, `KeyError` / `ValueError`, `k in d`, `len(d)`, `get(k, default)`, `pop(k)`, `clear()`. Capacity is a compile-time constant |
| Integer arithmetic promotion | `+` / `-` / `*` / `<<` promote to the next wider type (`uint8 255 + 45 == 300`); the annotation is a storage width; `uint8(a + b)` is the fixed-width escape hatch; out-of-range literals and folded constants are a `CompileError` |
| True division `/` vs `//` | `/` yields `float` (warns on integer operands); `//` and `%` are integer floor div / mod; a runtime divide-by-zero raises `ZeroDivisionError` |
| f-strings (streamed) | `print(f"...")`, `uart.write_str/println(f"...")`, `lcd.print_str(f"...")` with runtime interpolations and format specs (`{x:02x}`, `{x:08b}`, `{x:04d}`, …); lowered to direct writes, no heap |
| f-string as a **value** | `s = f"t={t} C"` builds the string into a compiler-managed fixed `bytearray` (statically bounded per part, lowered via `pymcu.strfmt`). `len(s)`, `s[i]`, `print(s)`, `uart.write_str(s)`, buffer reuse on re-assignment in a loop, passing as a `bytearray` param |
| Functions with more than 5 arguments | Overflow arguments passed via a fixed SRAM spill region |
| `in` / `not in` | Compile-time fold on a constant list; runtime equality chain |
| `is` / `is not` | Maps to `==` / `!=` |
| `divmod(a, b)` | Returns `(quotient, remainder)` |
| `bitcast(T, v)` | Reinterpret raw bytes as `T`; float ↔ uint32; compile-time folding |
| `hex(n)` / `bin(n)` | Compile-time: `hex(255)` → `"0xff"` |
| `sum(iterable)` / `any(iterable)` / `all(iterable)` | Compile-time fold or unrolled chain |
| `str(n)` compile-time | `str(42)` → `"42"` string constant |
| `pow(x, n)` / `x ** n` | Compile-time constant fold |
| `bytes` literal `b"\x00\xFF"` | Treated as `uint8[N]`; works in `for`, array init, `len()` |
| `bytearray` | Mutable SRAM buffer |
| `input(prompt?, maxlen?)` | `line: bytearray = input("prompt")` — reads a newline-terminated line from UART; auto-injects the UART init preamble |
| `int.from_bytes(b, 'little'/'big')` | Compile-time fold or runtime |
| Raw strings `r"\n"` | No escape processing |
| Extended unpacking `first, *rest = tup` | Compile-time tuples only (PEP 3132) |
| Nested list comprehensions | Full outer × inner product unroll; `if` filter supported |
| `for v in [Cls(p) for p in (...)]` | Compile-time unroll of ZCA instance arrays; plain for-in and `enumerate` both supported |
| Slice indexing `arr[1:3]`, `arr[::2]` | Compile-time constant indices |
| Equal-length slice **assignment** `arr[a:b] = src` | List, array and slice sources, including overlapping same-array copies (snapshot semantics) |
| `lambda x: expr` (no capture) | Inlined as an anonymous `@inline` function |
| Dunder operator overloading | `__add__`, `__sub__`, `__mul__`, `__len__`, `__contains__`, `__getitem__`, `__setitem__`, comparisons, bitwise |
| `@extern("symbol")` | External C/C++ symbol interop with the AVR ABI (AVR only) |
| `__name__` / `if __name__ == "__main__":` | Compile-time guard; body promoted in main, eliminated in libraries |
| Triple-quoted strings | Multiline string literals; the leading newline after the opening quote is stripped; useful for multiline `asm()` |
| `list[T]` heap-bounded list | `x: list[uint8] = list()` / `list(N)` / `[a, b, c]`; `append()`, `len()`, `x[i]`, `for v in x:`; bounded bump allocator + GC; suitable for ATmega328P (2 KB SRAM) and larger |
| Recursion diagnostics | An illegal recursive call reports the full call cycle; user-facing errors are located `file:line` |

### MCU extensions

| Feature | Notes |
|---|---|
| `uint8 / int8 / uint16 / int16 / uint32 / int32` | Annotation for variables; unannotated outlined `def` params and returns are inferred from call sites |
| `int` (built-in) | Maps to `int16`; no import required |
| `float` | IEEE 754 single-precision on every ARM and AVR target — AVR via `__fp_*` assembly helpers, RP2040 via the bootrom fast-float library (`__aeabi_f*` shims), RP2350 natively on the Cortex-M33 FPU. `print(float)` on AVR and ARM; float ↔ int conversions truncate toward zero |
| `ptr[T]` / `ptr(addr)` | Memory-mapped I/O |
| `const[T]` / `const[uint8[N]]` | Compile-time constants; flash-resident arrays via `LPM Z` on AVR and `.rodata` on ARM |
| `asm("instr")` | Inline assembly; register constraints `%N` on AVR, textual operand constraints on ARM |
| `delay_ms(n)` / `delay_us(n)` | Busy-wait on AVR / PIC; hardware TIMER on ARM |
| `millis()` / `micros()` | Timer0 overflow; atomic 32-bit read under CLI/SEI |
| `@inline` | Zero-cost expansion |
| `@interrupt(vector)` | ISR handler generation with automatic `sei` |
| `@property` / `@name.setter` | Compile-time expansion |
| `@naked` | No compiler prolog/epilog; registers hold raw calling-convention values at entry |
| `@staticmethod` | Silently ignored — all class methods in PyMCU are effectively static |
| `__CHIP__` | Conditional compilation by chip name / architecture |
| `__FREQ__` | Compile-time clock frequency in Hz |
| `[tool.pymcu.ffi]` build config | C/C++ interop: `sources`, `include_dirs`, `cflags` (AVR) |
| `CompileError` intrinsic | `raise CompileError("msg")` aborts compilation with a `CompileError:` diagnostic; never generates runtime code; used across the native HAL for unsupported arch/chip guards; cannot be caught by `try / except` |

### HAL (ATmega328P)

| Module | Coverage |
|---|---|
| `pymcu.hal.gpio` | `Pin` — `high` / `low` / `toggle` / `value` / `irq` / `pulse_in` |
| `pymcu.hal.uart` | `UART` — `write` / `read` / `read_line` / `write_str` / `println` / `print_byte` / `available` + RX interrupt |
| `pymcu.hal.adc` | `AnalogPin` — poll + interrupt; channels `"PC0"`–`"PC5"`, plus `"TEMP"` (internal sensor), `"VBG"` and `"ADC8"` |
| `pymcu.hal.timer` | `Timer(n, prescaler)` — Timer0/1/2 unified; CTC mode |
| `pymcu.hal.pwm` | `PWM` — `start` / `stop` / `set_duty` / `set_freq`; multi-channel |
| `pymcu.hal.spi` | `SPI` (bit-banged `SoftSPI` lives in `pymcu.hal.softspi`) |
| `pymcu.hal.i2c` | `I2C`; `write_to` / `read_from` / `write_bytes` / `writeto_mem(addr, reg, data)` / `readfrom_mem(addr, reg, buf, n)` (bit-banged `SoftI2C` lives in `pymcu.hal.softi2c`) |
| `pymcu.hal.eeprom` | `EEPROM` — `write(addr, val)` / `read(addr)` |
| `pymcu.hal.watchdog` | `Watchdog` — `enable` / `disable` / `feed` |
| `pymcu.hal.power` | `sleep_idle` / `sleep_adc_noise` / `sleep_power_down` / `sleep_power_save` / `sleep_standby` / `sleep_extended_standby` |

### Drivers

| Module | Device |
|---|---|
| `pymcu.drivers.dht11` | DHT11 temperature + humidity |
| `pymcu.drivers.ds18b20` | DS18B20 1-Wire precision temperature (12-bit) |
| `pymcu.drivers.lcd` | HD44780 character LCD (4-bit parallel), class `LCD` |
| `pymcu.drivers.ssd1306` | SSD1306 OLED (I2C, 128×64) |
| `pymcu.drivers.max7219` | MAX7219 8x8 LED matrix (SPI) |
| `pymcu.drivers.bmp280` | BMP280 barometer (I2C) |
| `pymcu.drivers.neopixel` | WS2812 NeoPixel |

These seven are the whole of `pymcu.drivers`. There is **no** LM35 driver module — an LM35 is
an analog sensor, so read it with [`AnalogPin`](/pymcu/stdlib/adc/). See
[Device drivers](/pymcu/stdlib/#device-drivers) for the full table.

### Compatibility layers

| Package | Activation | Coverage |
|---|---|---|
| `pymcu-micropython` | `stdlib = ["micropython"]` | `machine` (Pin, UART, ADC, PWM, SPI, I2C, `Timer(id, period, callback)`, WDT), `utime`, `micropython`; `network.WLAN` + `umqtt` on the Pico 2 W (RP2350) only |
| `pymcu-circuitpython` | `stdlib = ["circuitpython"]` | `board`, `digitalio`, `analogio`, `busio` (SPI + I2C), `pwmio`, `time`, `neopixel.NeoPixel`; `wifi` + `socketpool` + `adafruit_minimqtt` on the Pico 2 W (RP2350) only |

### Boards

| Module | Pins |
|---|---|
| `pymcu.boards.arduino_uno` | `D0`–`D13`, `A0`–`A5`, `LED_BUILTIN` |
| `pymcu.boards.arduino_mega` | `D0`–`D53`, `A0`–`A15`, `LED_BUILTIN` |
| `pymcu.boards.arduino_leonardo` | `D0`–`D13`, `A0`–`A5`, `LED_BUILTIN` |

### Tooling

| Tool | Notes |
|---|---|
| `pymcu lint` | MicroPython / CircuitPython porting assistant: flags constructs PyMCU cannot compile — unbounded `dict` / `set`, reflection, unbounded `append`, `*args` / `**kwargs`, untyped params, … — with a severity and a suggestion per finding |
| `pymcu new` / `build` / `flash` / `clean` | Project scaffolding, compilation, upload and cleanup — see the [CLI driver](/pymcu/driver/) |
| `pymcu-test` (AVR) | Turnkey pytest fixtures over the avr8sharp emulator |

---

## Target status

| Architecture | Chips |
|---|---|
| **AVR** (ATmega) | ATmega48/88/168/328P, ATmega2560, ATmega32U4 |
| **AVR** (ATtiny) | ATtiny25/45/85, ATtiny24/44/84, ATtiny13/13A, ATtiny2313/4313 |
| **ARM** (Cortex-M0+ / M33) | RP2040 (Pico / Pico W), RP2350 (Pico 2 / Pico 2 W) — the CYW43439 radio is driven on the Pico 2 W only |
| **PIC** (mid-range) | PIC16F84A, PIC16F877A — new in alpha 3 |

### AVR

The reference target, and the most thoroughly tested. Direct assembly codegen (no LLVM),
the full HAL and driver set listed above, soft-float, exceptions, and the only backend with
C/C++ interop.

| Feature | Status |
|---|---|
| Full HAL (GPIO, UART, ADC, Timer, PWM, SPI, I2C, EEPROM, watchdog, power) | ✅ |
| `try / except / raise / finally` | ✅ Zero-cost T-flag propagation |
| `float` (soft-float) | ✅ `__fp_*` assembly helpers |
| `list[T]` + GC, generators, `async` / `await` | ✅ |
| `@extern` C/C++ interop | ✅ `avr-gcc` / `avr-g++`, Arduino libraries usable |
| `@interrupt`, `Pin.irq()`, GPIOR flag promotion | ✅ |

### ARM (RP2040 / RP2350)

The ARM backend lowers PyMCU's architecture-agnostic IR to **LLVM IR** rather than emitting
assembly directly, so LLVM handles register allocation, instruction selection, the AAPCS
calling convention and optimization — `thumbv6m-none-eabi` for the RP2040 (Cortex-M0+) and
the Cortex-M33 target for the RP2350. `pymcu build` produces a flat flash image
(`firmware.bin`). Alpha 3 brings this target to feature parity with AVR.

| Feature | Status |
|---|---|
| GPIO (`pymcu.hal.gpio.Pin`) | ✅ Single-cycle IO (SIO); zero-cost; runtime `Pin(n)` |
| UART (`pymcu.hal.uart.UART`) | ✅ PL011; compile-time baud divisors (assume `clk_peri = 125 MHz` on RP2040, `150 MHz` on RP2350) |
| SPI, I2C, PWM, ADC, DMA | ✅ Full HAL on both RP2040 and RP2350 |
| PIO (`@rp2.asm_pio`) | ✅ Both RP2040 and RP2350; PIO assembler in the compiler, the DSL lowers to state-machine setup |
| CYW43439 WiFi | ✅ **Pico 2 W (RP2350) only** — gSPI bring-up, WLAN join, TCP, MQTT publish, with MicroPython and CircuitPython flavors. Open networks only: `connect()` raises `CompileError` on a non-empty key, because WPA is not implemented yet. There is no CYW43 path on the RP2040 / Pico W |
| `try / except / raise / finally` | ✅ Same flag-propagation model as AVR |
| `float` | ✅ RP2040 via the bootrom fast-float library; RP2350 natively on the M33 FPU; `print(float)` on both |
| Flash-resident const data | ✅ Interned strings and `const[uint8[N]]` in `.rodata`; `const[str]` runtime subscript |
| `delay_ms` / `delay_us` | ✅ Hardware TIMER (1 MHz); accurate on silicon |
| Inline `asm()` with operands | ✅ Textual constraints |
| Dual-core / SIO FIFO | ⏳ Planned — only core 0 runs today |
| `@extern` C/C++ interop | ❌ AVR-only |

### PIC

New in alpha 3, covering the mid-range **PIC16F84A** and **PIC16F877A** with direct assembly
codegen. The toolchain (`pymcu-compiler[pic]`) bundles self-contained gputils / `gpasm`
wheels — no system packages needed.

| Feature | Status |
|---|---|
| GPIO, `delay_ms` / `delay_us` | ✅ |
| Software `*` / `//` / `%` (8- and 16-bit) | ✅ No hardware multiplier needed |
| RAM arrays with a runtime index | ✅ FSR / INDF addressing |
| `ZeroDivisionError` on runtime `//` and `%` | ✅ Catchable |
| EUSART UART | ✅ Baud divisors derived from `__FREQ__` (PIC16F877A) |
| Flash strings and `print()` | ✅ |
| General `try / except / raise` | ❌ AVR + ARM only — use return codes on PIC |
| `@extern` C interop | ❌ AVR-only |
| PIC12 / PIC18 / PIC14E arrays | ⏳ Planned |

---

## Planned / next

| Feature | Notes |
|---|---|
| WPA / WPA2 on the CYW43439 | Today `connect()` joins open networks only; a non-empty key is a `CompileError` |
| CYW43439 WiFi on the RP2040 (Pico W) | The gSPI driver is wired for the RP2350 only so far |
| Dual-core / SIO FIFO on RP2040 + RP2350 | Launch core 1 and expose the inter-core FIFO |
| More PIC families | PIC12 and PIC18 codegen; arrays on PIC14E |
| RISC-V 32-bit codegen | CH32V003, ESP32-C3 |
| `fixed16` (Q8.8 fixed-point) | Float-like sensor math without soft-float overhead |
| Over-the-air (OTA) updates | Bootloader + `pymcu flash` over UART |
| Broader Cortex-M support | STM32, nRF52 — reusing the same LLVM backend |
| MicroPython / CircuitPython API alignment | Broaden the compat modules and close the remaining API gaps |

---

## Not planned

| Feature | Reason |
|---|---|
| **Unbounded** `dict` / `set` | Growing hash tables require a heap. Closed literals (read-only compile-time lookup tables) and `pymcu.collections.FixedDict` (mutable, fixed capacity, no heap) cover the fixed-footprint cases |
| Garbage collection beyond `list[T]` | A full GC is incompatible with deterministic ISR timing |
| Awaiting another coroutine / future, and `await` as an expression | async/await v2 ships (`await asyncio.sleep()` anywhere in the body, `asyncio.run` / `gather`). Sub-future fields would need ZCA construction outside `__init__`, and splitting the state machine mid-expression; call the coroutine and poll it, or use `asyncio.gather` |
| `yield` inside `@inline` functions or methods, `yield` as an expression, `yield from` | Generators lower to a per-top-level-function state machine; there is no two-way protocol and no nested frame to delegate to |
| `f"..."` inline in arbitrary expression positions | Streaming (`print(f"...")`) and the value form (`s = f"..."`, built into a fixed buffer) both ship; other expression positions have no lowering — assign to a name first. Float interpolations in the value form are also not lowered |
| `complex` / `Decimal` | Not available |
| Closures capturing mutable vars | Captured variables require heap cells; `nonlocal` inside `@inline` is supported |
| `*args` / `**kwargs` | Requires heap |
| Multiple inheritance | Complexity vs. benefit for the ZCA model |
| Metaclasses | No runtime type system |
| Reflection / `getattr` / `hasattr` | No runtime type information |
| `eval()` / `exec()` | No interpreter on the MCU |

---

For the full list of what the compiler rejects and why, see [Limitations](/pymcu/limitations/).
Release-by-release detail lives in the [changelog](/pymcu/changelog/).
