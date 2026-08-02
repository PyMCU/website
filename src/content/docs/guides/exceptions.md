---
title: Exceptions
description: try, except, finally and raise on bare metal — the zero-cost flag-propagation model, the builtin exception types, and compile-time CompileError.
---

`try` / `except` / `else` / `finally` / `raise` work on AVR and ARM (RP2040 / RP2350), and
they cost nothing when nothing goes wrong. There is no `jmp_buf`, no `setjmp`, no `longjmp`
and no stack unwinding anywhere in the model.

Exceptions are a **compiler feature**. They behave identically whether you import
`machine`, `board` or `pymcu.hal.*` — there is no MicroPython or CircuitPython variant of
this page.

## Raise from a helper, catch at the call site

```python
from pymcu.types import uint8
from pymcu.hal.uart import UART
from pymcu.time import delay_ms


def risky(x: uint8) -> uint8:
    if x == 0:
        raise ValueError
    return 42


def main():
    uart = UART(9600)
    uart.println("EXNS")

    # A: raise is triggered, except catches it
    try:
        result: uint8 = risky(0)
        uart.println("A:missed")
    except ValueError:
        uart.println("A:caught")

    # B: no raise, normal return
    try:
        result2: uint8 = risky(1)
        uart.println("B:ok")
    except ValueError:
        uart.println("B:caught")

    while True:
        delay_ms(1000)
```

### What you should see

```
EXNS
A:caught
B:ok
```

## Why this is cheap on a microcontroller

A function that raises **marks an error and returns normally**. The caller tests the mark
right after the call and branches to the matching handler.

- **On AVR**, the mark is the `T` flag in `SREG`, set with `SET`, cleared with `CLT`, tested
  with `BRTS` / `BRTC`. The error code travels in `R22`. A failing call ends
  `LDI R22, code; SET; RET`; a successful one ends `CLT; RET`.
- **On ARM**, the mark is an internal flag + code pair of globals, tested the same way.

The consequences are what make this usable in 2 KB of SRAM:

| Property | What it means |
|---|---|
| Zero SRAM cost | No `jmp_buf` is allocated. A `try` block occupies no data memory at all |
| Zero flash cost for tables | No unwind tables, no personality routine, no landing-pad metadata |
| Zero happy-path cost | One branch after each guarded call, and it is not taken when nothing was raised |
| Propagates across calls | A `raise` deep in a callee is caught at the call site in the caller's `try`, to any depth |
| Types are integer codes | Handlers discriminate on a small integer. There are no message strings at runtime |

## Raise directly inside the `try` body

You do not have to route a raise through a function call. A `raise` written lexically inside
the `try` body — including nested inside an `if` — is caught by the enclosing `except` in
the same function:

```python
def main():
    uart = UART(9600)
    uart.println("RT")

    flag: uint8 = 0

    # A: unconditional direct raise in the try body
    try:
        raise ValueError
        uart.println("A:miss")
    except ValueError:
        uart.println("A:caught")

    # B: no raise -> the try body completes, except not triggered
    try:
        if flag == 1:
            raise ValueError
        uart.println("B:ok")
    except ValueError:
        uart.println("B:miss")

    # C: raise nested inside an if inside the try body
    try:
        if flag == 0:
            raise ValueError
        uart.println("C:miss")
    except ValueError:
        uart.println("C:caught")

    uart.println("DONE")
```

```
RT
A:caught
B:ok
C:caught
DONE
```

That case lowers to a plain `LDI R22, code; JMP catch` — a local jump, with no flag set and
no return involved.

## Pick the handler by exception type

Multiple `except` clauses discriminate on the type:

```python
def pick(x: uint8) -> uint8:
    if x == 1:
        raise TypeError
    return 7


try:
    r3: uint8 = pick(1)
    uart.println("C:missed")
except ValueError:
    uart.println("C:value")
except TypeError:
    uart.println("C:type")
```

```
C:type
```

## `finally` runs on every exit path

Normal completion, a caught exception, propagation to an outer scope, and `return` /
`break` / `continue` out of the `try` all run the `finally` block:

```python
    # A: exception raised and caught, finally runs after the handler
    try:
        result: uint8 = risky(0)
        uart.println("A:missed")
    except ValueError:
        uart.println("A:caught")
    finally:
        uart.println("A:fin")

    # B: no exception, finally still executes
    try:
        result2: uint8 = risky(1)
        uart.println("B:ok")
    except ValueError:
        uart.println("B:missed")
    finally:
        uart.println("B:fin")
```

```
FINALLY
A:caught
A:fin
B:ok
B:fin
DONE
```

A `try` / `finally` with no `except` also works: the `finally` runs, then the exception
keeps propagating.

## The builtin exception types

`ValueError`, `TypeError`, `IndexError`, `KeyError`, `NotImplementedError` and
`ZeroDivisionError` are recognised by the compiler directly and **need no import**, exactly
as in CPython. `ZeroDivisionError` is raised automatically by a runtime `//` or `%` by zero.

The integration fixtures write `from pymcu.exceptions import ValueError` at the top for
readability and the compiler accepts it, but the import is never required. The one name you
*do* import from `pymcu.exceptions` is `CompileError`.

## When nothing catches it

An exception that reaches `main` with no handler goes to `__pymcu_unhandled_exn`, which
prints the type name to UART0 and then halts:

```
E:KeyError
```

The halt is a deliberate stop, never a silent continue. Only exception types actually
raised somewhere in the program have their name string emitted into flash, so unused codes
cost nothing. Chips with no UART0 (ATtiny85 and friends) skip the print and go straight to
the halt loop.

## `raise CompileError("msg")` — compile-time only

`CompileError` is the one PyMCU-specific exception, and it is not a runtime exception at
all. `raise CompileError("msg")` is intercepted by the compiler and **aborts the build**
with a diagnostic. It emits no code, generates no error-propagation instruction, and can
never be caught by `try` / `except`.

```python
from pymcu.exceptions import CompileError
from pymcu.chips import __CHIP__

match __CHIP__.arch:
    case "avr":
        ...
    case _:
        raise CompileError("SPI not supported on this architecture")
```

This is how every HAL module rejects an unsupported chip or configuration: you find out at
build time, not on the bench.

## Target support

| Target | Exceptions |
|---|---|
| AVR (ATmega, ATtiny) | Full `try` / `except` / `else` / `finally` / `raise` |
| ARM (RP2040, RP2350) | Full `try` / `except` / `else` / `finally` / `raise` |
| PIC | **Not supported** — use return codes or sentinel values. The automatic `ZeroDivisionError` guards on `//` and `%` are still emitted |

Even where exceptions work, an explicit status return is often the clearest bare-metal
style: it reads the same on every backend including PIC, and it makes the error path
obvious at each call site. See the return-code pattern in
[Limitations](/pymcu/limitations/).

## Where this is tested

This guide is built from four AVR integration fixtures — `exceptions-basic`,
`exceptions-finally`, `raise-in-try` and `t-flag-errors` (which pins down the
`SET` / `CLT` / `BRTS` ABI itself) — plus the `exceptions-rp2040` and `exceptions-rp2350`
ARM examples, which cover handler discrimination by type, a local raise, `finally`, and an
uncaught raise reaching the halt runtime. All of them compile and run in CI.

:::note[If you read the fixture source]
The header comment in `exceptions-basic/src/main.py` still says "using avr-libc
setjmp/longjmp". That comment is stale and predates the current implementation by a long
way. The model is flag propagation, as described above — trust the code, not the comment.
:::

## See also

- [Limitations](/pymcu/limitations/) — the full exception-handling reference table
- [Dictionaries and sets](/pymcu/guides/dicts/) — `KeyError` from a lookup is catchable
- [UART](/pymcu/stdlib/uart/) — where `E:<TypeName>` is printed
