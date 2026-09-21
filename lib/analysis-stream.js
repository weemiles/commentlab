import { analyzeVideo } from './analyze-video.js';

export async function streamAnalysis(response, body, options = {}, runAnalysis = analyzeVideo) {
  response.statusCode = 200;
  response.setHeader('Content-Type', 'application/x-ndjson; charset=utf-8');
  response.setHeader('Cache-Control', 'no-store, no-transform');
  response.setHeader('X-Accel-Buffering', 'no');
  response.flushHeaders?.();

  const send = (event) => response.write(`${JSON.stringify(event)}\n`);
  send({ type: 'progress', stage: 'connecting', done: 0, total: 0, percent: 0 });
  try {
    const result = await runAnalysis(body, {
      ...options,
      report: (progress) => send({ type: 'progress', ...progress })
    });
    send({ type: 'result', data: result });
  } catch (error) {
    send({ type: 'error', error: error.message || '분석 중 알 수 없는 오류가 발생했습니다.' });
  } finally {
    response.end();
  }
}
