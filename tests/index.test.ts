import { describe, it } from "vitest";
import * as P from "../src";

type Either<L, R> =
  | {
      type: "left";
      left: L;
    }
  | {
      type: "right";
      right: R;
    };

const left = <L, R>(left: L): Either<L, R> => ({ type: "left", left });
const right = <L, R>(right: R): Either<L, R> => ({ type: "right", right });

const parseEither = <L, R>(
  parseLeft: P.Parse<L>,
  parseRight: P.Parse<R>
): P.Parse<Either<L, R>> =>
  P.Parse.string()
    .at("kind", [])
    .bind(x =>
      x === "left"
        ? parseLeft.at("left", []).map(x => left<L, R>(x))
        : x === "right"
        ? parseRight.at("right", []).map(x => right<L, R>(x))
        : P.Parse.fail<Either<L, R>>("Invalid type").at("kind", [])
    );

describe("greet", () => {
  it("parses things", () => {
    const parser = P.Parse.zip4(
      P.Parse.string().maybeAt("some", ["nested", "path"]),
      P.Parse.dateTimeOffsetFlex({
        epochIsMilliseconds: true,
      }).at("some", ["other", "path"]),
      P.Parse.bool().at("the", ["flag"]),
      P.Parse.floatFlex().at("the", ["number"])
    ).map(([a, b, c, d]) => ({ a, b, c, d }));

    var objInput = {
      the: {
        number: 23,
        flag: "false",
      },
      some: {
        other: {
          path: "1762912054467",
        },
        nested: {
          path: "hello",
        },
      },
    };

    var result = parser.parse(
      P.Navigator.unknown(),
      P.Maybe.fromNullable(objInput)
    );
    console.log(result);

    const singleParser = parseEither(
      P.Parse.string().filter(s => (s.length < 5 ? ["Too short!"] : [])),
      P.Parse.intFlex()
        .filter(x => (x < 21 ? ["Too low!"] : []))
        .maybe()
        .map(P.Maybe.toNullable)
    );
    const seqParser = singleParser.seq();
    const seqInput = [
      {
        kind: "left",
        left: "hello",
      },
      {
        kind: "left",
        left: "clarice",
      },
      {
        kind: "right",
        right: null,
      },
      {
        kind: "left",
        left: "fortytwo",
      },
      {
        kind: "right",
        right: 42,
      },
    ];
    const result2 = seqParser.parse(
      P.Navigator.unknown(),
      P.Maybe.fromNullable(seqInput)
    );
    console.log(result2);
  });
});
