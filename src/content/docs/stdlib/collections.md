---
title: Collections
description: pymcu.collections.FixedDict — a mutable integer-keyed dictionary of fixed capacity, backed by plain arrays with no heap and no garbage collector.
---

```python
from pymcu.collections import FixedDict
```

`pymcu.collections` holds PyMCU's fixed-capacity containers: data structures with Python's
familiar surface and a footprint decided entirely at compile time. Today the module contains
exactly one class, **`FixedDict`**.

`FixedDict` is a **compiler / stdlib feature**, not part of MicroPython or CircuitPython. It is
imported the same way whatever API you use for the rest of your program: a `machine.Pin` sketch
and a `digitalio` sketch both say `from pymcu.collections import FixedDict`, and it compiles to
the same code in both.

For the wider picture — closed dict and set literals as zero-RAM lookup tables, and when to reach
for which — see the [Dictionaries and sets guide](/guides/dicts/). This page is the API reference.

## `FixedDict(capacity)`

| Parameter | Type | Description |
|---|---|---|
| `capacity` | `uint8` | Number of slots. Must be a compile-time constant |

An integer-keyed dictionary implemented as **open addressing with linear probing** over three
fixed arrays sized at construction:

| Array | Type | Purpose |
|---|---|---|
| `_keys` | `uint16[capacity]` | The stored keys |
| `_vals` | `uint16[capacity]` | The stored values |
| `_state` | `uint8[capacity]` | Per-slot state: `0` empty, `1` used, `2` tombstone |

That is **5 bytes of RAM per slot**, allocated per instance, with no heap and no garbage
collector. `FixedDict(4)` costs 20 bytes plus the capacity and count bytes; `FixedDict(64)` costs
320. On a 2 KB ATmega328P that arithmetic matters.

```python
from pymcu.types import uint16
from pymcu.collections import FixedDict


def main():
    d = FixedDict(4)
    d[300] = 5
    d[42] = 7
    d[300] = 6          # overwrite, not a second entry

    v: uint16 = d[300]  # 6
```

### FixedDict operations

| Operation | Signature | Description |
|---|---|---|
| `d[key] = value` | `key: uint16`, `value: uint16` | Insert or overwrite. Raises `ValueError` if the dict is full and the key is new |
| `d[key]` | → `uint16` | Look up. Raises `KeyError` if the key is absent |
| `key in d` | → `uint8` | `1` if present, `0` if not. Never raises |
| `len(d)` | → `uint8` | Number of live entries |
| `d.get(key, default=0)` | → `uint16` | Look up, returning `default` instead of raising |
| `d.pop(key)` | → `uint16` | Remove the entry and return its value. Raises `KeyError` if absent |
| `d.clear()` | — | Mark every slot empty and reset the count to zero |

Every method except the constructor is `@inline`, so a lookup is a probe loop emitted at the call
site rather than a call into a shared routine.

### FixedDict exceptions

Both are real, catchable PyMCU exceptions from `pymcu.exceptions`:

```python
from pymcu.exceptions import KeyError, ValueError
```

| Raised by | Exception | When |
|---|---|---|
| `d[key]`, `d.pop(key)` | `KeyError` | The key is not in the dict |
| `d[key] = value` | `ValueError` | Every slot is occupied and the key is new — a fixed dict cannot grow |

`get()` and `in` never raise; use `get()` when a miss is expected and you do not want the cost of
a `try` block.

## Sharp edges

These follow from the fixed-footprint design. None of them is a bug; all of them will bite if you
assume CPython behaviour.

### Capacity is a compile-time constant

`capacity` sizes three arrays, so it must be known when the program is compiled. A literal or a
module-level constant works; a value read from a sensor does not.

```python
d = FixedDict(16)        # fine

CAP = 16
d = FixedDict(CAP)       # fine

d = FixedDict(uart.read())   # not possible — capacity is not a runtime value
```

Because the parameter is a `uint8`, the **practical maximum capacity is 255**. Every internal
index (`i`, `n`, `free`, `_count`) is a `uint8` too, and `255` is used as the "no tombstone found"
sentinel, so there is no headroom above that.

### Keys and values are `uint16` integers only

There is no string keying, no tuples, no mixed types. Keys and values are both `uint16` — a
`uint8` widens transparently, but anything else does not fit. If you need a string key, hash it
yourself, or use a closed dict literal or `match` / `case` dispatch instead.

### Only the low 8 bits of a key are hashed

The slot index is computed as:

```python
i = uint8(key) % self._cap
```

The key is **truncated to 8 bits before the modulo**, so only its low byte participates in the
hash. The full 16-bit key is still compared on every probe, so lookups remain *correct* — but keys
that differ only above bit 7 all land on the same starting slot and are separated only by linear
probing.

Concretely, `42`, `298` and `554` all hash identically. With a small capacity and keys spread
across a wide 16-bit range, expect probe chains rather than the O(1) you would get in CPython. If
your keys are naturally 16-bit and clustered above 255, fold them into the low byte yourself
before storing.

### `pop()` leaves tombstones and never compacts

`pop()` marks the slot as a tombstone (state `2`) rather than emptying it. That is required for
correctness — an emptied slot would terminate a probe chain early and hide entries behind it — but
it has consequences:

- A probe that lands on a tombstone **keeps going**. Deleted entries still cost lookup time.
- A later insert reuses the first tombstone it finds, so tombstones do not permanently consume
  capacity, but they are not proactively reclaimed either.
- Nothing rehashes or compacts the table. A dict that is churned heavily gets progressively
  slower to probe.
- **`clear()` is the only reset.** It sets every slot back to empty and zeroes the count.

### There is no iteration. At all.

`FixedDict` has **no `keys()`, no `values()`, no `items()`, and no `__iter__`**. You cannot write
`for k in d:`, you cannot unpack it, and you cannot enumerate what is inside it. The complete
member list is `__len__`, `__setitem__`, `__getitem__`, `__contains__`, `get`, `pop` and `clear` —
every one of them takes a key you already have.

This is the single biggest departure from a CPython `dict`, and it shapes how you use the type: a
`FixedDict` is a **map you probe**, not a collection you walk. If you need to visit every entry,
keep a separate array of the keys you inserted and iterate that.

## Complete example

This is the `fixeddict` fixture from the AVR integration suite; the `fixeddict-rp2040` example in
the ARM backend repository is the same program with a faster UART. Both are compiled and tested,
which is why the expected output below is exact.

```python
from pymcu.types import uint8, uint16
from pymcu.collections import FixedDict
from pymcu.hal.uart import UART
from pymcu.exceptions import KeyError, ValueError
from pymcu.time import delay_ms


def main():
    uart = UART(9600)
    uart.println("FXD")

    d = FixedDict(4)
    d[300] = 5
    d[42] = 7
    d[300] = 6          # overwrite

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

    dv: uint16 = d.get(9, 99)   # miss -> default
    print(f"D:{dv}")

    p: uint16 = d.pop(42)
    print(f"P:{p}")

    try:
        gone: uint16 = d[42]    # popped above
        print("E:missed")
    except KeyError:
        print("E:caught")

    d2 = FixedDict(2)
    d2[1] = 10
    d2[2] = 20
    try:
        d2[3] = 30              # full
        print("F:missed")
    except ValueError:
        print("F:caught")

    d.clear()
    z: uint8 = len(d)
    print(f"Z:{z}")

    while True:
        delay_ms(1000)
```

Expected UART output:

```text
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

Note `L:2` — after three assignments there are two entries, because `d[300] = 6` overwrote
`d[300] = 5` rather than adding a row. And note that the key `300` works fine despite the 8-bit
hash: `uint8(300)` is `44`, which is where the probe starts, and the full 16-bit comparison
confirms the match.

## Target support

Verified on **AVR** and **RP2040**, by the `fixeddict` fixture in the AVR integration suite and
the `fixeddict-rp2040` example in the ARM backend repository. Those are the two targets the type
is tested on; no claim is made for any other architecture.

## See also

- [Dictionaries and sets](/guides/dicts/) — closed literals versus `FixedDict`, and how to choose
- [Language reference](/language-reference/) — the container support matrix
- [Limitations](/limitations/) — why there is no growing hash table
