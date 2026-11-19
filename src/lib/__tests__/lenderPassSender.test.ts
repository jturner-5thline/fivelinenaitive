import { describe, it, expect } from "vitest";
import { senderKind, forwardedLenderCandidates, websiteHost } from "../../../supabase/functions/_shared/lenderPassSender";

describe("lender pass sender rules", () => {
  it("skips automated and Asana senders", () => {
    expect(senderKind("no-reply@x.com")).toBe("automated");
    expect(senderKind("notifications@mail.asana.com")).toBe("automated");
    expect(senderKind("calendar-notification@google.com")).toBe("automated");
  });
  it("marks 5thline.co as internal and lenders as external", () => {
    expect(senderKind("nheikali@5thline.co")).toBe("internal");
    expect(senderKind("ian@eastwardcp.com")).toBe("external");
  });
  it("finds the lender address inside an internal forward", () => {
    const body = "---------- Forwarded message ---------\nFrom: Ian <ian@eastwardcp.com>\nTo: jturner@5thline.co\nCc: notifications@asana.com";
    expect(forwardedLenderCandidates(body)).toEqual(["ian@eastwardcp.com"]);
  });
  it("normalizes website hosts", () => {
    expect(websiteHost("https://www.MontageCap.com/about")).toBe("montagecap.com");
  });
});
