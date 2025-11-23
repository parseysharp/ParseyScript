import * as PR from "./parseResult";

export type MaybeMatch<A, B> = {
  onJust: (value: A) => B;
  onNothing: () => B;
};

export interface Maybe<A> {
  match: <B>(match: MaybeMatch<A, B>) => B;
  map: <B>(f: (value: A) => B) => Maybe<B>;
  bind: <B>(f: (value: A) => Maybe<B>) => Maybe<B>;
}

export class MaybeJust<A> implements Maybe<A> {
  private _type: "MaybeJust" = "MaybeJust";

  constructor(public value: A) {}

  match = <B>(match: MaybeMatch<A, B>) => match.onJust(this.value);
  map = <B>(f: (value: A) => B) => Maybe.just(f(this.value));
  bind = <B>(f: (value: A) => Maybe<B>) => f(this.value);

  toString = () => `Just(${this.value})`;
}

export class MaybeNothing<A> implements Maybe<A> {
  private _type: "MaybeNothing" = "MaybeNothing";

  constructor() {}

  match = <B>(match: MaybeMatch<A, B>) => match.onNothing();
  map = <B>(f: (value: A) => B) => Maybe.nothing<B>();
  bind = <B>(f: (value: A) => Maybe<B>) => Maybe.nothing<B>();

  toString = () => "Nothing";
}

export const Maybe = {
  just: <A>(value: A): Maybe<A> => new MaybeJust<A>(value),
  nothing: <A>(): Maybe<A> => new MaybeNothing<A>(),
  toNullable: <A>(maybe: Maybe<A>): A | null =>
    maybe.match({ onJust: x => x, onNothing: () => null }),

  fromNullable: <A>(value: A | null): Maybe<A> =>
    value === null || value === undefined
      ? Maybe.nothing<A>()
      : Maybe.just(value),

  filter: <A>(maybe: Maybe<A>, predicate: (value: A) => boolean): Maybe<A> =>
    maybe.match({
      onJust: x => (predicate(x) ? Maybe.just(x) : Maybe.nothing()),
      onNothing: () => Maybe.nothing(),
    }),

  toResult: <A, E>(maybe: Maybe<A>, error: E): PR.ParseResult<A, E> =>
    maybe.match<PR.ParseResult<A, E>>({
      onJust: x => PR.ParseResult.success<E>()(x),
      onNothing: () => PR.ParseResult.failure<A>()(error),
    }),
};
