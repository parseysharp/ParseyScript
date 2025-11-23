import * as PR from "./parseResult";
import * as M from "./maybe";
import * as N from "./navigate";
import * as Z from "./listZipper";
import * as Pipeable from "./pipeable";

export * from "./maybe";
export * from "./navigate";
export * from "./listZipper";
export * from "./parseResult";

const combineErrors = (e1: PR.ParseError[], e2: PR.ParseError[]) => [
  ...e1,
  ...e2,
];

const prefixErrors = <A>(
  result: PR.ParseResult<A, PR.ParseError[]>,
  prefix: string[]
) => result.mapFailure(errors => errors.map(error => error.withPrefix(prefix)));

const notNull = (
  name: string,
  input: M.Maybe<unknown>
): PR.ParseResult<unknown, PR.ParseError[]> =>
  input.match({
    onNothing: () =>
      PR.ParseResult.failure<unknown>()([
        new PR.ParseError("Null or missing value", name, input, []),
      ]),
    onJust: x => PR.ParseResult.success<PR.ParseError[]>()(x),
  });

export abstract class Parse<A> extends Pipeable.Class() {
  abstract run: <B>(
    nav: N.Navigator<B>
  ) => (x: M.Maybe<B>) => PR.ParseResult<A, PR.ParseError[]>;

  abstract name: () => string;

  static pure = <A>(x: A, name: string = "pure"): Parse<A> =>
    new PureParse<A>(name, x);

  bind = <B>(f: (value: A) => Parse<B>): Parse<B> =>
    new BindParse<A, B>(this, f);

  static bind =
    <A, B>(f: (value: A) => Parse<B>) =>
    (parse: Parse<A>): Parse<B> =>
      parse.bind(f);

  map = <B>(f: (value: A) => B): Parse<B> => new MapParse<A, B>(this, f);

  static map =
    <A, B>(f: (value: A) => B) =>
    (parse: Parse<A>): Parse<B> =>
      parse.map(f);

  tuple = <B>(
    other: Parse<B>,
    combineErrors?: (
      e1: PR.ParseError[],
      e2: PR.ParseError[]
    ) => PR.ParseError[]
  ): Parse<[A, B]> =>
    new ApplyParse<A, B, [A, B]>(this, other, (a, b) => [a, b] as const);

  static tuple =
    <A, B>(
      other: Parse<B>,
      combineErrors?: (
        e1: PR.ParseError[],
        e2: PR.ParseError[]
      ) => PR.ParseError[]
    ) =>
    (parse: Parse<A>): Parse<[A, B]> =>
      parse.tuple(other, combineErrors);

  filter = (f: (value: A) => string[]): Parse<A> =>
    new FilterParse<A, A>(this, x => {
      const errs = f(x);
      return errs.length === 0
        ? PR.ParseResult.success<PR.ParseError[]>()(x)
        : PR.ParseResult.failure<A>()(
            errs.map(e => new PR.ParseError(e, this.name(), x, []))
          );
    });

  static filter =
    <A>(f: (value: A) => string[]) =>
    (parse: Parse<A>): Parse<A> =>
      parse.filter(f);

  transform = <B>(
    name: string,
    f: (value: A) => PR.ParseResult<B, PR.ParseError[]>
  ): Parse<B> => new FilterParse<A, B>(this.withName(name), f);

  static transform =
    <A, B>(name: string, f: (value: A) => PR.ParseResult<B, PR.ParseError[]>) =>
    (parse: Parse<A>) =>
      parse.transform(name, f);

  maybe = (): Parse<M.Maybe<A>> => new MaybeParse<A>(this);

  static maybe =
    <A>() =>
    (parse: Parse<A>): Parse<M.Maybe<A>> =>
      parse.maybe();

  orElse = (other: Parse<A>): Parse<A> => new OrElseParse<A>(this, other);

  static orElse =
    <A>(other: Parse<A>) =>
    (parse: Parse<A>): Parse<A> =>
      parse.orElse(other);

  at = (head: string | number, tail: (string | number)[]): Parse<A> =>
    new PathParse<A>(
      Z.ListZipper.fromCons(N.Path.lift(head), tail.map(N.Path.lift)),
      this
    );

  static at =
    <A>(head: string | number, tail: (string | number)[]) =>
    (parse: Parse<A>): Parse<A> =>
      parse.at(head, tail);

  maybeAt = (
    head: string | number,
    tail: (string | number)[]
  ): Parse<M.Maybe<A>> =>
    [head, ...tail]
      .reverse()
      .reduce<Parse<M.Maybe<A>>>(
        (acc, x) =>
          acc
            .maybe()
            .at(x, [])
            .map(x => x.bind(_ => _)),
        this.maybe()
      )
      .maybe()
      .map(x => x.bind(_ => _));

  static maybeAt =
    <A>(head: string | number, tail: (string | number)[]) =>
    (parse: Parse<A>): Parse<M.Maybe<A>> =>
      parse.maybeAt(head, tail);

  seq = (): Parse<A[]> => new SeqParse<A>(this);

  static seq =
    <A>() =>
    (parse: Parse<A>): Parse<A[]> =>
      parse.seq();

  withName = (name: string): Parse<A> => new RenamedParse<A>(this, name);

  static withName =
    <A>(name: string) =>
    (parse: Parse<A>): Parse<A> =>
      parse.withName(name);

  static as = <A>(name: string, check: (x: unknown) => x is A): Parse<A> =>
    new ValueParse<A>(name, x => notNull(name, x).map(x => x as A)).filter(x =>
      check(x) ? [] : ["Type mismatch"]
    );

  static fail = <A>(err: string, extra?: string[]): Parse<A> =>
    new FailParse<A>(
      [err, ...(extra ?? [])].map(
        e => new PR.ParseError(e, "", M.Maybe.nothing(), [])
      )
    );

  static dateTimeOffsetFlex = (opts?: {
    epochIsMilliseconds?: boolean;
  }): Parse<Date> =>
    new ValueParse<Date>("DateTimeOffset", x =>
      notNull("DateTimeOffset", x).bind(v => {
        const d = M.Maybe.fromNullable(
          typeof v === "string"
            ? isNaN(parseInt(v))
              ? new Date(v)
              : new Date(
                  parseInt(v) * (opts?.epochIsMilliseconds ?? true ? 1 : 1000)
                )
            : typeof v === "number"
            ? new Date(v * (opts?.epochIsMilliseconds ?? true ? 1 : 1000))
            : null
        );

        return M.Maybe.filter(d, x => !isNaN(x.getTime())).match({
          onNothing: () =>
            PR.ParseResult.failure<Date>()([
              new PR.ParseError(
                typeof v === "string"
                  ? "Invalid timestamp (expected ISO-8601 Roundtrip)"
                  : "Invalid timestamp: non-finite number",
                "Date",
                v,
                []
              ),
            ]),
          onJust: d => PR.ParseResult.success<PR.ParseError[]>()(d),
        });
      })
    );

  static int = (name?: string): Parse<number> =>
    Parse.as(name ?? "int", x => typeof x === "number").filter(x =>
      !Number.isNaN(x) && Number.isInteger(x) ? [] : ["Not an integer"]
    );

  static intFromString = (): Parse<number> =>
    Parse.string("intFromString").transform("intFromString", x => {
      const n = Number(x.trim());
      return isNaN(n) || !Number.isFinite(n) || !Number.isInteger(n)
        ? PR.ParseResult.failure<number>()([
            new PR.ParseError("Invalid int", "intFromString", x, []),
          ])
        : PR.ParseResult.success<PR.ParseError[]>()(n);
    });

  static intFlex = (): Parse<number> =>
    Parse.int().orElse(Parse.intFromString());

  static float = (): Parse<number> =>
    Parse.as("float", x => typeof x === "number").filter(x =>
      !Number.isNaN(x) && Number.isFinite(x) ? [] : ["Not a float"]
    );

  static floatFromString = (): Parse<number> =>
    Parse.string("floatFromString").transform("floatFromString", x => {
      const n = Number(x.trim());
      return isNaN(n) || !Number.isFinite(n)
        ? PR.ParseResult.failure<number>()([
            new PR.ParseError("Invalid float", "floatFromString", x, []),
          ])
        : PR.ParseResult.success<PR.ParseError[]>()(n);
    });

  static floatFlex = (): Parse<number> =>
    Parse.float().orElse(Parse.floatFromString());

  static number = (): Parse<number> =>
    Parse.as("Number", x => typeof x === "number")
      .orElse(Parse.intFromString())
      .orElse(Parse.floatFromString());

  static string = (name?: string): Parse<string> =>
    Parse.as(name ?? "string", x => typeof x === "string");

  static bool = (): Parse<boolean> =>
    Parse.as("boolean", x => typeof x === "boolean").orElse(
      Parse.string("boolFromString").transform("boolFromString", x =>
        x.toLowerCase() === "true" || x.toLowerCase() === "false"
          ? PR.ParseResult.success<PR.ParseError[]>()(
              x.toLowerCase() === "true"
            )
          : PR.ParseResult.failure<boolean>()([
              new PR.ParseError("Invalid bool", "boolFromString", x, []),
            ])
      )
    );

  static nonEmptyString = (trim = true): Parse<string> =>
    Parse.string("nonEmptyString")
      .map(x => (trim ? x.trim() : x))
      .filter(x => (x.length > 0 ? [] : ["String must be non-empty"]));

  static zip2 = <A, B>(parser: Parse<A>, parser2: Parse<B>): Parse<[A, B]> =>
    parser.tuple(parser2, combineErrors);

  static zip3 = <A, B, C>(
    parser: Parse<A>,
    parser2: Parse<B>,
    parser3: Parse<C>
  ): Parse<[A, B, C]> =>
    parser
      .tuple(Parse.zip2(parser2, parser3), combineErrors)
      .map(([a, [b, c]]) => [a, b, c] as const);

  static zip4 = <A, B, C, D>(
    parser: Parse<A>,
    parser2: Parse<B>,
    parser3: Parse<C>,
    parser4: Parse<D>
  ): Parse<[A, B, C, D]> =>
    parser
      .tuple(Parse.zip3(parser2, parser3, parser4), combineErrors)
      .map(([a, [b, c, d]]) => [a, b, c, d] as const);

  static zip5 = <A, B, C, D, E, F>(
    parser: Parse<A>,
    parser2: Parse<B>,
    parser3: Parse<C>,
    parser4: Parse<D>,
    parser5: Parse<E>
  ): Parse<[A, B, C, D, E]> =>
    parser
      .tuple(Parse.zip4(parser2, parser3, parser4, parser5), combineErrors)
      .map(([a, [b, c, d, e]]) => [a, b, c, d, e] as const);

  static zip6 = <A, B, C, D, E, F>(
    parser: Parse<A>,
    parser2: Parse<B>,
    parser3: Parse<C>,
    parser4: Parse<D>,
    parser5: Parse<E>,
    parser6: Parse<F>
  ): Parse<[A, B, C, D, E, F]> =>
    parser
      .tuple(
        Parse.zip5(parser2, parser3, parser4, parser5, parser6),
        combineErrors
      )
      .map(([a, [b, c, d, e, f]]) => [a, b, c, d, e, f] as const);

  static zip7 = <A, B, C, D, E, F, G>(
    parser: Parse<A>,
    parser2: Parse<B>,
    parser3: Parse<C>,
    parser4: Parse<D>,
    parser5: Parse<E>,
    parser6: Parse<F>,
    parser7: Parse<G>
  ): Parse<[A, B, C, D, E, F, G]> =>
    parser
      .tuple(
        Parse.zip6(parser2, parser3, parser4, parser5, parser6, parser7),
        combineErrors
      )
      .map(([a, [b, c, d, e, f, g]]) => [a, b, c, d, e, f, g] as const);

  static mkSeq = (name: string): Parse<unknown[]> =>
    new ValueParse<unknown[]>(name, x =>
      notNull(name, x).bind(x =>
        Array.isArray(x)
          ? PR.ParseResult.success<PR.ParseError[]>()(x)
          : PR.ParseResult.failure<unknown[]>()([
              new PR.ParseError("Type mismatch", `${name}[]`, x, []),
            ])
      )
    );

  parse = <B>(
    nav: N.Navigator<B>,
    x: M.Maybe<B>
  ): PR.ParseResult<A, PR.FmtParseError[]> =>
    this.run(nav)(x).mapFailure(e => e.map(e => e.format()));

  static parse =
    <B>(nav: N.Navigator<B>, x: M.Maybe<B>) =>
    <A>(parser: Parse<A>): PR.ParseResult<A, PR.FmtParseError[]> =>
      parser.parse(nav, x);
}

class RenamedParse<A> extends Parse<A> {
  constructor(public parser: Parse<A>, public name_: string) {
    super();
  }

  name = () => this.name_;

  run = this.parser.run;
}

class FilterParse<A, X> extends Parse<X> {
  constructor(
    public parser: Parse<A>,
    public filter_: (x: A) => PR.ParseResult<X, PR.ParseError[]>
  ) {
    super();
  }

  name = this.parser.name;

  run =
    <B>(nav: N.Navigator<B>) =>
    (x: M.Maybe<B>): PR.ParseResult<X, PR.ParseError[]> =>
      this.parser.run(nav)(x).bind(this.filter_);
}

export class FailParse<A> extends Parse<A> {
  constructor(public errors: PR.ParseError[]) {
    super();
  }

  name = () => "Failure";

  run =
    <B>(nav: N.Navigator<B>) =>
    (x: M.Maybe<B>): PR.ParseResult<A, PR.ParseError[]> =>
      PR.ParseResult.failure<A>()(this.errors);
}

export class BindParse<A, X> extends Parse<X> {
  constructor(public parser: Parse<A>, public f: (x: A) => Parse<X>) {
    super();
  }

  name = this.parser.name;

  run =
    <B>(nav: N.Navigator<B>) =>
    (x: M.Maybe<B>): PR.ParseResult<X, PR.ParseError[]> =>
      this.parser
        .run(nav)(x)
        .bind(y => this.f(y).run(nav)(x));
}

export class MapParse<A, X> extends Parse<X> {
  constructor(public parser: Parse<A>, public f: (x: A) => X) {
    super();
  }

  name = this.parser.name;

  run =
    <B>(nav: N.Navigator<B>) =>
    (x: M.Maybe<B>): PR.ParseResult<X, PR.ParseError[]> =>
      this.parser.run(nav)(x).map(this.f);
}

export class ApplyParse<A, B, C> extends Parse<C> {
  constructor(
    public pa: Parse<A>,
    public pb: Parse<B>,
    public f: (a: A, b: B) => C
  ) {
    super();
  }

  name = () => `${this.pa.name} -> ${this.pb.name}`;

  run =
    <X>(nav: N.Navigator<X>) =>
    (x: M.Maybe<X>): PR.ParseResult<C, PR.ParseError[]> =>
      this.pa
        .run(nav)(x)
        .tuple(this.pb.run(nav)(x), combineErrors)
        .map(([a, b]) => this.f(a, b));
}

export class PureParse<A> extends Parse<A> {
  constructor(public name_: string, public value: A) {
    super();
  }

  name = () => this.name_;

  run =
    <B>(nav: N.Navigator<B>) =>
    (x: M.Maybe<B>): PR.ParseResult<A, PR.ParseError[]> =>
      PR.ParseResult.success<PR.ParseError[]>()(this.value);
}

export class ValueParse<A> extends Parse<A> {
  constructor(
    public name_: string,
    public run_: (x: M.Maybe<unknown>) => PR.ParseResult<A, PR.ParseError[]>
  ) {
    super();
  }

  name = () => this.name_;

  run =
    <B>(nav: N.Navigator<B>) =>
    (x: M.Maybe<B>): PR.ParseResult<A, PR.ParseError[]> =>
      x.match({
        onNothing: () => this.run_(M.Maybe.nothing()),
        onJust: x =>
          nav.unbox(x).match({
            onSuccess: this.run_,
            onFailure: e =>
              PR.ParseResult.failure<A>()([
                new PR.ParseError(
                  "Could not unbox value",
                  this.name_,
                  typeof x,
                  []
                ),
              ]),
          }),
      });
}

export class OrElseParse<A> extends Parse<A> {
  constructor(public p1: Parse<A>, public p2: Parse<A>) {
    super();
  }

  name = () => `${this.p1.name()} || ${this.p2.name()}`;

  run =
    <B>(nav: N.Navigator<B>) =>
    (x: M.Maybe<B>): PR.ParseResult<A, PR.ParseError[]> =>
      this.p1
        .run(nav)(x)
        .match<PR.ParseResult<A, PR.ParseError[]>>({
          onSuccess: (value: A) =>
            PR.ParseResult.success<PR.ParseError[]>()(value),
          onFailure: _ => this.p2.run(nav)(x),
        });
}

export class PathParse<A> extends Parse<A> {
  constructor(public path: Z.ListZipper<N.Path>, public parser: Parse<A>) {
    super();
  }

  name = this.parser.name;

  run =
    <B>(nav: N.Navigator<B>) =>
    (x: M.Maybe<B>): PR.ParseResult<A, PR.ParseError[]> =>
      N.PathParser.navigate(nav, this.path, this.name(), x).bind(x =>
        prefixErrors(
          this.parser.run<B>(nav)(x),
          this.path.toArray().map(x => x.toString())
        )
      );
}

class SeqParse<A> extends Parse<A[]> {
  constructor(public parser: Parse<A>) {
    super();
  }

  name = () => `${this.parser.name()}[]`;

  run =
    <B>(nav: N.Navigator<B>) =>
    (x: M.Maybe<B>): PR.ParseResult<A[], PR.ParseError[]> =>
      Parse.mkSeq(this.name())
        .run<B>(nav)(x)
        .bind(xs =>
          PR.ParseResult.traverse(
            xs.map((u, i) => [u, i] as const),
            t =>
              prefixErrors(
                // cast to B and let navigator figure out the rest
                this.parser.run(nav)(M.Maybe.fromNullable(t[0] as B)),
                [`[${t[1]}]`]
              )
          )
        );
}

class MaybeParse<A> extends Parse<M.Maybe<A>> {
  constructor(public parser: Parse<A>) {
    super();
  }

  name = () => `Maybe(${this.parser.name()})`;

  run =
    <B>(nav: N.Navigator<B>) =>
    (x: M.Maybe<B>): PR.ParseResult<M.Maybe<A>, PR.ParseError[]> =>
      x.match({
        onNothing: () =>
          PR.ParseResult.success<PR.ParseError[]>()(M.Maybe.nothing()),
        onJust: i =>
          nav.unbox(i).match({
            onFailure: l =>
              PR.ParseResult.failure<M.Maybe<A>>()([
                new PR.ParseError("Could not unbox value", this.name(), l, []),
              ]),
            onSuccess: x =>
              x.match({
                onJust: _ =>
                  this.parser.run<B>(nav)(x).map(M.Maybe.fromNullable),
                onNothing: () =>
                  PR.ParseResult.success<PR.ParseError[]>()(M.Maybe.nothing()),
              }),
          }),
      });
}
