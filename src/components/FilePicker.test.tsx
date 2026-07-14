import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { FilePicker } from "./FilePicker";
import type { DirListingDto } from "../bindings/DirListingDto";

vi.mock("../api/commands", () => ({
  api: { listDirectory: vi.fn() },
}));

import { api } from "../api/commands";

const home: DirListingDto = {
  path: "/home/user",
  parent: "/home",
  entries: [
    { name: "models", path: "/home/user/models", is_dir: true },
    { name: "base.bin", path: "/home/user/base.bin", is_dir: false },
    { name: "notes.txt", path: "/home/user/notes.txt", is_dir: false },
  ],
};

const modelsDir: DirListingDto = {
  path: "/home/user/models",
  parent: "/home/user",
  entries: [{ name: "ggml-small.bin", path: "/home/user/models/ggml-small.bin", is_dir: false }],
};

function renderPicker() {
  const onSelect = vi.fn();
  const onClose = vi.fn();
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={qc}>
      <FilePicker
        heading="Choose a model file"
        extensions={["bin"]}
        onSelect={onSelect}
        onClose={onClose}
      />
    </QueryClientProvider>,
  );
  return { onSelect, onClose };
}

describe("FilePicker", () => {
  beforeEach(() => {
    vi.mocked(api.listDirectory).mockReset();
    vi.mocked(api.listDirectory).mockImplementation((path?: string) => {
      if (path === undefined) return Promise.resolve(home);
      if (path === "/home/user/models") return Promise.resolve(modelsDir);
      return Promise.reject(new Error("permission denied"));
    });
  });

  it("lists directories and matching files, and hides files of other types", async () => {
    renderPicker();
    expect(await screen.findByRole("button", { name: "models" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "base.bin" })).toBeInTheDocument();
    // notes.txt does not match the .bin filter, so it must not be offered.
    expect(screen.queryByRole("button", { name: "notes.txt" })).not.toBeInTheDocument();
  });

  it("keeps Select disabled until a file is chosen, then confirms and closes", async () => {
    const { onSelect, onClose } = renderPicker();
    const file = await screen.findByRole("button", { name: "base.bin" });

    expect(screen.getByRole("button", { name: "Select" })).toBeDisabled();
    fireEvent.click(file);
    expect(screen.getByRole("button", { name: "Select" })).toBeEnabled();

    fireEvent.click(screen.getByRole("button", { name: "Select" }));
    expect(onSelect).toHaveBeenCalledWith("/home/user/base.bin");
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("confirms a file on a double click", async () => {
    const { onSelect, onClose } = renderPicker();
    fireEvent.dblClick(await screen.findByRole("button", { name: "base.bin" }));
    expect(onSelect).toHaveBeenCalledWith("/home/user/base.bin");
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("navigates into a directory", async () => {
    renderPicker();
    fireEvent.click(await screen.findByRole("button", { name: "models" }));
    await waitFor(() => expect(api.listDirectory).toHaveBeenCalledWith("/home/user/models"));
    expect(await screen.findByRole("button", { name: "ggml-small.bin" })).toBeInTheDocument();
  });

  it("steps back up to the parent directory", async () => {
    renderPicker();
    await screen.findByRole("button", { name: "models" });
    fireEvent.click(screen.getByRole("button", { name: "Up one level" }));
    // home's parent is /home — the listing is requested for it.
    await waitFor(() => expect(api.listDirectory).toHaveBeenCalledWith("/home"));
  });

  it("returns to the home directory with the Home button", async () => {
    renderPicker();
    fireEvent.click(await screen.findByRole("button", { name: "models" }));
    await screen.findByRole("button", { name: "ggml-small.bin" });

    fireEvent.click(screen.getByRole("button", { name: "Home folder" }));
    // Home is the null path → listDirectory called with undefined, and the home entries return.
    expect(await screen.findByRole("button", { name: "base.bin" })).toBeInTheDocument();
  });

  it("surfaces a directory that cannot be read, without crashing", async () => {
    renderPicker();
    fireEvent.click(await screen.findByRole("button", { name: "models" }));
    await screen.findByRole("button", { name: "ggml-small.bin" });
    // /home/user (the parent of models) is not mocked → it rejects; the error is shown, not swallowed.
    fireEvent.click(screen.getByRole("button", { name: "Up one level" }));
    // The notice carries the reason after the message, so match on the message substring.
    expect(await screen.findByText(/This folder could not be read\./)).toBeInTheDocument();
  });

  it("cancels on the button, on Escape, and on a backdrop click", async () => {
    const { onClose } = renderPicker();
    await screen.findByRole("button", { name: "base.bin" });

    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    fireEvent.keyDown(window, { key: "Escape" });
    fireEvent.click(screen.getByRole("presentation"));
    expect(onClose).toHaveBeenCalledTimes(3);
  });
});
