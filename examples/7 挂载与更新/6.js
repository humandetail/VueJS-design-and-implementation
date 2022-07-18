function createRenderer (options) {
  // 通过 options 取得操作 DOM 的 API
  const {
    createElement,
    insert,
    setElementText,
    patchProps
  } = options

  function render (vnode, container) {
    if (vnode) {
      // 新 vnode 存在，将其与旧 vnode 一起传递给 patch 函数，进行更新
      patch(container._vnode, vnode, container)
    } else {
      if (container._vnode) {
        unmount(container._vnode)
      }
    }

    // 把 vnode 存储到 container._vnode 下，即后续渲染中的旧 vnode
    container._vnode = vnode
  }

  function unmount (vnode) {
    // 获取 el 的父元素
    const parent = vnode.el.parentNode
    // 调用父元素的 removeChild 移除元素
    if (parent) {
      parent.removeChild(vnode.el)
    }
  }

  function patch (n1, n2, container) {
    // n1 存在，则对比 n1 和 n2 的类型
    if (n1 && n1.type !== n2.type) {
      // 如果两者类型不一致，则直接将旧 vnode 卸载
      unmount(n1)
      n1 = null
    }

    // 代码运行到这里，证明 n1 和 n2 所描述的内容相同
    const { type } = n2
    // 如果 n2.type 是字符串类型，则它描述的是普通标签元素
    if (typeof type === 'string') {
      if (!n1) {
        mountElement(n2, container)
      } else {
        patchElement(n1, n2)
      }
    } else if (typeof type === 'object') {
      // 如果 n2.type 是对象，则它描述的是组件
    } else if (type === 'xxx') {
      // 处理其他类型的 vnode
    }
  }

  function shouldSetAsProps (el, key, value) {
    // 特殊处理
    if (key === 'form' && el.tagName === 'INPUT') return false
    // 兜底
    return key in el
  }

  function mountElement (vnode, container) {
    // 创建 DOM 元素，并让 vnode.el 引用真实 DOM 元素
    const el = vnode.el = createElement(vnode.type)

    // 处理子节点，如果子节点是字符串，代表元素具有文本节点
    if (typeof vnode.children === 'string') {
      setElementText(el, vnode.children)
    } else if (Array.isArray(vnode.children)) {
      // 如果 children 是一个数组，则遍历每一个子节点，并调用 patch 函数挂载它们
      vnode.children.forEach(child => {
        patch(null, child, el)
      })
    }

    // 如果 vnode.props 存在，则处理
    if (vnode.props) {
      // 遍历 vnode.props，并将属性设置到元素上
      for (const key in vnode.props) {
        // 调用 patchProps 即可
        patchProps(el, key, null, vnode.props[key], shouldSetAsProps)
      }
    }

    // 将元素添加到容器中
    insert(el, container)
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
    patchChildren(n1, n2, el)
  }

  function patchChildren (n1, n2, container) {
    // 判断新子节点的类型是否是文本节点
    if (typeof n2.children === 'string') {
      // 旧子节点的类型有三种可能
      // 只有当旧子节点为一组子节点时，才需要逐个卸载，其他情况什么都不需要做
      if (Array.isArray(n1.children)) {
        n1.children.forEach(c => unmount(c))
      }
      // 最后将新的文本节点内容设置给容器元素
      setElementText(container, n2.children)
    } else if (Array.isArray(n2.children)) {
      // 如果新子节点的类型是一组子节点
      // 判断旧子节点是否也是一组子节点
      if (Array.isArray(n1.children)) {
        // **这里涉及到核心的 diff 算法**

        // 我们可以先用一种傻方式来处理
        // 就是将旧节点全卸载，重新挂载新的一组子节点
        n1.children.forEach(c => unmount(c))
        n2.children.forEach(c => patch(null, c, container))
      } else {
        // 此时：
        // 旧子节点要么是文本子节，要么不存在
        // 无论哪种情况，我们都只需要将容器清空，然后将新的一组子节点逐个挂载即可
        setElementText(container, '')
        n2.children.forEach(c => patch(null, c, container))
      }
    } else {
      // 代码运行到这里，说明新的子节点不存在
      // 如果旧的子节点是一组子节点，只需要逐个卸载即可
      if (Array.isArray(n1.children)) {
        n1.children.forEach(c => unmount(c))
      } else if (typeof n1.children === 'string') {
        // 旧子节点是文本节点，清空内容即可
        setElementText(container, '')
      }
      // 如果也没有旧子节点，那么什么都不需要做
    }
  }

  return {
    render
  }
}

function normalizeClass(value) {
  let res = ''
  if (typeof value === 'string') {
    res = value
  } else if (Array.isArray(value)) {
    for (let i = 0; i < value.length; i++) {
      const normalized = normalizeClass(value[i])
      if (normalized) {
        res += normalized + ' '
      }
    }
  } else if (Object.prototype.toString.call(value) === '[object Object]') {
    for (const name in value) {
      if (value[name]) {
        res += name + ' '
      }
    }
  }
  return res.trim()
}

const renderer = createRenderer({
  // 用于创建元素
  createElement(tag) {
    return document.createElement(tag)
  },
  // 用于设置元素的文本节点
  setElementText (el, text) {
    el.textContent = text
  },
  // 用于在给定的 parent 下添加指定元素
  insert (el, parent, anchor = null) {
    parent.insertBefore(el, anchor)
  },
  // 将属性设置相关的操作封装到 patchProps 函数中，并作为渲染器选项传递
  patchProps (el, key, prevValue, nextValue, shouldSetAsProps) {
    if (/^on/.test(key)) {
      const invokers = el._vei || (el._vei = {})
      let invoker = invokers[key]
      const name = key.slice(2).toLowerCase()

      if (nextValue) {
        if (!invoker) {
          // 将事件处理函数缓存到 `el._vei[key]` 下，避免覆盖
          invoker = el._vei[key] = (e) => {
            // 如果事件发生的时间 早于 事件处理函数被绑定的时间
            // 则不执行事件处理函数
            if (e.timeStamp < invoker.attached) return

            // 如果 invoker.value 是一个数组，则遍历它并逐个调用事件处理函数
            if (Array.isArray(invoker.value)) {
              invoker.value.forEach(fn => fn(e))
            } else {
              // 否则直接作用函数调用
              invoker.value(e)
            }
          }
          // 将真正的事件处理函数赋值给 invoker.value
          invoker.value = nextValue
          // 添加 invoker.attached 属性，存储事件处理函数被绑定的时间
          invoker.attached = performance.now()
          // 绑定 invoker 作为事件处理函数
          el.addEventListener(name, invoker)
        } else {
          // 如果 invoker 存在，意味着更新，只需要更新 invoker.value 的值即可
          invoker.value = nextValue
        }
      } else if (invoker) {
        // 新的事件绑定函数不存在，且之前绑定的 invoker 存在，则移除绑定
        el.removeEventListener(name, invoker)
      }
    } else if (key === 'class') {
      el.className = nextValue || ''
    } else if (shouldSetAsProps(el, key, nextValue)) {
      // 获取该 DOM Properties 的类型
      const type = typeof el[key]

      // 如果是布尔类型，并且值是空字符串，则将值矫正为 true
      if (type === 'boolean' && nextValue === '') {
        el[key] = true
      } else {
        el[key] = nextValue
      }
    } else {
      // 如果要设置的属性没有对应的 DOM Properties，则使用 setAttribute 函数设置属性
      el.setAttribute(key, nextValue)
    }
  }
})
