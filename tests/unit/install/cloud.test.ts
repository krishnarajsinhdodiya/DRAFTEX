import { describe, expect, it } from "vitest";
import { cloudSyncedFolder, cloudWarning } from "@/lib/install/cloud";

const win = (env: Record<string, string> = {}) => ({
  platform: "win32" as const,
  homedir: "C:\\Users\\Ravi",
  env,
});
const mac = { platform: "darwin" as const, homedir: "/Users/ravi", env: {} };
const linux = { platform: "linux" as const, homedir: "/home/ravi", env: {} };

describe("cloudSyncedFolder", () => {
  it("finds OneDrive from its environment variables, ignoring case on Windows", () => {
    const deps = win({ OneDrive: "C:\\Users\\Ravi\\OneDrive - KSV" });
    expect(cloudSyncedFolder("c:\\users\\ravi\\onedrive - ksv\\DRAFTEX-data", deps)).toBe(
      "OneDrive",
    );
    expect(cloudSyncedFolder("C:\\Users\\Ravi\\OneDrive - KSV", deps)).toBe("OneDrive");
    const business = win({ OneDriveCommercial: "D:\\Work" });
    expect(cloudSyncedFolder("D:\\Work\\papers", business)).toBe("OneDrive");
    expect(cloudSyncedFolder("D:\\Workshop", business)).toBeNull();
  });

  it("finds sync folders by their usual names", () => {
    expect(cloudSyncedFolder("C:\\Users\\Ravi\\Dropbox\\x", win())).toBe("Dropbox");
    expect(cloudSyncedFolder("C:\\Users\\Ravi\\OneDrive\\x", win())).toBe("OneDrive");
    expect(cloudSyncedFolder("G:\\My Drive\\x", win())).toBe("Google Drive");
    expect(cloudSyncedFolder("/home/ravi/Google Drive/x", linux)).toBe("Google Drive");
    expect(cloudSyncedFolder("/home/ravi/Box", linux)).toBe("Box");
    expect(cloudSyncedFolder("/Users/ravi/iCloud Drive/x", mac)).toBe("iCloud Drive");
  });

  it("finds iCloud and macOS cloud storage folders", () => {
    expect(
      cloudSyncedFolder("/Users/ravi/Library/Mobile Documents/com~apple~CloudDocs/d", mac),
    ).toBe("iCloud Drive");
    expect(cloudSyncedFolder("/Users/ravi/Library/CloudStorage/GoogleDrive-x/d", mac)).toBe(
      "a cloud storage service",
    );
  });

  it("passes ordinary folders", () => {
    expect(cloudSyncedFolder("C:\\Users\\Ravi\\DRAFTEX-data", win())).toBeNull();
    expect(cloudSyncedFolder("/Users/ravi/DRAFTEX-data", mac)).toBeNull();
    expect(cloudSyncedFolder("/Volumes/DRAFTEX/DRAFTEX-data", mac)).toBeNull();
    expect(cloudSyncedFolder("/home/ravi/boxes", linux)).toBeNull();
  });
});

describe("cloudWarning", () => {
  it("names the service and the folder, or says nothing", () => {
    const w = cloudWarning("C:\\Users\\Ravi\\Dropbox\\d", "The data folder", win());
    expect(w).toContain('The data folder "C:\\Users\\Ravi\\Dropbox\\d"');
    expect(w).toContain("Dropbox");
    expect(w).toContain("unreleased papers");
    expect(cloudWarning("/Users/ravi/DRAFTEX-data", "The data folder", mac)).toBeNull();
  });
});
