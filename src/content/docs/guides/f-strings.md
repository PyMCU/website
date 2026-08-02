---
title: f-strings
description: Format values with f-strings in PyMCU — the streamed form, the fixed-buffer value form, the supported format specs, and buffer reuse inside loops.
---

f-strings work on bare metal, with no heap and no string objects. There are two forms, and
which one you get depends on what you do with the f-string: **stream it** straight to a
sink, or **assign it** to a name and keep it.

f-strings are a **compiler feature**. They behave identically whether you import `machine`,
`board` or `pymcu.hal.*` — there is no MicroPython or CircuitPython variant of this page.

## Print a formatted line (the streamed form)

Pass the f-string directly to something that consumes bytes and the compiler emits the
formatting inline, writing character by character to the sink. Nothing is buffered:

```python
print(f"S:{total}")
uart.write_str(f"reg={reg:04x}")
uart.println(f"T:{temp}C")
lcd.print_str(f"H:{humidity}%")
```

This is the cheapest form. Use it whenever you only need the text once.

## Build a string you can keep (the value form)

Assign an f-string to a name and the compiler allocates a **fixed `bytearray`**, sized at
compile time from the static width bound of every part, and fills it with calls into
`pymcu.strfmt`. Still no heap:

```python
from pymcu.types import uint8, uint16, int16
from pymcu.hal.uart import UART
from pymcu.time import delay_ms


def main():
    uart = UART(9600)
    uart.println("FSTR")

    t: uint8 = 23
    reg: uint16 = 0xBEEF
    neg: int16 = -42
    s = f"t={t}C reg={reg:04x} n={neg}"
    print(s)

    n: uint16 = len(s)
    print(f"L:{n}")

    first: uint8 = s[0]
    uart.write_str("B:")
    uart.write(first)
    uart.write(10)
```

The name behaves like a string you can use again:

| Operation | Result |
|---|---|
| `print(s)`, `uart.write_str(s)`, `uart.println(s)` | Writes the formatted bytes |
| `len(s)` | The **formatted** length, not the buffer capacity |
| `s[i]` | The byte at index `i` |
| passing `s` to a `bytearray` parameter | Works — it is a real byte buffer |

`pymcu build` injects the `pymcu.strfmt` import automatically when it sees a value-form
f-string, so you never write it yourself.

### What you should see

```
FSTR
t=23C reg=beef n=-42
L:20
B:t
```

`L:20` is the length of the formatted text; `B:t` is `s[0]`.

## Format specs

Specs go after a colon inside the braces, and cover width, zero padding and base:

| Spec | Meaning | `v = 7` gives |
|---|---|---|
| `{v:5d}` | Decimal, width 5, space-padded | `7` right-aligned in 5 columns |
| `{v:04d}` | Decimal, width 4, zero-padded | `0007` |
| `{v:02x}` | Lowercase hex, width 2, zero-padded | `07` |
| `{v:X}` | Uppercase hex | `7` |
| `{v:08b}` | Binary, width 8, zero-padded | `00000111` |
| `{v:o}` | Octal | `7` |

The supported format **types** are `d`, `x`, `X`, `b` and `o`. Anything else is a compile
error naming the spec it rejected, so you find out at build time.

```python
    v: uint8 = 7
    p = f"pad=[{v:3d}]=[{v:03d}]"
    print(p)
```

```
pad=[  7]=[007]
```

Signedness is inferred from the interpolated expression: a variable declared `int8` /
`int16` / `int32`, a negative literal, or a unary minus routes through the signed
formatter. Everything else formats as unsigned.

## Reuse the buffer inside a loop

Re-assigning the same name inside a loop reuses the buffer that was allocated the first
time — no new storage per iteration:

```python
    k: uint8 = 0
    line = f"k={k} "
    while k < 3:
        line = f"k={k} "
        uart.write_str(line)
        k = k + 1
    uart.write(10)
```

```
k=0 k=1 k=2
```

:::caution[Assign the longest f-string first]
The buffer size is fixed by the **first** assignment to a name. Re-assigning that name a
longer f-string later is a compile error — the compiler cannot retroactively enlarge a
buffer it has already emitted:

```
'line' is re-assigned an f-string needing 24 bytes but its buffer was sized 12 by an
earlier assignment; assign the longest f-string first
```

The fix is the one in the message: make the first assignment the widest form, as the
example above does by assigning `line` once before the loop.
:::

## f-strings inside `asm()`

Inline assembly accepts an f-string template as long as **every** interpolated expression is
a compile-time constant — typically `const[uint8]` parameters of an `@inline` function:

```python
from pymcu.types import uint8, inline, asm


@inline
def sbi(port: const[uint8], bit: const[uint8]):
    asm(f"SBI {port}, {bit}")


@inline
def cbi(port: const[uint8], bit: const[uint8]):
    asm(f"CBI {port}, {bit}")


def main():
    sbi(0x0A, 5)     # SBI DDRD, 5  -- PD5 as output
    sbi(0x0B, 5)     # SBI PORTD, 5 -- PD5 high
    cbi(0x0B, 5)     # CBI PORTD, 5 -- PD5 low
```

The f-string is folded to a string constant during compilation; a runtime value there is a
compile error, not a miscompile.

## What is not supported yet

| Not supported | Do this instead |
|---|---|
| Float interpolation in the **value** form | Stream it: `print(f"{x}")` handles floats where the target supports them |
| `s == "lit"` — comparing a value-form f-string to a literal | Compare the numbers before formatting them |
| An f-string inline in an arbitrary expression position | Assign it to a name first, then use that name |

The compiler tells you which one you hit, with a message naming the two supported
positions (streaming and assignment) rather than failing obscurely.

## Where this is tested

This guide is built from the `fstring-value` fixture in the AVR integration suite
(`tests/integration/fixtures/fstring-value/src/main.py`), its ARM twin the
`fstring-value-rp2040` example, and the `asm-fstring` fixture for the inline-assembly
template form. All of them compile and run in CI — check there first if this page looks out
of date.

## See also

- [UART](/stdlib/uart/) — `write_str`, `println` and the other sinks
- [Limitations](/limitations/) — what else is unsupported about strings
- [Dictionaries and sets](/guides/dicts/)
