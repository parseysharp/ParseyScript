export type FmtParseError = {
  message: string;
  expected: string;
  actual: unknown;
  path: string;
};

export class ParseError {
  constructor(
    public message: string,
    public expected: string,
    public actual: unknown,
    public path: string[]
  ) {}

  withPrefix = (prefix: string[]) =>
    new ParseError(this.message, this.expected, this.actual, [
      ...prefix,
      ...this.path,
    ]);

  format = (): FmtParseError => {
    return {
      message: this.message,
      expected: this.expected,
      actual: this.actual,
      path: this.path.join("."),
    };
  };
}

export type ParseMatch<A, E, B> = {
  onSuccess: (value: A) => B;
  onFailure: (error: E) => B;
};

export interface ParseResult<A, E> {
  match: <B>(match: ParseMatch<A, E, B>) => B;
  bind: <B>(f: (value: A) => ParseResult<B, E>) => ParseResult<B, E>;
  map: <B>(f: (value: A) => B) => ParseResult<B, E>;
  mapFailure: <B>(f: (error: E) => B) => ParseResult<A, B>;
  tuple: <B>(
    other: ParseResult<B, E>,
    combineErrors?: (e1: E, e2: E) => E
  ) => ParseResult<[A, B], E>;
}

export class ParseSuccess<A, E> implements ParseResult<A, E> {
  private _type: "ParseSuccess" = "ParseSuccess";

  constructor(public value: A) {}

  match = <B>(match: ParseMatch<A, E, B>) => match.onSuccess(this.value);
  bind = <B>(f: (value: A) => ParseResult<B, E>) => f(this.value);
  map = <B>(f: (value: A) => B) => ParseResult.success<E>()(f(this.value));
  mapFailure = <B>(f: (error: E) => B) => ParseResult.success<B>()(this.value);
  tuple = <B>(
    other: ParseResult<B, E>,
    combineErrors?: (e1: E, e2: E) => E
  ): ParseResult<[A, B], E> =>
    other.match<ParseResult<[A, B], E>>({
      onSuccess: otherValue =>
        ParseResult.success<E>()([this.value, otherValue] as const),
      onFailure: error => ParseResult.failure<[A, B]>()(error),
    });
}

export class ParseFailure<A, E> implements ParseResult<A, E> {
  private _type: "ParseFailure" = "ParseFailure";

  constructor(public error: E) {}

  match = <B>(match: ParseMatch<A, E, B>) => match.onFailure(this.error);
  bind = <B>(f: (value: A) => ParseResult<B, E>) =>
    ParseResult.failure<B>()(this.error);
  map = <B>(f: (value: A) => B) => ParseResult.failure<B>()(this.error);
  mapFailure = <B>(f: (error: E) => B) =>
    ParseResult.failure<A>()(f(this.error));
  tuple = <B>(other: ParseResult<B, E>, combineErrors?: (e1: E, e2: E) => E) =>
    other.match({
      onSuccess: otherValue => ParseResult.failure<[A, B]>()(this.error),
      onFailure: error =>
        ParseResult.failure<[A, B]>()(
          combineErrors ? combineErrors(this.error, error) : this.error
        ),
    });
}

export const ParseResult = {
  success:
    <E>() =>
    <A>(value: A): ParseResult<A, E> =>
      new ParseSuccess<A, E>(value),
  failure:
    <A>() =>
    <E>(error: E): ParseResult<A, E> =>
      new ParseFailure<A, E>(error),

  sequence: <A, E>(
    results: ParseResult<A, E>[],
    combineErrors?: (e1: E, e2: E) => E
  ): ParseResult<A[], E> =>
    results.reduce(
      (acc, result) =>
        acc.tuple(result, combineErrors).map(([a, b]) => [...a, b]),
      ParseResult.success<E>()<A[]>([])
    ),

  traverse: <A, B, E>(
    inputs: A[],
    map: (a: A) => ParseResult<B, E>,
    combineErrors?: (e1: E, e2: E) => E
  ): ParseResult<B[], E> =>
    ParseResult.sequence(inputs.map(map), combineErrors),

  runTry: <A, E>(err: (e: unknown) => E, run: () => A): ParseResult<A, E> => {
    try {
      return ParseResult.success<E>()(run());
    } catch (e) {
      return ParseResult.failure<A>()(err(e));
    }
  },
};
