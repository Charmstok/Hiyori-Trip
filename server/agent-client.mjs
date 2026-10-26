import OpenAI from 'openai';

export const MODEL_REQUEST_TIMEOUT_MS = 10 * 60_000;
export const AGENT_RUN_TIMEOUT_MS = 15 * 60_000;
export const CONNECTION_TEST_TIMEOUT_MS = 20_000;
const MAX_CONTENT_BYTES = 2 * 1024 * 1024;
const MAX_STREAM_BYTES = 128 * 1024 * 1024;

function responseError(code, message) {
  return Object.assign(new Error(message), { code });
}
// Keep backpressure while bounding responses. SSE framing can be much larger than final text.
async function boundedFetch(input, init) {
  const response = await fetch(input, { ...init, redirect: 'error' });
  if (!response.body) return response;
  const limit = /text\/event-stream/i.test(response.headers.get('content-type') || '')
    ? MAX_STREAM_BYTES
    : MAX_CONTENT_BYTES;
  const reader = response.body.getReader();
  let size = 0;
  const body = new ReadableStream({
    async pull(controller) {
      try {
        const { done, value } = await reader.read();
        if (done) {
          reader.releaseLock();
          controller.close();
          return;
        }
        size += value.byteLength;
        if (size > limit) throw responseError('HIYORI_RESPONSE_TOO_LARGE', '模型响应过大。');
        controller.enqueue(value);
      } catch (error) {
        await reader.cancel().catch(() => {});
        reader.releaseLock();
        controller.error(error);
      }
    },
    async cancel(reason) {
      await reader.cancel(reason).catch(() => {});
      reader.releaseLock();
    },
  });
  return new Response(body, {
    status: response.status,
    statusText: response.statusText,
    headers: response.headers,
  });
}
export function createModelClient(config) {
  return new OpenAI({
    apiKey: config.apiKey,
    baseURL: config.baseURL,
    organization: config.organization || null,
    project: config.project || null,
    adminAPIKey: null,
    webhookSecret: null,
    maxRetries: 0,
    timeout: MODEL_REQUEST_TIMEOUT_MS,
    logLevel: 'off',
    fetch: boundedFetch,
  });
}

// Collect only the final answer/tool arguments; reasoning remains transient and is never logged.
export async function modelCompletion(
  client,
  parameters,
  { signal, timeoutMs = MODEL_REQUEST_TIMEOUT_MS, onPhase = () => {} } = {},
) {
  const requestSignal = AbortSignal.any([
    ...(signal ? [signal] : []),
    AbortSignal.timeout(timeoutMs),
  ]);
  try {
    const { data: stream, response } = await client.chat.completions
      .create({ ...parameters, stream: true }, { signal: requestSignal, timeout: timeoutMs })
      .withResponse();
    if (!/text\/event-stream/i.test(response.headers.get('content-type') || '')) {
      // Some compatible services ignore stream=true. Reuse this response without another paid call.
      return await response.json();
    }
    let content = '',
      refusal = '',
      finishReason,
      contentBytes = 0,
      thinking = false,
      composing = false;
    const tools = new Map();
    const append = (previous, fragment) => {
      if (typeof fragment !== 'string') return previous;
      contentBytes += Buffer.byteLength(fragment);
      if (contentBytes > MAX_CONTENT_BYTES)
        throw responseError('HIYORI_RESPONSE_TOO_LARGE', '模型输出过大。');
      return previous + fragment;
    };
    try {
      for await (const chunk of stream) {
        if (requestSignal.aborted) throw requestSignal.reason;
        const choice = chunk.choices?.find((choice) => choice.index === 0) || chunk.choices?.[0];
        if (!choice) continue;
        const delta = choice.delta || {};
        if (!thinking && (delta.reasoning_content || delta.reasoning)) {
          thinking = true;
          onPhase('模型正在推理和检查路线，可随时取消…');
        }
        if (!composing && (delta.content || delta.tool_calls?.length)) {
          composing = true;
          onPhase('模型正在输出安排与交通细节…');
        }
        content = append(content, delta.content);
        refusal = append(refusal, delta.refusal);
        for (const piece of delta.tool_calls || []) {
          if (!Number.isInteger(piece.index) || piece.index < 0 || piece.index >= 8)
            throw responseError('HIYORI_INVALID_RESPONSE', '模型返回了无效的工具调用。');
          if (!tools.has(piece.index))
            tools.set(piece.index, {
              id: '',
              type: 'function',
              function: { name: '', arguments: '' },
            });
          const tool = tools.get(piece.index);
          tool.id = append(tool.id, piece.id);
          if (piece.type) tool.type = piece.type;
          tool.function.name = append(tool.function.name, piece.function?.name);
          tool.function.arguments = append(tool.function.arguments, piece.function?.arguments);
        }
        if (choice.finish_reason) finishReason = choice.finish_reason;
      }
    } finally {
      stream.controller.abort();
    }
    if (requestSignal.aborted) throw requestSignal.reason;
    if (!finishReason)
      throw responseError('HIYORI_INCOMPLETE_RESPONSE', '模型连接在输出完成前中断。');
    return {
      choices: [
        {
          index: 0,
          finish_reason: finishReason,
          message: {
            role: 'assistant',
            content: content || null,
            ...(refusal ? { refusal } : {}),
            ...(tools.size
              ? {
                  tool_calls: [...tools.entries()]
                    .sort(([a], [b]) => a - b)
                    .map(([, tool]) => tool),
                }
              : {}),
          },
        },
      ],
    };
  } catch (error) {
    if (requestSignal.aborted && !signal?.aborted) throw new OpenAI.APIConnectionTimeoutError();
    throw error;
  }
}

function causeCodes(error) {
  const codes = [];
  let cause = error;
  for (let i = 0; cause && i < 5; i++, cause = cause.cause)
    if (typeof cause.code === 'string') codes.push(cause.code);
  return codes;
}
export function modelErrorMessage(error, { signal, timeoutMs = MODEL_REQUEST_TIMEOUT_MS } = {}) {
  const codes = causeCodes(error);
  if (signal?.aborted && signal.reason?.name === 'TimeoutError')
    return '整次规划已超过 15 分钟，请减少行程天数或材料后重试。之前的草案仍保留。';
  if (
    error instanceof OpenAI.APIConnectionTimeoutError ||
    error?.name === 'TimeoutError' ||
    codes.some((code) =>
      [
        'ETIMEDOUT',
        'UND_ERR_CONNECT_TIMEOUT',
        'UND_ERR_HEADERS_TIMEOUT',
        'UND_ERR_BODY_TIMEOUT',
      ].includes(code),
    )
  )
    return `模型响应超时（单次请求最长等待 ${Math.ceil(timeoutMs / 1000)} 秒），请稍后重试，或适当减少行程天数与输出额度。之前的草案仍保留。`;
  if (signal?.aborted || error instanceof OpenAI.APIUserAbortError || error?.name === 'AbortError')
    return '规划已取消，之前的草案仍保留。';
  if (codes.includes('HIYORI_RESPONSE_TOO_LARGE'))
    return '模型输出过大，请减少行程天数或按日期分段规划。';
  if (codes.includes('HIYORI_INCOMPLETE_RESPONSE'))
    return '模型连接在输出完成前中断，请稍后重试。之前的草案仍保留。';
  if (codes.includes('HIYORI_INVALID_RESPONSE'))
    return '模型返回了无效的工具调用，请重试或改用 JSON 兼容模式。';
  if (
    error instanceof OpenAI.APIConnectionError ||
    codes.some(
      (code) =>
        /CERT|TLS|SSL|SELF_SIGNED|VERIFY_LEAF/.test(code) ||
        [
          'ENOTFOUND',
          'EAI_AGAIN',
          'ECONNREFUSED',
          'ECONNRESET',
          'EPIPE',
          'UND_ERR_SOCKET',
        ].includes(code),
    )
  ) {
    if (codes.some((code) => ['ENOTFOUND', 'EAI_AGAIN'].includes(code)))
      return '模型服务地址无法解析，请检查 Base URL 和本机 DNS。';
    if (codes.some((code) => /CERT|TLS|SSL|SELF_SIGNED|VERIFY_LEAF/.test(code)))
      return '无法验证模型服务的 HTTPS 证书，请检查服务地址与系统证书。';
    if (codes.includes('ECONNREFUSED'))
      return '模型服务拒绝连接，请检查服务地址、端口及服务是否启动。';
    if (codes.some((code) => ['ECONNRESET', 'EPIPE', 'UND_ERR_SOCKET'].includes(code)))
      return '模型服务连接被中断，请检查网络、代理或服务状态后重试。';
    return '未能连接模型服务，请检查网络、代理和 Base URL 后重试。';
  }
  if (error instanceof OpenAI.APIError) {
    const status = error.status;
    if (status === 401 || status === 403)
      return '模型服务拒绝访问，请检查 API Key、模型权限与 Base URL。';
    if (status === 429) return '模型服务额度不足或请求过于频繁，请检查额度后重试。';
    if ([408, 504, 524].includes(status))
      return `模型服务或网关等待超时（HTTP ${status}），请稍后重试或减少规划内容。`;
    if (status >= 500) return `模型服务暂时不可用（HTTP ${status}），请稍后重试。`;
    if (status === 413) return '参考材料超出模型服务的大小限制，请减少附件或文字。';
    if (
      (status === 400 || status === 422) &&
      /max[_ -]?(?:completion[_ -]?|output[_ -]?)?tokens/i.test(
        `${error.param || ''} ${error.message || ''}`,
      ) &&
      /exceed|maximum|range|limit|too (?:large|high)|less than|<=|最大|上限|范围/i.test(
        error.message || '',
      )
    )
      return '当前输出上限超过了该模型支持的范围，请按模型服务商的限制降低输出上限。';
    if ([400, 404, 422].includes(status))
      return '模型或请求格式不被服务支持。请检查模型名、输出参数，或切换为 JSON 兼容模式；图片需要支持视觉的模型。';
    return status
      ? `模型服务返回错误（HTTP ${status}），请检查服务状态后重试。`
      : '模型服务在输出过程中返回错误，请稍后重试。';
  }
  return '规划未能完成，请检查输入和模型连接后重试。';
}
