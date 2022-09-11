const PatchFlags = {
  TEXT: 1,
  CLASS: 2,
  STYLE: 3
}

// 动态节点栈
const dynamicChildrenStack = []
// 当前动态节点集合
let currentDynamicChildren = null
// 用来创建一个新的动态节点集合，并将该集合压入栈中
function openBlock () {
  dynamicChildrenStack.push((currentDynamicChildren = []))
}
// 用来将通过 openBlock 创建的动态节点集合从栈中弹出
function closeBlock () {
  currentDynamicChildren = dynamicChildrenStack.pop()
}

// render () {
//   // 1. 使用 createBlock 代替 createVNode 来创建 block
//   // 2. 每当调用 createBlock 之前，先调用 openBlock
//   return (openBlock(), createBlock('div', null, [
//     createVNode('p', { class: 'foo' }, null, 1 /* patch flag */),
//     createVNode('p', { class: 'bar' }, null)
//   ]))
// }

function createBlock (tag, props, children) {
  // block 本质也是一个 vnode
  const block = createVNode(tag, props, children)
  // 将当前动态节点集合作为 block.dynamicChildren
  block.dynamicChildren = currentDynamicChildren

  // 关闭 block
  closeBlock()

  return block
}

function createVNode (tag, props, children, flags) {
  const key = props && props.key
  props && delete props.key
  
  const vnode = {
    tag,
    props,
    children,
    key,
    patchFlags: flags
  }

  if (typeof flags !== undefined && currentDynamicChildren) {
    // 动态节点，将其添加到当前动态节点集合中
    currentDynamicChildren.push(vnode)
  }

  return vnode
}

function patchElement (n1, n2) {
  const el = n2.el = n1.el
  const oldProps = n1.props
  const newProps = n2.props


  // 第一步：更新 props
  for (const key in newProps) {
    if (newProps[key] !== oldProps[key]) {
      patchProps(el, key, oldProps[key], newProps[key])
    }
  }
  for (const key in oldProps) {
    if (!key in newProps) {
      patchProps(el, key, oldProps[key], null)
    }
  }

  // 第二步：更新 children
  if (n2.dynamicChildren) {
    // 调用 patchBlockChildren 函数，这样只会更新动态节点
    patchBlockChildren(n1, n2)
  } else {
    patchChildren(n1, n2, el)
  }
}

function patchBlockChildren (n1, n2) {
  // 只更新动态节点即可
  for (let i = 0; i < n2.dynamicChildren.length; i++) {
    patchElement(n1.dynamicChildren[i], n2.dynamicChildren[i])
  }
}
