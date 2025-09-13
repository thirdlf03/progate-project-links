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
    options.modelId ?? process.env.BEDROCK_MODEL_ID ?? "amazon.nova-micro-v1:0";
  const temperature = options.temperature ?? 0.2;
  const maxTokens = options.maxTokens ?? 1024;

  // Nova models use different format
  const isNova = modelId.includes("nova");
  const body = isNova
    ? JSON.stringify({
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
        inferenceConfig: {
          temperature,
          max_new_tokens: maxTokens,
        },
      })
    : JSON.stringify({
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

  try {
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
        output?: { message?: { content?: { text?: string }[] } };
      };

      // Nova format
      if (json.output?.message?.content?.[0]?.text) {
        return json.output.message.content[0].text;
      }

      // Anthropic format
      if (json.content && json.content.length > 0) {
        const [first] = json.content;
        if (first && typeof first.text === "string") return first.text;
      }

      if (typeof json.completion === "string") return json.completion;
      return text;
    } catch {
      return text;
    }
  } catch (error) {
    // Fallback for when Bedrock is not accessible
    const msg = error instanceof Error ? error.message : String(error);
    if (msg.includes("AccessDenied") || msg.includes("don't have access")) {
      return "申し訳ございませんが、現在AIモデルにアクセスできません。Bedrockのモデルアクセス許可を有効にしてください。";
    }
    throw error;
  }
}
