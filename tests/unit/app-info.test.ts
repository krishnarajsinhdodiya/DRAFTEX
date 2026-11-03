import { describe, expect, it } from "vitest";
import pkg from "../../package.json";
import { appInfo, creditLine } from "@/lib/app-info";

describe("appInfo", () => {
  it("names the app", () => {
    expect(appInfo.name).toBe("DRAFTEX");
  });

  it("credits its maker", () => {
    expect(creditLine).toBe("Made by Krishnarajsinh Hitesh Dodiya");
  });

  it("reports the version from package.json", () => {
    expect(appInfo.version).toBe(pkg.version);
    expect(appInfo.version).toMatch(/^\d+\.\d+\.\d+$/);
  });
});
