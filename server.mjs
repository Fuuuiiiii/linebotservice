import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import dotenv from "dotenv";

dotenv.config();

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const buildDir = path.join(__dirname, "build");
const port = Number(process.env.PORT || 3000);
const modelProvider = process.env.MODEL_PROVIDER || "ollama";
const ollamaBaseUrl = process.env.OLLAMA_BASE_URL || "http://127.0.0.1:11434";
const ollamaModel = process.env.OLLAMA_MODEL || "llama3.2:3b";

const contentTypes = {
  ".css": "text/css; charset=utf-8",
  ".gif": "image/gif",
  ".html": "text/html; charset=utf-8",
  ".ico": "image/x-icon",
  ".jpeg": "image/jpeg",
  ".jpg": "image/jpeg",
  ".js": "application/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".map": "application/json; charset=utf-8",
  ".pdf": "application/pdf",
  ".png": "image/png",
  ".svg": "image/svg+xml",
  ".txt": "text/plain; charset=utf-8",
};

const menuReplies = new Map([
  ["訂單", "請選擇：主產品訂單、耗材訂單、訂單進度查詢、申請退貨"],
  ["產品故障", "請選擇產品：床墊、小黑盤、itracker、fora、td2300"],
  ["品質獎勵計畫", "請選擇：詢問計畫範本、計畫附件資格、計畫分母"],
  ["主產品訂單", "要請洽專責業務"],
  ["訂單：主產品訂單", "要請洽專責業務"],
  [
    "耗材訂單",
    "您的名稱或單位名稱：\n耗材名稱：\n數量：\n我們會盡快跟您聯繫",
  ],
  [
    "訂單：耗材訂單",
    "您的名稱或單位名稱：\n耗材名稱：\n數量：\n我們會盡快跟您聯繫",
  ],
  ["訂單進度查詢", "客戶名稱："],
  ["訂單：訂單進度查詢", "客戶名稱："],
  ["申請退貨", "客戶名稱：\n產品名稱：\n數量："],
  ["訂單：申請退貨", "客戶名稱：\n產品名稱：\n數量："],
  ["床墊", "請選擇問題：網路斷線、更換住民、通知與實際不符合、其他問題"],
  ["產品故障：床墊", "請選擇問題：網路斷線、更換住民、通知與實際不符合、其他問題"],
  ["小黑盤", "請選擇問題：數據未上傳、人數未達標、感應不良"],
  ["產品故障：小黑盤", "請選擇問題：數據未上傳、人數未達標、感應不良"],
  ["itracker", "請選擇問題：網頁問題、itracker不能用了"],
  ["產品故障：itracker", "請選擇問題：網頁問題、itracker不能用了"],
  ["fora", "請選擇問題：量不出來、數據未上傳"],
  ["產品故障：fora", "請選擇問題：量不出來、數據未上傳"],
  ["td2300", "請選擇問題：量測不準、量不出來、數據未上傳"],
  ["產品故障：td2300", "請選擇問題：量測不準、量不出來、數據未上傳"],
]);

const productIssueReplies = {
  床墊: ["網路斷線", "更換住民", "通知與實際不符合", "其他問題"],
  小黑盤: ["數據未上傳", "人數未達標", "感應不良"],
  itracker: ["網頁問題", "itracker不能用了"],
  fora: ["量不出來", "數據未上傳"],
  td2300: ["量測不準", "量不出來", "數據未上傳"],
};

const productIssueFixedReplies = new Map([
  [
    "產品故障：小黑盤：數據未上傳",
    "先請確認\n1.app中是否為授權玩家\n2.儀表板中是否有上傳過住民名單",
  ],
]);

const rewardPlanReplies = new Map([
  ["詢問計畫範本", "請提供您的單位名稱與想確認的計畫年度，我們會協助提供品質獎勵計畫範本。"],
  ["品質獎勵計畫：詢問計畫範本", "請提供您的單位名稱與想確認的計畫年度，我們會協助提供品質獎勵計畫範本。"],
  ["計畫附件資格", "請提供您的單位名稱與附件項目，我們會協助確認是否符合計畫附件資格。"],
  ["品質獎勵計畫：計畫附件資格", "請提供您的單位名稱與附件項目，我們會協助確認是否符合計畫附件資格。"],
  ["計畫分母", "請提供您的單位名稱、計畫期間與想確認的指標，我們會協助確認計畫分母。"],
  ["品質獎勵計畫：計畫分母", "請提供您的單位名稱、計畫期間與想確認的指標，我們會協助確認計畫分母。"],
]);

const normalizeMessage = (message = "") =>
  String(message).trim().replace(/\s+/g, "").replace(/:/g, "：");

const findProductIssueReply = (message) => {
  const fixedReply = productIssueFixedReplies.get(message);

  if (fixedReply) {
    return fixedReply;
  }

  for (const [product, issues] of Object.entries(productIssueReplies)) {
    for (const issue of issues) {
      const exact = `產品故障：${product}：${issue}`;

      if (message === normalizeMessage(exact)) {
        return `已收到「${product}」的「${issue}」問題，請補充客戶名稱、單位名稱與目前狀況，我們會協助排查。`;
      }
    }
  }

  return "";
};

const resolveKeywordReply = (message) => {
  const normalized = normalizeMessage(message);
  const normalizedMenuReplies = new Map(
    [...menuReplies, ...rewardPlanReplies].map(([key, value]) => [
      normalizeMessage(key),
      value,
    ])
  );

  return normalizedMenuReplies.get(normalized) || findProductIssueReply(normalized);
};

const readRequestBody = async (request) => {
  const chunks = [];

  for await (const chunk of request) {
    chunks.push(chunk);
  }

  return Buffer.concat(chunks).toString("utf8");
};

const sendJson = (response, status, data) => {
  response.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
  });
  response.end(JSON.stringify(data));
};

const buildPrompt = ({ product, message }) => [
  {
    role: "system",
    content:
      "你是客服助理。請使用繁體中文回答，語氣清楚、簡潔、禮貌。若問題資訊不足，請請使用者補充客戶名稱、單位名稱、產品名稱、數量或問題狀況。不要自行編造政策或承諾。",
  },
  {
    role: "user",
    content: `產品或服務：${product || "客服系統"}\n使用者問題：${message}`,
  },
];

const askOpenAI = async ({ product, message }) => {
  if (!process.env.OPENAI_API_KEY) {
    throw new Error("Missing OPENAI_API_KEY");
  }

  const openaiResponse = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: "gpt-4o-mini",
      messages: buildPrompt({ product, message }),
      temperature: 0.2,
    }),
  });

  const data = await openaiResponse.json();

  if (!openaiResponse.ok) {
    throw new Error(data?.error?.message || "OpenAI request failed");
  }

  return data.choices?.[0]?.message?.content || "目前無法產生回覆，請稍後再試。";
};

const askOllama = async ({ product, message }) => {
  const ollamaResponse = await fetch(`${ollamaBaseUrl}/api/chat`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: ollamaModel,
      messages: buildPrompt({ product, message }),
      stream: false,
    }),
  });

  const data = await ollamaResponse.json();

  if (!ollamaResponse.ok) {
    throw new Error(data?.error || "Ollama request failed");
  }

  return data?.message?.content || "目前無法產生回覆，請稍後再試。";
};

const askModel = async (payload) => {
  const keywordReply = resolveKeywordReply(payload.message);

  if (keywordReply) {
    return keywordReply;
  }

  if (modelProvider === "openai") {
    return askOpenAI(payload);
  }

  return askOllama(payload);
};

const serveStaticFile = async (request, response) => {
  const requestUrl = new URL(request.url, `http://${request.headers.host}`);
  const rawPath = decodeURIComponent(requestUrl.pathname);
  const safePath = path
    .normalize(rawPath)
    .replace(/^[/\\]+/, "")
    .replace(/^(\.\.[/\\])+/, "");
  const filePath = path.join(buildDir, safePath || "index.html");
  const resolvedPath = existsSync(filePath) ? filePath : path.join(buildDir, "index.html");
  const extension = path.extname(resolvedPath);

  try {
    const file = await readFile(resolvedPath);
    response.writeHead(200, {
      "Content-Type": contentTypes[extension] || "application/octet-stream",
    });
    response.end(file);
  } catch {
    response.writeHead(404, {
      "Content-Type": "text/plain; charset=utf-8",
    });
    response.end("Not found");
  }
};

const server = createServer(async (request, response) => {
  if (request.method === "POST" && request.url === "/api/chat") {
    try {
      const body = JSON.parse(await readRequestBody(request));
      const reply = await askModel(body);
      sendJson(response, 200, { reply });
    } catch (error) {
      sendJson(response, 500, {
        error: error.message || "API error",
      });
    }
    return;
  }

  if (request.method === "GET") {
    await serveStaticFile(request, response);
    return;
  }

  response.writeHead(405);
  response.end();
});

server.listen(port, "0.0.0.0", () => {
  console.log(`Customer service chatbot running at http://0.0.0.0:${port}`);
  console.log(`Model provider: ${modelProvider}`);

  if (modelProvider === "ollama") {
    console.log(`Ollama endpoint: ${ollamaBaseUrl}`);
    console.log(`Ollama model: ${ollamaModel}`);
  }
});
