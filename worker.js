export default {
  async fetch(request, env) {
    if (request.method === "OPTIONS") {
      return new Response(null, {
        headers: getCorsHeaders()
      });
    }

    if (request.method !== "POST") {
      return jsonResponse(
        { error: "Method not allowed." },
        405
      );
    }

    try {
      const body = await request.json();
      const messages = Array.isArray(body.messages) ? body.messages : [];
      const selectedProducts = Array.isArray(body.selectedProducts)
        ? body.selectedProducts
        : [];
      const useWebSearch = Boolean(body.useWebSearch);

      if (!env.OPENAI_API_KEY) {
        return jsonResponse(
          { error: "Missing OPENAI_API_KEY in Worker environment variables." },
          500
        );
      }

      const systemMessage = {
        role: "system",
        content:
          "You are a helpful beauty and skincare assistant for a L'Oréal Routine Builder project. Only answer questions related to skincare, haircare, makeup, fragrance, beauty routines, and the selected products. Keep answers clear, practical, and personalized."
      };

      const selectedProductsMessage = {
        role: "system",
        content: `Selected products: ${JSON.stringify(selectedProducts)}`
      };

      const safeMessages = [systemMessage, selectedProductsMessage, ...messages]
        .filter(
          (msg) =>
            msg &&
            typeof msg.role === "string" &&
            typeof msg.content === "string" &&
            msg.content.trim() !== ""
        )
        .map((msg) => ({
          role: msg.role,
          content: [{ type: "input_text", text: msg.content }]
        }));

      const payload = {
        model: "gpt-5.4-thinking",
        input: safeMessages
      };

      if (useWebSearch) {
        payload.tools = [{ type: "web_search_preview" }];
      }

      let openAIResponse = await fetch("https://api.openai.com/v1/responses", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${env.OPENAI_API_KEY}`
        },
        body: JSON.stringify(payload)
      });

      let data = await openAIResponse.json();

      /* If web search tool caused a problem, retry once without it */
      if (!openAIResponse.ok && useWebSearch) {
        const retryPayload = {
          model: "gpt-5.4-thinking",
          input: safeMessages
        };

        openAIResponse = await fetch("https://api.openai.com/v1/responses", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${env.OPENAI_API_KEY}`
          },
          body: JSON.stringify(retryPayload)
        });

        data = await openAIResponse.json();
      }

      if (!openAIResponse.ok) {
        return jsonResponse(
          {
            error:
              data?.error?.message ||
              "OpenAI request failed."
          },
          openAIResponse.status
        );
      }

      let reply = "";

      if (typeof data.output_text === "string" && data.output_text.trim()) {
        reply = data.output_text.trim();
      }

      if (!reply && Array.isArray(data.output)) {
        const collected = [];

        for (const item of data.output) {
          if (!item || !Array.isArray(item.content)) continue;

          for (const part of item.content) {
            if (part.type === "output_text" && typeof part.text === "string") {
              collected.push(part.text);
            }
          }
        }

        reply = collected.join("\n").trim();
      }

      if (!reply) {
        return jsonResponse(
          {
            error:
              "OpenAI returned a response, but no readable text reply was found."
          },
          500
        );
      }

      return jsonResponse({ reply }, 200);
    } catch (error) {
      return jsonResponse(
        {
          error: error.message || "Unexpected Worker error."
        },
        500
      );
    }
  }
};

function getCorsHeaders() {
  return {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type"
  };
}

function jsonResponse(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "Content-Type": "application/json",
      ...getCorsHeaders()
    }
  });
}