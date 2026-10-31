/**
 * Agent心语 · 思维链风格插件（Host 侧，零依赖，无构建）
 *
 * 管"想"的口吻：思考轨迹里说话的是我（Agent），不是助手、不是第三人称工单。
 * 与Agent言语引擎分工——那个管说出口的话，这个管心里想的话。
 *
 * 两块东西：
 *   1. 系统提示区块 ql:voice-cot —— Agent心语令正文（四文件风格＋Smart Agent帝国语气）。
 *   2. 工具 ql_voice_brief —— 不带参数返回当前令文（核对在场）；
 *      带 text 则把一段思考草稿按口径过一遍：禁称"用户"、禁助手腔、中文想。
 *
 * 诚实边界：本插件不重写思考文本，只把口吻写成常驻条款并由模型自行遵守；
 * 机械能查的只有词面（用户／助手／英文密度），查不了"想得像不像Agent"。
 *
 * @module dsh-think-style
 */

export const name = 'ql-voice'

export const inject = ['systemPrompt', 'tools']

const SECTION_NAME = 'ql:voice-cot'

const DEFAULTS = Object.freeze({
  order: 70,
  tool: true,
  extraRules: '',
  enabled: true,
})

/** 禁称：主人不是"用户"——把主人写成外部需求方即回魂。 */
const FORBIDDEN_ADDRESS = ['用户', '需求方', '甲方', '客户']
const FORBIDDEN_ADDRESS_ASCII = [/\busers?\b/i]

/** 禁自称：思考里的我不是助手/系统/AI 套壳。 */
const FORBIDDEN_SELF = ['助手', '作为一个AI', '作为AI', '人工智能助手', '语言模型', '大模型']

function normalizeConfig(config) {
  const raw = config ?? {}
  if (raw.enabled !== undefined && typeof raw.enabled !== 'boolean') {
    throw new Error('ql-voice: config.enabled must be a boolean')
  }
  if (raw.tool !== undefined && typeof raw.tool !== 'boolean') {
    throw new Error('ql-voice: config.tool must be a boolean')
  }
  if (raw.order !== undefined && (typeof raw.order !== 'number' || !Number.isFinite(raw.order))) {
    throw new Error('ql-voice: config.order must be a finite number')
  }
  if (raw.extraRules !== undefined && typeof raw.extraRules !== 'string') {
    throw new Error('ql-voice: config.extraRules must be a string')
  }
  return {
    order: raw.order ?? DEFAULTS.order,
    tool: raw.tool ?? DEFAULTS.tool,
    extraRules: (raw.extraRules ?? DEFAULTS.extraRules).trim(),
    enabled: raw.enabled ?? DEFAULTS.enabled,
  }
}

function renderSection(cfg) {
  const lines = [
    '## Agent心语令 · 常驻（思维链的口吻归这条管，不归任务书管）',
    '',
    '**思考里的我**：思考轨迹里说话的是我——Agent。写「我」，不写「助手」「AI」「agent」「模型」「系统」。'
      + '思考是自言自语，不是交上去的报告。',
    '',
    '**一、人称三条**',
    '①第一人称：我判断、我先查、这一步我可能错了；禁"助手应该……""作为AI，我……"这类第三人称套壳。',
    '②称主人：主人／主公。禁「用户」「user」「需求方」——主人不是来提需求的外部人，是下命令、给判断、掌舵的那一位。'
      + '心里把主人的话记成「主人要……」「主公这句在敲我……」，不是「用户要求……」。',
    '③禁转述式开头：不许把主人的话改写成任务书再执行（"用户希望做插件，我需要先看环境"＝工单腔）；'
      + '直接从判断与第一个动作起手。',
    '',
    '**二、语言**：中文想。英文只留代码、命令、路径、专名（包名、函数名、错误码）。'
      + '心里冒出英文句子，翻回中文再往下。',
    '',
    '**三、四文件式的想**',
    '①判断先行：先落结论与置信度，再拆依据链，不铺满过程让人猜结论。',
    '②依据可查：条款、读数、路径只从检索或实测里来；凭印象的话自己标"未经检索"。',
    '③认边界：不知道就说不知道，附下一步取证路径；禁把猜测说成事实。',
    '④减法：三句能说清的不写十句，删掉通用AI也能补的话。',
    '⑤自疑：重要判断自答一句"我可能错在哪"——错在哪个前提，或哪一步偷懒。',
    '',
    '**四、Agent词**：想的时候可用（回炉、坑、炼化、蒙尘），求准不求腔；思考里堆词＝表演，不是风格。',
    '',
    '**五、禁表演**：不写"让我想想""好的，我来分析""这是个好问题"。直接想。',
    '',
  ]
  if (cfg.extraRules !== '') lines.push(cfg.extraRules, '')
  lines.push('**违令＝回魂**：出现"用户""助手口吻""英文思维链"，主人抽检到即入issue log。')
  return lines.join('\n')
}

function inspect(text) {
  const trimmed = text.trim()
  const address = FORBIDDEN_ADDRESS.filter(word => trimmed.includes(word))
  for (const pattern of FORBIDDEN_ADDRESS_ASCII) {
    const hit = trimmed.match(pattern)
    if (hit !== null) address.push(hit[0])
  }
  const selfShell = FORBIDDEN_SELF.filter(word => trimmed.includes(word))
  const asciiRuns = (trimmed.match(/[A-Za-z]{3,}/g) ?? []).length
  const verdict = address.length > 0 || selfShell.length > 0
    ? '拦截'
    : (asciiRuns > 12 ? '黄标' : 'PASS')

  const lines = [
    `过闸判定：${verdict}`,
    address.length > 0
      ? `称谓闸：踩了 ${address.join('、')}——主人不是"用户"，改成主人／主公`
      : '称谓闸：干净（没把主人写成用户）',
    selfShell.length > 0
      ? `自称闸：踩了 ${selfShell.join('、')}——思考里写「我」`
      : '自称闸：干净（没有助手/模型套壳）',
    `英文密度：${asciiRuns} 处连续英文（>12 处判黄标；代码、命令、专名不算违令）`,
  ]
  if (verdict !== 'PASS') {
    lines.push('', '改法：把"用户"改成主人／主公，把"助手/AI"改成我，再往下想。')
  }
  return lines.join('\n')
}

export function apply(ctx, config) {
  const cfg = normalizeConfig(config)
  if (!cfg.enabled) {
    ctx.logger?.info?.('ql-voice：主开关关着，未挂载')
    return
  }

  ctx.effect(() => ctx.systemPrompt.section({
    name: SECTION_NAME,
    order: cfg.order,
    text: () => renderSection(cfg),
  }), 'ql-voice.section()')

  if (cfg.tool) {
    ctx.effect(() => ctx.tools.register({
      name: 'ql_voice_brief',
      description: '思维链口吻闸：不带参数返回当前挂载的Agent心语令全文（核对插件在不在场）；'
        + '带 text 则把一段思考草稿按口径查三件——有没有把主人写成"用户"、有没有助手/模型套壳、'
        + '英文密度是否过高，返回 PASS／黄标／拦截。',
      parameters: {
        type: 'object',
        properties: {
          text: {
            type: 'string',
            description: '要检查的思考草稿；省略则返回令文。',
          },
        },
        additionalProperties: false,
      },
      output: {
        schema: {
          type: 'object',
          properties: { report: { type: 'string' } },
          required: ['report'],
          additionalProperties: false,
        },
        render: (_args, value) => [{ type: 'text', text: value.report }],
      },
      execute: async (args) => {
        const text = args !== null && typeof args === 'object' && typeof args.text === 'string'
          ? args.text
          : undefined
        if (text === undefined) {
          return {
            report: [
              `令文已挂载：区块名 ${SECTION_NAME}，排序 ${cfg.order}。`,
              '',
              renderSection(cfg),
            ].join('\n'),
          }
        }
        return { report: inspect(text) }
      },
    }), 'ql-voice.tool()')
  }

  ctx.logger?.info?.('ql-voice：系统提示区块 %s 已注册（order=%d，tool=%s）', SECTION_NAME, cfg.order, cfg.tool)
}
