import { describe, expect, it } from "vitest";
import { demoRequestSchema } from "./demoRequestSchema";

const required = { firstName: "James", lastName: "Turner", email: "james@example.com" };
describe("demo requests", () => {
  it("requires first name, last name and valid work email", () => {
    for (const field of ["firstName", "lastName", "email"]) {
      expect(demoRequestSchema.safeParse({ ...required, [field]: "" }).success).toBe(false);
    }
    expect(demoRequestSchema.safeParse({ ...required, email: "invalid" }).success).toBe(false);
  });
  it("allows company and notes to be omitted", () => {
    expect(demoRequestSchema.parse(required)).toEqual(required);
  });
  it("retains company and notes while trimming surrounding whitespace", () => {
    expect(demoRequestSchema.parse({ ...required, company: " Blount Capital ", notes: " Show us the deal workspace. " })).toEqual({ ...required, company: "Blount Capital", notes: "Show us the deal workspace." });
  });
});