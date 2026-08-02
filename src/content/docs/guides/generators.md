---
title: Generators
description: How to write a yield generator in PyMCU, consume it with a for loop, break out early, and what the compiler builds instead of a heap object.
---

A generator lets you produce a sequence one item at a time instead of materialising a list.
On a microcontroller that matters twice over: there is no heap to put the list in, and the
values you skip are values you never computed.

Generators are a **compiler feature**. They behave identically whether you import
`machine`, `board` or `pymcu.hal.*` — there is no MicroPython or CircuitPython variant of
this page.

## Yield a sequence without a list

Write an ordinary `def` that contains `yield`, and consume it with a `for` loop:

```python
from pymcu.types import uint16, uint32
from pymcu.hal.uart import UART
from pymcu.time import delay_ms


def powers(n: uint32):
    p: uint32 = 1
    k: uint32 = 0
    while k < n:
        yield p
        p = p * 2
        k = k + 1


def main():
    uart = UART(9600)
    uart.println("GEN")

    total: uint32 = 0
    for v in powers(4):
        t: uint16 = v
        print(t)
        total = total + v
    print(f"S:{total}")
```

No `async`, no `import asyncio`, no runtime: a generator has no time source and needs
nothing beyond the compiler.

## What you should see

Watch UART0 at 9600 baud (the RP2040 version of the same program uses 115200):

```
GEN
1
2
4
8
S:15
```

## Stop early with `break`

`break` abandons the generator mid-iteration, exactly as in CPython — the remaining values
are never produced:

```python
    found: uint32 = 0
    for w in powers(10):
        if w > 4:
            found = w
            break
    print(f"F:{found}")
```

`powers(10)` would have yielded ten values. The loop stops at the first one greater
than 4, so only four are ever computed:

```
F:8
```

`continue` works too, and advances to the next yielded value.

## What the compiler builds instead

A function containing `yield` is lowered to the **same zero-cost state-machine class** an
`async def` produces: locals that must survive a suspension become fields, and the body is
split into numbered states behind a `poll()` method. `poll()` reports what happened:

| `poll()` returns | Meaning |
|---|---|
| `2` | The generator yielded — the value is in `._value` |
| `1` | An internal state transition, no value this time |
| `0` | The generator is finished |

Your `for` loop desugars to an explicit poll loop over that protocol:

```python
__gen = powers(4)
while True:
    __gr = __gen.poll()
    if __gr == 0:
        break            # done
    if __gr != 2:
        continue         # internal transition, no value
    v = __gen._value
    ...                  # your loop body, with your own break/continue
```

Because your `break` and `continue` land on that `while`, they keep exact Python
semantics. There is no heap allocation, no iterator object and no interpreter — the whole
thing is straight-line machine code plus a state variable.

## What is not supported yet

| Not supported | Do this instead |
|---|---|
| `yield` inside an `@inline` function | Make it a plain `def` — a generator is compiled once as a state machine, which is incompatible with being inlined at each call site |
| `yield` inside a method | Use a module-level generator function and pass what it needs as arguments |
| `yield` as an expression (`x = yield v`) | Not lowered. Generators are one-directional: they produce values, they do not receive them |

See [Limitations](/limitations/) for the full list of unsupported Python features, and the
[Roadmap](/roadmap/) for what is planned next.

## Where this is tested

This guide is built from the `generators` fixture in the AVR integration suite
(`tests/integration/fixtures/generators/src/main.py`) and its ARM twin, the
`generators-rp2040` example. Both compile and run in CI, so the code above is exactly what
is verified — check there first if anything on this page looks out of date.

## See also

- [Async and await](/guides/async/) — the same state machine, driven by a time base
- [f-strings](/guides/f-strings/) — the `f"S:{total}"` formatting used above
- [UART](/stdlib/uart/) — the output sink
