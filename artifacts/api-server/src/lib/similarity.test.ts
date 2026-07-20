import { describe, it, expect } from "vitest";
import { computeMatchedRanges, computePairSimilarity } from "./similarity";

describe("computeMatchedRanges", () => {
  it("returns no ranges for unrelated texts", () => {
    const { aRanges, bRanges } = computeMatchedRanges(
      "the quick brown fox jumps over",
      "completely different words entirely here now",
    );
    expect(aRanges).toEqual([]);
    expect(bRanges).toEqual([]);
  });

  it("highlights the full text for identical texts", () => {
    const text = "the quick brown fox jumps over the lazy dog";
    const { aRanges, bRanges } = computeMatchedRanges(text, text);
    expect(aRanges).toEqual([{ start: 0, end: text.length }]);
    expect(bRanges).toEqual([{ start: 0, end: text.length }]);
  });

  it("highlights a shared passage embedded in different texts", () => {
    const shared = "climate change threatens coastal cities worldwide";
    const a = `My intro here. ${shared} And my conclusion.`;
    const b = `Different opening lines first. ${shared} Then other things.`;
    const { aRanges, bRanges } = computeMatchedRanges(a, b);
    expect(aRanges.length).toBe(1);
    expect(a.slice(aRanges[0].start, aRanges[0].end)).toBe(shared);
    expect(bRanges.length).toBe(1);
    expect(b.slice(bRanges[0].start, bRanges[0].end)).toBe(shared);
  });

  it("matching is case- and punctuation-insensitive, consistent with scoring", () => {
    const a = "Climate Change threatens coastal cities!";
    const b = "climate change threatens coastal cities";
    const { aRanges, bRanges } = computeMatchedRanges(a, b);
    expect(aRanges.length).toBe(1);
    expect(bRanges.length).toBe(1);
    expect(computePairSimilarity(a, b)).toBe(100);
  });

  it("ranges use character offsets into the original text", () => {
    const a = "AAA one two three four BBB";
    const b = "one two three four";
    const { aRanges } = computeMatchedRanges(a, b);
    expect(a.slice(aRanges[0].start, aRanges[0].end)).toBe(
      "one two three four",
    );
  });
});
