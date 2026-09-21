import { analyzeVideo } from './analyze-video.js';
import { publicMessage } from './messages.js';

export async function streamAnalysis(response, body, options = {}, runAnalysis = analyzeVideo) {
  const { language = 'ko', ...analysisOptions } = options;
  response.statusCode = 200;
  response.setHeader('Content-Type', 'application/x-ndjson; charset=utf-8');
  response.setHeader('Cache-Control', 'no-store, no-transform');
  response.setHeader('X-Accel-Buffering', 'no');
  response.flushHeaders?.();

  const send = (event) => response.write(`${JSON.stringify(event)}\n`);
  send({ type: 'progress', stage: 'connecting', done: 0, total: 0, percent: 0 });
  try {
    const result = await runAnalysis(body, {
      ...analysisOptions,
      report: (progress) => send({ type: 'progress', ...progress })
    });
    send({ type: 'result', data: result });
  } catch (error) {
    send({ type: 'error', error: publicMessage(error, language) });
  } finally {
    response.end();
  }
}
