import { describe, expect, it } from "vitest";
import { appInfo, creditLine } from "@/lib/app-info";

describe("appInfo", () => {
  it("names the app", () => {
    expect(appInfo.name).toBe("DRAFTEX");
  });

  it("credits its maker", () => {
    expect(creditLine).toBe("Made by Krishnarajsinh Hitesh Dodiya");
  });
});
