---
title: Zero-cost classes
description: "How PyMCU flattens a class at compile time, what that design actually costs you, and how outlining shares one method body across many instances."
---

A class on a microcontroller normally means three things you cannot afford: a heap to
allocate the instance in, a per-instance struct in SRAM, and a vtable pointer chased on
every method call. PyMCU's answer is to make the class disappear before the firmware
exists.

A **zero-cost abstraction (ZCA)** class is flattened by the compiler. Its fields become
registers, fixed SRAM slots or baked constants; its methods become either inlined code or
one shared subroutine; and no object exists at runtime. You write `led.on()` and the
firmware contains a single `SBI` instruction.

Classes are a **compiler feature**. They behave identically whether you import `machine`,
`board` or `pymcu.hal.*` — there is no MicroPython or CircuitPython variant of this page.

## Write a class, get no object

```python
from pymcu.types import uint8, inline
from pymcu.hal.gpio import Pin


class GPIODevice:
    @inline
    def __init__(self, pin_name):
        self._pin = Pin(pin_name, Pin.OUT)

    @inline
    def on(self):
        self._pin.high()

    @inline
    def off(self):
        self._pin.low()

    @inline
    def read(self) -> uint8:
        return self._pin.value()


def main():
    led = GPIODevice("PB5")
    led.on()
    r: uint8 = led.read()
    led.off()
```

`led` never becomes a value. `"PB5"` is folded through the constructor into a port and bit
number, `led.on()` expands to the `_pin.high()` body at the call site, and that in turn
expands to a single bit-set on `PORTB`. The result is:

- **zero SRAM** — there is no instance struct, and no stack frame for the call
- **no vtable** — the target of every call is known statically
- **no allocation** — nothing is constructed at runtime, so nothing can fail to construct

This is the `inheritance-zca` example, which the AVR suite compiles and runs; see
[the worked walkthrough](/pymcu/examples/inheritance-zca/).

## What it costs

The site elsewhere tells you ZCA classes are free. They are free at runtime. They are not
free in what you are allowed to write, and the constraints are worth knowing before you
design around them.

**Constructor arguments have to be knowable when the method is inlined.** The HAL classes
spell this out in their signatures. The AVR `Pin` is
`__init__(self, name: str, mode: const[uint8], pull: const[uint8] = -1, ...)` — a `const[T]`
parameter is a compile-time constant by definition, and the pin `name` drives a `match` over
port letters, so it has to fold too. (The RP `Pin` is friendlier: its `pin` number may be a
runtime value, though a constant one still folds the address arithmetic away entirely.) Your
*own* classes are less restricted — see outlining below — but any class whose methods are
`@inline` bakes its fields in as constants, and a field that cannot be folded to a constant
cannot be baked.

**There is no runtime polymorphism.** Virtual calls are devirtualized at compile time. A
call the compiler cannot resolve statically is a build-time diagnostic, not a vtable
lookup that happens to be slow. `isinstance()`, `type()` and `__repr__` do not exist,
because there is no type tag and no runtime string formatting of an object.

**Arrays of instances are a special case, not the general one.** An array of `@inline` ZCA
instances works by compile-time unrolling — `[Led(p) for p in ("PD5", "PD6", "PD7")]` is
three separate flattened objects wearing a list's clothing, and the tuple has to be a
compile-time constant. A genuine runtime-indexed `Class[N]` is possible, but only for the
boxed classes described below.

**And the big one: flash grows with every call site.** Inlining duplicates the body. One
`@inline` method called from three places emits three copies. For `led.high()` that is a
win — one instruction beats a `CALL`/`RET` pair. For a DHT11 bit-bang read protocol driving
three sensors, it is a disaster.

## Share one body across instances

That last cost is what RFC 0001 (`docs/rfcs/0001-zca-runtime-state.md` in the compiler
repository) set out to fix, and the fix is **outlining**: compile the method *once* as a
real subroutine whose parameters are the instance's fields, then call it with each
instance's values.

Write the class the natural way and leave `@inline` off the method:

```python
from pymcu.types import uint8
from pymcu.hal.uart import UART


class Counter:
    def __init__(self, base: uint8):     # runtime field, not const
        self.base = base

    def stepped(self, k: uint8) -> uint8:
        return self.base + k


def main():
    uart = UART(9600)
    uart.println("OL")

    a = Counter(65)
    b = Counter(97)

    uart.write(a.stepped(1))   # 'B'
    uart.write(b.stepped(2))   # 'c'
```

Expected UART output at 9600 baud:

```
OL
Bc
```

Exactly **one** `Counter_stepped` body exists in the firmware, and two distinct instances
drive it — the field travels in a register alongside the user's argument. That is the
`zca-outline` fixture, and the test asserts the single label as well as the output.

Since RFC 0001 F4, this is the **default**. A class method without `@inline` is outlined
automatically whenever the compiler can prove it is safe to: the body must touch `self`
only as `self.<field>`, with every field a scalar. A sibling call `self.helper(n)` is
allowed and forwards the same fields (fixture `zca-outline-selfcall`). Anything the
analysis does not recognise falls back to the old force-inline behaviour, conservatively.

So `@inline` on a method finally means something. **With** it, you get collapse-to-constant
and zero call overhead. **Without** it, you get one shared copy.

### The number that matters

The `zca-outline-dht` fixture is a DHT-style driver with the whole bit-bang protocol
written directly in `read(self)` over `self.pin`, driving three sensors on pins 2, 3
and 4:

| Method decorated | Firmware size |
|---|---|
| `@inline` — protocol duplicated per sensor | **3596 B** |
| outlined — one shared `DHT_read` plus three `CALL`s | **1268 B** |

2328 bytes saved, a 2.8x reduction, and the gap widens linearly with every sensor you add.

### `@outline` — the explicit override

```python
from pymcu.types import outline
```

`@outline` (defined in `lib/src/pymcu/types.py`) forces sharing. Because outlining is now
automatic for anything provably safe, you rarely need it — the four RFC fixtures were
rewritten without the decorator and produce byte-identical firmware. It survives as the
escape hatch for the case where the safety analysis is too conservative and force-inlines
a body you know is shareable. Think of it as the analogue of `#[inline(never)]`.

## Keep several instances around

A class with **one** scalar field needs no memory at all: the field *is* the instance, and
a non-`@inline` factory can return it packed into the return register.

```python
class Sensor:
    def __init__(self, pin: uint8):
        self.pin = pin

    def read(self) -> uint8:
        return self.pin * 2


def make_sensor(base: uint8) -> Sensor:      # not @inline
    return Sensor(base + 1)


def main():
    uart = UART(9600)
    s = make_sensor(20)   # handle = 21
    t = make_sensor(40)   # handle = 41
    uart.write(s.read())  # 42
    uart.write(t.read())  # 82
```

From the `zca-factory-b` fixture. Before this existed, a non-`@inline` factory returning a
ZCA failed at link time with `undefined reference to <var>_read`, because there was no
value to return.

With **two or more** fields the instance no longer fits in a register, so it is *boxed*:
the compiler reserves a fixed SRAM slot (no heap — one static reservation per declared
instance), the constructor stores the fields into it, and the shared method takes a `self`
pointer and reads each field at its byte offset. `zca-slot` proves two `Sensor(pin, gain)`
instances get two distinct 2-byte slots and one shared `Sensor_read`. `zca-factory-slot`
extends that across a function boundary: the *caller* allocates the slot and passes its
address as a hidden argument, so two factory calls produce two independent instances with
no aliasing.

Boxed classes are also the ones that support a real runtime-indexed array:

```python
sensors: Sensor[3]
sensors[0] = Sensor(3, 4)
sensors[1] = Sensor(5, 7)
sensors[2] = Sensor(2, 9)

i: uint8 = 0
while i < 3:
    uart.write(sensors[i].read())   # runtime index -> the one shared body
    i = i + 1
```

`Sensor[3]` reserves `3 * stride` contiguous bytes; `sensors[i]` computes
`base + i * stride` and hands that to the same `Sensor_read`. Output: `12`, `35`, `18`.
That is the `zca-array` fixture — the "several DHT sensors" case with one copy of the code.

Boxing is opt-in and narrow by design: a class becomes a slot class only if it has at least
two fields **and** an outlined method. Multi-field HAL classes stay collapsed, which is
what keeps `Pin(13)` costing nothing.

## Inheritance, properties and operators

Single-level inheritance works, including `super()`. The derived class inherits the base's
fields and methods and can add its own:

```python
class LedBase:
    def __init__(self, pin: Pin):
        self._pin = pin           # a machine.Pin stored in a field

    def turn_on(self):
        self._pin.high()          # dispatch on an INHERITED field


class Led(LedBase):
    def turn_off(self):
        self._pin.low()

    def is_on(self) -> int:
        return self._pin.value()  # value-returning nested dispatch
```

That is `nested-zca-rp2350`, which runs on a Cortex-M33 and drives GP25 so the emulator can
see the nested dispatch produce real MMIO. A class-typed field also resolves through a
facade re-export — `facade-singleton-rp2350` covers the module-level singleton case, where
`radio.light()` must find the concrete class rather than a name invented from the alias.

Note the interaction with outlining: a field holding another ZCA instance is *not* a scalar,
so a method that uses one stays force-inlined. There is nothing to pass as a parameter — a
`Pin` is only its constant pin name.

`@property` and `@name.setter` expand at compile time, and the setter accepts a runtime
value:

```python
class Led:
    @property
    def level(self) -> uint8:
        return 0

    @level.setter
    def level(self, v: uint8):
        if v:
            self._pin.high()
        else:
            self._pin.low()


for bit, led in enumerate(leds):
    led.level = (pattern >> bit) & 1     # runtime value into the setter
```

From `zca-instance-array`, which also exercises the list-comprehension construction and
`for`/`enumerate` over the resulting array.

Operator dunders are expanded the same way — `__add__`, `__sub__`, `__mul__`,
`__floordiv__`, `__mod__`, the bitwise and comparison dunders, plus `__neg__`, `__invert__`,
`__len__`, `__contains__`, `__getitem__` and `__setitem__`:

```python
class Vec:
    x: uint8
    y: uint8

    @inline
    def __init__(self, xv: uint8, yv: uint8):
        self.x = xv
        self.y = yv

    @inline
    def __add__(self, other: uint8) -> uint8:
        return Vec(self.x + other.x, self.y + other.y)

    @inline
    def __len__(self) -> uint8:
        return 2

    @inline
    def __contains__(self, val: uint8) -> uint8:
        if val == self.x:
            return 1
        if val == self.y:
            return 1
        return 0
```

`v1 + v2`, `len(v)`, `3 in v` and `v[1]` all become straight-line arithmetic. Fixture:
`dunder-ops`.

## Choosing between the two

| You want | Do this | You get |
|---|---|---|
| One hot singleton — an LED, a UART, a register wrapper | `@inline` methods | Fields baked as constants, no call at all |
| The same driver logic over N devices | Leave `@inline` off | One shared body, fields passed as arguments |
| A factory that returns a configured object | Leave `@inline` off the factory | Single field: register handle. Multiple: caller-allocated slot |
| A runtime-indexed collection | `Class[N]` on a two-or-more-field class | Contiguous slots, one shared method |
| To force sharing when the analysis is too cautious | `@outline` on the method | Explicit Model A |

## Limits

| Not supported | Why | Do this instead |
|---|---|---|
| Multiple inheritance | C3 linearization is a runtime concept | Single-level inheritance |
| Runtime polymorphism / vtable dispatch | Needs a vtable and heap class objects | `match` / `case` dispatch, or let the compiler devirtualize |
| `isinstance()` / `type()` | No runtime type tags | Not available |
| `__repr__` / `__str__` | No runtime string formatting of an object | `print()` the fields explicitly |
| `dataclass` / `namedtuple` | Metaclass plus heap | A hand-written ZCA class |
| An outlined method whose sibling call is overridden in a subclass | The shared body is compiled once with `self` bound to the defining class, so the sibling call binds statically | Mark the method `@inline` so it expands per call site |
| A method holding a class-typed field, shared across instances | A nested ZCA has no runtime value to pass as a parameter | It stays inlined; that is expected |

See [Limitations](/pymcu/limitations/) for the full picture and
[Language reference](/pymcu/language-reference/) for the exact accepted syntax.

## Where this is tested

This guide is built from the ZCA fixtures in the AVR integration suite
(`tests/integration/fixtures/`): `zca-outline`, `zca-outline-dht`, `zca-outline-selfcall`,
`zca-slot`, `zca-array`, `zca-factory`, `zca-factory-b`, `zca-factory-slot`,
`zca-instance-array` and `dunder-ops`, plus the `inheritance-zca` example; and from the ARM
examples `nested-zca-rp2350` and `facade-singleton-rp2350`. All of them compile and run in
CI, so the code above is exactly what is verified — check there first if anything on this
page looks out of date. The design rationale, including the size measurements quoted here,
lives in `docs/rfcs/0001-zca-runtime-state.md` in the compiler repository.

## See also

- [Language reference](/pymcu/language-reference/) — classes, inheritance and decorators in full
- [Limitations](/pymcu/limitations/) — what the Python subset does not accept
- [Inline assembly](/pymcu/guides/inline-asm/) — the other escape hatch from generated code
- [GPIO](/pymcu/stdlib/gpio/) — the `Pin` class every example above wraps
