export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).end();

  const { market, odds } = req.body;

  const messages = [{
    role: "user",
    content: `You are a prediction market analyst with web search. Search for the latest news about: "${market}". Current Polymarket price: ${odds}%. After searching, reply with ONLY this JSON (no markdown, no backticks): {"prob":45,"analysis":"2-3 sentences with current facts","kelly":"Recommendation based on edge"}. Replace 45 with your true probability estimate (integer 1-99).`
  }];

  let finalText = "";
  let iterations = 0;
  const apiMessages = [...messages];

  while (iterations < 6) {
    iterations++;
    const response = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": process.env.ANTHROPIC_API_KEY,
        "anthropic-version": "2023-06-01"
      },
      body: JSON.stringify({
        model: "claude-sonnet-4-5",
        max_tokens: 1000,
        tools: [{ type: "web_search_20250305", name: "web_search" }],
        messages: apiMessages
      })
    });

    const data = await response.json();
    if (!response.ok) return res.status(500).json({ error: data });

    const text = (data.content || []).filter(b => b.type === "text").map(b => b.text).join("");
    if (text) finalText = text;

    if (data.stop_reason === "end_turn") break;

    if (data.stop_reason === "tool_use") {
      apiMessages.push({ role: "assistant", content: data.content });
      const results = data.content
        .filter(b => b.type === "tool_use")
        .map(b => ({ type: "tool_result", tool_use_id: b.id, content: "Search completed." }));
      apiMessages.push({ role: "user", content: results });
    } else break;
  }

  const start = finalText.indexOf("{");
  const end = finalText.lastIndexOf("}");
  if (start === -1) return res.status(500).json({ error: "No JSON in response", raw: finalText });

  const parsed = JSON.parse(finalText.slice(start, end + 1));
  res.status(200).json(parsed);
}
