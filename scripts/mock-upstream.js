// 本地 OpenAI 兼容 mock 上游，用于 neo-matrix 端到端验证。
// 监听 :19000，暴露 /v1/chat/completions，返回可计数的 usage。
const http = require('http');

const usage = { prompt_tokens: 12, completion_tokens: 8, total_tokens: 20 };

const server = http.createServer((req, res) => {
  if (req.method === 'GET' && req.url.startsWith('/v1/models')) {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ object: 'list', data: [{ id: 'gpt-4o-mini', object: 'model' }] }));
    return;
  }
  if (req.method === 'POST' && req.url.startsWith('/v1/chat/completions')) {
    let body = '';
    req.on('data', (c) => (body += c));
    req.on('end', () => {
      let parsed = {};
      try { parsed = JSON.parse(body); } catch {}
      const isStream = parsed.stream === true;
      if (isStream) {
        res.writeHead(200, { 'Content-Type': 'text/event-stream' });
        const chunks = [
          'data: {"choices":[{"delta":{"content":"Hello"},"index":0}]}\n\n',
          'data: {"choices":[{"delta":{},"index":0,"finish_reason":"stop"}],"usage":{"prompt_tokens":12,"completion_tokens":8,"total_tokens":20}}\n\n',
          'data: [DONE]\n\n',
        ];
        chunks.forEach((c) => res.write(c));
        res.end();
        return;
      }
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({
        id: 'chatcmpl-mock',
        object: 'chat.completion',
        created: Math.floor(Date.now() / 1000),
        model: parsed.model || 'gpt-4o-mini',
        choices: [{ index: 0, message: { role: 'assistant', content: 'mock reply' }, finish_reason: 'stop' }],
        usage,
      }));
    });
    return;
  }
  res.writeHead(404, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify({ error: { message: 'not found: ' + req.url, type: 'mock_404' } }));
});

server.listen(19000, () => console.log('mock upstream listening on :19000'));
