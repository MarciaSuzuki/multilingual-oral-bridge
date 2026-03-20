// app/api/agent/route.ts
export const runtime = "edge";

import Anthropic from "@anthropic-ai/sdk";
import {
  cartographerPrompt,
  analystPrompt,
  reconstructorPrompt,
  framerPrompt,
  checkerPrompt,
  type AgentPromptInput,
} from "@/lib/agentPrompts";
import type { AgentStep } from "@/lib/types";

const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
});

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

    const stream = await anthropic.messages.stream({
      model: "claude-sonnet-4-20250514",
      max_tokens: maxTokens,
      system,
      messages: [{ role: "user", content: user }],
    });

    const readable = new ReadableStream({
      async start(controller) {
        try {
          for await (const chunk of stream) {
            if (
              chunk.type === "content_block_delta" &&
              chunk.delta.type === "text_delta"
            ) {
              controller.enqueue(
                new TextEncoder().encode(chunk.delta.text)
              );
            }
          }
          controller.close();
        } catch (err) {
          controller.error(err);
        }
      },
    });

    return new Response(readable, {
      headers: {
        "Content-Type": "text/plain; charset=utf-8",
        "Cache-Control": "no-cache",
        "X-Accel-Buffering": "no",
      },
    });
  } catch (error) {
    console.error("Agent API error:", error);
    return new Response(
      JSON.stringify({ error: "Agent request failed" }),
      { status: 500, headers: { "Content-Type": "application/json" } }
    );
  }
}
