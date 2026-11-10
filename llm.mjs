/**
 * AI 摘要：调用 DeepSeek（或任何 OpenAI 兼容）接口，把一批通知压成「对我有什么用」。
 * 没有配置 Key / 调用失败时返回失败原因，调用方自动退回规则摘要 —— 功能不中断。
 */

const SYSTEM_PROMPT =
  '你是一位在校大学生的私人助理。任务：把校内通知里「与我有关、需要我动作」的部分挑出来，用中文写清楚。' +
  '严格只输出 JSON 数组，不要解释、不要 markdown 代码块。'

function buildPrompt(notices) {
  const payload = notices.map((notice, index) => ({
    i: index,
    title: notice.title,
    date: notice.publishedAt || '',
    content: String(notice.content || notice.context || '').slice(0, 900),
  }))
  return (
    '下面是一批校园通知。对每一条输出一个对象：\n' +
    '{"i":序号,"gist":"一句话讲清这件事（不超过60字）","useful":["对我有用的点，每条不超过30字，最多3条"],' +
    '"tags":["考试","报名","讲座"等2-4个标签],"deadline":"YYYY-MM-DDTHH:mm 或 空字符串","relevant":true|false}\n' +
    '判断标准：只和老师/行政/后勤有关、或者纯招标采购类，relevant 给 false 且 useful 给空数组。' +
    '有明确截止时间的，deadline 必须填；没有就给空字符串。\n\n通知列表：\n' +
    JSON.stringify(payload, null, 1)
  )
}

/**
 * @param {Array} notices 待摘要的 notice（带 title/publishedAt/content）
 * @param {{llm?: {apiKey?: string, baseURL?: string, model?: string}}} config
 * @returns {Promise<{ok: true, map: Map<number, object>} | {ok: false, reason: string}>}
 */
export async function summarizeBatch(notices, config = {}) {
  const llm = config.llm || {}
  const apiKey = llm.apiKey || process.env.DEEPSEEK_API_KEY || process.env.OPENAI_API_KEY
  if (!apiKey) {
    return { ok: false, reason: '没有配置 API Key（设置页填 DeepSeek Key，或设环境变量 DEEPSEEK_API_KEY）' }
  }
  const baseURL = String(llm.baseURL || 'https://api.deepseek.com').replace(/\/+$/, '')
  const model = llm.model || 'deepseek-chat'
  const body = {
    model,
    messages: [
      { role: 'system', content: SYSTEM_PROMPT },
      { role: 'user', content: buildPrompt(notices) },
    ],
    temperature: 0.2,
    max_tokens: 2400,
    stream: false,
  }
  let text = ''
  try {
    const response = await fetch(`${baseURL}/chat/completions`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: `Bearer ${apiKey}` },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(90_000),
    })
    const raw = await response.text()
    if (!response.ok) {
      let hint = raw.slice(0, 300)
      try {
        const parsed = JSON.parse(raw)
        hint = parsed?.error?.message || hint
      } catch {
        /* 原样返回 */
      }
      return { ok: false, reason: `接口返回 HTTP ${response.status}：${hint}` }
    }
    const parsed = JSON.parse(raw)
    text = parsed?.choices?.[0]?.message?.content || ''
  } catch (error) {
    return { ok: false, reason: `调用失败：${error?.message || error}` }
  }
  const start = text.indexOf('[')
  const end = text.lastIndexOf(']')
  if (start === -1 || end === -1 || end <= start) {
    return { ok: false, reason: '模型没有返回 JSON 数组' }
  }
  try {
    const rows = JSON.parse(text.slice(start, end + 1))
    if (!Array.isArray(rows)) return { ok: false, reason: '模型返回的不是数组' }
    const map = new Map()
    for (const row of rows) {
      if (row && Number.isInteger(row.i)) map.set(row.i, row)
    }
    return { ok: true, map }
  } catch (error) {
    return { ok: false, reason: `JSON 解析失败：${error?.message || error}` }
  }
}
