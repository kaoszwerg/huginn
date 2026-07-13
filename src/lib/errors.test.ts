import { describe, it, expect } from "vitest";
import { errorMessage } from "./errors";

describe("errorMessage", () => {
  it("passes a rejected command string through untouched", () => {
    expect(errorMessage("io error at C:/x: missing")).toBe("io error at C:/x: missing");
  });

  it("unwraps an Error instance", () => {
    expect(errorMessage(new Error("boom"))).toBe("boom");
  });

  it("reads the message field of a plain object", () => {
    expect(errorMessage({ message: "nested" })).toBe("nested");
  });

  it("stringifies anything else", () => {
    expect(errorMessage(42)).toBe("42");
  });
});
