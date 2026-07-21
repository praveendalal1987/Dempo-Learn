import fs from "node:fs";
import OpenAI, { toFile } from "openai";
import { Buffer } from "node:buffer";

// Lazy, memoized client (see ../client.ts) so importing this module never
// requires AI env at boot — only when an image function is actually called.
let client: OpenAI | null = null;

function getOpenAI(): OpenAI {
  if (client) return client;
  const baseURL = process.env.AI_INTEGRATIONS_OPENAI_BASE_URL;
  const apiKey = process.env.AI_INTEGRATIONS_OPENAI_API_KEY;
  if (!baseURL) {
    throw new Error(
      "AI_INTEGRATIONS_OPENAI_BASE_URL must be set to use the AI integration.",
    );
  }
  if (!apiKey) {
    throw new Error(
      "AI_INTEGRATIONS_OPENAI_API_KEY must be set to use the AI integration.",
    );
  }
  client = new OpenAI({ apiKey, baseURL });
  return client;
}

export async function generateImageBuffer(
  prompt: string,
  size: "1024x1024" | "512x512" | "256x256" = "1024x1024"
): Promise<Buffer> {
  const response = await getOpenAI().images.generate({
    model: "gpt-image-1",
    prompt,
    size,
  });
  const base64 = response.data?.[0]?.b64_json ?? "";
  return Buffer.from(base64, "base64");
}

export async function editImages(
  imageFiles: string[],
  prompt: string,
  outputPath?: string
): Promise<Buffer> {
  const images = await Promise.all(
    imageFiles.map((file) =>
      toFile(fs.createReadStream(file), file, {
        type: "image/png",
      })
    )
  );

  const response = await getOpenAI().images.edit({
    model: "gpt-image-1",
    image: images,
    prompt,
  });

  const imageBase64 = response.data?.[0]?.b64_json ?? "";
  const imageBytes = Buffer.from(imageBase64, "base64");

  if (outputPath) {
    fs.writeFileSync(outputPath, imageBytes);
  }

  return imageBytes;
}
