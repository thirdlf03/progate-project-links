// Thin Bedrock Runtime wrapper (Anthropic-style messages)
// Note: requires @aws-sdk/client-bedrock-runtime at runtime.

import { env } from "~/env.js";

type InvokeModelInput = {
  modelId: string;
  body: string;
  contentType: string;
  accept: string;
};

type BedrockModule = {
  BedrockRuntimeClient: new (config: { region?: string }) => BedrockClientLike;
  InvokeModelCommand: new (input: InvokeModelInput) => unknown;
};

type BedrockClientLike = {
  send(cmd: unknown): Promise<{ body: Uint8Array }>;
};

async function getBedrockModule(): Promise<BedrockModule> {
  const mod = (await import(
    "@aws-sdk/client-bedrock-runtime"
  )) as unknown as BedrockModule;
  return mod;
}

async function getClient(): Promise<BedrockClientLike> {
  const { BedrockRuntimeClient } = await getBedrockModule();
  const region =
    process.env.AWS_REGION ??
    (env.NODE_ENV === "production"
      ? process.env.AWS_REGION
      : (process.env.AWS_REGION ?? "us-east-1"));
  const client: BedrockClientLike = new BedrockRuntimeClient({ region });
  return client;
}

export async function invokeAnthropicMessages(options: {
  modelId?: string;
  prompt: string;
  temperature?: number;
  maxTokens?: number;
}): Promise<string> {
  const modelId =
    options.modelId ??
    process.env.BEDROCK_MODEL_ID ??
    "anthropic.claude-3-5-sonnet-20240620-v1:0";
  const temperature = options.temperature ?? 0.2;
  const maxTokens = options.maxTokens ?? 1024;
  const body = JSON.stringify({
    anthropic_version: "bedrock-2023-05-31",
    temperature,
    max_tokens: maxTokens,
    messages: [
      {
        role: "user",
        content: [
          {
            type: "text",
            text: options.prompt,
          },
        ],
      },
    ],
  });

  const client = await getClient();
  const { InvokeModelCommand } = await getBedrockModule();
  const res = await client.send(
    new InvokeModelCommand({
      modelId,
      body,
      contentType: "application/json",
      accept: "application/json",
    }),
  );

  const text = Buffer.from(res.body).toString("utf8");
  try {
    const json = JSON.parse(text) as {
      content?: { type: string; text?: string }[];
      completion?: string;
    };
    if (json.content && json.content.length > 0) {
      const [first] = json.content;
      if (first && typeof first.text === "string") return first.text;
    }
    if (typeof json.completion === "string") return json.completion;
    return text;
  } catch {
    return text;
  }
}
