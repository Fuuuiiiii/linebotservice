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
  ".js": "application/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".map": "application/json; charset=utf-8",
  ".pdf": "application/pdf",
  ".png": "image/png",
  ".svg": "image/svg+xml",
  ".txt": "text/plain; charset=utf-8",
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
      "你是台灣客服機器人。請用繁體中文回答，語氣清楚、簡短、可執行。若資訊不足，請先問一個最關鍵的追問。不要編造不存在的文件或承諾。",
  },
  {
    role: "user",
    content: `產品或流程：${product || "未指定"}\n客戶問題：${message}`,
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

  return data.choices?.[0]?.message?.content || "目前沒有取得模型回覆。";
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

  return data?.message?.content || "目前沒有取得模型回覆。";
};

const askModel = async (payload) => {
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

server.listen(port, '0.0.0.0', () => {
  console.log(`Customer service chatbot running at http://0.0.0.0:${port}`);
  console.log(`Model provider: ${modelProvider}`);

  if (modelProvider === "ollama") {
    console.log(`Ollama endpoint: ${ollamaBaseUrl}`);
    console.log(`Ollama model: ${ollamaModel}`);
  }
});
