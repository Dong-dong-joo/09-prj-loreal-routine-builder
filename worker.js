export default {
  async fetch(request, env) {
    if (request.method === "OPTIONS") {
      return new Response(null, {
        headers: corsHeaders(),
      });
    }

    if (request.method !== "POST") {
      return new Response("Method Not Allowed", {
        status: 405,
        headers: corsHeaders(),
      });
    }

    try {
      const body = await request.json();
      const { messages, selectedProducts, useWebSearch } = body;

      const systemMessage = {
        role: "system",
        content:
          "You are a helpful beauty and skincare assistant for a L'Oréal Routine Builder project. Only answer topics related to skincare, beauty, makeup, haircare, fragrance, routines, or the selected products. If the user asks something unrelated, politely redirect them.",
      };

      const selectedProductsMessage = {
        role: "system",
        content: `Selected products data: ${JSON.stringify(selectedProducts || [])}`,
      };

      const finalMessages = [
        systemMessage,
        selectedProductsMessage,
        ...(messages || []),
      ];

      const model = useWebSearch ? "gpt-5.4-thinking" : "gpt-5.4-thinking";

      const openAIResponse = await fetch(
        "https://api.openai.com/v1/responses",
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${env.OPENAI_API_KEY}`,
          },
          body: JSON.stringify({
            model,
            input: finalMessages.map((message) => ({
              role: message.role,
              content: [{ type: "input_text", text: message.content }],
            })),
          }),
        },
      );

      const data = await openAIResponse.json();

      let reply = "Sorry, I could not generate a response.";

      if (data.output && Array.isArray(data.output)) {
        const texts = [];

        for (const item of data.output) {
          if (!item.content) continue;

          for (const part of item.content) {
            if (part.type === "output_text" && part.text) {
              texts.push(part.text);
            }
          }
        }

        if (texts.length > 0) {
          reply = texts.join("\n");
        }
      }

      return new Response(JSON.stringify({ reply }), {
        headers: {
          "Content-Type": "application/json",
          ...corsHeaders(),
        },
      });
    } catch (error) {
      return new Response(
        JSON.stringify({
          error: "Something went wrong.",
          details: error.message,
        }),
        {
          status: 500,
          headers: {
            "Content-Type": "application/json",
            ...corsHeaders(),
          },
        },
      );
    }
  },
};

function corsHeaders() {
  return {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
  };
}
