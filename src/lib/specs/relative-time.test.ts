import { relativeTime } from "./relative-time";

describe("relativeTime", () => {
  it("formats a recent ISO timestamp as minutes ago", () => {
    const tenMinAgo = new Date(Date.now() - 10 * 60_000).toISOString();
    expect(relativeTime(tenMinAgo)).toBe("10m ago");
  });

  it("formats hours and days for older ISO timestamps", () => {
    const threeHoursAgo = new Date(Date.now() - 3 * 60 * 60_000).toISOString();
    const twoDaysAgo = new Date(
      Date.now() - 2 * 24 * 60 * 60_000
    ).toISOString();
    expect(relativeTime(threeHoursAgo)).toBe("3h ago");
    expect(relativeTime(twoDaysAgo)).toBe("2d ago");
  });

  it("falls back to a calendar date beyond two weeks", () => {
    expect(relativeTime("2020-01-15T00:00:00Z")).toBe("2020-01-15");
  });

  it("still parses the backend's compact run-id stamp", () => {
    expect(relativeTime("20200115-000000")).toBe("2020-01-15");
  });

  it("returns the raw string when nothing parses", () => {
    expect(relativeTime("not-a-timestamp")).toBe("not-a-timestamp");
  });
});
