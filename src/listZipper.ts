import * as M from "./maybe";

export class ListZipper<A> {
  private _type: "ListZipper" = "ListZipper";

  constructor(public prevs: A[], public focus: A, public nexts: A[]) {}

  next = (): M.Maybe<ListZipper<A>> =>
    ListZipper.headAndTailSafe(this.nexts).map(
      r => new ListZipper<A>([this.focus, ...this.prevs], r[0], r[1])
    );

  prev = (): M.Maybe<ListZipper<A>> =>
    ListZipper.headAndTailSafe(this.prevs).map(
      l => new ListZipper<A>(l[1], l[0], [this.focus, ...this.nexts])
    );

  rewind = (z: ListZipper<A>): ListZipper<A> =>
    z.prev().match({
      onJust: nz => this.rewind(nz),
      onNothing: () => z,
    });

  public toArray = (): A[] => [
    ...[...this.prevs].reverse(),
    this.focus,
    ...this.nexts,
  ];

  fold = <S>(seed: S, f: (acc: S, z: ListZipper<A>) => S) => {
    const go = (acc: S, z: ListZipper<A>): S =>
      z.next().match({
        onJust: nz => go(f(acc, z), nz),
        onNothing: () => f(acc, z),
      });

    return go(seed, this);
  };

  public static fromSeq = <A>(xs: A[]): M.Maybe<ListZipper<A>> =>
    ListZipper.headAndTailSafe(xs).map(x => new ListZipper<A>([], x[0], x[1]));

  public static fromCons = <A>(head: A, xs: A[]): ListZipper<A> =>
    new ListZipper([], head, xs);

  public static headAndTailSafe = <A>(lst: A[]): M.Maybe<[A, A[]]> =>
    lst[0] ? M.Maybe.just([lst[0], lst.slice(1)]) : M.Maybe.nothing();
}
