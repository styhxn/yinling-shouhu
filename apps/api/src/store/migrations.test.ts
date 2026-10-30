import { describe, expect, it } from "vitest";
import { MYSQL_SCHEMA_SQL, SCHEMA_SQL } from "./migrations.js";

describe("schema migrations", () => {
  it("quotes the MySQL reserved word read in family_messages", () => {
    expect(MYSQL_SCHEMA_SQL).toContain("`read` TINYINT NOT NULL DEFAULT 0");
    expect(SCHEMA_SQL).toContain("`read` INTEGER NOT NULL DEFAULT 0");
  });
});
