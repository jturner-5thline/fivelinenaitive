import { describe, it, expect } from "vitest";
import { validateOptionValues, applyArrayMode, closestMatches } from "../fieldOptions";
import { findExistingLenderContact, parseCrmLinkConflict, normalizePersonName } from "../lenderContactMatch";
import { pickLenderMatch, titleHasExactName } from "../../../../supabase/functions/_shared/claapLenderMatch";
import { encodeUploadToken, decodeUploadToken, checkFile } from "../attachmentTargets";
import { buildOrExpression } from "../tools/query-insights-dataset";

describe("option validation", () => {
  it("rewrites values to canonical spelling", () => {
    expect(validateOptionValues("loan_types", ["abl", "Term Loan"], ["ABL", "Term Loan"], { array: true }).value).toEqual(["ABL", "Term Loan"]);
  });
  it("rejects unknown values with closest suggestions", () => {
    const r = validateOptionValues("loan_types", ["Term Loans"], ["ABL", "Term Loan", "MCA"], { array: true });
    expect(r.error?.invalid).toEqual(["Term Loans"]);
    expect(r.error?.suggestions["Term Loans"][0]).toBe("Term Loan");
  });
  it("validates each part of comma-separated lender types", () => {
    expect(validateOptionValues("lender_type", "bank,Private Credit", ["Bank", "Private Credit"], { array: false, csv: true }).value).toBe("Bank,Private Credit");
    expect(validateOptionValues("lender_type", "Bank,Hedge", ["Bank"], { array: false, csv: true }).error?.invalid).toEqual(["Hedge"]);
  });
  it("suggests the nearest option first", () => {
    expect(closestMatches("Healthcar", ["Energy", "Healthcare", "Mining"])[0]).toBe("Healthcare");
  });
});

describe("array add/remove modes", () => {
  it("add appends only missing values, case-insensitively", () => {
    expect(applyArrayMode(["ABL"], "add", ["abl", "MCA"])).toEqual(["ABL", "MCA"]);
  });
  it("remove drops matching values and keeps the rest", () => {
    expect(applyArrayMode(["ABL", "MCA", "PO"], "remove", ["mca"])).toEqual(["ABL", "PO"]);
    expect(applyArrayMode(null, "remove", ["x"])).toEqual([]);
  });
});

describe("lender contact duplicate detection", () => {
  const rows = [
    { id: "1", name: "Jane Doe", email: "Jane@Bank.com" },
    { id: "2", name: "Dr. John Smith", email: null },
  ];
  it("matches by email case-insensitively", () => {
    expect(findExistingLenderContact(rows, { email: "jane@bank.com", name: "Someone" })?.id).toBe("1");
  });
  it("matches by normalized name", () => {
    expect(normalizePersonName("Dr. John  Smith")).toBe("john smith");
    expect(findExistingLenderContact(rows, { name: "john smith" })?.id).toBe("2");
  });
  it("does not treat a same-name contact with a different email as a duplicate", () => {
    expect(findExistingLenderContact(rows, { name: "Jane Doe", email: "jane@other.com" })).toBeNull();
  });
  it("parses the structured CRM link conflict", () => {
    const c = parseCrmLinkConflict('lender_contacts update: crm_contact_company_conflict:{"crm_contact_id":"a","lender_crm_company_id":"b"}');
    expect(c).toEqual({ crm_contact_id: "a", lender_crm_company_id: "b" });
    expect(parseCrmLinkConflict("other error")).toBeNull();
  });
});

describe("Claap lender matcher", () => {
  const lenders = [
    { id: "mr", name: "Mountain Ridge Capital" },
    { id: "fncc", name: "First NCC" },
    { id: "fncc2", name: "First NCC Equipment Finance" },
  ];
  const shared = [
    { lender_id: "fncc", email: "a@firstncc.com" },
    { lender_id: "fncc2", email: "b@firstncc.com" },
  ];
  it("does not suggest a lender on fuzzy title similarity (onboarding calls)", () => {
    expect(pickLenderMatch({ title: "naitive onboarding call", externalDomains: ["gmail.com"], lenders, domainContacts: [] })).toBeNull();
    expect(pickLenderMatch({ title: "Mountain Ridge onboarding", externalDomains: [], lenders, domainContacts: [] })).toBeNull();
  });
  it("matches an exact full lender name in the title on word boundaries", () => {
    expect(pickLenderMatch({ title: "Intro: Mountain Ridge Capital x 5th Line", externalDomains: [], lenders, domainContacts: [] })?.lenderId).toBe("mr");
    expect(titleHasExactName("Mountain Ridge Capitalist meetup", "Mountain Ridge Capital")).toBe(false);
  });
  it("does not pick between lenders that share a domain without an exact title name", () => {
    expect(pickLenderMatch({ title: "Weekly sync", externalDomains: ["firstncc.com"], lenders, domainContacts: shared })).toBeNull();
  });
  it("uses the exact title name to choose among lenders sharing a domain", () => {
    expect(pickLenderMatch({ title: "First NCC Equipment Finance review", externalDomains: ["firstncc.com"], lenders, domainContacts: shared })?.lenderId).toBe("fncc2");
  });
  it("matches a domain that belongs to exactly one lender", () => {
    const m = pickLenderMatch({ title: "Call", externalDomains: ["mrcap.com"], lenders, domainContacts: [{ lender_id: "mr", email: "x@mrcap.com" }] });
    expect(m?.lenderId).toBe("mr");
  });
  it("ignores contacts of lenders outside the workspace list", () => {
    expect(pickLenderMatch({ title: "Call", externalDomains: ["z.com"], lenders, domainContacts: [{ lender_id: "other", email: "q@z.com" }] })).toBeNull();
  });
});

describe("attachment upload token and file checks", () => {
  it("round-trips a token and rejects tampering", () => {
    const t = { v: 1 as const, t: "deal" as const, id: "d1", p: "u/d1/f.pdf", n: "Térm sheet.pdf", s: 10, c: "general", exp: 1 };
    expect(decodeUploadToken(encodeUploadToken(t))).toEqual(t);
    expect(() => decodeUploadToken("not-a-token")).toThrow();
  });
  it("enforces the 20 MB limit and supported types", () => {
    expect(checkFile("a.pdf", 1024).contentType).toBe("application/pdf");
    expect(() => checkFile("a.pdf", 20 * 1024 * 1024 + 1)).toThrow(/20 MB/);
    expect(() => checkFile("a.exe", 10)).toThrow(/unsupported/);
  });
});

describe("query_insights_dataset or groups", () => {
  it("quotes values so they cannot add filters", () => {
    expect(buildOrExpression([{ column: "email", op: "eq", value: "a,b),id.neq.(x" }, { column: "email", op: "is", value: null }]))
      .toBe('email.eq."a,b),id.neq.(x",email.is.null');
  });
  it("rejects invalid column names", () => {
    expect(() => buildOrExpression([{ column: "id;drop", op: "eq", value: 1 }])).toThrow(/Invalid column/);
  });
});
