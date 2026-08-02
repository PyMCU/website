---
title: Contributing
description: Repository layout, how to build the C# compiler, run the test suites, edit the stdlib, and the commit conventions PyMCU follows.
---

Contributions to PyMCU are welcome. Please read this guide before opening a PR.

## Repository layout

PyMCU is split across a monorepo and one repository per backend, all under the
[PyMCU organisation](https://github.com/PyMCU).

| Repository | Contents |
|---|---|
| [`PyMCU/PyMCU`](https://github.com/PyMCU/PyMCU) | Compiler, CLI driver, standard library, SDKs |
| [`PyMCU/pymcu-avr`](https://github.com/PyMCU/pymcu-avr) | AVR backend + its integration suite |
| [`PyMCU/pymcu-arm`](https://github.com/PyMCU/pymcu-arm) | ARM (RP2040 / RP2350) backend + its integration suite |
| [`PyMCU/pymcu-pic`](https://github.com/PyMCU/pymcu-pic) | PIC backend + its integration suite |

Inside the monorepo:

```
PyMCU/
  src/compiler/           # C# compiler (pymcuc), .NET 10, AOT-published
    Frontend/             # Lexer, Parser, AST
    IR/                   # IRGenerator, Optimizer, Tacky IR
    Backend/              # Shared backend infrastructure
  src/driver/             # Python CLI driver (pymcu new/build/flash/lint/...)
  lib/src/pymcu/          # Python stdlib, compiled into firmware
    hal/                  # GPIO, UART, ADC, Timer, PWM, SPI, I2C, ...
    drivers/              # Device drivers (DHT11, SSD1306, BMP280, ...)
    boards/               # Board pin-name constants
    chips/                # Chip configuration and __CHIP__
  extensions/pymcu-sdk/   # Backend + toolchain plugin SDK (C# and Python)
  tests/unit/             # C# compiler unit tests (PyMCU.Tests.csproj)
  tests/driver/           # Python driver tests
```

There is no `examples/` directory in the monorepo — the runnable example projects live in
the backend repositories, under `pymcu-avr/examples/` and `pymcu-arm/examples/`.

The documentation site you are reading is a separate Astro + Starlight project.

## Building the compiler

The compiler is **C#**, targeting .NET 10 and published ahead-of-time:

```bash
dotnet publish src/compiler/PyMCU.csproj -c Release -o build/bin --nologo
```

Rebuild after every compiler change, before running the tests.

## Running the tests

The monorepo carries the **unit** suite only:

```bash
dotnet test tests/unit/PyMCU.Tests.csproj
```

The **integration** suites live in the backend repositories, one per target, and each runs
the compiled firmware on an emulator (AVR against AVR8Sharp, ARM against RP2040Sharp /
RP2350Sharp, PIC against PicSharp):

```bash
dotnet test ../pymcu-avr/tests/integration/PyMCU.IntegrationTests.csproj
dotnet test ../pymcu-arm/tests/integration/PyMCU.IntegrationTests.csproj
dotnet test ../pymcu-pic/tests/integration/PyMCU.IntegrationTests.csproj
```

Add a test for every new compiler or HAL feature, in the suite that covers the target you
changed.

**All suites must stay green** — including after each individual commit, not just at the end
of a branch.

## Working on the standard library

Install the stdlib **editable, once**:

```bash
just sync-stdlib     # = uv pip install --no-deps -e lib/
```

After that, edits under `lib/src/pymcu/` are picked up live by `pymcu build`.

:::danger[Never copy the stdlib into site-packages]
Copying `lib/src/pymcu/` into `.venv/.../site-packages/pymcu/` shadows the editable `.pth`
install, and your edits silently stop taking effect — with no error to tell you why. If
stdlib changes seem to be ignored, check `pymcu.__file__` and delete any physical copy you
find in site-packages.
:::

### Adding a stdlib module or driver

1. **Match MicroPython / CircuitPython.** If an API for what you are exposing already exists
   in either ecosystem, mirror it exactly. Do not invent names. User-facing code should reach
   for `machine.Pin`, not `pymcu.hal.gpio.Pin`; the internal HAL exists to be wrapped by the
   compat layers.
2. Put the implementation in `lib/src/pymcu/hal/` (or `drivers/`).
3. Use `@inline` for public methods — the zero-cost abstraction rule.
4. Dispatch on architecture with `match __CHIP__.arch:`.
5. Add a test in the relevant backend repository.

## HAL coding rules

These are compiler constraints, not style preferences:

- **ASCII only.** No em dashes or any other non-ASCII character in `.py` files under `lib/` —
  the lexer is ASCII-only.
- **No statements after a `match` block.** Put defaults in `case _:` inside the match.
- **Dotted names are value patterns** in `match` / `case` (`ClassName.ATTR` compares); bare
  names are **capture patterns** and will match anything. Always use the dotted form for
  named constants.
- **`@inline` functions containing `asm()` with labels** must delegate to a non-inline
  sub-helper, otherwise labels are duplicated at every expansion site.
- **No augmented assignment inside compile-time unrolled `for` loops.** Write
  `acc = acc + x` rather than `acc += x`.
- Avoid multiline docstrings containing code examples — use `#` comments.

## Commit format

PyMCU follows [Conventional Commits](https://www.conventionalcommits.org/):

```
<type>(<scope>): <short description, under 72 chars>
```

**Types:** `feat`, `fix`, `docs`, `test`, `refactor`, `perf`, `chore`, `style`

**Scopes:** `avr`, `arm`, `pic`, `ir`, `parser`, `hal`, `driver`, `stdlib`, `drivers`,
`test`, `docs`, `ci`

Split a feature into small, focused commits rather than one large batch:

```
feat(parser): parse @extern decorator on function definitions
feat(ir): emit Extern IR instruction and register extern symbols
feat(avr): emit .extern and CALL with the AVR ABI for @extern
test(avr): add ExternCallTests for @extern C interop
docs: mark @extern as implemented in the roadmap and limitations
```

**Every commit must leave the test suite green.**

## Pull request checklist

1. Fork the repository and branch from `main`.
2. Every commit follows Conventional Commits.
3. The compiler builds (`dotnet publish ...`) and all integration tests pass.
4. A test covers each new compiler or HAL feature.
5. `LANGUAGE_ROADMAP.md` is updated when the feature set changes.
6. The [Limitations](/pymcu/limitations/) and [Roadmap](/pymcu/roadmap/) pages are updated when
   supported / unsupported status changes.

Bugs and feature requests go to the
[issue tracker](https://github.com/PyMCU/PyMCU/issues).
