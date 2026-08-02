---
title: Language Reference
description: "The complete accepted Python subset: types and annotations, control flow, decorators, ZCA classes, generators, async/await and the MCU-specific extensions."
---

PyMCU compiles a **statically-typed subset of Python** to bare-metal machine code for AVR, ARM
(RP2040 / RP2350) and PIC. No interpreter, no VM, no general heap — every allocation size is
fixed at compile time. This document is the canonical reference for every language feature the
compiler accepts.

:::note[Alpha]
This page tracks PyMCU **v0.1.0a3**. Core compilation is stable and test-covered; error
messages and tooling still have rough edges. Where a feature is target-dependent, the target
list is stated inline.
:::

This page is about the **language** — the syntax and the type system, which are the same
whichever peripheral API you import. For the peripheral APIs themselves, write MicroPython
(`machine`, `utime`) or CircuitPython (`board`, `digitalio`, `busio`, …): those are the
recommended, stable surfaces, and the [Standard Library](/stdlib/) pages show every example
in all three dialects. Sections 9 and 10 below use `pymcu.hal.*` because it is the layer the
compat packages are built on, and because register access, `@interrupt` handlers, `asm()`
and `@extern` have no compat equivalent by design.

---

## 1. Quick Reference

| Category | Feature | Status |
|---|---|---|
| **Statements** | `if / elif / else` | Complete |
| | `while` + `break` / `continue` | Complete |
| | `for i in range(n)` | Complete |
| | `for x in array` | Complete |
| | `match / case` (literal, wildcard, OR patterns) | Complete |
| | `def` (typed params, defaults, keyword args) | Complete |
| | `class` (ZCA `@inline`, `@property`) | Complete |
| | `class Foo(Enum)` (zero-cost integer constants) | Complete |
| | `with obj:` (context manager, `__enter__`/`__exit__`) | Complete |
| | `assert condition, "msg"` (compile-time only) | Complete |
| | `return` | Complete |
| | `pass` | Complete |
| | `try / except / else / finally` | Complete (AVR + ARM; not PIC) |
| | `raise` + builtin exception types | Complete (AVR + ARM; not PIC) |
| | `raise CompileError("msg")` (aborts compilation) | Complete |
| | `async def` / `await asyncio.sleep_ms(n)` | Complete (section 6) |
| | `yield` (generators) | Complete (top-level `def` only) |
| | `import` / `from ... import` / `import ... as` | Complete |
| | `global` | Complete |
| | `nonlocal` (inside nested `@inline` functions) | Complete |
| **Expressions** | Integer literals (dec, hex, bin, oct, `_` separators) | Complete |
| | `True` / `False` / `None` | Complete |
| | String literals (double- and single-quoted) | Complete |
| | Arithmetic `+ - * / % //` | Complete |
| | Comparison `== != < <= > >=` | Complete |
| | Bitwise `& \| ^ ~ << >>` | Complete |
| | Logical `and` / `or` / `not` | Complete (full short-circuit evaluation) |
| | Augmented assignment `+= -= *= //= &= \|= ^= <<= >>=` | Complete (variables, subscripts, member targets) |
| | Ternary `val = x if cond else y` | Complete |
| | Type cast `uint8(val)`, `uint16(val)` | Complete (constant-fold at compile time) |
| | `abs(x)`, `min(a, b)`, `max(a, b)` | Complete |
| | `ord('A')`, `chr(65)` (compile-time) | Complete |
| | Multiple assignment `a = b = 0` | Complete |
| | `len(arr)` / `len([...])` (compile-time) | Complete |
| | Walrus `:=` `(c := uart.read())` | Complete |
| | Bit-index `reg[n]` | Complete |
| | Array index `arr[i]` (const and variable) | Complete |
| | Tuple literal `(a, b)` | Complete |
| | Tuple unpacking `a, b = func()` | Complete |
| | Member access `obj.x`, method calls `obj.m()` | Complete |
| | f-strings `f"t={t}C"` — streamed and as values | Complete |
| | Closed `dict` / `set` literals (compile-time lookup tables) | Complete |
| **MCU extensions** | `uint8 / int8 / uint16 / int16 / uint32 / int32` | Complete |
| | `float` (IEEE-754 single precision) | Complete (AVR, RP2040, RP2350) |
| | `ptr[T]` pointer type | Complete |
| | `const[T]` compile-time constant | Complete |
| | `asm("instr")` inline assembly | Complete |
| | `delay_ms(n)` / `delay_us(n)` | Complete |
| | `@inline` decorator | Complete |
| | `@interrupt(vector)` ISR decorator | Complete |
| | `@property` / `@name.setter` | Complete |
| | Conditional compilation `__CHIP__` | Complete |
| **Arrays** | Fixed-size arrays `arr: uint8[N]` | Complete |
| | Constant-index access (zero overhead) | Complete |
| | Variable-index access (SRAM) | Complete |
| | List comprehension (compile-time constant only) | Complete |
| | `bytearray(N)` / `bytearray(b"...")` | Complete (lowers to `uint8[N]`) |
| | `list[T]` bounded list with `append()` | Complete on AVR (bump allocator + GC); not on ARM/PIC |
| | `pymcu.collections.FixedDict(capacity)` | Complete (no heap) |
| **Not supported** | Growing `dict` / `set` (`.add()`, unbounded insert) | No heap hash tables — use a closed literal or `FixedDict` |
| | `list.append` on a **fixed-size** array | Use `list[T]`, or size the array up front |
| | Closures capturing mutable variables | No closure cell without a heap |
| | `*args` / `**kwargs`, `functools.partial` | Fixed parameter lists only |
| | Reflection: `getattr` / `setattr` / `eval` / `exec` | No runtime type info |
| | `isinstance()`, multiple inheritance, metaclasses | No runtime type tags |
| | `complex`, `Decimal` | Not available |
| | `str.split()` / `.join()` / `.format()`, `str + str` | No heap strings |
| | `await` as an expression; awaiting another coroutine | Poll it, or use `asyncio.gather` |
| | `yield` inside `@inline` functions or methods; `yield` as an expression | Top-level `def` only |
| | f-string inline in an arbitrary expression position | Assign it to a name first |
| | List comprehension (runtime bounds) | No heap |

---

## 2. Types and Annotations

Annotate your variables. The annotation drives register width, instruction selection, and
memory layout, and it is the only way to pin a value to a width you care about. Where an
annotation is omitted the compiler infers the type from the initializer — see
[Type inference](#type-inference) in section 6 for the rules that apply to `def` parameters
and return types.

### Primitive types

| Type | Width | Range | Notes |
|---|---|---|---|
| `uint8` | 8-bit | 0 – 255 | Default for pin values, flags, bytes |
| `int8` | 8-bit | -128 – 127 | Signed byte |
| `uint16` | 16-bit | 0 – 65535 | Counters, UART baud divisors |
| `int16` | 16-bit | -32768 – 32767 | Signed 16-bit |
| `int` | 16-bit | -32768 – 32767 | Built-in alias for `int16` — **no import needed** |
| `uint32` | 32-bit | 0 – 4294967295 | Timestamps, large counters |
| `int32` | 32-bit | — | Signed 32-bit |
| `bool` | 8-bit | 0 / 1 | Aliases `uint8`; `True`/`False` fold to 1/0 |
| `float` | 32-bit | IEEE 754 single | AVR, RP2040 and RP2350 — see below |

```python
x: uint8 = 0
counter: uint16 = 0
flag: bool = False
```

### `float`

`float` is IEEE-754 **single precision** (32-bit) and is available on AVR, RP2040 and RP2350.
The implementation differs per target, the semantics do not:

| Target | Implementation |
|---|---|
| AVR | Pure-assembly `__fp_*` soft-float helpers — no FPU, ~200-400 cycles per operation |
| RP2040 (Cortex-M0+) | The bootrom **fast-float** library; `crt0` resolves the SF table and the `__aeabi_f*` shims |
| RP2350 (Cortex-M33) | Hardware FPU (FPv5-SP, softfp calling convention) |

`print(x)` on a `float` emits a one-decimal representation on both AVR and ARM.

```python
a: float = 2.5
b: float = 4.0
c: float = a * b + 1.5     # 11.5
d: float = c / 2.0         # 5.75

if d > 5.0:
    print("high")

n: uint16 = int(d * 10.0)  # 57 — int() truncates toward zero
print(d)                   # 5.7
```

Subnormals are flushed to zero; NaN and Inf propagate correctly. `float` is not supported on
the PIC backend.

### Pointer type `ptr[T]`

Maps directly to a memory-mapped register address. Dereferencing with `.value` reads or writes
the full register. Subscript access `reg[n]` reads or writes individual bits.

```python
from pymcu.types import ptr, uint8

PORTB: ptr[uint8] = ptr(0x25)   # ATmega328P PORTB DATA address
PORTB.value = 0xFF               # write whole register
PORTB[5] = 1                     # set bit 5 (SBI on AVR I/O space)
bit: uint8 = PORTB[5]            # read bit 5 (SBIS/SBIC)
```

### Constant type `const[T]`

Declares a value that must be resolvable at compile time. The compiler rejects any attempt to
assign a runtime expression to a `const[T]` variable.

```python
BAUD: const[uint16] = 9600
```

### Arrays

Fixed-size arrays are allocated in SRAM. Size must be a compile-time constant.

```python
buf: uint8[8] = [0, 0, 0, 0, 0, 0, 0, 0]

# Constant-index access: zero overhead (synthesized scalars)
buf[0] = 42
x: uint8 = buf[0]

# Variable-index access: SRAM + Z-register indirect load/store
i: uint8 = 3
buf[i] = 99
```

#### List comprehensions (compile-time only)

List comprehensions with compile-time constant bounds are supported and unroll at compile time:

```python
# Supported: compile-time constant range
powers: uint8[5] = [2**i for i in range(5)]   # [1, 2, 4, 8, 16]
doubled: uint8[10] = [i*2 for i in range(10)] # [0, 2, 4, 6, ...]

# NOT supported: runtime variable bounds
n: uint8 = get_size()
values: uint8[10] = [i for i in range(n)]  # CompileError — use a for loop instead
```

The comprehension must have a constant range bound known at compile time. The result is a fixed-size array.

#### `bytearray` and bounded `list[T]`

`bytearray(N)` and `bytearray(b"...")` compile to SRAM `uint8[N]` arrays and work on every
target.

`list[T]` is a bounded, GC-managed list — it supports `append()`, `len()`, `x[i]` and
`for v in x:`, and grows by reallocation inside its own arena rather than on a general heap.
It is **AVR-only**; the ARM and PIC backends reject the GC. Use a fixed-size array or a
`FixedDict` there.

```python
buf = bytearray(16)

samples: list[uint8] = list()
samples.append(42)
n: uint8 = len(samples)
```

### Dictionaries and sets

There is no hash table and no heap, so an unbounded, growing `dict` or `set` cannot be
compiled. Two bounded forms are supported instead.

#### Closed `dict` / `set` literals — compile-time lookup tables

A `dict` or `set` literal bound to a name is a **compile-time lookup table** with no storage.
A constant lookup folds to its value; a runtime lookup lowers to a compare chain that raises
a catchable `KeyError` when no key matches. `x in d` / `x in {...}` test membership and
`len(d)` folds to a constant. These tables are read-only.

```python
SCALE = {0: 10, 1: 20, 2: 30}
MODES = {"low": 1, "mid": 2, "high": 3}
OK    = {1, 3, 5}

v: uint8 = SCALE[2]        # folds to 30 at compile time

k: uint8 = 1
r: uint8 = SCALE[k]        # runtime key -> compare chain

try:
    k = 7
    bad: uint8 = SCALE[k]
except KeyError:
    handle_missing()

a: uint8 = 3
if a in OK:                # membership chain
    accept()

n: uint8 = len(SCALE)      # 3, compile-time constant
m: uint8 = MODES["mid"]    # string keys fold on constant lookups
```

#### `FixedDict` — mutable, fixed capacity

`pymcu.collections.FixedDict(capacity)` is the mutable counterpart: an integer-keyed dict
implemented with open addressing over per-instance fixed arrays. No heap, no GC, deterministic
timing. The capacity is a compile-time constant; inserting into a full dict raises `ValueError`.

```python
from pymcu.collections import FixedDict

d = FixedDict(4)
d[300] = 5
d[42]  = 7
d[300] = 6                 # overwrite

g: uint16 = d[300]         # 6 — KeyError if absent
c: uint8  = 300 in d
n: uint8  = len(d)
dv: uint16 = d.get(9, 99)  # default when missing
p: uint16 = d.pop(42)
d.clear()
```

### Strings and f-strings

String literals live in flash and are read-only. `f"..."` with runtime interpolations is
supported in two forms.

**Streamed** — the compiler lowers each piece to a direct write, with no buffer at all:

```python
print(f"adc={raw} v={mv:04d}")
uart.write_str(f"t={temp:5d}")
uart.println(f"err 0x{code:02X}")
```

**As a value** — assigning an f-string to a name builds it into a compiler-managed fixed
`bytearray` whose size is statically bounded per part. `len(s)` is the formatted length,
`s[i]` indexes bytes, `print(s)` / `uart.write_str(s)` stream it, and re-assigning `s` inside
a loop reuses the same buffer:

```python
t: uint8 = 23
reg: uint16 = 0xBEEF
s = f"t={t}C reg={reg:04x}"
print(s)

n: uint16 = len(s)
first: uint8 = s[0]

k: uint8 = 0
line = f"k={k} "           # sized here — assign the longest form first
while k < 3:
    line = f"k={k} "       # buffer reuse, no allocation
    uart.write_str(line)
    k = k + 1
```

**Format specs:** `{x:02x}`, `{x:X}`, `{x:08b}`, `{x:o}`, `{x:5d}`, `{x:04d}` — width,
zero-padding and the `x` / `X` / `b` / `o` / `d` bases. Compile-time constant interpolations
are folded straight into the flash string.

Not supported in the **value** form: float interpolations, `s == "lit"` comparison, and an
f-string used inline in an arbitrary expression position — assign it to a name first.

### Tuple returns

Functions may return multiple values as a tuple, and the caller unpacks them at the call
site. The function **must be `@inline`** — unpacking a tuple returned by an outlined
(non-`@inline`) `def` is a located `CompileError`, because there is no multi-value return in
the calling convention.

```python
@inline
def divmod8(a: uint8, b: uint8) -> (uint8, uint8):
    q: uint8 = a // b
    r: uint8 = a - q * b
    return (q, r)

q, r = divmod8(10, 3)   # q=3, r=1
```

The return annotation itself is optional and may be spelled either `-> (uint8, uint8)` or
`-> tuple[uint8, uint8]`. Annotating it pins the width of each element, so a wide value is
not truncated into an 8-bit result slot.

---

## 3. Variables and Scope

- **Local variables** — allocated to registers (R4-R15) or SRAM stack slots. Scope is the
  enclosing `def`.
- **Global variables** — declared with `global name` inside a function, allocated to named SRAM
  labels (`_global_name`). Accessible across functions.
- **Inline prefix** — inside an `@inline` expansion, every variable is prefixed with the inline
  call chain (`inline1.func.varname`). This prevents name collisions across multiple call sites.
- **`nonlocal`** — supported inside nested `@inline` functions, where the enclosing frame is
  flattened at compile time.
- **No closures over mutable variables** — a closure that captures a mutable binding needs a
  heap-allocated cell and is rejected. Pass the captured values as explicit parameters, or use
  module-level state or `@inline` class methods. `lambda x: expr` without capture is inlined at
  the call site.

```python
count: uint16 = 0    # global in main module

def increment():
    global count
    count += 1
```

---

## 4. Operators

### Arithmetic

| Operator | Description | Notes |
|---|---|---|
| `+` | Addition | Wraps on overflow (no UB) |
| `-` | Subtraction | |
| `*` | Multiplication | |
| `/` | True division | Python 3 semantics — **always yields a `float`** and links the float routines; the compiler warns when both operands are integers |
| `//` | Floor division | Integer result, floored (Python semantics); raises `ZeroDivisionError` on a runtime divide-by-zero |
| `%` | Modulo | Floored, matching Python's sign rules; raises `ZeroDivisionError` on a runtime divide-by-zero |
| `-x` | Unary negate | |

`+`, `-`, `*` and `<<` **promote** their operands to the next wider type, so same-width
arithmetic does not silently wrap; narrowing happens only at an explicit store into a narrower
variable or an explicit cast. Prefer `//` on a hot path when you want an integer result —
`/` pulls the soft-float runtime into the firmware.

```python
a: uint8 = 255
b: uint8 = 45
c: uint16 = a + b            # 300 — promoted, no wrap
wrapped: uint8 = uint8(a + b)  # 44 — explicit fixed-width add

ticks: uint16 = total // 2   # integer floor division
half: float = count / 2      # float result (soft-float / FPU)
```

### Comparison

`==  !=  <  <=  >  >=` — all produce `uint8` (0 or 1).

### Bitwise

| Operator | Description |
|---|---|
| `&` | Bitwise AND |
| `\|` | Bitwise OR |
| `^` | Bitwise XOR |
| `~` | Bitwise NOT |
| `<<` | Left shift |
| `>>` | Right shift |

### Logical

`and`, `or`, `not` use full short-circuit evaluation. The right-hand operand is not evaluated
when the result is already determined by the left-hand operand:

```python
if pin.value() and sensor.read():   # sensor.read() skipped if pin.value() == 0
    process()

if done or retry_count > 5:         # retry_count check skipped if done != 0
    finish()
```

### Ternary expression

```python
val: uint8 = HIGH if enabled else LOW
level: uint8 = 255 if saturated else measured
```

### Augmented assignment

`+=  -=  *=  //=  &=  |=  ^=  <<=  >>=` are supported on variable, subscript, and member targets:

```python
count += 1          # variable target
arr[i] += 1         # subscript target (SRAM array)
PORTB[5] ^= 1       # bit-index target (toggle pin)
sensor.value += 2   # member target
```

### Type casts

Explicit width conversion. Constant expressions are folded at compile time:

```python
x: uint16 = 1000
y: uint8 = uint8(x)     # truncate to low byte (232)
z: uint16 = uint16(y)   # zero-extend
```

### Built-in functions

| Function | Description |
|---|---|
| `abs(x)` | Absolute value |
| `min(a, b)` | Minimum of two values |
| `max(a, b)` | Maximum of two values |
| `ord('A')` | ASCII code of a single-character literal (compile-time) |
| `chr(65)` | Character literal to integer (compile-time identity) |
| `len(arr)` | Element count of a fixed-size array or list literal (compile-time constant) |

### Walrus operator `:=`

Assigns a value and returns it, enabling assignment inside conditions and loops:

```python
# UART line reader
i: uint8 = 0
while (c := uart.read()) != '\n':
    buf[i] = c
    i += 1

# Sensor polling loop
while (v := adc_read()) < threshold:
    process(v)
```

The variable must already be declared with a type annotation before the walrus expression.

### `range()` — full syntax

All three forms are supported with runtime or compile-time bounds:

```python
for i in range(8):          # 0..7
for i in range(1, 8):       # 1..7
for i in range(0, 16, 2):   # 0,2,4,...,14
for i in range(10, 0, -1):  # 10,9,...,1 (countdown)
n: uint8 = uart.read()
for i in range(n):          # runtime bound
```

---

## 5. Control Flow

### `if / elif / else`

Standard Python semantics. Compile-time dead-code elimination applies when the condition is a
`__CHIP__` attribute comparison — the compiler evaluates the condition at compile time and omits
the dead branch entirely.

```python
if x > 0:
    led.high()
elif x == 0:
    led.low()
else:
    led.toggle()
```

### `while`

```python
while not done:
    process()
    if error:
        break
```

`break` and `continue` are fully supported.

### `for`

```python
# range() with runtime or compile-time bound
for i in range(8):
    buf[i] = 0

# Iterate over a fixed-size array
for val in buf:
    uart.write(val)

# enumerate() — compile-time index counter
for i, val in enumerate(buf):
    process(i, val)

# Over a generator — desugars to a poll loop (see section 6)
for v in powers(4):
    process(v)
```

`zip(a, b)` and `reversed([...])` are also supported over compile-time constant sequences.

### `match / case`

Supports literal patterns, wildcard `_`, and OR patterns (`|`). Compile-time DCE applies when
matching on `__CHIP__` attributes.

```python
match state:
    case 0:
        init()
    case 1 | 2:
        run()
    case _:
        error()
```

Dotted-name patterns (e.g. `case State.IDLE:`) require the right-hand side to be a **dotted**
name (not a bare identifier) to avoid capture:

```python
match mode:
    case Pin.OUT:
        setup_output()
    case Pin.IN:
        setup_input()
```

### `with`

Calls `__enter__()` before the body and `__exit__()` after. Zero-cost when both methods are
`@inline`. This is the preferred pattern for SPI, I2C, and critical-section wrappers:

```python
with spi:
    spi.write(0xAB)         # select() before, deselect() after

with i2c:
    i2c.write(0xD0)         # start() before, stop() after
    i2c.write(0x3B)
```

`as` binding is also supported:

```python
with spi as bus:
    bus.write(0xAA)
```

### `assert`

Compile-time assertion. Evaluated at compile time — statically false expressions raise a
`CompileError`; runtime-variable conditions are silently stripped (no MCU code emitted):

```python
assert TABLE_SIZE <= 256, "TABLE_SIZE must fit in uint8"
assert __CHIP__.arch == "avr", "This file requires AVR"
```

### `try` / `except` / `else` / `finally` and `raise`

Exceptions are supported on **AVR and ARM (RP2040 / RP2350)** through a zero-cost
**flag-propagation** model — not `setjmp` / `longjmp`. A function that raises sets an error
flag and an integer type code (on AVR the SREG T flag via `SET` / `CLT` / `BRTS`; on ARM an
internal flag + code pair) and returns normally; every call site inside a `try` tests the flag
and branches to the matching handler. There is no `jmp_buf`, no stack unwinding and no SRAM
cost — the happy path pays one skipped branch per guarded call.

Because propagation rides on the function return, cross-function propagation *is* the model:
raise in a helper, catch it where you call the helper. An unmatched exception re-propagates to
the enclosing `try`, then to the caller, to any depth.

```python
def read_sensor(raw: uint16) -> uint8:
    if raw > 1000:
        raise ValueError          # sets the flag, returns to the caller
    return uint8(raw)

try:
    v: uint8 = read_sensor(adc.read())
except ValueError:
    handle_error()
    raise                         # bare re-raise — propagates to our caller
else:
    handle(v)                     # runs only when nothing was raised
finally:
    cleanup()                     # runs on every exit path
```

`finally` runs on **every** exit path: normal completion, a caught exception, propagation to an
outer scope, and `return` / `break` / `continue` out of the `try`.

**Builtin exception types** — no import required, exactly like CPython:
`ValueError`, `TypeError`, `IndexError`, `KeyError`, `NotImplementedError`,
`ZeroDivisionError`. `ZeroDivisionError` is raised automatically on a runtime `//` or `%` by
zero; `KeyError` comes out of a failed closed-dict or `FixedDict` lookup. Exception types are
integer codes at runtime — handlers match on the code, and there are no message strings.

An exception that reaches `main` with no handler is not swallowed: the runtime writes
`E:<TypeName>` to UART0 (when one is initialized) and halts.

:::note[Not on PIC]
The PIC backend does not implement the exception model — only the automatic
`ZeroDivisionError` guards. On PIC, use return codes or sentinel values.
:::

Return codes remain a perfectly idiomatic firmware style, read identically on every backend,
and make the error path visible at each call site:

```python
STATUS_OK:    uint8 = 0
STATUS_RANGE: uint8 = 1

match read_sensor():
    case STATUS_OK:    proceed()
    case STATUS_RANGE: recover()
```

#### `raise CompileError("msg")` — the compile-time intrinsic

`CompileError` is intercepted by the compiler and **aborts compilation** with a diagnostic. It
emits no runtime code and it **cannot be caught** by `try` / `except`. The native HAL uses it to
reject unsupported configurations at compile time:

```python
from pymcu.exceptions import CompileError

match __CHIP__.arch:
    case "avr":
        setup_avr()
    case _:
        raise CompileError("SPI not supported on this architecture")
```

---

## 6. Functions and Decorators

### Regular functions

Annotate your parameters and return type — that is what pins each value to a width. Default
values and keyword arguments are supported.

```python
def clamp(val: uint8, lo: uint8, hi: uint8) -> uint8:
    if val < lo:
        return lo
    if val > hi:
        return hi
    return val
```

### Type inference

Annotations may be omitted. For an **outlined** (non-`@inline`) function, the compiler infers
the missing parameter and return types from call-site evidence, default values and the return
expressions, joining them with a safe integer-widening rule. This is what stops a wide argument
from being silently truncated through an 8-bit default:

```python
def scale(v, k):          # both params and the return type are inferred
    return v * k

x: uint16 = 300
r: uint16 = scale(x, 2)   # 600 — inferred as uint16, not truncated to uint8
```

`@inline` functions are left alone: they keep their compile-time polymorphism and are
re-specialized at each call site. Overloaded names are also untouched.

Local variables follow the same principle — an unannotated local takes its type from the
initializer:

```python
x = get_count()   # uint16, from the callee's return type
y = 300           # wide enough to hold 300, not a truncated uint8
```

### `@inline`

Marks a function for zero-cost inline expansion at every call site. No stack frame is allocated;
the body is emitted in-place. Ideal for small helper functions and ZCA class methods.

```python
@inline
def nibble_to_hex(n: uint8) -> uint8:
    if n < 10:
        return n + 48    # '0'
    return n + 55        # 'A'
```

**Constraints:**
- Inline functions containing `asm()` with labels must delegate asm to a non-inline sub-helper
  (labels would duplicate at multiple call sites).
- No recursion inside `@inline` functions.

### `@interrupt(vector)`

Declares an ISR. The compiler emits `ISR(vector)` in assembly. All registers used inside the ISR
are automatically saved/restored.

```python
@interrupt(0x0002)    # INT0 on ATmega328P
def on_button():
    global count
    count += 1
```

Global variables written from an ISR must be declared `global` inside the ISR. The compiler
detects globals shared between an ISR and main code and treats them as volatile automatically —
on AVR it may also promote small ones into the `GPIOR0`-`GPIOR2` registers for single-instruction
access. Multi-byte values still need an explicit critical section (disable interrupts around the
read) if you need the read to be atomic.

### `@property` / `@name.setter`

Supported inside classes. Compile-time expansion only — no descriptor protocol at runtime.

```python
class Sensor:
    @property
    def value(self) -> uint8:
        return self._raw

    @value.setter
    def value(self, v: uint8):
        self._raw = v
```

### Generators — `yield`

A top-level `def` containing `yield` is lowered at compile time to a zero-cost **state-machine
class**: no heap, no coroutine frame, no interpreter. The generated object exposes `poll()`,
which returns `2` when a value was yielded, `1` while the machine is still working, and `0`
when the generator is exhausted; the yielded value is available as `._value`.

You rarely touch that protocol directly, because `for x in gen(...)` desugars to a poll loop
with Python-exact `break` and `continue` semantics — including abandoning the generator
mid-iteration:

```python
def powers(n: uint32):
    p: uint32 = 1
    k: uint32 = 0
    while k < n:
        yield p
        p = p * 2
        k = k + 1


def main():
    total: uint32 = 0
    for v in powers(4):        # 1, 2, 4, 8
        total = total + v
    print(f"S:{total}")        # S:15

    found: uint32 = 0
    for w in powers(10):
        if w > 4:
            found = w
            break              # generator abandoned mid-iteration
    print(f"F:{found}")        # F:8
```

**Limits:** `yield` is only allowed in a top-level `def` — not inside an `@inline` function and
not inside a method. `yield` as an *expression* (`x = yield v`, i.e. `send()`) is not supported.

### `async` / `await`

`async def` compiles to the same zero-cost state machine as a generator — there is no event
loop, no heap and no interpreter. `import asyncio` is required (mirroring how CPython pairs the
keywords with the runtime), and the awaitables are `asyncio.sleep(seconds)` and
`asyncio.sleep_ms(ms)`, which lower to non-blocking waits against the monotonic hardware tick
counter.

`await` may appear **anywhere in the body**: inside `if` / `elif` / `else`, inside
`while <cond>` and `for i in range(...)` at any nesting depth, and alongside `break` /
`continue`. A `return expr` from a coroutine surfaces on the object as `._value`. Locals are
promoted to state-machine fields only when they survive a suspension.

```python
import asyncio
from pymcu.types import uint32


async def worker(n: uint32):
    total: uint32 = 0
    for i in range(n):
        if i == 2:
            await asyncio.sleep_ms(2)
            total = total + 10
        else:
            await asyncio.sleep_ms(1)
            total = total + 1
    return total


async def pinger():
    k: uint32 = 0
    while k < 3:
        await asyncio.sleep_ms(1)
        k = k + 1
        if k == 2:
            continue
    print("P")


def main():
    w = worker(4)
    p = pinger()
    asyncio.gather(w, p)       # drive both until they finish
    r: uint32 = w._value       # the coroutine's return value
    print(f"T:{r}")
```

**Executors:** `asyncio.run(coro)` drives a single coroutine to completion;
`asyncio.gather(a, b)` drives two concurrently. The arity of `gather` is fixed at compile time
because coroutine state machines have no runtime representation to store in an array — nest
gathers or write an explicit `poll()` loop for more tasks:

```python
def main():
    a = blink_a()
    b = blink_b()
    while True:                # a hand-written cooperative executor
        a.poll()
        b.poll()
```

**Limits:** you cannot `await` another coroutine or a future — call it and poll it, or restructure
with `asyncio.gather`. `await` as an expression is not supported.

---

## 7. Classes and Inheritance

### ZCA (Zero-Cost Abstraction) classes

Classes decorated (or called) with `@inline` are statically flattened. No SRAM is used for the
instance — all methods expand inline and member accesses resolve to registers or named globals.
The [inheritance / ZCA example](/examples/inheritance-zca/) walks through a worked one.

```python
class LED:
    @inline
    def __init__(self, pin: str):
        self._pin = Pin(pin, Pin.OUT)

    @inline
    def on(self):
        self._pin.high()

    @inline
    def off(self):
        self._pin.low()
```

### Single-level inheritance

```python
class Base:
    @inline
    def init(self):
        self._x: uint8 = 0

class Derived(Base):
    @inline
    def run(self):
        self.init()
        self._x += 1
```

`super()` works on a single-level hierarchy, and `@staticmethod` is supported. So are the
operator dunder methods — `__add__`, `__sub__`, `__mul__`, `__len__`, `__contains__`,
`__getitem__`, `__setitem__` and the comparison and bitwise dunders — all expanded at compile
time.

**Not supported:** multiple inheritance, `isinstance()` / `type()`, metaclasses, `dataclass` /
`namedtuple`, and `__repr__` / `__str__` (there is no runtime string formatting of an object).
Virtual calls are devirtualized at compile time; a call the compiler cannot resolve statically
is a diagnostic, not a runtime vtable lookup.

### `Enum` classes (zero-cost)

Classes that inherit from `Enum` or `IntEnum` are flattened to compile-time integer constants.
No SRAM is allocated. Use them to name states, modes, or error codes:

```python
from enum import Enum

class State(Enum):
    IDLE    = 0
    RUNNING = 1
    ERROR   = 2

state: uint8 = State.IDLE

match state:
    case State.IDLE:
        init()
    case State.RUNNING:
        run()
    case State.ERROR:
        handle_error()
```

Enum fields are accessible as `ClassName.FIELD` anywhere in the file. No `import` of `Enum`
is needed if the class is defined in the same file — the compiler recognises the `(Enum)` base
directly.

---

## 8. Imports and Modules

```python
import foo
from foo import Bar
from foo import Bar as B
from foo.sub import helper
```

- **Relative imports** (`from . import foo`) are supported.
- **`__init__.py`** re-exports work at compile time.
- **Third-party PyPI packages** are not supported — only the `pymcu` stdlib and the compat
  packages (`pymcu-circuitpython`, `pymcu-micropython`).
- **Circular imports** are not supported.
- **`import X as Y`** — fully supported.
- **`importlib` / dynamic imports** — not supported; there is no runtime module loader.
- **C / C++ interop** — available on AVR via `@extern` and `[tool.pymcu.ffi]` in
  `pyproject.toml`, which is how you pull in an existing Arduino library. Not yet on the ARM or
  PIC backends.

---

## 9. MCU-Specific Extensions

### `asm("instruction")`

Emits a single assembly instruction verbatim. The instruction is target-specific. String must
be a compile-time constant.

```python
asm("cli")    # disable interrupts (AVR)
asm("sei")    # enable interrupts (AVR)
asm("nop")    # no-operation
```

On the ARM targets `asm()` also accepts operands with textual constraints (`"=r"`, `"0"`, …),
which lets an assembly block read and write Python variables. `"+r"` read-write constraints are
not supported — use the `"=r"` / `"0"` tied-operand form instead.

### `delay_ms(n)` / `delay_us(n)`

Busy-wait delays. `n` may be a runtime value, and no hardware timer is consumed on AVR or PIC.
On AVR the delay loop is calibrated to the configured clock (16 MHz on an Arduino Uno); on PIC
it is calibrated for 4 / 8 / 16 / 20 MHz. On RP2040 and RP2350 the delays poll the free-running
1 MHz hardware TIMER instead, so they are accurate regardless of the CPU clock.

```python
delay_ms(500)          # 500 ms busy-wait
delay_us(10)           # 10 µs busy-wait
delay_ms(interval)     # runtime variable is OK
```

### `ptr(addr)` / `ptr[T]`

Creates a typed pointer to a memory-mapped address. Used for direct register access.

```python
from pymcu.types import ptr, uint8

SREG: ptr[uint8] = ptr(0x5F)    # Status register (ATmega328P)
SREG[7] = 1                      # sei — enable global interrupts
saved: uint8 = SREG.value        # read whole register
```

### `const[T]`

Compile-time constant marker. The compiler enforces that the value is statically known.

```python
from pymcu.types import const, uint8

BAUD: const[uint16] = 9600
TABLE_SIZE: const[uint8] = 16
```

### `__CHIP__` — Conditional compilation

`__CHIP__` is a special compile-time object with attributes `arch`, `name`, `ram_size`, and
`flash_size`. Comparisons against `__CHIP__` attributes in `if` / `match` are evaluated at
compile time and dead branches are eliminated.

```python
from pymcu.exceptions import CompileError

match __CHIP__.arch:
    case "avr":
        init_avr()
    case "arm":
        init_arm()
    case "pic14":
        init_pic14()
    case _:
        raise CompileError("Unsupported architecture")
```

---

## 10. Standard Library Overview

:::caution[Prefer the compat APIs during the alpha]
`pymcu.hal.*` is the lowest-overhead API, but it may change between alpha releases. For
application code, prefer the MicroPython (`machine`, `utime`) or CircuitPython (`board`,
`digitalio`, `busio`, …) compat packages — see [/compat/micropython/](/compat/micropython/).
They compile to byte-for-byte equivalent firmware.
:::

The native HAL modules below are **facades**: `pymcu.hal.spi` and friends dispatch on `__CHIP__` at
compile time and re-export the backend implementation for the target you are building for.
GPIO, UART, SPI, I2C, PWM and ADC are available on AVR and on both ARM targets
(RP2040 / RP2350); DMA and the `@rp2.asm_pio` PIO DSL are ARM-only. The register-level detail in
the snippets below is written for the ATmega328P — the API is the same on the other targets, the
constructor arguments follow that target's conventions.

### `pymcu.hal.gpio` — GPIO

```python
from pymcu.hal.gpio import Pin

led = Pin("PB5", Pin.OUT)       # output pin
btn = Pin("PD2", Pin.IN, pull=Pin.PULL_UP)   # input with pull-up

led.high()                       # set high
led.low()                        # set low
led.toggle()                     # toggle
led.value(1)                     # write value
v: uint8 = led.value()           # read value
led.irq(Pin.IRQ_FALLING)         # configure interrupt (setup only)
w: uint16 = led.pulse_in(1, timeout_us=1000)   # measure pulse width
```

**Mode constants:** `Pin.IN`, `Pin.OUT`, `Pin.OPEN_DRAIN`
**Pull constants:** `Pin.PULL_UP`, `Pin.PULL_DOWN`
**IRQ constants:** `Pin.IRQ_FALLING`, `Pin.IRQ_RISING`, `Pin.IRQ_LOW_LEVEL`, `Pin.IRQ_HIGH_LEVEL`

### `pymcu.hal.uart` — UART

```python
from pymcu.hal.uart import UART

uart = UART(9600)
uart.write(65)                  # send byte
b: uint8 = uart.read()          # receive byte (blocking)
uart.write_str("hello")         # flash string → UART
uart.println("done")            # write_str + newline
uart.print_byte(42)             # print decimal uint8 + newline
```

### `pymcu.hal.adc` — ADC

```python
from pymcu.hal.adc import AnalogPin

adc = AnalogPin("PC0")   # ADC0 on the ATmega328P (Arduino "A0" header pin)
adc.start()
# poll ADCSRA[6] (ADSC) to wait for conversion, then read ADCL/ADCH
```

The channel is an **AVR pin name**, not an Arduino header label: `"PC0"`–`"PC5"`, plus the
internal `"TEMP"` sensor, `"VBG"` (1.1 V bandgap) and `"ADC8"`. An unrecognised string such as
`"A0"` is not rejected — it silently falls back to ADC0. Use the board module
(`from pymcu.boards.arduino_uno import A0`) if you want to think in Arduino labels.

### `pymcu.hal.timer` — Timer

```python
from pymcu.hal.timer import Timer

# n is a compile-time constant — the compiler emits only the code for the selected timer
t0 = Timer(0, 64)     # Timer0 (8-bit), prescaler 64 — AVR + PIC
t1 = Timer(1, 1024)   # Timer1 (16-bit), prescaler 1024 — ATmega328P
t2 = Timer(2, 256)    # Timer2 (8-bit async), prescaler 256 — ATmega328P

t0.start()            # enable overflow interrupt
t0.stop()             # disable overflow interrupt + stop clock
t0.clear()            # reset counter to 0
ovf: uint8 = t0.overflow()   # poll overflow flag (1 if fired)
```

Use `@interrupt(vector)` to handle the overflow in an ISR:

```python
@interrupt(0x0010)    # Timer0 OVF (ATmega328P)
def on_tick():
    global ticks
    ticks += 1
```

### `pymcu.hal.pwm` — PWM

```python
from pymcu.hal.pwm import PWM

pwm = PWM("PD6", duty=128)   # OC0A, 50% duty cycle
pwm.start()
pwm.set_duty(200)
pwm.stop()
```

### `pymcu.hal.spi` — SPI (AVR, RP2040, RP2350)

On AVR the hardware SPI peripheral is configured from the chip defaults; on the ARM targets the
constructor takes the bus clock in Hz.

```python
from pymcu.hal.spi import SPI

# AVR
spi = SPI()
with spi:
    result: uint8 = spi.transfer(0xAA)   # select() before, deselect() after
    spi.write(0x55)

# RP2040 / RP2350 — SPI0 at 1 MHz
spi = SPI(1_000_000)
spi.transfer(0xAB)
```

`pymcu.hal.softspi.SoftSPI` provides a bit-banged bus on any pins.

### `pymcu.hal.i2c` — I2C / TWI (AVR, RP2040, RP2350)

```python
from pymcu.hal.i2c import I2C

# AVR (TWI)
i2c = I2C()
if i2c.ping(0x68):           # check if device responds
    with i2c:
        i2c.write(0xD0)      # address + write (start() before, stop() after)
        i2c.write(0x3B)      # register

# RP2040 / RP2350 — I2C0 at 100 kHz
bus = I2C(100_000)
bus.write_to(0x3C, 0x12)
```

`pymcu.hal.softi2c.SoftI2C` provides a bit-banged bus on any pins.

### `pymcu.hal.dma` — DMA (RP2040, RP2350)

Direct memory access channels are available on the ARM targets only.

### `pymcu.time` — Delays

```python
from pymcu.time import delay_ms, delay_us

delay_ms(1000)     # 1 second
delay_us(100)      # 100 µs
```

### `pymcu.drivers.dht11` — DHT11 sensor

```python
from pymcu.drivers.dht11 import DHT11

sensor = DHT11("PD4")
result: uint16 = sensor.read()    # high byte = humidity, low byte = temp
# result == 0xFFFF means read error
```

### `pymcu.boards.arduino_uno` — Arduino Uno pin names

```python
from pymcu.boards.arduino_uno import D13, D2, A0, LED_BUILTIN

led = Pin(LED_BUILTIN, Pin.OUT)    # PB5
```

Further modules — EEPROM, watchdog, power management, WiFi (Pico 2 W / RP2350 only) and the
device drivers (DS18B20, HD44780 LCD via `pymcu.drivers.lcd`, SSD1306 OLED, MAX7219 8x8 LED
matrix, BMP280, WS2812) — are documented under [/stdlib/](/stdlib/). There is no LM35 driver:
read an LM35 with `AnalogPin`.

---

## 11. Comparison: PyMCU vs Python vs MicroPython vs CircuitPython

| Concept | Python 3 | MicroPython | CircuitPython | PyMCU |
|---|---|---|---|---|
| Integer type | `int` (arbitrary precision) | `int` (30-bit on most ports) | `int` (30-bit) | `uint8/16/32`, `int8/16/32` — annotation required |
| Float | `float` (64-bit IEEE) | `float` (32-bit) | `float` (32-bit) | `float` (32-bit IEEE) — soft-float on AVR, bootrom fast-float on RP2040, FPU on RP2350 |
| Heap / GC | ✅ `malloc` + GC | ✅ small heap + GC | ✅ small heap + GC | No general heap — fixed arrays, plus a bounded `list[T]` arena on AVR |
| GPIO | `RPi.GPIO` or similar | `machine.Pin(13, OUT)` | `digitalio.DigitalInOut(board.D13)` | `Pin("PB5", Pin.OUT)` |
| GPIO via compat | — | `from machine import Pin` | `import digitalio` | `pymcu-micropython` / `pymcu-circuitpython` |
| UART | `pyserial` | `machine.UART(1, 9600)` | `busio.UART(TX, RX, baudrate=9600)` | `UART(9600)` |
| ADC | — | `machine.ADC(Pin(26))` | `analogio.AnalogIn(board.A0)` | `AnalogPin("PC0")` |
| Delay | `time.sleep(s)` | `utime.sleep_ms(n)` | `time.sleep(s)` | `delay_ms(n)` |
| Constant | — | `micropython.const(0xFF)` | — | `const[T]` annotation |
| Zero-cost fn | — | `@micropython.native` | — | `@inline` |
| ISR | `signal` module | `Pin.irq()` callback | — | `@interrupt(vector)`, or `Pin.irq(handler, trigger)` via the compat API |
| Inline asm | `ctypes` | `@micropython.viper` | — | `asm("instr")` (with operands on ARM) |
| Type annotations | Optional (hints only) | Optional (hints only) | Optional (hints only) | **Required** — drives codegen |
| `for` loop | ✅ | ✅ | ✅ | ✅ (`range(n)`, arrays, `enumerate`) |
| `match / case` | ✅ (3.10+) | ❌ | ❌ | ✅ |
| Short-circuit `and/or` | ✅ | ✅ | ✅ | ✅ |
| `try / except` | ✅ | ✅ | ✅ | ✅ on AVR + ARM — zero-cost flag propagation, no `jmp_buf` (not on PIC) |
| `f"str {x}"` | ✅ | ✅ | ✅ | ✅ streamed (`print(f"...")`) and as a value (fixed buffer); no float interpolation in the value form |
| `list` / `dict` | ✅ | ✅ | ✅ | Fixed arrays + bounded `list[T]` (AVR); closed `dict`/`set` literals as compile-time tables + `FixedDict` — no growing hash table |
| Generators (`yield`) | ✅ | ✅ | ✅ | ✅ lowered to a state machine; top-level `def` only |
| Classes | ✅ full OOP | ✅ | ✅ | ZCA `@inline` only; no vtable |
| Multiple inheritance | ✅ | ✅ | ✅ | Not supported |
| `async / await` | ✅ | ✅ | ✅ | ✅ compiled to a state machine — `await asyncio.sleep_ms`, `asyncio.run` / `gather`; cannot await another coroutine |

---

## 12. Migration Guide

### CircuitPython → PyMCU

Install the `pymcu-circuitpython` compat package and add to `pyproject.toml`:

```toml
[tool.pymcu]
stdlib = ["circuitpython"]
```

Then most CircuitPython code compiles unchanged:

```python
# CircuitPython code — works as-is with pymcu-circuitpython
import board
import digitalio
import time

led = digitalio.DigitalInOut(board.LED)
led.direction = digitalio.Direction.OUTPUT

while True:
    led.value = True
    time.sleep(0.5)
    led.value = False
    time.sleep(0.5)
```

CircuitPython's `time` module has only `sleep(seconds: float)`, `monotonic()` and
`monotonic_ns()` — there is no `sleep_ms` / `sleep_us` here (those are MicroPython's `utime`).

**Things that still need changes:**
- Type annotations: add `x: uint8 = 0` where you need a specific width. Unannotated locals and
  outlined `def` signatures are inferred, but the annotation is what pins the width.
- Growing containers: an unbounded `dict` / `set` has no equivalent. Use a closed literal as a
  lookup table, `pymcu.collections.FixedDict(capacity)`, or a `list[T]`.
- `str` methods (`split`, `join`, `format`) and string concatenation: use f-strings or separate
  writes.
- `try / except` works on AVR and ARM but not on PIC — port those paths to return codes.
- Closures capturing mutable variables: pass the captured values as explicit parameters.

Run [`pymcu lint`](/driver/#pymcu-lint-path) on the port first — it flags the constructs PyMCU
cannot compile, with a severity and a suggested rewrite for each finding.

### MicroPython → PyMCU

Install the `pymcu-micropython` compat package:

```toml
[tool.pymcu]
stdlib = ["micropython"]
```

```python
# MicroPython code — works with pymcu-micropython
from machine import Pin, UART
from utime import sleep_ms

led = Pin(13, Pin.OUT)   # D13 by Arduino Uno number
uart = UART(0, 9600)

while True:
    led.value(1)
    sleep_ms(500)
    led.value(0)
    sleep_ms(500)
```

**Things that still need changes:**
- Integer pin numbers map to Arduino Uno digital pin numbers via the compat package.
- `micropython.const(0xFF)` is treated as an integer literal.
- `Pin.irq(handler, trigger)` **is** supported for external pin interrupts — the handler must be
  a named function known at compile time, not a runtime value or a capturing lambda. The
  compiler synthesizes the ISR wrapper and inlines the handler with the pin's compile-time
  constants. `@interrupt(vector)` remains available for direct vector control.
- `machine.Timer(id, period=..., callback=...)` is supported (CTC mode) with the same
  compile-time-constant callback rule.
- `read_u16()` on ADC returns a 16-bit value (0-1023 scaled to 0-65535).
- `pymcu lint` reports whatever else in the port will not compile.

### Plain Python → PyMCU

The biggest changes when porting generic Python:

1. **Annotate your types** — inference fills in what you leave out, but the annotation is what
   fixes a value's storage width, and every size must be known at compile time.
2. **Bound your containers** — a growing `dict` or `set` has no lowering. Use a closed
   `dict` / `set` literal as a compile-time lookup table, `FixedDict(capacity)` for the mutable
   case, `list[T]` for an appendable sequence on AVR, or a fixed `uint8[N]` array.
3. **`float` works** — IEEE-754 single precision on AVR, RP2040 and RP2350. It is not free
   (~200-400 cycles per operation on AVR), so integers or fixed-point are still the right call
   on a hot path, and `/` always yields a float — use `//` when you want an integer.
4. **`try / except / raise` works on AVR and ARM** — zero-cost on the happy path. On PIC, and
   anywhere a status code reads more clearly, return a sentinel and dispatch with `match / case`.
5. **f-strings work** — `print(f"val={x}")` streams directly, and `s = f"val={x}"` builds a
   fixed buffer. Only float interpolations in the value form are missing.
6. **Replace `time.sleep(s)`** — use `delay_ms(n)` or `delay_us(n)`, or
   `await asyncio.sleep_ms(n)` inside a coroutine.
7. **Drop closures over mutable state** — pass the captured values as explicit parameters.
   `nonlocal` inside a nested `@inline` function is fine; a capturing closure is not.
8. **Drop reflection** — `getattr` / `setattr` / `eval` / `exec` / `isinstance` have no runtime
   type information to work with.

---

## Getting Help

- [Limitations](/limitations/) — the full list of unsupported features and the idiomatic
  alternative for each.
- [Roadmap](/roadmap/) — what has shipped and what is planned.
- [Open an issue](https://github.com/PyMCU/PyMCU/issues) with your source snippet and the
  compiler error. Alpha error messages still have rough edges; a bug report genuinely helps.
