import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { BookDemoDialog } from "./BookDemoDialog";

const { invoke } = vi.hoisted(() => ({ invoke: vi.fn() }));
vi.mock("@/integrations/supabase/client", () => ({ supabase: { functions: { invoke } } }));

function completeForm() {
  fireEvent.change(screen.getByLabelText("First Name"), { target: { value: "Jane" } });
  fireEvent.change(screen.getByLabelText("Last Name"), { target: { value: "Doe" } });
  fireEvent.change(screen.getByLabelText("Work Email"), { target: { value: "jane@example.com" } });
  fireEvent.change(screen.getByLabelText("Notes (optional)"), { target: { value: "Show deal workflows" } });
}
describe("Book a Demo workflow", () => {
  beforeEach(() => { invoke.mockReset(); });
  it("only sends after explicit form submission and shows confirmation", async () => {
    invoke.mockResolvedValue({ error: null });
    render(<BookDemoDialog><button>Open demo</button></BookDemoDialog>);
    fireEvent.click(screen.getByText("Open demo"));
    completeForm();
    expect(invoke).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Book a Demo" }));
    await waitFor(() => expect(screen.getByRole("status")).toBeInTheDocument());
    expect(invoke).toHaveBeenCalledWith("send-app-email", expect.objectContaining({ body: expect.objectContaining({ templateData: expect.objectContaining({ firstName: "Jane", lastName: "Doe", email: "jane@example.com", notes: "Show deal workflows", requestType: "demo" }) }) }));
  });
  it("keeps input and allows retry when sending fails", async () => {
    invoke.mockResolvedValue({ error: new Error("Unavailable") });
    render(<BookDemoDialog><button>Open demo</button></BookDemoDialog>);
    fireEvent.click(screen.getByText("Open demo"));
    completeForm();
    fireEvent.click(screen.getByRole("button", { name: "Book a Demo" }));
    await waitFor(() => expect(screen.getByRole("alert")).toBeInTheDocument());
    expect(screen.getByLabelText("Work Email")).toHaveValue("jane@example.com");
    expect(screen.getByRole("button", { name: "Book a Demo" })).toBeEnabled();
  });
});