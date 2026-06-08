import { describe, it, expect } from "vitest";
import { buildEnrollmentToastMessage } from "./notification-toast";

describe("buildEnrollmentToastMessage", () => {
  it("returns null when there are no fresh notifications", () => {
    expect(buildEnrollmentToastMessage([])).toBeNull();
  });

  it("names the student when there is exactly one", () => {
    expect(
      buildEnrollmentToastMessage([
        { actorName: "Ada Lovelace", courseTitle: "Intro to Rust" },
      ])
    ).toBe("Ada Lovelace enrolled in Intro to Rust");
  });

  it("summarizes the count when there is more than one", () => {
    expect(
      buildEnrollmentToastMessage([
        { actorName: "Ada Lovelace", courseTitle: "Intro to Rust" },
        { actorName: "Alan Turing", courseTitle: "Intro to Rust" },
        { actorName: "Grace Hopper", courseTitle: "Advanced TS" },
      ])
    ).toBe("3 new students enrolled in your courses");
  });
});
