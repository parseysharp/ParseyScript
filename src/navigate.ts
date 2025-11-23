import * as PR from "./parseResult";
import * as M from "./maybe";
import * as Z from "./listZipper";

export class Key {
  public readonly _type: "PathSegKey" = "PathSegKey";
  constructor(public name: string) {}

  toString = () => this.name;
}
export class Index {
  public readonly _type: "PathSegIndex" = "PathSegIndex";
  constructor(public i: number) {}

  toString = () => `[${this.i}]`;
}

export type Path = Key | Index;

type PathMatch<B> = {
  onKey: (name: string) => B;
  onIndex: (i: number) => B;
};

export const Path = {
  Key: (name: string) => new Key(name),
  Index: (i: number) => new Index(i),

  match: <B>(seg: Path, match: PathMatch<B>) =>
    seg._type === "PathSegKey" ? match.onKey(seg.name) : match.onIndex(seg.i),

  lift: (x: string | number) =>
    typeof x === "string" ? Path.Key(x) : Path.Index(x),
};

export interface Navigator<S> {
  prop: (s: S, k: string) => PR.ParseResult<M.Maybe<S>, S>;
  index: (s: S, i: number) => PR.ParseResult<M.Maybe<S>, S>;
  unbox: (s: S) => PR.ParseResult<M.Maybe<S>, S>;
  cloneNode: (s: S) => S;
}

export const Navigator = {
  unknown: (): Navigator<unknown> => ({
    prop: (s: unknown, k: string) =>
      typeof s === "object"
        ? PR.ParseResult.success<unknown>()(
            M.Maybe.fromNullable<unknown>((s as any)[k])
          )
        : PR.ParseResult.failure<M.Maybe<unknown>>()<unknown>(s),
    index: (s: unknown, i: number) =>
      Array.isArray(s) && i >= 0
        ? PR.ParseResult.success<unknown>()(M.Maybe.fromNullable((s as any)[i]))
        : PR.ParseResult.failure<M.Maybe<unknown>>()(s),
    unbox: (s: unknown) =>
      PR.ParseResult.success<unknown>()(M.Maybe.fromNullable(s)),
    cloneNode: (s: unknown) => s,
  }),
};

export const PathParser = {
  nextStep: <B>(
    path: Z.ListZipper<Path>,
    getNext: (b: B) => PR.ParseResult<M.Maybe<B>, B>,
    runNext: (b: M.Maybe<B>) => PR.ParseResult<B, PR.ParseError[]>,
    input: M.Maybe<B>
  ): PR.ParseResult<M.Maybe<B>, PR.ParseError[]> =>
    input.match({
      onNothing: () => runNext(M.Maybe.nothing<B>()).map(M.Maybe.just),
      onJust: i =>
        getNext(i).match({
          onFailure: _ => runNext(M.Maybe.nothing<B>()).map(M.Maybe.just),
          onSuccess: x =>
            x.match({
              onNothing: () =>
                path.nexts.length === 0
                  ? PR.ParseResult.success<PR.ParseError[]>()(M.Maybe.nothing())
                  : runNext(M.Maybe.nothing<B>()).map(M.Maybe.just),
              onJust: x => runNext(M.Maybe.just(x)).map(M.Maybe.just),
            }),
        }),
    }),

  navigate: <B>(
    nav: Navigator<B>,
    path: Z.ListZipper<Path>,
    name: string,
    input: M.Maybe<B>
  ): PR.ParseResult<M.Maybe<B>, PR.ParseError[]> =>
    path.fold(PR.ParseResult.success<PR.ParseError[]>()(input), (acc, z) =>
      acc.bind(cur =>
        Path.match(z.focus, {
          onKey: k =>
            PathParser.nextStep<B>(
              z,
              cur => nav.prop(cur, k),
              x =>
                M.Maybe.toResult(x, [
                  new PR.ParseError(
                    `Missing property ${k}`,
                    name,
                    cur.map(nav.cloneNode),
                    [...z.prevs].reverse().map(x => x.toString())
                  ),
                ]),
              cur
            ),
          onIndex: i =>
            PathParser.nextStep<B>(
              z,
              cur => nav.index(cur, i),
              x =>
                M.Maybe.toResult(x, [
                  new PR.ParseError(
                    `Missing index ${i}`,
                    name,
                    cur.map(nav.cloneNode),
                    [...z.prevs].reverse().map(x => x.toString())
                  ),
                ]),
              cur
            ),
        })
      )
    ),
};
