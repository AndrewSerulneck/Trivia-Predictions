import { describe, it, expect } from "vitest";
import {
  getThursdayOfWeek,
  calculateNFLWeekNumber,
  getNFLWeekRange,
  getNFLWeeksForSeason,
} from "@/lib/nflWeekUtils";

describe("NFL Week Calculation", () => {
  describe("getThursdayOfWeek", () => {
    const testCases = [
      { input: "2024-09-05", expected: "2024-09-05", desc: "Thursday" },
      { input: "2024-09-08", expected: "2024-09-05", desc: "Sunday" },
      { input: "2024-09-04", expected: "2024-08-29", desc: "Wednesday (prev week)" },
      { input: "2024-09-09", expected: "2024-09-05", desc: "Monday" },
      { input: "2024-01-01", expected: "2023-12-28", desc: "New Year (prev year)" },
    ];

    testCases.forEach(({ input, expected, desc }) => {
      it(`returns ${expected} for ${desc}`, () => {
        const result = getThursdayOfWeek(new Date(input));
        expect(result.toISOString().slice(0, 10)).toBe(expected);
      });
    });
  });

  describe("calculateNFLWeekNumber", () => {
    it("calculates 2024 season correctly", () => {
      // 2024 Week 1: Sept 5
      expect(calculateNFLWeekNumber(new Date("2024-09-05"), 2024)).toBe(1);
      expect(calculateNFLWeekNumber(new Date("2024-09-12"), 2024)).toBe(2);
      expect(calculateNFLWeekNumber(new Date("2024-09-19"), 2024)).toBe(3);
      expect(calculateNFLWeekNumber(new Date("2024-12-26"), 2024)).toBe(17);
      expect(calculateNFLWeekNumber(new Date("2025-01-02"), 2024)).toBe(18);
    });

    it("handles years where Sept 1 is Friday-Sunday", () => {
      // 2025: Sept 1 is Monday
      expect(calculateNFLWeekNumber(new Date("2025-09-04"), 2025)).toBe(1);
    });
  });

  describe("getNFLWeekRange", () => {
    it("returns correct 5-day range", () => {
      const thursday = new Date("2024-09-05");
      const range = getNFLWeekRange(thursday);

      expect(range.start.toISOString().slice(0, 10)).toBe("2024-09-05");
      expect(range.end.toISOString().slice(0, 10)).toBe("2024-09-09"); // Monday
    });

    it("sets correct times", () => {
      const thursday = new Date("2024-09-05T12:00:00Z");
      const range = getNFLWeekRange(thursday);

      expect(range.start.getUTCHours()).toBe(0);
      expect(range.end.getUTCHours()).toBe(23);
    });
  });

  describe("getNFLWeeksForSeason", () => {
    it("returns 18 weeks for 2024 season", () => {
      const weeks = getNFLWeeksForSeason(2024);
      expect(weeks).toHaveLength(18);
    });

    it("weeks are sequential by week number", () => {
      const weeks = getNFLWeeksForSeason(2024);

      for (let i = 1; i < weeks.length; i++) {
        // Each week starts 7 days after the previous week started
        const prevStart = weeks[i - 1].startDate.getTime();
        const currStart = weeks[i].startDate.getTime();
        const sevenDays = 7 * 24 * 60 * 60 * 1000;
        expect(currStart - prevStart).toBe(sevenDays);
      }
    });

    it("first week starts in September", () => {
      const weeks = getNFLWeeksForSeason(2024);
      expect(weeks[0].startDate.getUTCMonth()).toBe(8); // September (0-indexed)
    });
  });
});
