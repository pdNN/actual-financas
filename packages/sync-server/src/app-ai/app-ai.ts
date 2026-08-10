// >>> CUSTOM: AI-powered transaction classification endpoint
import express from 'express';

import {
  requestLoggerMiddleware,
  validateSessionMiddleware,
} from '#util/middlewares';

const app = express();
export { app as handlers };
app.use(requestLoggerMiddleware);
app.use(express.json());
app.use(validateSessionMiddleware);

type TransactionInput = {
  index: number;
  description: string;
  amount: number;
  date: string;
};

type CategoryInput = {
  id: string;
  name: string;
  group: string;
};

type ClassificationResult = {
  index: number;
  categoryId: string | null;
  categoryName: string | null;
  confidence: number;
};

/**
 * A classificação por IA fica DESLIGADA por padrão.
 *
 * Ela é anterior à constituição do projeto e viola três princípios: chama o
 * modelo sem tentar a camada determinística antes, não aprende, e tem provider
 * fixo no código. A feature 003 reconstrói isso; até lá, só roda se alguém
 * ligar de propósito.
 *
 * Ter credencial NÃO liga — antes bastava a chave existir, e era assim que a
 * funcionalidade acabava ativa sem ninguém ter decidido.
 * Ver specs/001-desligar-padrao-enriquecimento/spec.md
 */
function isEnabled(): boolean {
  const flag = process.env.ACTUAL_AI_CLASSIFICATION_ENABLED;
  return flag === 'true' || flag === 'TRUE' || flag === '1';
}

function isConfigured(): boolean {
  return isEnabled() && !!process.env.ACTUAL_GEMINI_API_KEY;
}

app.post('/status', (_req, res) => {
  res.send({
    status: 'ok',
    data: {
      enabled: isEnabled(),
      configured: isConfigured(),
    },
  });
});

app.post('/classify-transactions', async (req, res) => {
  // A recusa vive no servidor de propósito: esconder o botão não garante nada,
  // e um cliente desatualizado ainda consegue chamar este endpoint.
  if (!isEnabled()) {
    res.status(403).send({
      status: 'error',
      reason:
        'AI classification is not enabled. Set ACTUAL_AI_CLASSIFICATION_ENABLED=true to turn it on.',
    });
    return;
  }

  const apiKey = process.env.ACTUAL_GEMINI_API_KEY;

  if (!apiKey) {
    res.status(400).send({
      status: 'error',
      reason: 'ACTUAL_GEMINI_API_KEY not configured',
    });
    return;
  }

  const { transactions, categories } = req.body as {
    transactions: TransactionInput[];
    categories: CategoryInput[];
  };

  if (!transactions?.length || !categories?.length) {
    res.status(400).send({
      status: 'error',
      reason: 'transactions and categories are required',
    });
    return;
  }

  try {
    const classifications = await classifyWithGemini(
      apiKey,
      transactions,
      categories,
    );

    res.send({
      status: 'ok',
      data: { classifications },
    });
  } catch (err) {
    console.error('AI classification error:', err);
    res.status(500).send({
      status: 'error',
      reason: err instanceof Error ? err.message : 'Unknown error',
    });
  }
});

async function classifyWithGemini(
  apiKey: string,
  transactions: TransactionInput[],
  categories: CategoryInput[],
): Promise<ClassificationResult[]> {
  const categoryList = categories
    .map(c => `- "${c.name}" (grupo: "${c.group}", id: "${c.id}")`)
    .join('\n');

  const transactionList = transactions
    .map(
      (t, i) =>
        `${i}. "${t.description}" | valor: ${t.amount} | data: ${t.date}`,
    )
    .join('\n');

  const prompt = `Você é um assistente financeiro brasileiro especializado em categorização de transações bancárias.

Dado as seguintes categorias disponíveis:
${categoryList}

Classifique cada transação abaixo na categoria mais apropriada. Se não tiver certeza, use null.

Transações:
${transactionList}

Responda APENAS com um JSON array válido, sem markdown, sem explicações. Cada elemento deve ter:
- "index": número da transação (como listado acima)
- "categoryId": o id da categoria escolhida (ou null se incerto)
- "categoryName": o nome da categoria escolhida (ou null se incerto)  
- "confidence": número de 0 a 1 indicando confiança

Exemplo de resposta:
[{"index":0,"categoryId":"abc123","categoryName":"Alimentação","confidence":0.9}]`;

  const response = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${apiKey}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: {
          temperature: 0.1,
          maxOutputTokens: 8192,
          responseMimeType: 'application/json',
        },
      }),
    },
  );

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Gemini API error (${response.status}): ${errorText}`);
  }

  const data = (await response.json()) as {
    candidates?: Array<{
      content?: {
        parts?: Array<{ text?: string }>;
      };
    }>;
  };

  const text = data?.candidates?.[0]?.content?.parts?.[0]?.text;
  if (!text) {
    throw new Error('Empty response from Gemini API');
  }

  // Parse the JSON response — Gemini with responseMimeType=application/json should return clean JSON
  let parsed: ClassificationResult[];
  try {
    parsed = JSON.parse(text);
  } catch {
    // Try to extract JSON from markdown code blocks if present
    const jsonMatch = text.match(/\[[\s\S]*\]/);
    if (jsonMatch) {
      parsed = JSON.parse(jsonMatch[0]);
    } else {
      throw new Error('Failed to parse Gemini response as JSON');
    }
  }

  // Validate and sanitize the response
  const validCategoryIds = new Set(categories.map(c => c.id));

  return parsed.map(item => ({
    index: item.index,
    categoryId: validCategoryIds.has(item.categoryId ?? '')
      ? item.categoryId
      : null,
    categoryName: item.categoryName ?? null,
    confidence: Math.min(1, Math.max(0, item.confidence ?? 0)),
  }));
}
// <<< CUSTOM
