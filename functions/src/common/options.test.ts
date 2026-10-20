import { describe, expect, it } from "vitest";
import { REGION } from "./options.js";

describe("humo", () => {
  it("la región global es us-east4 (D-010)", () => {
    expect(REGION).toBe("us-east4");
  });
});
