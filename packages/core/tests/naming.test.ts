import { describe, expect, it } from "vitest";

import {
  applyFieldConvention,
  applyFileConvention,
  applyTypeConvention,
  autoNameInlineJson,
  resolveFieldIdent,
  resolveTypeFilename,
  resolveTypeIdent,
  splitWords,
  toCamelCase,
  toKebabCase,
  toPascalCase,
  toSnakeCase,
} from "../src/naming/index.js";

describe("splitWords", () => {
  it("splits camelCase", () => {
    expect(splitWords("createdAt")).toEqual(["created", "At"]);
  });

  it("splits PascalCase", () => {
    expect(splitWords("UserSettings")).toEqual(["User", "Settings"]);
  });

  it("splits snake_case", () => {
    expect(splitWords("user_settings")).toEqual(["user", "settings"]);
  });

  it("splits kebab-case", () => {
    expect(splitWords("user-settings")).toEqual(["user", "settings"]);
  });

  it("splits SCREAMING_SNAKE", () => {
    expect(splitWords("LEGACY_VALUE")).toEqual(["LEGACY", "VALUE"]);
  });

  it("handles acronyms (HTMLParser → HTML + Parser)", () => {
    expect(splitWords("HTMLParser")).toEqual(["HTML", "Parser"]);
  });

  it("handles digits as part of words", () => {
    expect(splitWords("user2")).toEqual(["user2"]);
  });

  it("returns empty for empty input", () => {
    expect(splitWords("")).toEqual([]);
  });
});

describe("casing transformations", () => {
  it("toPascalCase", () => {
    expect(toPascalCase("user_settings")).toBe("UserSettings");
    expect(toPascalCase("createdAt")).toBe("CreatedAt");
    expect(toPascalCase("status")).toBe("Status");
    expect(toPascalCase("HTMLParser")).toBe("HtmlParser");
  });

  it("toCamelCase", () => {
    expect(toCamelCase("UserSettings")).toBe("userSettings");
    expect(toCamelCase("user_settings")).toBe("userSettings");
    expect(toCamelCase("Status")).toBe("status");
  });

  it("toSnakeCase", () => {
    expect(toSnakeCase("UserSettings")).toBe("user_settings");
    expect(toSnakeCase("createdAt")).toBe("created_at");
    expect(toSnakeCase("HTMLParser")).toBe("html_parser");
  });

  it("toKebabCase", () => {
    expect(toKebabCase("UserSettings")).toBe("user-settings");
    expect(toKebabCase("createdAt")).toBe("created-at");
  });
});

describe("applyTypeConvention", () => {
  it("PascalCase", () => {
    expect(applyTypeConvention("status", "PascalCase")).toBe("Status");
  });
  it("camelCase", () => {
    expect(applyTypeConvention("UserSettings", "camelCase")).toBe("userSettings");
  });
  it("preserve", () => {
    expect(applyTypeConvention("status", "preserve")).toBe("status");
    expect(applyTypeConvention("UserSettings", "preserve")).toBe("UserSettings");
  });
});

describe("applyFieldConvention", () => {
  it("camelCase", () => {
    expect(applyFieldConvention("first_name", "camelCase")).toBe("firstName");
  });
  it("snake_case", () => {
    expect(applyFieldConvention("firstName", "snake_case")).toBe("first_name");
  });
  it("preserve", () => {
    expect(applyFieldConvention("first_name", "preserve")).toBe("first_name");
  });
});

describe("applyFileConvention (all 5 conventions)", () => {
  it("PascalCase", () => {
    expect(applyFileConvention("settings_order", "PascalCase")).toBe("SettingsOrder");
  });
  it("camelCase", () => {
    expect(applyFileConvention("SettingsOrder", "camelCase")).toBe("settingsOrder");
  });
  it("snake_case", () => {
    expect(applyFileConvention("SettingsOrder", "snake_case")).toBe("settings_order");
  });
  it("kebab-case", () => {
    expect(applyFileConvention("SettingsOrder", "kebab-case")).toBe("settings-order");
  });
  it("preserve", () => {
    expect(applyFileConvention("SettingsOrder", "preserve")).toBe("SettingsOrder");
  });
});

describe("resolveTypeIdent", () => {
  it("uses override verbatim when present", () => {
    expect(
      resolveTypeIdent({
        schemaName: "status",
        override: "BulkJobStatus",
        convention: "snake_case",
      }),
    ).toBe("BulkJobStatus");
  });

  it("applies convention when no override", () => {
    expect(
      resolveTypeIdent({ schemaName: "status", override: null, convention: "PascalCase" }),
    ).toBe("Status");
  });
});

describe("resolveFieldIdent", () => {
  it("uses override verbatim when present", () => {
    expect(
      resolveFieldIdent({ schemaName: "old", override: "newName", convention: "snake_case" }),
    ).toBe("newName");
  });

  it("applies convention when no override", () => {
    expect(
      resolveFieldIdent({ schemaName: "first_name", override: null, convention: "camelCase" }),
    ).toBe("firstName");
  });
});

describe("resolveTypeFilename", () => {
  it("derives filename from resolved type ident", () => {
    expect(resolveTypeFilename("BulkJobStatus", "snake_case")).toBe("bulk_job_status");
    expect(resolveTypeFilename("BulkJobStatus", "PascalCase")).toBe("BulkJobStatus");
    expect(resolveTypeFilename("BulkJobStatus", "kebab-case")).toBe("bulk-job-status");
  });
});

describe("autoNameInlineJson", () => {
  it("derives {Model}{Field} in PascalCase", () => {
    expect(autoNameInlineJson("User", "settings")).toBe("UserSettings");
    expect(autoNameInlineJson("audit_log", "payload")).toBe("AuditLogPayload");
  });
});
