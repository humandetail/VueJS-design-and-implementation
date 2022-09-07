// 定义文本模式，作为一个状态表
const TextModes = {
  /** 能解析标签，支持 HTML 实体 */
  DATA: 'DATA',
  /** 不能解析标签，支持 HTML 实体 */
  RCDATA: 'RCDATA',
  /** 不能解析标签，不支持 HTML 实体 */
  RAWTEXT: 'RAWTEXT',
  /** 不能解析标签，不支持 HTML 实体 */
  CDATA: 'CDATA'
}

const namedCharacterReference = {
  gt: '>',
  'gt;': '>',
  lt: '<',
  'lt;': '<',
  'ltcc;': '⪦'
}

const CCR_REPLACEMENTS = {
  0x80: 0x20ac,
  0x82: 0x201a,
  0x83: 0x0192,
  0x84: 0x201e,
  0x85: 0x2026,
  0x86: 0x2020,
  0x87: 0x2021,
  0x88: 0x02c6,
  0x89: 0x2030,
  0x8a: 0x0160,
  0x8b: 0x2039,
  0x8c: 0x0152,
  0x8e: 0x017d,
  0x91: 0x2018,
  0x92: 0x2019,
  0x93: 0x201c,
  0x94: 0x201d,
  0x95: 0x2022,
  0x96: 0x2013,
  0x97: 0x2014,
  0x98: 0x02dc,
  0x99: 0x2122,
  0x9a: 0x0161,
  0x9b: 0x203a,
  0x9c: 0x0153,
  0x9e: 0x017e,
  0x9f: 0x0178
}

// 解析器函数，接收模板作为参数
function parse (str) {
  // 定义上下文对象
  const context = {
    // source 是模板内容，用于在解析过程中进行消费
    source: str,
    // 解析器当前处于的文本模式，初始模式为 DATA
    mode: TextModes.DATA,
    // advanceBy 函数用来消费指定数量的字符，它接收一个数字作为参数
    advanceBy (num) {
      context.source = context.source.slice(num)
    },
    // 无论是开始标签还是结束标签，都可能存在无用的空白字符，例如 <div   >
    advanceSpaces () {
      // 匹配空白字符
      const match = /^[\t\r\n\f ]+/.exec(context.source)
      if (match) {
        // 调用 advanceBy 函数消费空白字符
        context.advanceBy(match[0].length)
      }
    }
  }

  // 调用 parseChildren 函数开始进行解析，它返回解析后得到的子节点
  // parseChildren 函数接收两个参数：
  // 1. 上下文对象 context
  // 2. 由父节点构成的代码栈，初始时栈为空
  const nodes = parseChildren(context, [])

  // 解析器返回 Root 根节点
  return {
    type: 'Root',
    // 使用 nodes 作为根节点的 children
    children: nodes
  }
}

function parseChildren (context, ancestors) {
  // 定义 nodes 数组存储子节点，它将作为最终的返回值
  let nodes = []
  // 从上下文对象中取得当前状态
  const { mode } = context

  // 开启 while 循环，只要满足条件就会一直对字符串进行解析
  // 关于 isEnd() 后文会详细讲解
  while (!isEnd(context, ancestors)) {
    let node
    // 只有 DATA 模式和 RCDATA 模式才支持插值节点的解析
    if (mode === TextModes.DATA || mode === TextModes.RCDATA) {
      // 只有 DATA 模式才支持标签节点的解析
      if (mode === TextModes.DATA && context.source[0] === '<') {
        if (context.source[1] === '!') {
          if (context.source.startsWith('<!--')) {
            // 注释
            node = parseComment(context)
          } else if (context.source.startsWith('<![CDATA[')) {
            // CDATA
            node = parseCDATA(context)
          }
        } else if (context.source[1] === '/') {
          // 状态机遇到了闭合标签，此时应该抛出错误，因为它缺少与之对应的开始标签
          console.error('无效的结束标签')
        } else if (/[a-z]/i.test(context.source[1])) {
          // 标签
          node = parseElement(context, ancestors)
        }
      } else if (context.source.startsWith('{{')) {
        // 解析插值
        node = parseInterpolation(context)
      }
    }

    // node 不存在，说明处于其它模式，即非 DATA 模式且非 RCDATA 模式
    // 这时一切内容都作为文本处理
    if (!node) {
      node = parseText(context)
    }

    // 将节点添加到 nodes 数组中
    nodes.push(node)
  }

  // 当 while 循环停止后，说明子节点解析完毕，返回子节点
  return nodes
}

function parseElement (context, ancestors) {
  // 解析开始标签
  const element = parseTag(context)

  if (element.isSelfClosing) return element

  // 切换到正确的文本模式
  if (element.tag === 'textarea' || element.tag === 'title') {
    context.mode = TextModes.RCDATA
  } else if (/style|xmp|iframe|noembed|noframes|noscript/.test(element.tag)) {
    context.mode = TextModes.RAWTEXT
  } else {
    context.mode = TextModes.DATA
  }

  ancestors.push(element)
  element.children = parseChildren(context, ancestors)
  ancestors.pop()

  if (context.source.startsWith(`</${element.tag}`)) {
    // 解析结束标签
    parseTag(context, 'end')
  } else {
    // 缺少闭合标签
    console.error(`${element.tag} 标签缺少闭合标签`)
  }

  return element
}

function parseTag (context, type = 'start') {
  const { advanceBy, advanceSpaces } = context

  // 处理开始标签和结束标签的正则表达式不同
  const match = type === 'start'
    // 匹配开始标签
    ? /^<([a-z][^\t\r\n\f />]*)/i.exec(context.source)
    // 匹配结束标签
    : /^<\/([a-z][^\t\r\n\f />]*)/i.exec(context.source)

  // 匹配成功后，正则表达式的第一个捕获组的值就是标签名称
  const tag = match[1]
  // 消费正则表达式匹配的全部内容，例如 `<div` 这段内容
  advanceBy(match[0].length)
  // 消费标签中无用的空白字符
  advanceSpaces()

  // 调用 parseAttributes() 函数完成属性与指令的解析，并得到 props 数组
  // props 数组是由指令节点与属性节点共同组件的数组
  const props = parseAttributes(context)

  // 在消费匹配的内容后，如果字符串以 '/>' 开头，则说明这是一个自闭合标签
  const isSelfClosing = context.source.startsWith('/>')

  // 如果是自闭合标签，则消费 '/>'，否则消费 '>'
  advanceBy(isSelfClosing ? 2 : 1)

  // 返回标签节点
  return {
    type: 'Element',
    // 标签名称
    tag,
    // 将 props 数组添加到标签节点上
    props,
    // 子节点留空
    children: [],
    // 是否为自闭合
    isSelfClosing
  }
}

function parseAttributes (context) {
  const { advanceBy, advanceSpaces } = context
  const props = []

  // 不断消费模板内容，直到遇到标签的 “结束部分” 为止
  while (
    !context.source.startsWith('>') &&
    !context.source.startsWith('/>')
  ) {
    // 匹配属性名称
    const match = /^[^\t\r\n\f />][^\t\r\n\f />=]*/.exec(context.source)
    const name = match[0]
    // 消费属性名称
    advanceBy(name.length)
    // 消费空白字符
    advanceSpaces()
    // 消费等于号
    advanceBy(1)
    // 消费等于号与属性值之间的空白字符
    advanceSpaces()

    // 属性值
    let value = ''
    // 获取当前模板内容的第一个字符
    const quote = context.source[0]
    // 判断属性值是否被引号引用
    const isQuoted = quote === '"' || quote === "'"

    if (isQuoted) {
      // 属性值被引号引用
      advanceBy(1)
      // 获取下一个引号的索引
      const endQuoteIndex = context.source.indexOf(quote)
      if (endQuoteIndex > -1) {
        // 获取下一个引号之前的内容作为属性值
        value = context.source.slice(0, endQuoteIndex)
        // 消费属性值
        advanceBy(value.length)
        // 消费引号
        advanceBy(1)
      } else {
        // 缺少引号错误
        console.error('缺少引号')
      }
    } else {
      // 代码运行到这里，说明属性值没有被引号引用
      // 下一个空白字符之前的内容全部作为属性值
      const match = /^[^\t\r\n\f >]+/.exec(context.source)
      // 获取属性值
      value = match[0]
      // 消费属性值
      advanceBy(value.length)
    }

    // 消费属性值后面的空白字符
    advanceSpaces()

    // 使用属性名 + 属性值创建一个属性节点，添加到 props 数组中
    props.push({
      type: 'Attribute',
      name,
      value
    })
  }

  return props
}

function parseText (context) {
  // endIndex 为文本内容的结尾索引，默认为整个模板剩余内容
  let endIndex = context.source.length
  // 寻找字符 < 的位置索引
  const ltIndex = context.source.indexOf('<')
  // 寻找定界符 {{ 的位置索引
  const delimiterIndex = context.source.indexOf('{{')

  // 取 ltIndex 与 endIndex 中较小值作为新的结尾索引
  if (ltIndex > -1 && ltIndex < endIndex) {
    endIndex = ltIndex
  }
  // 取 delimiterIndex 与 endIndex 中较小值作为新的结尾索引
  if (delimiterIndex > -1 && delimiterIndex < endIndex) {
    endIndex = delimiterIndex
  }

  // 此时 endIndex 是最终的文本内容的结尾索引
  const content = context.source.slice(0, endIndex)
  // 消耗文本内容
  context.advanceBy(content.length)

  return {
    type: 'Text',
    content: decodeHtml(content)
  }
}

function parseInterpolation (context) {
  const { advanceBy } = context
  // 消费开始定界符
  advanceBy('{{'.length)
  // 找到结束定界符的位置索引
  const closeIndex = context.source.indexOf('}}')

  if (closeIndex < 0) {
    console.error('插值缺少结束定界符')
  }

  // 截取开始定界符与结束定界符之间的内容作为插值表达式
  const content = context.source.slice(0, closeIndex)
  // 消费表达式的内容
  advanceBy(content.length)
  // 消费结束定界符
  advanceBy('}}'.length)

  // 返回类型为 Interpolation 的节点，代表插值节点
  return {
    type: 'Interpolation',
    content: {
      // 类型为 Expression 表达式节点
      type: 'Expression',
      // 表达式节点的内容则经过 HTML 解码后的插值表达式
      content: decodeHtml(content)
    }
  }
}

function parseComment (context) {
  const { advanceBy } = context
  // 消费注释开始部分
  advanceBy('<!--'.length)
  // 找到结束注释的位置索引
  const closeIndex = context.source.indexOf('-->')

  if (closeIndex < 0) {
    console.error('插值缺少注释结束部分')
  }

  // 截取开始注释与结束注释之间的内容作为插值表达式
  const content = context.source.slice(0, closeIndex)
  // 消费表达式的内容
  advanceBy(content.length)
  // 消费结束注释部分
  advanceBy('}}'.length)

  return {
    type: 'Comment',
    content
  }
}

/**
 * 解码文本
 * @param {string} rawText 需要被解码的文本
 * @param {boolean} asAttr 是否为属性值
 */
function decodeHtml (rawText, asAttr = false) {
  let offset = 0
  const end = rawText.length

  // 解码后的文本
  let decodedText = ''
  // 引用表中实体名称的最大长度
  let maxCRNameLength = 0

  // advance 函数用于消费指定长度的文本
  function advance (length) {
    offset += length
    rawText = rawText.slice(length)
  }

  // 消费字符串，直到处理完毕为止
  while (offset < end) {
    // 用于匹配字符引用的开始部分，如果匹配成功，那么 head[0] 的值将有三种可能：
    // 1. head[0] === '&' 说明是命名字符引用
    // 2. head[0] === '&#' 说明是十进制的数字字符引用
    // 3. head[0] === '&#x' 说明是十六进制的数字字符引用
    const head = /&(?:#x?)?/i.exec(rawText)
    // 如果没有匹配，说明没有需要解码的内容
    if (!head) {
      // 计算剩余内容的长度
      const remaining = end - offset
      // 将剩余内容加到 decodedText 上
      decodedText += rawText.slice(0, remaining)
      // 消费剩余内容
      advance(remaining)
      break
    }

    // head.index 为匹配的字符 & 在 rawText 中的位置索引
    // 截取字符 & 之前的内容加到 decodedText 上
    decodedText += rawText.slice(0, head.index)
    // 消费字符 & 之前的内容
    advance(head.index)

    // 如果满足条件 ，则说明是命名字符引用，否则为数字字符引用
    if (head[0] === '&') {
      let name = ''
      let value
      // 字符 & 的下一个字符必须是 a-Z0-9
      if (/[0-9a-z]/i.test(rawText[1])) {
        // 根据引用表计算实体名的最大长度
        if (!maxCRNameLength) {
          maxCRNameLength = Object.keys(namedCharacterReference).reduce((max, name) => Math.max(max, name.length), 0)
        }

        // 从最大长度开始对文本进行截取，并试图去引用表中找到对应的项
        for (let length = maxCRNameLength; !value && length > 0; --length) {
          // 截取字符 & 到最大长度之间的字符作为实体名称
          name = rawText.slice(1, length)
          // 使用实体名称去索引表中查找对应项的值
          value = (namedCharacterReference)[name]
        }

        // 如果找到了对应项的值，说明解码成功
        if (value) {
          // 检查实体最后一个字符是否为分号
          const semi = value.endsWith(';')
          // 如果解码的文本作为属性值，最后一个匹配的字符不是分号，
          // 并且最后一个匹配字符的下一个字符是等于号（=）、ASCII 字母或数字，
          // 由于历史原因，将字符 & 和实体名称 name 作为普通文本
          if (
            asAttr &&
            !semi &&
            /[=a-z0-9]/i.test(rawText[name.length + 1] || '')
          ) {
            decodedText += '&' + name
            advance(1 + name.length)
          } else {
            // 其他情况下，正在使用解码后的内容拼接到 decodedText 上
            decodedText += value
            advance(1 + name.length)
          }
        } else {
          // 如果没有找到对应的值，说明解码失败
          decodedText += '&' + name
          advance(1+ name.length)
        }
      } else {
        // 如果字符 & 的下一个字符不是 ASCII 字母或数字，则将字符 & 作为普通文本
        decodedText += '&'
        advance(1)
      }
    } else {
      // 判断是以十进制表示还是以十六进制表示
      const hex = head[0] === '&#x'
      // 根据不同的进制选用不同的正则
      const pattern = hex
        ? /^&#x([0-9a-f]+);?/i
        : /^&#([0-9]+);?/
      // 最终， body[1] 就是 Unicode 码点
      const body = pattern.exec(rawText)

      if (body) {
        // 根据对应的进制，将码点字符串转换为数字
        let cp = parseInt(body[1], hex ? 16 : 10)

        // 检查码点的合法性
        if (cp === 0) {
          // 如果码点值为 0x00，替换为 0xfffd
          cp = 0xfffd
        } else if (cp > 0x10ffff) {
          // 如果码点值超过了 Unicode 的最大值，替换为 0xfffd
          cp = 0xfffd
        } else if (cp >= 0xd800 && cp <= 0xdfff) {
          // 如果码点值处于 surroaget pair 范围内，替换为 0xfffd
          cp = 0xfffd
        } else if ((cp >= 0xfdd0 && cp <= 0xfdef) || (cp & 0xfffe) === 0xfffe) {
          // 如果码点值处于 noncharacter 范围内，则什么都不做，交给平台处理
        } else if (
          // 控制字符集的范围是：[0x01,0x1f] 加上 [0x7f,0x9f]
          // 去掉 ASCII 空白符：0x09(TAB)、0x0A(LF)、0x0C(FF)
          // 0x0D(CR)虽然也是 ASCII 空白符，但需要包含
          (cp >= 0x01 && cp <= 0x08) ||
          cp === 0x0b ||
          (cp >= 0x0d && cp <= 0x1f) ||
          (cp >= 0x7f && cp <= 0x9f)
        ) {
          // 在 CCR_REPLACEMENTS 表中查找替换码点，如果找不到，则使用原码点
          cp = CCR_REPLACEMENTS[cp] || cp
        }

        // 解码
        decodedText += String.fromCodePoint(cp)
        // 消费整 个数字字符引用的内容
        advance(body[0].length)
      } else {
        // 如果没有匹配，则不进行解码操作，只是把 head[0] 追加到 decodedText 上并消费
        decodedText += head[0]
        advance(head[0].length)
      }
    }
  }
  return decodedText
}

function isEnd (context, ancestors) {
  // 当模板内容解析完毕后，停止
  if (!context.source) return true

  // 与父级节点栈内所有节点做比较
  for (let i = ancestors.length - 1; i >= 0; i--) {
    // 只要栈中存在与当前结束标签同名的节点，就停止状态机
    if (context.source.startsWith(`</${ancestors[i].tag}>`)) {
      return true
    }
  }
}
