---
title: Dictionaries and sets
description: Compile-time dict and set literals as lookup tables, plus FixedDict for a mutable fixed-capacity map with no heap and no garbage collector.
---

PyMCU has no heap, so it has no hash table that can grow. What it does have are two things
that cover most of what firmware actually needs from a dict:

1. **Closed dict and set literals** — read-only lookup tables resolved at compile time, at
   zero RAM cost.
2. **`FixedDict`** — a mutable map of fixed capacity, backed by plain arrays.

Both are **compiler / stdlib features**. They behave identically whether you import
`machine`, `board` or `pymcu.hal.*` — there is no MicroPython or CircuitPython variant of
this page.

## Look up a constant table without spending RAM

Bind a dict or set literal at module scope and use it like a table:

```python
from pymcu.types import uint8
from pymcu.hal.uart import UART
from pymcu.time import delay_ms

SCALE = {0: 10, 1: 20, 2: 30}
MODES = {"low": 1, "mid": 2, "high": 3}
OK = {1, 3, 5}


def main():
    uart = UART(9600)
    uart.println("DICT")

    v: uint8 = SCALE[2]          # constant key -> folded to `v = 30`
    print(f"V:{v}")

    k: uint8 = 1
    r: uint8 = SCALE[k]          # runtime key  -> compare chain
    print(f"R:{r}")
```

The literal itself never exists at runtime. There is no table in flash and no object in
SRAM — only the code the lookups compile into:

| You write | The compiler emits |
|---|---|
| `SCALE[2]` (constant key) | The constant `30`. Nothing at all at runtime |
| `SCALE[k]` (runtime key) | A compare chain over the keys, raising `KeyError` if none match |
| `x in OK` | A membership compare chain |
| `len(SCALE)` | The constant `3` |
| `MODES["mid"]` (string key) | The constant `2` |

## A missing key raises a catchable `KeyError`

A runtime lookup that matches nothing raises `KeyError`, and you catch it with an ordinary
`try` / `except`:

```python
    try:
        k = 7
        bad: uint8 = SCALE[k]
        print("E:missed")
    except KeyError:
        print("E:caught")
```

## Membership and length

```python
    a: uint8 = 3
    if a in OK:
        print("S:1")
    if 4 in OK:
        print("S:bad")
    else:
        print("S:0")

    n: uint8 = len(SCALE)
    print(f"N:{n}")

    m: uint8 = MODES["mid"]
    print(f"M:{m}")
```

### What you should see

Watch UART0 at 9600 baud (the RP2040 version uses 115200):

```
DICT
V:30
R:20
E:caught
S:1
S:0
N:3
M:2
```

Closed literals are **read-only**. `SCALE[k] = v` is not supported — for mutation, read on.

## Mutable tables: `FixedDict`

`pymcu.collections.FixedDict` is the mutable counterpart: open addressing with linear
probing over per-instance fixed arrays sized at construction. No heap, no garbage
collector, deterministic timing.

```python
from pymcu.types import uint8, uint16
from pymcu.collections import FixedDict
from pymcu.hal.uart import UART
from pymcu.time import delay_ms


def main():
    uart = UART(9600)
    uart.println("FXD")

    d = FixedDict(4)
    d[300] = 5
    d[42] = 7
    d[300] = 6           # overwrites, does not insert

    g: uint16 = d[300]
    print(f"G:{g}")
    g2: uint16 = d[42]
    print(f"G2:{g2}")

    c: uint8 = 300 in d
    print(f"C:{c}")
    c = 9 in d
    print(f"C:{c}")

    n: uint8 = len(d)
    print(f"L:{n}")

    dv: uint16 = d.get(9, 99)     # default when absent
    print(f"D:{dv}")

    p: uint16 = d.pop(42)         # returns the value, removes the entry
    print(f"P:{p}")

    try:
        gone: uint16 = d[42]      # popped -> KeyError
        print("E:missed")
    except KeyError:
        print("E:caught")

    d2 = FixedDict(2)
    d2[1] = 10
    d2[2] = 20
    try:
        d2[3] = 30                # full -> ValueError
        print("F:missed")
    except ValueError:
        print("F:caught")

    d.clear()
    z: uint8 = len(d)
    print(f"Z:{z}")
```

### What you should see

```
FXD
G:6
G2:7
C:1
C:0
L:2
D:99
P:7
E:caught
F:caught
Z:0
```

### The API

| Operation | Behaviour |
|---|---|
| `FixedDict(capacity)` | `capacity` must be a **compile-time constant** |
| `d[k] = v` | Insert or overwrite. Raises `ValueError` when the dict is full |
| `d[k]` | Raises `KeyError` when the key is absent |
| `k in d` | Returns `1` or `0` |
| `len(d)` | Number of live entries |
| `d.get(k, default=0)` | Value, or `default` when absent — never raises |
| `d.pop(k)` | Returns the value and removes the entry. Raises `KeyError` when absent |
| `d.clear()` | Empties the dict |

Keys and values are `uint16` (a `uint8` widens transparently).

## `FixedDict` sharp edges

These are consequences of doing hashing in a few hundred bytes with no allocator. Know them
before you build something on top:

- **Capacity is fixed and must be a compile-time constant.** A `FixedDict` never grows;
  inserting into a full one raises `ValueError` rather than reallocating.
- **The hash is `uint8(key) % capacity`** — only the **low 8 bits** of the key take part.
  Keys that differ only above bit 7 (for example `0x0105` and `0x0205`) collide and are
  resolved by linear probing. Correctness is unaffected; lookups just get slower. If you
  control your key space, keep the low byte well spread.
- **`pop` leaves a tombstone.** The slot is marked deleted rather than compacted, so a
  later insert can reuse it, but a long run of insert/pop cycles lengthens probe chains.
  `clear()` resets every slot.
- **There is no iteration at all.** No `keys()`, no `values()`, no `items()`, no
  `__iter__`, so `for k in d:` does not compile. Iterating a hash table with tombstones has
  no fixed-cost lowering. Keep a parallel array of the keys you inserted if you need to walk
  them.

## What is not supported

| Not supported | Alternative |
|---|---|
| A general growable `dict` / `set` | Hash tables need a heap. Use a closed literal (read-only) or `FixedDict` (fixed capacity) |
| Mutating a closed literal (`SCALE[k] = v`) | `FixedDict` |
| Iterating a `FixedDict` | Keep your own array of keys |
| Non-integer keys in a `FixedDict` | String keys work only in closed literals, on constant lookups |
| Dict/set comprehensions | Build the literal explicitly |

See [Limitations](/pymcu/limitations/) and the [Roadmap](/pymcu/roadmap/).

## Where this is tested

This guide is built from two AVR integration fixtures — `dict-set-literal` and `fixeddict` —
and their ARM twins, the `dict-set-rp2040` and `fixeddict-rp2040` examples. The
implementation is `lib/src/pymcu/collections.py` in the monorepo. Everything compiles and
runs in CI, so re-check there first if this page looks out of date.

:::note[If you read the fixture source]
The header comment in `fixeddict/src/main.py` says `pymcu.types.FixedDict`. That is stale —
the import two lines below it, `from pymcu.collections import FixedDict`, is the correct
one.
:::

## See also

- [Exceptions](/pymcu/guides/exceptions/) — catching the `KeyError` and `ValueError` above
- [f-strings](/pymcu/guides/f-strings/) — the `print(f"G:{g}")` formatting used here
- [Limitations](/pymcu/limitations/)
