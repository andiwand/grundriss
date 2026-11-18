import { expect, it } from "vitest";
import { TextError } from "../src/model/errors";

it("keeps the key of an error apart from its values, and fills them into the message", () => {
  const error = new TextError('Poly Haven has no glTF file of "{name}".', { name: "Chair" });
  expect(error.message).toBe('Poly Haven has no glTF file of "Chair".');
  expect(error.key).toBe('Poly Haven has no glTF file of "{name}".');
  expect(error).toBeInstanceOf(Error);
  // A name without a value stays.
  expect(new TextError("{a} and {b}", { a: 1 }).message).toBe("1 and {b}");
});
