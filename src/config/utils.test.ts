import { stringbool, trimTrailingSlash } from "./utils";

describe("trimTrailingSlash", () => {
  it("removes a trailing slash", () => {
    expect(trimTrailingSlash("https://example.com/")).toBe("https://example.com");
  });

  it("leaves a url without trailing slash unchanged", () => {
    expect(trimTrailingSlash("https://example.com")).toBe("https://example.com");
  });

  it("only removes the last slash", () => {
    expect(trimTrailingSlash("https://example.com/path/")).toBe("https://example.com/path");
  });

  it("returns null for undefined", () => {
    expect(trimTrailingSlash(undefined)).toBeNull();
  });

  it("returns null for empty string", () => {
    expect(trimTrailingSlash("")).toBeNull();
  });
});

describe("stringbool", () => {
  it("returns true for 'true'", () => {
    expect(stringbool("true")).toBe(true);
  });

  it("returns true for 'TRUE' (case-insensitive)", () => {
    expect(stringbool("TRUE")).toBe(true);
  });

  it("returns true for '1'", () => {
    expect(stringbool("1")).toBe(true);
  });

  it("returns false for 'false'", () => {
    expect(stringbool("false")).toBe(false);
  });

  it("returns false for '0'", () => {
    expect(stringbool("0")).toBe(false);
  });

  it("returns false for undefined", () => {
    expect(stringbool(undefined)).toBe(false);
  });

  it("returns false for empty string", () => {
    expect(stringbool("")).toBe(false);
  });

  it("returns false for an arbitrary string", () => {
    expect(stringbool("yes")).toBe(false);
  });
});
