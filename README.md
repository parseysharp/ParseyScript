# parseyscript

A small TypeScript parsing library for going from less-structured inputs to more-structured types, with cursor-based navigation and path-aware error reporting.

You can think of it as an alternative to Zod: instead of declaring the entire shape of the source data, you describe only the values you want to extract. You navigate someone else's structure on your own terms, without having to model every intermediate field just because it exists in the input.

It provides:

- **`Parse<A>`**: composable parsers for values of type `A` (strings, numbers, booleans, dates, etc.).
- **Cursor-based navigation** via `at` / `maybeAt` using a `Navigator` over arbitrary input shapes.
- **Optional values** via a simple `Maybe` type.
- **Result values** via `ParseResult`, with success/failure, mapping, and sequencing helpers.

## Installation

This is a plain TypeScript project. You can install dependencies with:

```bash
npm install
```

## Usage

The library is re-exported from `src/index.ts`, so you can import everything as:

```ts
import * as P from "./src";
```

Example: parsing a nested object with some required and optional fields:

```ts
const parser = P.Parse.zip4(
  P.Parse.string().maybeAt("some", ["nested", "path"]),
  P.Parse.dateTimeOffsetFlex({ epochIsMilliseconds: true }).at("some", [
    "other",
    "path",
  ]),
  P.Parse.bool().at("the", ["flag"]),
  P.Parse.floatFlex().at("the", ["number"])
).map(([a, b, c, d]) => ({ a, b, c, d }));

const input = {
  the: {
    number: 23,
    flag: "false",
  },
  some: {
    other: { path: "1762912054467" },
    nested: { path: "hello" },
  },
};

const result = parser.parse(P.Navigator.unknown(), P.Maybe.fromNullable(input));
console.log(result);
```

Errors are accumulated as `ParseError` values with human-readable messages and a dot-separated path.

## Running tests

Tests are written with Vitest and live in `tests/`.

```bash
npm test
```

This runs Vitest against the TypeScript sources.
