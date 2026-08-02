---
title: Tuple Operations Example
description: Tuple literals, multi-return functions, unpacking and enumerate — all resolved at compile time.
---

Demonstrates tuple literals, multi-return functions, tuple unpacking, and `enumerate`.
These are language features, so they work on every backend — AVR, ARM (RP2040 / RP2350)
and PIC.

:::note[API-agnostic]
This example is pure language: tuples, multi-return and `enumerate` are compiler features
that behave identically whether you import `machine`, `board` / `digitalio` or
`pymcu.hal.*`. There is nothing to switch between, so this page has no API tabs.
:::

## Multi-return divmod

A function that returns a tuple and is unpacked at the call site must be marked
`@inline` — the tuple is destructured at compile time, so there is no runtime tuple to
return:

```python
from pymcu.types import uint8, inline

@inline
def divmod8(a: uint8, b: uint8) -> (uint8, uint8):
    q: uint8 = a // b
    r: uint8 = a - q * b
    return (q, r)

def main():
    q, r = divmod8(10, 3)    # q=3, r=1
    # q and r are allocated to registers — zero SRAM cost
```

The `-> (T1, T2)` annotation parses on a plain `def` as well, but unpacking its result with
`q, r = f()` outside an `@inline` function is a `CompileError` pointing at the assignment.

## Enumerate over an array

```python
from pymcu.types import uint8

def main():
    buf: uint8[4] = [10, 20, 30, 40]

    for i, val in enumerate(buf):
        # i is a compile-time counter; val is buf[i]
        process(i, val)
```

## Key points

- A tuple never exists at runtime. Both forms above are destructured while compiling: the
  multi-return is unpacked into the two variables at the call site, and `enumerate()`
  expands into the loop counter plus the element load.
- That is why `@inline` is required on a tuple-returning function that gets unpacked — there
  is no runtime tuple object for a normal call to hand back.
- Because there is no object, there is no allocation: `q`, `r`, `i` and `val` are ordinary
  local variables and cost exactly what any other local of their type costs.

## See also

- [Language Reference — tuple returns](/language-reference/#tuple-returns) — the full rules
  for `-> (T1, T2)`, unpacking and where `@inline` is required
- [Examples](/examples/) — the rest of the gallery
