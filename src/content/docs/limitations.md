---
title: Limitations
description: What PyMCU cannot compile, why, and the idiomatic bare-metal alternative for each case.
---

**Read this before writing your first project.**

PyMCU compiles a statically-typed, allocation-free subset of Python to bare-metal machine
code. There is no runtime and no interpreter, and **no heap by default**: nothing allocates
behind your back, and every size is fixed at compile time. A heap exists only if you ask for
one — the opt-in `list[T]` bounded list (see [Dynamic memory and containers](#dynamic-memory-and-containers)
below) links a small bump allocator and a GC on AVR. Many standard Python features are
therefore incompatible with this model.

:::note[Standard library philosophy]
Because of the architectural differences between a PC and a bare-metal microcontroller,
PyMCU **does not attempt to replicate the CPython standard library 1:1**.

Instead, PyMCU adopts the philosophy and API design of **MicroPython and CircuitPython**
(specifically the `machine` and `board` modules) as its official user-facing standard
library. This ensures that code written for PyMCU looks familiar to developers coming from
the broader Python-on-hardware ecosystem, even though it executes entirely differently.
See [MicroPython compat](/pymcu/compat/micropython/) and
[CircuitPython compat](/pymcu/compat/circuitpython/).
:::

This page lists every known unsupported feature, explains *why* it cannot be compiled, and
suggests the idiomatic PyMCU alternative where one exists.

---

## Dynamic memory and containers

| Feature | Why it fails | Alternative |
|---|---|---|
| `list.append(x)` on a **fixed-size** array | Fixed arrays have no `append` | `list[uint8]` heap-bounded list, or `uint8[N]` fixed-size array |
| **Growing** `dict` (unbounded) | Hash table requires heap | [`pymcu.collections.FixedDict(capacity)`](/pymcu/stdlib/#module-index) (mutable, fixed footprint), a closed dict literal (below), or `match / case` key dispatch |
| **Mutable** `set` (`.add()`) | Hash set requires heap | Closed set literal (below), or a `uint8` bitmask |
| Dict / set **comprehensions** | Would build a container at runtime | Build a closed literal, or fill a `FixedDict` in a loop |

**Supported:** `list[T]` (`x: list[uint8] = list()`) is the one **opt-in** heap in PyMCU — it
compiles to a bounded bump allocator with a shadow-stack GC, linked only into firmware that
actually uses it, and it supports `append()`, `len()`, `x[i]` and `for v in x:`. It is
currently **AVR-only** (suitable for the ATmega328P's 2 KB of SRAM and up); on ARM and PIC it
is not available. `bytearray(N)` and `bytearray(b"...")` compile to SRAM `uint8[N]` arrays and
involve no allocator at all.

**Closed dict/set literals** (`d = {0: 10, "mid": 2}` / `OK = {1, 3, 5}`) bind compile-time
lookup tables with no storage: `d[const]` folds to its value, `d[runtime_key]` lowers to a
compare chain that raises `KeyError` (catchable with `try/except`) on no match, `x in d` /
`x in {...}` test membership, and `len(d)` folds. They are read-only.

**`pymcu.collections.FixedDict(capacity)`** is the mutable counterpart: a fixed-capacity
integer dict (open addressing over per-instance fixed arrays — no heap, no GC) with Python
semantics where they fit a fixed footprint: `d[k]` / `d[k] = v`, `KeyError` on a missing
key, `ValueError` when inserting into a full dict, `k in d`, `len(d)`, `get(k, default)`,
`pop(k)`, `clear()`. The capacity is a compile-time constant.

Fixed-size arrays `arr: uint8[N]` support both constant- and variable-index access, and
equal-length slice assignment (`arr[a:b] = src`, including overlapping same-array copies).

**Rule of thumb:** if the size is not known at compile time, it cannot be compiled.

---

## String operations

| Feature | Why it fails | Alternative |
|---|---|---|
| `f"..."` inline in arbitrary expressions | No general runtime string objects | Assign it to a name first (`s = f"..."` builds a fixed buffer), or stream it: `print(f"...")` |
| `str.split()`, `str.join()`, `str.format()` | Heap strings | Not available |
| `len(string_variable)` | Runtime string object required | Use fixed-size buffers, or an f-string value (whose `len()` is the formatted length) |
| `str + str` concatenation | Heap allocation | Separate `uart.write_str()` calls, or one f-string |
| `str[i]` on a runtime string | No runtime string object | Use `const[str]` parameters |
| `s == "literal"` on an f-string value | No runtime string comparison | Compare the underlying integers instead |

**Supported:** string literals in flash, raw strings `r"\n"`, `uart.println("literal")`,
`for ch in "ABC":` (compile-time unroll), `const[str]` runtime subscript (reads the byte
from flash), and runtime f-strings — both streamed and as values, see below.

### f-strings

`f"..."` with **runtime interpolations** is supported streamed to a sink — the compiler
lowers each piece to a direct write (no heap, no format buffer):

```python
print(f"adc={raw} v={mv:04d}")
uart.write_str(f"t={temp:5d}")
uart.println(f"err 0x{code:02X}")
lcd.print_str(f"{hours:02d}:{mins:02d}")
```

It is also supported **as a value**: `s = f"t={t} C"` builds the string into a
compiler-managed fixed `bytearray` whose size is statically bounded per part. On the value
form, `len(s)` is the formatted length, `s[i]` indexes bytes, `print(s)` /
`uart.write_str(s)` stream it, and re-assigning `s` in a loop reuses the buffer — assign
the longest f-string first, since the buffer is sized at the first assignment.

Not yet supported in the value form: float interpolations, `s == "lit"` comparison, and
f-strings inline in other expression positions (assign to a name first).

**Format specs** supported in interpolations: `{x:02x}`, `{x:X}`, `{x:08b}`, `{x:o}`,
`{x:5d}`, `{x:04d}` — width, zero-pad, and the `x` / `X` / `b` / `o` / `d` bases.
Compile-time constant interpolations (`f"text={const}"`) are folded into the flash string.

---

## Exception handling

`try / except / raise / finally` are **supported** on AVR and ARM (RP2040 / RP2350) via a
zero-cost **flag error-propagation** model — *not* `setjmp` / `longjmp`. A function that
raises marks the error (AVR: the SREG T flag via `SET` / `CLT` / `BRTS`; ARM: an internal
flag + code global pair) and returns normally; every call site inside a `try` tests the flag
and branches to the matching `except`. There is no `jmp_buf` and no stack unwinding, so the
happy path costs a single skipped branch per guarded call.

Because propagation rides on the function return, raise from a helper and catch it where you
call that helper:

```python
def read_sensor(raw: uint16) -> uint8:
    if raw > 1000:
        raise ValueError        # sets the error flag, returns to the caller
    return uint8(raw)

try:
    v: uint8 = read_sensor(adc.read())   # caught here if read_sensor raised
    handle(v)
except ValueError:
    handle_error()
finally:
    cleanup()
```

`ValueError`, `TypeError`, `IndexError`, `KeyError`, `NotImplementedError` and
`ZeroDivisionError` are builtins — no import required, exactly like CPython.
`ZeroDivisionError` is raised automatically on a runtime `//` or `%` by zero.

The full statement is supported: `try` / `except` / **`else`** / **`finally`**, plus a bare
`raise` to re-raise the active exception. `finally` runs on **every** exit path — normal
completion, a caught exception, propagation to an outer scope, and `return` / `break` /
`continue` out of the `try` (including a `break` or `return` inside `finally` that discards
the in-flight exception):

```python
try:
    v: uint8 = read_sensor(adc.read())
except ValueError:
    handle_error()
    raise                # bare re-raise — propagates to the caller
else:
    handle(v)            # runs only if no exception
finally:
    cleanup()            # always runs
```

**How it works, and its limits:**

| Property | Notes |
|---|---|
| Zero SRAM, zero happy-path cost | No `jmp_buf`; each guarded call is followed by one branch, skipped when no error was raised |
| Propagates across calls | A `raise` inside a called function is caught at the call site in the caller's `try` — cross-function propagation **is** the model; there is no same-function restriction |
| Propagates to any depth | An unmatched exception re-propagates to the **enclosing** `try`, then the caller, and so on — there is no single-nesting-level limit |
| Caught at call sites | An exception is detected after a **function call** inside the `try`. Raise from a helper and catch it where you call it, rather than `raise`-ing directly in the `try` body |
| AVR + ARM only | On PIC, use return codes or sentinel values instead (`ZeroDivisionError` guards on `//` and `%` are still emitted there) |
| Exception types are integer codes | Builtins (`ValueError` etc.); no message strings at runtime; handlers match by integer code |
| Unmatched at top level | An exception that reaches `main` with no handler hits `__pymcu_unhandled_exn` — `E:<TypeName>` to UART0, then a halt; never a silent continue |

:::note[Return codes are still often clearer for firmware]
`try / except` is now zero-cost on the happy path (no `jmp_buf`, one skipped branch per
guarded call), so the old "21 bytes of SRAM per `try`" objection no longer applies. Even so,
an explicit status return is frequently the clearest bare-metal style, reads the same on
every backend (including PIC), and makes the error path obvious at each call:

```python
STATUS_OK:    uint8 = 0
STATUS_RANGE: uint8 = 1

def read_sensor() -> uint8:
    if adc.read() > 1000:
        return STATUS_RANGE
    return STATUS_OK

match read_sensor():
    case STATUS_OK:    ...
    case STATUS_RANGE: ...
```
:::

### `CompileError` — compile-time intrinsic

`raise CompileError("msg")` is intercepted by the compiler and **aborts compilation** with a
`CompileError:` diagnostic. It never generates any runtime code or error-propagation
instruction. It is used throughout the native HAL to reject unsupported configurations at compile
time:

```python
from pymcu.exceptions import CompileError

match __CHIP__.arch:
    case "avr":
        ...
    case _:
        raise CompileError("SPI not supported on this architecture")
```

`CompileError` **cannot be caught** by `try / except` — compilation aborts before any binary
is produced.

### Unhandled exception output

When a `raise` has no active `except` handler, PyMCU prints `"E:<TypeName>\r\n"` to UART0
(if initialized) and then halts. Useful for debugging from a serial monitor:

```
E:ValueError
```

Only exception types actually raised in the program have their name strings emitted in
flash — no overhead for unused exception codes. Chips without UART0 (ATtiny85 and friends)
skip the output and go directly to the halt loop.

`assert condition, msg` is a compile-time check: a statically false assertion is a
`CompileError`; a true or runtime-dependent assertion is stripped.

---

## Functions and closures

| Feature | Why it fails | Alternative |
|---|---|---|
| Closures capturing mutable vars | Closure cell requires heap | Pass captured values as explicit parameters |
| `*args` / `**kwargs` | Variadic convention needs stack inspection | Fixed parameter lists |
| `functools.partial` | Runtime partial object | Wrapper `@inline` function |
| Passing a **bare function name** as a value (`cb = my_handler`) | An identifier alone does not lower to a reference | Wrap it: `cb = funcref(my_handler)` (see below), or use `match / case` dispatch |
| Unbounded recursion | Stack overflow on an MCU | Iterative equivalent (the compiler reports the full call cycle it detected) |

**Supported:** `@inline` functions expand at call sites — zero call overhead, zero stack.
Non-`@inline` functions use a conventional call/ret ABI and can recurse to a fixed depth
(~80 frames on ATmega328P with 2 KB SRAM). `lambda x: expr` (no closure capture) is inlined
at the call site. `nonlocal` is supported inside nested `@inline` functions. Unannotated
parameters and return types on outlined functions are inferred from call sites, defaults and
return expressions.

**Function references are supported.** A function assigned to a `Callable`-annotated variable
captures its code address, and calling through that variable emits an indirect call
(`ICALL` on AVR):

```python
from pymcu.types import uint8, Callable

fn: Callable = add_one     # captures the address
r: uint8 = fn(10)          # indirect call
```

`funcref(fn)` is the explicit spelling of the same thing, and it is what you need to build a
`Callable[N]` dispatch table or to hand an address to inline assembly. The limit is that the
target must be a **named function known at compile time** — no closures, no bound methods and
no runtime-computed targets.

---

## Classes and inheritance

| Feature | Why it fails | Alternative |
|---|---|---|
| Multiple inheritance / MRO | C3 linearization is a runtime concept | Single-level inheritance only |
| Runtime polymorphism (vtable dispatch) | Requires vtable + heap class objects | Compile-time `match / case` dispatch |
| `isinstance()` / `type()` | No type tags at runtime | Not available |
| `__repr__`, `__str__` | No runtime string formatting | `uart.println()` with explicit fields |
| `dataclass` / `namedtuple` | Metaclass + runtime heap | Manual `@inline` class |

**Supported:** zero-cost abstraction (ZCA) `@inline` classes (zero SRAM), `@property` / `@name.setter`,
single-level class inheritance with `super()`, `with obj:` context managers
(`__enter__` / `__exit__`), `@staticmethod`, class-typed fields nested inside another class
(a `machine.Pin` wrapping the native HAL `Pin`, including through facade re-exports), and operator
dunder methods (`__add__`, `__sub__`, `__mul__`, `__len__`, `__contains__`, `__getitem__`,
`__setitem__`, and all comparison / bitwise dunders).

---

## Type system limitations

| Feature | Why it fails | Alternative |
|---|---|---|
| `complex` numbers | Not implemented | Not available |
| `Decimal` | Requires heap | Not available |
| `None` assigned to a scalar (`int` / `uintN`) | `None` is a real null literal, not the integer `-1` | Use a sentinel value (e.g. `0xFF`), or keep `None` for reference / optional-typed values where `is None` / `== None` checks work |
| `Optional[T]` at runtime | No heap, no runtime type tag | Sentinel value pattern |
| `Union` types | Runtime type tag required | Separate functions per type |
| `TypeVar` / `Generic` | Runtime generics | Separate `@inline` functions per type |

:::note[`float` is supported on every target]
IEEE 754 single-precision `float` works on **AVR** (pure-assembly `__fp_*` helper library,
~200-400 cycles per operation), on **RP2040** (the bootrom fast-float library, reached
through `__aeabi_f*` shims) and on **RP2350** (natively on the Cortex-M33 FPU).
`print(float)` works on AVR and ARM. Subnormals are treated as zero; NaN and Inf propagate
correctly. Float interpolations inside an f-string **value** are the one remaining gap.
:::

---

## Pointer arithmetic

`ptr[T]` in PyMCU is an **address alias for memory-mapped I/O**, closest to a C volatile
pointer:

```c
// C: what ptr[T] models
volatile uint8_t* const PINB = (volatile uint8_t*)0x36;
```

**What does work.** A `ptr[T]` may be passed as a function parameter and returned from a
function, and the address handed to `ptr(...)` may be computed at runtime — the native HAL
relies on all three:

```python
# a ptr parameter (pymcu.hal.avr.gpio)
def pin_pulse_in(pin_reg: ptr[uint8], bit: uint8, state: uint8, timeout_us: uint16) -> uint16:
    ...

# a ptr return value (pymcu.hal.avr.pwm)
def pwm_select_ocr(pin: str) -> ptr[uint8]:
    ...

# a runtime address (pymcu.hal.rp2040.gpio) — `pin` is a runtime variable
pad: ptr[uint32] = ptr(PADS_BANK0_BASE + 4 + 4 * pin)
pad.value = 1 << 6
```

Reads and writes go through `.value`, and augmented assignment on `.value` works.

**What does not work** is treating a `ptr` as an iterator you can walk:

| Operation | Example | Why it fails |
|---|---|---|
| Pointer advance | `p = p + 1` | There is no pointer arithmetic in the IR — recompute the address instead |
| Pointer difference | `p - q` | Not in the IR |
| Variable-index dereference | `p[i]` where `i` is a runtime variable | Subscripting a `ptr` is bit-indexing, not element indexing |
| Register base + runtime offset | a base address already held in a register, plus a variable | Only `ptr(<expression>)` is lowered; there is no base-register addressing form |

**Idiomatic alternative — fixed arrays with a variable index:**

```python
buf: uint8[16] = [0] * 16
i: uint8 = 0
while i < 16:
    buf[i] = compute(i)   # compiles to: LDD / STD with Y+offset
    i = i + 1
```

`uint8[N]` arrays with a runtime index already compile to efficient `ld` / `st` with
Y+offset addressing on AVR — no pointer arithmetic needed.

For performance-critical pointer walks in assembly on AVR, use the Z register (`r30:r31`)
with `ld r24, Z+` / `st Z+, r24` to auto-increment through a buffer:

```python
asm("""
ldi  r30, lo8(my_buf)
ldi  r31, hi8(my_buf)
ldi  r18, 16          ; length
_loop:
    ld   r24, Z+      ; load byte and advance pointer
    dec  r18
    brne _loop
""")
```

---

## Iterators and comprehensions

| Feature | Why it fails | Alternative |
|---|---|---|
| List comprehension over a **runtime** iterable | Length not known at compile time | `for` loop with a fixed-size array |
| Dict comprehension | Would build a container at runtime | Closed dict literal, or fill a `FixedDict` in a loop |
| Set comprehension | Would build a container at runtime | Closed set literal, or a `uint8` bitmask |
| Generator **expressions** (`(x for x in ...)`) | No lazy iterator object | Write a generator function with `yield`, or an explicit `for` loop |
| `yield` inside an `@inline` function or a method | The state machine is generated per top-level function | Move the generator to a module-level `def` |
| `yield` used as an **expression** (`x = yield v`) | No two-way generator protocol | One-way `yield` only |
| `yield from` | Delegation needs a nested frame | Loop over the inner generator and re-`yield` |
| `map()` / `filter()` with runtime iterables | Lazy iterator requires heap | Explicit `for` loop |

**Supported:** `for i in range(N)` (runtime or constant N), `for x in array`,
`for x in [...]`, `for i, x in enumerate(iterable)`, `for x, y in zip(list1, list2)`,
`for x in reversed([...])`, list comprehensions with compile-time constant bounds, nested
list comprehensions, `if`-filtered list comprehensions, and
`for pin in [DigitalInOut(p) for p in (...)]` /
`for bit, pin in enumerate([DigitalInOut(p) for p in (...)])` (compile-time unroll of ZCA
instance arrays).

### Generators (`yield`)

A **top-level** function containing `yield` lowers to the same zero-cost state-machine class
the compiler builds for `async def` — no heap, no `asyncio` needed. `poll()` returns
`2` (yielded), `1` (still working) or `0` (done), with the produced value in `._value`, and
`for x in gen(...)` desugars to a poll loop with Python-exact `break` / `continue`
semantics:

```python
def countdown(n: uint8):
    while n > 0:
        yield n
        n = n - 1

for v in countdown(5):
    print(v)
    if v == 2:
        break
```

The limits are the ones in the table above: no `yield` inside `@inline` functions or class
methods, no `yield` as an expression, and no `yield from`.

---

## Async and concurrency

| Feature | Why it fails | Alternative |
|---|---|---|
| Awaiting another coroutine or future | Sub-future fields need ZCA construction outside `__init__` (not supported yet) | Call the coroutine and poll it, or restructure with `asyncio.gather` |
| `await` as an **expression** (`x = await f()`) | The state machine only splits at statement boundaries | `await` the sleep, then read the result from `._value` |
| `threading` / `multiprocessing` | An OS is required | `@interrupt` ISRs |

**Supported:** `async def` / `await` (compiled to a zero-cost state machine; requires
`import asyncio`). `await asyncio.sleep()` / `sleep_ms()` works anywhere in the body —
inside `if` / `elif` / `else`, `while <cond>` and `for i in range(...)` at any nesting,
with `break` and `continue`; `return expr` surfaces the result via `._value`. Executors:
`asyncio.run(coro)` and `asyncio.gather(a, b)`. Locals become state-machine fields only when
they survive a suspension.

Also supported: the `@interrupt` decorator for hardware ISRs, `Pin.irq(trigger, handler)`
for external pin interrupts, and atomic flag patterns via `GPIOR0` on AVR.

:::caution[Timer0 and `millis()` / `ticks_ms()` on AVR]
`millis_init()` (auto-injected when `ticks_ms()` is detected) configures **Timer0** in
normal overflow mode. Do **not** use Timer0 for PWM, CTC or anything else while
`ticks_ms()` / `millis()` is active in the same program.

`delay_ms()` and `delay_us()` are unaffected — on AVR they are a software busy-loop with no
hardware timer dependency.
:::

---

## Imports and modules

| Feature | Why it fails | Alternative |
|---|---|---|
| Third-party PyPI packages | Only the `pymcu` stdlib is compiled | Implement it in the `pymcu` stdlib, or use `@extern` (AVR) |
| `importlib` / dynamic imports | Runtime module loading | Not available |
| Circular imports | Not supported | Restructure the module dependencies |

**Supported:** `import foo`, `from foo import Bar`, `from foo import Bar as B`, relative
imports, multi-module projects, the `pymcu` stdlib, and the `pymcu-circuitpython` /
`pymcu-micropython` compat packages. Module-level statements are allowed alongside an
explicit `def main()` — they run at startup before `main()`'s body, mirroring Python.

---

## Built-ins summary

| Built-in | Status | Notes |
|---|---|---|
| `print(str)` / `print(int)` / `print(float)` | ✅ Supported | Routes to UART; `print(float)` on AVR and ARM |
| `range(n)` | ✅ Supported | For-loop bounds; runtime or constant |
| `len(arr)` / `len(b"...")` | ✅ Supported | Compile-time constant fold |
| `abs(x)` | ✅ Supported | Intrinsic |
| `min(a, b)` / `max(a, b)` | ✅ Supported | Intrinsic |
| `sum(iterable)` | ✅ Supported | Compile-time fold or unrolled additions |
| `enumerate(iterable)` | ✅ Supported | Compile-time index counter |
| `zip(a, b)` | ✅ Supported | Compile-time unroll over constant lists |
| `reversed(iterable)` | ✅ Supported | Compile-time reverse unroll |
| `any(iterable)` / `all(iterable)` | ✅ Supported | Compile-time fold |
| `divmod(a, b)` | ✅ Supported | Compile-time or runtime |
| `pow(x, n)` / `x ** n` | ✅ Supported | Compile-time constant fold |
| `hex(n)` / `bin(n)` | ✅ Supported | Compile-time only |
| `str(n)` | ✅ Supported | Compile-time only |
| `ord('A')` / `chr(n)` | ✅ Supported | Compile-time constant only |
| `int.from_bytes(b, e)` | ✅ Supported | Compile-time fold or runtime |
| `input(prompt?, maxlen?)` | ✅ Supported | `line: bytearray = input("prompt")` — reads a newline-terminated line from UART; the prompt is an optional compile-time string, the max length an optional integer (default 64); the UART preamble is auto-injected |
| `sorted()` | ❌ Not supported | No dynamic allocation |
| `map()` / `filter()` | ❌ Not supported | Use explicit `for` loops |
| `open()` / file I/O | ❌ Not supported | No filesystem |
| `exec()` / `eval()` | ❌ Not supported | An interpreter would be required |
| `getattr()` / `hasattr()` | ❌ Not supported | No runtime type information |

---

## Platform notes (AVR — ATmega328P / Arduino Uno)

- **Stack depth:** roughly 80 nested non-inline calls before overflow (2 KB SRAM,
  ~16 bytes per frame). Use `@inline` for leaf helpers.
- **Soft float:** `float` variables and arithmetic go through a pure-assembly soft-float
  library. No FPU required; expect ~200-400 cycles per operation.
- **No heap by default:** every variable must have a size known at compile time. The one
  opt-in exception is `list[T]`, which links a bounded bump allocator and a GC — and only
  into firmware that uses it.
- **String literals live in flash:** read-only, sent to UART through the flash string pool.
  They cannot be compared, indexed or modified at runtime (except via `const[str]`).
- **C/C++ interop:** supported via `@extern` and `[tool.pymcu.ffi]` in `pyproject.toml`.
  C sources use `avr-gcc`; C++ sources (`.cpp` / `.cc` / `.cxx`) use `avr-g++` with
  `-fno-exceptions -fno-rtti`, which makes Arduino libraries usable.

---

## Platform notes (ARM — RP2040 / RP2350)

The ARM backend does **not** emit assembly directly. It lowers PyMCU's
architecture-agnostic IR to **LLVM IR** — target `thumbv6m-none-eabi` for the RP2040
(Cortex-M0+) and the Cortex-M33 triple for the RP2350 — so LLVM handles register
allocation, instruction selection, the AAPCS calling convention and all optimization
passes. `pymcu build` emits a flat flash image (`firmware.bin`), with the stage-2 boot
loader at offset 0 on RP2040 and a picobin image block on RP2350.

Both chips ship the **full peripheral HAL** — GPIO, UART, SPI, I2C, PWM, ADC and DMA — plus
the `@rp2.asm_pio` PIO DSL. Exceptions (`try` / `except` / `raise` / `finally`) and `float`
work here exactly as they do on AVR. Interned strings and `const[uint8[N]]` tables are
flash-resident (`.rodata`), and `const[str]` runtime subscript works.

The CYW43439 WiFi stack (`pymcu.hal.wifi`: gSPI bring-up, WLAN join, TCP, MQTT publish) is
**Pico 2 W (RP2350) only** — importing it on any other chip, the Pico W (RP2040) included, is
a `CompileError`.

Remaining ARM-specific caveats:

- **Single core:** only core 0 runs. Dual-core launch and the SIO FIFO are not exposed yet.
- **Delays:** `delay_ms` / `delay_us` poll the hardware **TIMER** (the free-running 1 MHz
  microsecond counter), so timing is accurate on real silicon regardless of CPU clock and
  pipeline — it is not a calibrated busy-loop. In the emulator, wall-clock measured by
  `RunMilliseconds` reads the wait slightly short, because that harness budgets execution by
  retired instruction count while the timer advances by elapsed cycles; the firmware delay
  itself is exact.
- **WiFi is RP2350-only, and open networks only:** there is no CYW43 driver for the RP2040,
  and WPA / WPA2 is not implemented — `connect(ssid, key)` raises a `CompileError` if `key`
  is non-empty rather than silently dropping it.
- **UART clock assumption:** the baud divisors assume the board default for the chip —
  `clk_peri = 125 MHz` on the RP2040 and `150 MHz` on the RP2350 (`clk_peri == clk_sys` in
  both cases). A configurable clocks HAL is future work.
- **No C/C++ interop:** `@extern` and `[tool.pymcu.ffi]` are AVR-only.
- **Toolchain:** install with `pipx install --pip-args=--pre "pymcu-compiler[arm]"`. The
  backend ships in `pymcu-arm` and requires **LLVM** (`opt`, `llc`, `llvm-mc`, `ld.lld`,
  `llvm-objcopy`) on the host, provided by the
  [`pymcu-arm-toolchain`](https://github.com/PyMCU/pymcu-arm-toolchain) wheel. If no wheel
  is available for your platform, the toolchain falls back to a system LLVM (for example
  `brew install llvm lld`).

---

## Platform notes (PIC)

The PIC backend is **new in alpha 3** and currently covers the mid-range
**PIC16F84A** and **PIC16F877A**. It emits assembly directly (no LLVM) and supports:

- Software `*`, `//` and `%` routines for 8- and 16-bit operands (no hardware multiplier).
- Fixed-size RAM arrays with runtime indices (FSR / INDF addressing).
- A catchable `ZeroDivisionError` guard on runtime `//` and `%`.
- EUSART UART (baud divisors derived from `__FREQ__`), flash-resident strings and `print()`.

Caveats:

- **No general `try` / `except`:** full exception propagation is AVR + ARM only. On PIC,
  use return codes or sentinel values; only the `ZeroDivisionError` guard is emitted.
- **No `@extern` C interop.**
- **Toolchain:** install with `pipx install --pip-args=--pre "pymcu-compiler[pic]"`. It
  bundles self-contained gputils (`gpasm`) wheels — no system packages required.

---

## Getting help

If you hit a compile error on a Python construct not covered here, please
[open an issue](https://github.com/PyMCU/PyMCU/issues). Include the source snippet and the
compiler error message — the compiler reports `file:line` for user-facing errors, so paste
the whole diagnostic.

For what is coming next, see the [roadmap](/pymcu/roadmap/).
