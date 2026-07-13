import { render, screen, fireEvent } from "@testing-library/react";
import { describe, it, expect } from "vitest";
import { Panel } from "./Panel";

describe("Panel", () => {
  it("renders the label and children", () => {
    render(<Panel label="Build">panel body</Panel>);
    expect(screen.getByText("Build")).toBeInTheDocument();
    expect(screen.getByText("panel body")).toBeInTheDocument();
  });

  it("renders children without a label or info button", () => {
    render(<Panel>just children</Panel>);
    expect(screen.getByText("just children")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "What is this?" })).toBeNull();
  });

  it("opens the info popover on click and closes it on a second click", () => {
    render(
      <Panel label="Build" info={<p>Explains the build panel</p>}>
        panel body
      </Panel>,
    );
    expect(screen.queryByText("Explains the build panel")).toBeNull();

    const infoButton = screen.getByRole("button", { name: "What is this?" });
    fireEvent.click(infoButton);
    expect(screen.getByText("Explains the build panel")).toBeInTheDocument();

    fireEvent.click(infoButton);
    expect(screen.queryByText("Explains the build panel")).toBeNull();
  });

  it("closes the info popover on an outside click", () => {
    render(
      <Panel label="Build" info={<p>Explains the build panel</p>}>
        panel body
      </Panel>,
    );
    fireEvent.click(screen.getByRole("button", { name: "What is this?" }));
    expect(screen.getByText("Explains the build panel")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("presentation"));
    expect(screen.queryByText("Explains the build panel")).toBeNull();
  });
});
