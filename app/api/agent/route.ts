// app/api/agent/route.ts
export const runtime = "edge";

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
      step === "reconstructor" || step === "cartographer" ? 3000 : 2000;

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
        stream: true,
        system,
        messages: [{ role: "user", content: user }],
      }),
    });

    if (!anthropicRes.ok || !anthropicRes.body) {
      const err = await anthropicRes.text();
      return new Response(err, { status: 500 });
    }

    const encoder = new TextEncoder();
    const decoder = new TextDecoder();

    const stream = new ReadableStream({
      async start(controller) {
        const reader = anthropicRes.body!.getReader();
        let buffer = "";
        try {
          while (true) {
            const { done, value } = await reader.read();
            if (done) break;
            buffer += decoder.decode(value, { stream: true });
            const lines = buffer.split("\n");
            buffer = lines.pop() ?? "";
            for (const line of lines) {
              if (!line.startsWith("data: ")) continue;
              const data = line.slice(6).trim();
              if (!data || data === "[DONE]") continue;
              try {
                const parsed = JSON.parse(data);
                if (
                  parsed.type === "content_block_delta" &&
                  parsed.delta?.type === "text_delta" &&
                  parsed.delta?.text
                ) {
                  controller.enqueue(encoder.encode(parsed.delta.text));
                }
              } catch { /* skip malformed lines */ }
            }
          }
          controller.close();
        } catch (err) {
          controller.error(err);
        }
      },
    });

    return new Response(stream, {
      headers: {
        "Content-Type": "text/plain; charset=utf-8",
        "Cache-Control": "no-cache",
        "X-Accel-Buffering": "no",
      },
    });

  } catch (error) {
    const msg = error instanceof Error ? error.message : "Unknown error";
    return new Response(msg, { status: 500 });
  }
}
