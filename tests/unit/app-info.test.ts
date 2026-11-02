import { describe, expect, it } from "vitest";
import { appInfo } from "@/lib/app-info";

describe("appInfo", () => {
  it("names the app", () => {
    expect(appInfo.name).toBe("DRAFTEX");
  });
});
