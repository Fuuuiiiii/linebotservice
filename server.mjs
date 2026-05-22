import express from "express";
import { middleware, messagingApi } from "@line/bot-sdk";
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

const lineConfig = {
  channelAccessToken: process.env.LINE_CHANNEL_ACCESS_TOKEN || "",
  channelSecret: process.env.LINE_CHANNEL_SECRET || "",
};

const client = new messagingApi.MessagingApiClient({
  channelAccessToken: lineConfig.channelAccessToken,
});

const quickReplyGroups = {
  primary: ["訂單", "產品故障", "品質獎勵計畫"],
  order: ["主產品訂單", "耗材訂單", "訂單進度查詢", "申請退貨"],
  product: ["床墊", "小黑盤", "itracker", "fora", "td2300"],
  reward: ["詢問計畫範本", "計畫附件資格", "計畫分母"],
  床墊: ["網路斷線", "更換住民", "通知與實際不符合", "其他問題"],
  小黑盤: ["數據未上傳", "人數未達標", "感應不良"],
  itracker: ["網頁問題", "itracker不能用了"],
  fora: ["量不出來", "數據未上傳"],
  td2300: ["量測不準", "量不出來", "數據未上傳"],
};

const toQuickReply = (labels) => ({
  items: labels.slice(0, 13).map((item) => {
    const option = typeof item === "string" ? { label: item, text: item } : item;

    return {
    type: "action",
    action: {
      type: "message",
      label: option.label,
      text: option.text,
    },
  };
  }),
});

const resolveQuickReplyLabels = (message = "") => {
  const normalized = String(message).trim();

  if (normalized === "訂單") {
    return quickReplyGroups.order.map((label) => ({
      label,
      text: `訂單：${label}`,
    }));
  }

  if (normalized === "產品故障") {
    return quickReplyGroups.product;
  }

  if (normalized === "品質獎勵計畫") {
    return quickReplyGroups.reward.map((label) => ({
      label,
      text: `品質獎勵計畫：${label}`,
    }));
  }

  if (quickReplyGroups[normalized]) {
    return quickReplyGroups[normalized].map((label) => ({
      label,
      text: `產品故障：${normalized}：${label}`,
    }));
  }

  return quickReplyGroups.primary;
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

const app = express();

// LINE Webhook
app.post("/webhook", middleware(lineConfig), (req, res) => {
  Promise.all(req.body.events.map(handleEvent))
    .then((result) => res.json(result))
    .catch((err) => {
      console.error(err);
      res.status(500).end();
    });
});

async function handleEvent(event) {
  if (event.type !== "message" || event.message.type !== "text") {
    return null;
  }

  const userMessage = event.message.text;
  const reply = await askModel({ message: userMessage });
  const quickReplyLabels = resolveQuickReplyLabels(userMessage);

  return client.replyMessage({
    replyToken: event.replyToken,
    messages: [
      {
        type: "text",
        text: reply,
        quickReply: toQuickReply(quickReplyLabels),
      },
    ],
  });
}

// API for web chat
app.post("/api/chat", express.json(), async (req, res) => {
  try {
    const body = req.body;
    const reply = await askModel(body);
    res.json({ reply });
  } catch (error) {
    res.status(500).json({ error: error.message || "API error" });
  }
});

// Serve static files
app.use(express.static(buildDir));

// Fallback to index.html for React Router
app.get("*", (req, res) => {
  const indexPath = path.join(buildDir, "index.html");
  res.sendFile(indexPath);
});

app.listen(port, "0.0.0.0", () => {
  console.log(`Customer service chatbot running at http://0.0.0.0:${port}`);
  console.log(`Model provider: ${modelProvider}`);

  if (modelProvider === "ollama") {
    console.log(`Ollama endpoint: ${ollamaBaseUrl}`);
    console.log(`Ollama model: ${ollamaModel}`);
  }
});
