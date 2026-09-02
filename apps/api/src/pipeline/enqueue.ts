import type { Env, PipelineJob } from '../env.js';

/**
 * Enfileira um job do pipeline. Se houver Cloudflare Queues (plano pago), usa a
 * fila. Caso contrário (plano gratuito), processa em segundo plano na própria
 * requisição via `waitUntil` — mesma lógica, sem depender de Queues.
 *
 * O import de `handleJob` é dinâmico de propósito, para evitar ciclo de módulos
 * (process.ts importa os handlers de questions.ts, que importam este arquivo).
 */
export async function enqueue(
  env: Env,
  job: PipelineJob,
  waitUntil?: (p: Promise<unknown>) => void,
): Promise<void> {
  if (env.QUEUE) {
    await env.QUEUE.send(job);
    return;
  }
  const run = (async () => {
    const { handleJob } = await import('./process.js');
    await handleJob(env, job);
  })().catch((err) => console.error('inline job falhou', job, err));
  if (waitUntil) waitUntil(run);
  else await run;
}
