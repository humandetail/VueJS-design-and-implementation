// 定义状态机的状态
const State = {
  initial: 1,     // 初始状态
  tagOpen: 2,     // 标签开始状态
  tagName: 3,     // 标签名称状态
  text: 4,        // 文本状态
  tagEnd: 5,      // 结束标签状态
  tagEndName: 6   // 结束标签名称状态
}

// 辅助函数，用于判断是否是字符
const isAlpha = char => char >= 'a' && char <= 'z' || char >= 'A' && char <= 'Z'

// 辅助函数，用于打印当前 AST 中节点的信息
const dump = (node, indent = 0) => {
  // 节点的类型
  const { type } = node
  // 节点的描述，如果是根节点，则没有描述
  // 如果是 Element 类型的节点，则使用 node.tag 作为节点的描述
  // 如果是 Text 类型的节点，则使用 node.content 作为节点的描述
  const desc = node.type === 'Root'
    ? ''
    : node.type === 'Element'
      ? node.tag
      : node.content

  // 打印节点的类型和描述信息
  console.log(`${'-'.repeat(indent)}${type}: ${desc}`)

  // 递归地打印子节点
  if (node.children) {
    node.children.forEach(n => dump(n, indent + 2))
  }
}

// 转换标签节点
const tranformElement = node => {
  if (node.type === 'Element' && node.tag === 'p') {
    node.tag = 'h1'
  }
}
// 转换文本节点
const tranformText = (node, context) => {
  if (node.type === 'Text') {
    // 移除文本节点
    context.removeNode()
  }
}

// 接收模板字符串作为参数，并将模板切割为 Token 返回
function tokenize (str) {
  // 状态机的当前状态：初始状态
  let currentState = State.initial
  // 用于缓存字符
  const chars = []
  // 生成的 Token 会存储到 tokens 数组中，并作为函数的返回值返回
  const tokens = []

  // 使用 while 循环开启自动机，只要模板字符串没有被消费完，自动机就会一直运行
  while (str) {
    // 查看第一个字符，注意，这里只是查看，没有消费该字符
    const char = str[0]

    switch (currentState) {
      // 状态机当前处于初始状态
      case State.initial:
        // 遇到字符 '<'
        if (char === '<') {
          // 1. 状态机切换到标签开始状态
          currentState = State.tagOpen
          // 2. 消费字符 '<'
          str = str.slice(1)
        } else if (isAlpha(char)) {
          // 1. 遇到字母，切换到文本状态
          currentState = State.text
          // 2. 将当前字母缓存到 chars 数组
          chars.push(char)
          // 3. 消费当前字符
          str = str.slice(1)
        }
        break
      // 状态机当前处于标签开始状态
      case State.tagOpen:
        if (isAlpha(char)) {
          // 1. 遇到字母，切换到标签名称状态
          currentState = State.tagName
          // 2. 将当前字母缓存到 chars 数组
          chars.push(char)
          // 3. 消费当前字符
          str = str.slice(1)
        } else if (char === '/') {
          // 1. 遇到字符 /，切换到结束标签状态
          currentState = State.tagEnd
          // 2. 消费字符 /
          str = str.slice(1)
        }
        break
      // 状态机当前处于标签名称状态
      case State.tagName:
        if (isAlpha(char)) {
          // 1. 遇到字母，由于当前处理标签名称状态，所以不需要切换状态，
          // 但需要将当前字符缓存到 chars 数组中。
          chars.push(char)
          // 2. 消费当前字符
          str = str.slice(1)
        } else if (char === '>') {
          // 1. 遇到字符 '>'，切换到初始状态
          currentState = State.initial
          // 2. 同时创建一个标签 Token，并添加到 tokens 数组中
          // 注意，此时 chars 中的字符就是标签名称
          tokens.push({
            type: 'tag',
            name: chars.join('')
          })
          // 3. chars 数组的内容已经被消费，清空它
          chars.length = 0
          // 4. 同时消费当前字符 '>'
          str = str.slice(1)
        }
        break
      // 状态机当前处于文本状态
      case State.text:
        if (isAlpha(char)) {
          // 1. 遇到字母，保持状态不变，但应该将当前字符缓存到 chars 数组中
          chars.push(char)
          // 2. 消费当前字符
          str = str.slice(1)
        } else if (char === '<') {
          // 1. 遇到字符 '<'，切换到标签开始状态
          currentState = State.tagOpen
          // 2. 从 文本状态 ---> 标签开始状态，此时应该创建文本 Token，并添加到 tokens 数组中
          // 注意，此时 chars 数组中的字符就是文本内容
          tokens.push({
            type: 'text',
            content: chars.join('')
          })
          // 3. chars 数组的内容已经被消费，清空它
          chars.length = 0
          // 4. 同时消费当前字符 '<'
          str = str.slice(1)
        }
        break
      // 状态机处于标签结束状态
      case State.tagEnd:
        if (isAlpha(char)) {
          // 1. 遇到字母，切换到结束标签名称状态
          currentState = State.tagEndName
          // 2. 将当前字符缓存到 chars 数组中
          chars.push(char)
          // 3. 消费当前字符
          str = str.slice(1)
        }
        break
      // 状态机当前牌结束标签名称状态
      case State.tagEndName:
        if (isAlpha(char)) {
          // 1. 遇到字母，不需要切换状态，但需要将当前字符缓存到 chars 数组中
          chars.push(char)
          // 2. 消费当前字符
          str = str.slice(1)
        } else if (char === '>') {
          // 1. 遇到字符 '>'，切换到初始状态
          currentState = State.initial
          // 2. 从 结束标签名称状态 ---> 初始状态，应该保存结束标签名称 Token
          // 注意，此时 chars 数组中缓存的内容就是标签名称
          tokens.push({
            type: 'tagEnd',
            name: chars.join('')
          })
          // 3. chars 数组的内容已经被消费，清空它
          chars.length = 0
          // 4. 消费当前字符
          str = str.slice(1)
        }
        break
      default:
        break
    }
  }

  // 最后，返回 tokens
  return tokens
}

function parse (str) {
  // 获取 tokens
  const tokens = tokenize(str)
  // 创建 Root 根节点
  const root = {
    type: 'Root',
    children: []
  }
  // 创建 elementStack 栈，起初只有 Root 根节点
  const elementStack = [root]

  // 开启一个 while 循环扫描 tokens，直到所有 Token 都被扫描完毕为止
  while (tokens.length) {
    // 获取当前栈顶节点作为父节点
    const parent = elementStack[elementStack.length - 1]
    // 当前扫描到的 Token
    const t = tokens[0]

    switch (t.type) {
      case 'tag':
        // 如果当前 Token 是开始标签，则创建 Element 类型的 AST 节点
        const elementNode = {
          type: 'Element',
          tag: t.name,
          children: []
        }
        // 将其添加到父节点的 children 中
        parent.children.push(elementNode)
        // 将当前节点压入栈
        elementStack.push(elementNode)
        break
      case 'text':
        // 如果当前 Token 是文本，则创建 Text 类型的 AST 节点
        const textNode = {
          type: 'Text',
          content: t.content
        }
        // 将其添加到父节点的 children 中
        parent.children.push(textNode)
        break
      case 'tagEnd':
        // 遇到结束标签，将栈顶节点弹出
        elementStack.pop()
        break
      default:
        break
    }

    // 消费已经扫描过的 token
    tokens.shift()
  }

  // 最后返回 AST
  return root
}

function traverseNode (ast, context) {
  context.currentNode = ast

  // 1. 增加退出阶段的回调函数数组
  const exitFns = []

  // context.nodeTransforms 是一个数组，其中每一个元素都是一个函数
  const transforms = context.nodeTransforms
  for (let i = 0; i < transforms.length; i++) {
    // 2. 转换函数可以返回另外一个函数，该函数即作为退出阶段的回调函数
    const onExit = transforms[i](context.currentNode, context)
    if (onExit) {
      // 将退出阶段的回调函数添加到 exitFns 数组中
      exitFns.push(onExit)
    }

    // 由于任何转换函数都可能移除当前节点，因此每个转换函数执行完毕后
    // 都应该检查当前节点是否已经被移除，如果被移除了，直接返回即可
    if (!context.currentNode) return
  }

  // 如果有子节点，则递归调用 traverseNode 函数进行遍历
  const { children } = context.currentNode
  if (children) {
    for (let i = 0; i < children.length; i++) {
      // 递归之前，将当前节点设置为父节点
      context.parent = context.currentNode
      // 设置位置索引
      context.childIndex = i
      // 递归调用时，将 context 透传
      traverseNode(children[i], context)
    }
  }

  // 在节点处理的最后阶段执行缓存到 exitFns 中的回调函数
  // 注意，这里我们要逆序执行
  let i = exitFns.length
  while (i--) {
    exitFns[i]()
  }
}

// transform 函数用来对 AST 进行转换
function transform (ast) {
  // 在 transform 函数内创建 context 对象
  const context = {
    currentNode: null, // 当前正在转换的节点
    childIndex: 0, // 当前节点在父节点的 children 中的位置索引
    parent: null, // 用来存储当前转换节点的父节点

    // 用于替换节点的函数，接收新节点作为参数
    replaceNode (node) {
      // 为了替换节点，我们需要修改 AST
      // 找到当前节点在父节点的 children 中的位置
      // 然后使用新节点替换即可
      context.parent.children[context.childIndex] = node
      // 由于当前节点已经被新节点替换掉了，因此我们需要将 currentNode 更新为新节点
      context.currentNode = node
    },

    // 用于删除当前节点
    removeNode () {
      if (context.parent) {
        // 调用数组的 splice 方法，根据当前节点的索引删除当前节点
        context.parent.children.splice(context.childIndex, 1)
        // 将 context.currentNode 置空
        context.currentNode = null
      }
    },

    // 注册 nodeTransforms 数组
    nodeTransforms: [
      tranformElement, // transformElement 函数用来转换标签节点
      tranformText // transformText 函数用来转换文本节点
    ]
  }

  // 调用 traverseNode 完成转换
  traverseNode(ast, context)
  // 打印 AST 信息
  dump(ast)
}
