import { render, screen } from "@testing-library/react";
import React from "react";

import VoiceButton from "../VoiceButton";

test("renders mic button", () => {
  render(<VoiceButton />);
  expect(screen.getByTitle(/Push-to-Talk/i)).toBeInTheDocument();
});


