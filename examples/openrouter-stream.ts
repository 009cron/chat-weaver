import { OpenRouter } from "@openrouter/sdk";

const openrouter = new OpenRouter({
  apiKey: process.env.OPENROUTER_API_KEY,
});

async function main() {
  if (!process.env.OPENROUTER_API_KEY) {
    throw new Error("Missing OPENROUTER_API_KEY environment variable");
  }

  // Stream the response and read usage (including reasoning tokens) from the final chunk.
  const stream = await openrouter.chat.send({
    model: "deepseek/deepseek-v3.2",
    messages: [
      {
        role: "user",
        content: "How many r's are in the word 'strawberry'?",
      },
    ],
    stream: true,
  });

  let response = "";

  for await (const chunk of stream) {
    const content = chunk.choices?.[0]?.delta?.content;
    if (content) {
      response += content;
      process.stdout.write(content);
    }

    // Usage arrives on the final chunk.
    if (chunk.usage) {
      console.log("\nUsage:", chunk.usage);
      console.log("Reasoning tokens:", chunk.usage.reasoning_tokens ?? 0);
    }
  }

  console.log("\n\nFinal response:", response);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
