// >>> CUSTOM: testes do gate de habilitação da classificação por IA
import express from 'express';
import request from 'supertest';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('#util/middlewares', () => ({
  requestLoggerMiddleware: (_req: unknown, _res: unknown, next: () => void) =>
    next(),
  validateSessionMiddleware: (_req: unknown, _res: unknown, next: () => void) =>
    next(),
}));

const { handlers } = await import('./app-ai');

const app = express();
app.use('/', handlers);

const ENABLE = 'ACTUAL_AI_CLASSIFICATION_ENABLED';
const KEY = 'ACTUAL_GEMINI_API_KEY';

const payload = {
  transactions: [
    {
      index: 0,
      description: 'PADARIA DO ZE',
      amount: -1250,
      date: '2026-08-01',
    },
  ],
  categories: [{ id: 'cat-1', name: 'Alimentação', group: 'Essenciais' }],
};

describe('gate de habilitação', () => {
  const fetchSpy = vi.spyOn(globalThis, 'fetch');

  beforeEach(() => {
    delete process.env[ENABLE];
    delete process.env[KEY];
    fetchSpy.mockReset();
  });

  afterEach(() => {
    delete process.env[ENABLE];
    delete process.env[KEY];
  });

  describe('/status', () => {
    it('reporta desabilitado quando a flag não foi definida', async () => {
      const res = await request(app).post('/status');

      expect(res.status).toBe(200);
      expect(res.body.data).toEqual({ enabled: false, configured: false });
    });

    // O caso que diferencia esta feature do comportamento anterior: antes, a
    // presença da credencial já ligava a funcionalidade.
    it('continua desabilitado quando só a credencial está presente', async () => {
      process.env[KEY] = 'chave-de-teste';

      const res = await request(app).post('/status');

      expect(res.body.data).toEqual({ enabled: false, configured: false });
    });

    it('distingue habilitado-sem-credencial de habilitado-e-pronto', async () => {
      process.env[ENABLE] = 'true';
      const semChave = await request(app).post('/status');
      expect(semChave.body.data).toEqual({ enabled: true, configured: false });

      process.env[KEY] = 'chave-de-teste';
      const comChave = await request(app).post('/status');
      expect(comChave.body.data).toEqual({ enabled: true, configured: true });
    });
  });

  describe('/classify-transactions', () => {
    it('recusa quando desabilitado, mesmo com credencial válida', async () => {
      process.env[KEY] = 'chave-de-teste';

      const res = await request(app)
        .post('/classify-transactions')
        .send(payload);

      expect(res.status).toBe(403);
      expect(res.body.reason).toMatch(/not enabled/i);
      // O ponto do RF-002: nenhuma chamada ao provider externo acontece.
      expect(fetchSpy).not.toHaveBeenCalled();
    });

    it('recusa quando habilitado mas sem credencial, com motivo diferente', async () => {
      process.env[ENABLE] = 'true';

      const res = await request(app)
        .post('/classify-transactions')
        .send(payload);

      expect(res.status).toBe(400);
      expect(res.body.reason).toMatch(/not configured/i);
      expect(fetchSpy).not.toHaveBeenCalled();
    });

    it('chama o provider quando habilitado e credenciado', async () => {
      process.env[ENABLE] = 'true';
      process.env[KEY] = 'chave-de-teste';
      fetchSpy.mockResolvedValue(
        new Response(
          JSON.stringify({
            candidates: [
              {
                content: {
                  parts: [
                    {
                      text: JSON.stringify([
                        {
                          index: 0,
                          categoryId: 'cat-1',
                          categoryName: 'Alimentação',
                          confidence: 0.9,
                        },
                      ]),
                    },
                  ],
                },
              },
            ],
          }),
          { status: 200 },
        ),
      );

      const res = await request(app)
        .post('/classify-transactions')
        .send(payload);

      expect(res.status).toBe(200);
      expect(fetchSpy).toHaveBeenCalledOnce();
      expect(res.body.data.classifications).toEqual([
        {
          index: 0,
          categoryId: 'cat-1',
          categoryName: 'Alimentação',
          confidence: 0.9,
        },
      ]);
    });
  });

  describe('leitura da flag', () => {
    it.each([
      ['true', true],
      ['TRUE', true],
      ['1', true],
      ['false', false],
      ['0', false],
      ['', false],
      ['sim', false],
    ])('%s liga? %s', async (valor, esperado) => {
      process.env[ENABLE] = valor;

      const res = await request(app).post('/status');

      expect(res.body.data.enabled).toBe(esperado);
    });
  });
});
// <<< CUSTOM
