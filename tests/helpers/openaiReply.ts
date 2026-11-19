// A Responses API reply body (POST /v1/responses), as lib/openai/responses.cjs reads it (Phase 4f.2).
export const openaiBody = (text: string, { status = "completed", input = 200, output = 20, reasoning = 0, model = "gpt-6-luna" } = {}) => ({
  model, status,
  output: [{ type: "message", content: [{ type: "output_text", text }] }],
  usage: { input_tokens: input, output_tokens: output, output_tokens_details: { reasoning_tokens: reasoning } },
});

export const openaiResponse = (text: string, options: Parameters<typeof openaiBody>[1] = {}, httpStatus = 200) =>
  new Response(JSON.stringify(openaiBody(text, options)), { status: httpStatus });
