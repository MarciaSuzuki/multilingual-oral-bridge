// app/api/agent/route.ts
export const runtime = "edge";
export const maxDuration = 60;

import {
  cartographerPrompt,
  analystPrompt,
  reconstructorPrompt,
  framerPrompt,
  checkerPrompt,
  type AgentPromptInput,
} from "@/lib/agentPrompts";
import type { AgentStep } from "@/lib/types";

type AgentRequestBody = {
  step: AgentStep;
  input: AgentPromptInput;
};

function getPromptForStep(
  step: AgentStep,
  input: AgentPromptInput
): { system: string; user: string } {
  switch (step) {
    case "cartographer":
      return cartographerPrompt(input);
    case "analyst":
      return analystPrompt(input);
    case "reconstructor":
      return reconstructorPrompt(input);
    case "framer":
      return framerPrompt(input);
    case "checker":
      return checkerPrompt(input);
  }
}

export async function POST(req: Request) {
  try {
    const body: AgentRequestBody = await req.json();
    const { step, input } = body;

    const { system, user } = getPromptForStep(step, input);

    const maxTokens =
      step === "reconstructor" || step === "cartographer" ? 6000 : 4000;

    const anthropicRes = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": process.env.ANTHROPIC_API_KEY ?? "",
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: "claude-sonnet-4-6",
        max_tokens: maxTokens,
        system,
        messages: [{ role: "user", content: user }],
      }),
    });

    if (!anthropicRes.ok) {
      const err = await anthropicRes.text();
      return new Response(
        JSON.stringify({ error: `Anthropic API error ${anthropicRes.status}: ${err}` }),
        { status: 500, headers: { "Content-Type": "application/json" } }
      );
    }

    const data = await anthropicRes.json() as {
      content: Array<{ type: string; text?: string }>;
    };

    const text = data.content
      .filter((b) => b.type === "text")
      .map((b) => b.text ?? "")
      .join("");

    return new Response(text, {
      headers: { "Content-Type": "text/plain; charset=utf-8" },
    });

  } catch (error) {
    const msg = error instanceof Error ? error.message : "Unknown error";
    return new Response(
      JSON.stringify({ error: msg }),
      { status: 500, headers: { "Content-Type": "application/json" } }
    );
  }
}
