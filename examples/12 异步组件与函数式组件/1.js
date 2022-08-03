const VNODE_TYPES = {
  Text: Symbol(),
  Comment: Symbol(),
  Fragment: Symbol()
}


// 全局变量，存储当前存在被初始化的实例
let currentInstance = null

function setCurrentInstance (instance) {
  currentInstance = instance
}

function onMounted (fn) {
  if (currentInstance) {
    // 将生命周期函数添加到 instance.mounted 数组中
    currentInstance.mounted.push(fn)
  } else {
    console.error('onMounted 函数只能在 setup 中调用')
  }
}


// 任务缓存队列，用一个 Set 数据结构来表示，这样就可以自动对任务进行去重
const queue = new Set()
// 标识，代表是否正在刷新任务队列
let isFlushing = false
const p = Promise.resolve()

// 调度器的主要函数，用来将一个任务添加到缓冲队列中，并开始刷新队列
function queueJob (job) {
  // 将任务加到队列中
  queue.add(job)

  // 如果还没有开始刷新队列，则刷新
  if (!isFlushing) {
    // 将标识设置为 true 以避免重复刷新
    isFlushing = true

    // 在微任务中刷新缓冲队列
    p.then(() => {
      try {
        // 执行任务
        queue.forEach(job => job())
      } finally {
        // 重置状态
        isFlushing = false
        queue.length = 0
      }
    })
  }
}

function getSequence (arr) {
  const p = arr.slice(0)
  const len = arr.length

  const result = [0]

  let i, j, u, v, call

  for (i = 0; i < len; i++) {
    const arrI = arr[i]
    if (arrI !== 0) {
      j = result[result.length - 1]
      if (arr[j] < arrI) {
        p[i] = j
        result.push(i)
        continue
      }
      u = 0
      v = result.length - 1

      while (u < v) {
        c = ((u + v) / 2) | 0
        if (arr[result[c]] < arrI) {
          u = c + 1
        } else {
          v = c
        }
      }
      if (arrI < arr[result[u]]) {
        if (u > 0) {
          p[i] = result[u - 1]
        }
        result[u] = i
      }
    }
  }
  u = result.length
  v = result[u - 1]
  while (u-- > 0) {
    result[u] = v
    v = p[v]
  }
  return result
}

function resolveProps (options, propsData) {
  const props = {}
  const attrs = {}

  for (const key in propsData) {
    // 无论是显式声明，还是以 on 开头的 prop，都将其添加到 props 数据中
    if (key in options || key.startsWith('on')) {
      props[key] = propsData[key]
    } else {
      attrs[key] = propsData[key]
    }
  }

  return [props, attrs]
}

function hasPropsChanged (prevProps, nextProps) {
  const nextKeys = Object.keys(nextProps)
  // 如果新旧 props 的数量变了，则说明有变化
  if (nextKeys.length !== Object.keys(prevProps).length) {
    return true
  }

  for (let i = 0; i < nextKeys.length; i++) {
    const key = nextKeys[i]
    // 只有不相等的 props，则说明有变化
    if (nextProps[key] !== prevProps[key]) return true
  }

  return false
}

function createRenderer (options) {
  // 通过 options 取得操作 DOM 的 API
  const {
    createElement,
    insert,
    setElementText,
    patchProps,
    createText,
    setText,
    createComment,
    setComment
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
    if (vnode.type === VNODE_TYPES.Fragment) {
      vnode.children.forEach(c => unmount(c))
      return
    } else if (typeof vnode.type === 'object') {
      // 对于组件的卸载，本质上是要卸载组件所渲染的内容，即 subTree
      unmount(vnode.component.subTree)
      return
    }

    // 获取 el 的父元素
    const parent = vnode.el.parentNode
    // 调用父元素的 removeChild 移除元素
    if (parent) {
      parent.removeChild(vnode.el)
    }
  }

  function patch (n1, n2, container, anchor) {
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
        // 挂载时将锚点元素作为第三个参数传递给 mountElement 函数
        mountElement(n2, container, anchor)
      } else {
        patchElement(n1, n2)
      }
    } else if (typeof type === 'object' || typeof type === 'function') {
      // 如果 n2.type 是对象，则它描述的是组件
      if (!n1) {
        // 挂载组件
        mountComponent(n2, container, anchor)
      } else {
        // 更新组件
        patchComponent(n1, n2, anchor)
      }
    } else if (type === VNODE_TYPES.Text) {
      // 处理文本节点
      if (!n1) {
        // 如果没有旧节点，则进行挂载
        const el = n2.el = createText(n2.children)
        // 将文本节点插入到容器中
        insert(el, container)
      } else {
        // 如果旧 vnode 存在，只需要使用新文本节点的内容替换更新旧文本节点即可
        const el = n2.el = n1.el
        if (n2.children !== n1.children) {
          setText(el, n2.children)
        }
      }
    } else if (type === VNODE_TYPES.Comment) {
      if (!n1) {
        const el = n2.el = createComment(n2.children)
        insert(el, container)
      } else {
        const el = n2.el = n1.el
        if (n2.children !== n1.children) {
          setComment(el, n2.children)
        }
      }
    } else if (type === VNODE_TYPES.Fragment) {
      // 处理 Fragment 类型的 vnode
      if (!n1) {
        n2.children.forEach(child => patch(null, child, container))
      } else {
        // 如果旧 vnode 存在，则只需要更新 Fragment 的 children 即可
        patchChildren(n1, n2, container)
      }
    }
  }

  function shouldSetAsProps (el, key, value) {
    // 特殊处理
    if (key === 'form' && el.tagName === 'INPUT') return false
    // 兜底
    return key in el
  }

  function mountElement (vnode, container, anchor) {
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
    insert(el, container, anchor)
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

  function mountComponent (vnode, container, anchor) {
    // 用于检测是否是函数式组件
    const isFunctional = typeof vnode.type === 'function'

    let componentOptions = vnode.type

    if (isFunctional) {
      // 如果是函数式组件，则将 vnode.type 作为渲染函数
      // 将 vnode.type.props 作为 props 选项定义即可
      componentOptions = {
        render: vnode.type,
        props: vnode.type.props
      }
    }

    const {
      data,
      beforeCreate,
      created,
      beforeMount,
      mounted,
      beforeUpdate,
      updated,
      props: propsOption,
      setup // 取出 setup() 函数
    } = componentOptions

    let { render } = componentOptions

    // 在这里调用 beforeCreate() 钩子
    beforeCreate && beforeCreate()

    // 调用 data() 函数得到原始数组，并调用 reactive() 函数将其包装成响应式数组
    const state = data ? reactive(data()) : null
    // 调用 resolveProps() 函数解析出最终的 props 数据与 attrs 数据
    const [props, attrs] = resolveProps(propsOption, vnode.props)

    // 直接使用编译好的 vnode.children 对象作为 slots 对象即可
    const slots = vnode.children || {}

    // 定义组件实例，一个组件实例本质上就是一个对象，它包含与组件有关的状态信息
    const instance = {
      // 组件自身的状态数据，即 data
      state,
      // 将 props 数据包装为浅响应并定义到组件实例上
      props: shallowReactive(props),
      // 一个布尔值，表示组件是否已经被挂载
      isMounted: false,
      // 组件所渲染的内容，即子树 subTree
      subTree: null,
      // 将插槽添加到组件实例上
      slots,
      // 在组件实例中添加 mounted 数组，用来存储通过 onMounted() 函数注册的生命周期钩子函数
      mounted: []
    }

    // 定义 emit() 函数
    function emit (event, ...payload) {
      // 根据约定对事件名称进行处理，例如 change --> onChange
      // event[0] => 'change'[0] => 'c'
      const eventName = `on${event[0].toUpperCase() + event.slice(1)}`
      // 根据处理后的事件名称去 props 中寻找对应的事件处理函数
      const handler = instance.props[eventName]
      if (handler) {
        handler(...payload)
      } else {
        console.error('事件不存在')
      }
    }

    // setupContext
    const setupContext = { attrs, emit, slots }

    // 在调用 setup() 函数之前，设置当前组件实例
    setCurrentInstance(instance)

    // 调用 setup() 函数，将只读的 props 作为第一个参数传递，避免用户意外地修改 props 的值，
    // 将 setupContext 作为第二个参数传递
    const setupResult = setup && setup(shallowReadonly(instance.props), setupContext)

    // 在调用 setup() 函数之后，重置当前组件实例
    setCurrentInstance(null)

    // setupState 用来存储由 setup() 返回的数据
    let setupState = null

    if (typeof setupResult === 'function') {
      // 报告冲突
      if (render) console.error('setup 函数返回渲染函数，render 选项将被忽略')
      // 将 setupResult 作为渲染函数
      render = setupResult
    } else {
      // 如果返回的不是函数，则作为数据状态赋值给 setupState
      setupState = setupResult
    }

    // 将组件实例设置到 vnode 上，用于后续更新
    vnode.component = instance

    // 创建渲染上下文对象，本质上是组件实例的代理
    const renderContext = new Proxy(instance, {
      get (t, k, r) {
        const { state, props, slots } = t

        // 当 k 值为 $slots 时，直接返回 slots
        if (k === '$slots') return slots

        // 先尝试读取自身状态数据
        if (state && k in state) {
          return state[k]
        } else if (k in props) { // 如果组件自身没有该数据，则尝试从 props 中读取
          return props[k]
        } else if (setupState && k in setupState) {
          // 渲染上下文需要增加对 setupState 的支持
          return setupState[k]
        } else {
          console.error('不存在')
        }
      },

      set (t, k, v, r) {
        const { state, props } = t
        if (state && k in state) {
          state[k] = v
        } else if (k in props) {
          props[k] = v
        } else if (k in setupState) {
          // 渲染上下文需要增加对 setupState 的支持
          setupState[k] = v
        } else {
          console.error('不存在')
        }
      }
    })

    // 在这里调用 created() 钩子
    // 生命周期函数调用时需要绑定渲染上下文
    created && created.call(renderContext)

    effect(() => {
      // 调用 render() 函数时，将其 this 设置为 state，
      // 从而 render() 函数内部可以通过 this 访问组件自身状态数据
      const subTree = render.call(renderContext, state)

      // 检测组件是否已经被挂载
      if (!instance.isMounted) {
        // 在这里调用 beforeMount() 钩子
        beforeMount && beforeMount.call(renderContext)

        // 初次挂载，调用 patch() 函数，第一个参数传递 null
        patch(null, subTree, container, anchor)
        // 重点：将组件实例上的 isMounted 标记为 true，这样当更新发生时就不会再次进行挂载操作
        // 而是执行更新操作
        instance.isMounted = true

        // 在这里调用 mounted() 钩子
        mounted && mounted.call(renderContext)
        // 遍历 instance.mounted 数组，并逐个执行即可
        instance.mounted && instance.mounted.forEach(hook => hook.call(renderContext))
      } else {
        // 在这里调用 beforeUpdate() 钩子
        beforeUpdate && beforeUpdate.call(renderContext)

        // 当 isMounted 为 true 时，说明组件已经被挂载了，只需要完成自更新即可，
        // 所以在调用 patch() 函数时，第一个参数为组件上一次渲染的子树，
        // 意思是：使用新的子树与上一次渲染的子树进行打补丁操作
        patch(vnode.subTree, subTree, container, anchor)

        // 在这里调用 updated() 钩子
        updated && updated.call(renderContext)
      }

      // 更新组件实例的子树
      instance.subTree = subTree
    }, {
      // 指定该副作用函数的调度器为 queueJob 即可
      scheduler: queueJob
    })
  }

  function patchComponent (n1, n2, container) {
    // 获取组件实例，即 n1.component，同时让新的组件虚拟节点也指向组件实例
    const instance = (n2.component = n1.component)
    // 获取当前的 props 数据
    const { props } = instance
    // 调用 hasPropsChanged() 检测子组件传递的 props 是否发生变化
    if (hasPropsChanged(n1.props, n2.props)) {
      // 调用 resolveProps 函数重新获取 props
      const [nextProps] = resolveProps(n2.type.props, n2.props)
      // 更新 props
      for (const k in nextProps) {
        props[k] = nextProps[k]
      }
      // 删除不存在的 props
      for (const k in props) {
        if (!k in nextProps) delete props[k]
      }
    }
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
        // 封装 patchKeyedChildren 函数处理两组子节点
        patchKeyedChildren(n1, n2, container)
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

  function patchKeyedChildren (n1, n2, container) {
    const newChildren = n2.children
    const oldChildren = n1.children

    // 处理相同的前置节点
    // 索引 j 指向新旧两组子节点的开头
    let j = 0
    let oldVNode = oldChildren[j]
    let newVNode = newChildren[j]
    // while 循环向后遍历，直到遇到不同 key 值的节点为止
    while (oldVNode.key === newVNode.key) {
      // 调用 patch() 函数进行更新
      patch(oldVNode, newVNode, container)
      // 更新索引，让其递增
      j++
      oldVNode = oldChildren[j]
      newVNode = newChildren[j]
    }

    // 处理相同的后置节点
    // 索引 oldEnd 指向旧的一组子节点的最后一个节点
    let oldEnd = oldChildren.length - 1
    // 索引 newEnd 指向新的一组子节点的最后一个节点
    let newEnd = newChildren.length - 1

    oldVNode = oldChildren[oldEnd]
    newVNode = newChildren[newEnd]

    // while 循环从后向前遍历，直到遇到不同 key 值的节点
    while (oldVNode.key === newVNode.key) {
      // 调用 patch() 函数进行更新
      patch(oldVNode, newVNode, container)
      // 递减 oldEnd 和 newEnd
      oldEnd--
      newEnd--
      oldVNode = oldChildren[oldEnd]
      newVNode = newChildren[newEnd]
    }

    // 预处理完毕后，如果满足以下条件，则说明从 j ---> newEnd 之间的节点应作为新节点挂载
    if (j > oldEnd && j <= newEnd) {
      // 锚点的索引
      const anchorIndex = newEnd + 1
      // 锚点元素
      const anchor = anchorIndex < newChildren.length
        ? newChildren[anchorIndex].el
        : null

      // 采用 while 循环，调用 patch 函数逐个挂载新增节点
      while (j <= newEnd) {
        patch(null, newChildren[j++], container, anchor)
      }
    } else if (j > newEnd && j <= oldEnd) {
      // j ---> oldEnd 之间的节点都应该被卸载
      unmount(oldChildren[j++])
    } else {
      // 处理非理想情况
      // 构造 source 数组
      // 新的一组子节点中剩余未处理的节点的数量
      const count = newEnd - j + 1
      const source = new Array(count)
      source.fill(-1)

      // oldStart 和 newStart 分别为起始索引，即 j
      const oldStart = j
      const newStart = j

      // moved 代表是否需要移动节点
      let moved = false
      // pos 代表遍历旧的一组子节点的过程中遇到的最大索引值
      let pos = 0

      // 构建索引表
      const keyIndex = {}
      for (let i = newStart; i <= newEnd; i++) {
        keyIndex[newChildren[i].key] = i
      }

      // patched 代表更新过的节点数量
      let patched = 0

      // 遍历旧的一组子节点中剩余未处理的节点
      for (let i = oldStart; i <= oldEnd; i++) {
        oldVNode = oldChildren[i]

        if (patched <= count) {
          // 通过索引表快速找到新的一组子节点中具有相同 key 值的节点位置
          const k = keyIndex[oldVNode.key]
  
          if (typeof k !== 'undefined') {
            newVNode = newChildren[k]
            // 调用 patch() 函数完成更新
            patch(oldVNode, newVNode, container)
  
            // 每更新一个节点，都将 patched 的值 + 1
            patched++
  
            // 填充 source 数组
            source[k - newStart] = i
  
            // 判断节点是否需要移动
            if (k < pos) {
              moved = true
            } else {
              pos = k
            }
          } else {
            // 没找到就卸载
            unmount(oldVNode)
          }
        } else {
          // 如果更新过的节点数量大于需要更新的节点数量，则卸载多作的节点
          unmount(oldVNode)
        }
      }

      if (moved) {
        const seq = getSequence(source)

        // s 指向最长递增子序列的最后一个元素
        let s = seq.length - 1
        // i 指向新的一组子节点的最后一个元素
        let i = count - 1

        // for 循环使 i 递减
        for (i; i >= 0; i--) {
          if (source[i] === -1) {
            // 说明索引为 i 的节点是全新的节点，应该将其挂载
            // 该节点在新 children 中的真实位置索引
            pos = i + newStart
            newVNode = newChildren[pos]

            // 该节点的下一个节点的索引
            const nextPos = pos + 1
            // 锚点
            const anchor = nextPos < newChildren.length
              ? newChildren[nextPos].el
              : null

            // 挂载
            patch(null, newVNode, container, anchor)
          } else if (i !== seq[s]) {
            // 如果节点的索引 i 不等于 seq[s] 的值，说明该节点需要移动
            // 该节点在新 children 中的真实位置索引
            pos = i + newStart
            newVNode = newChildren[pos]

            // 该节点的下一个节点的索引
            const nextPos = pos + 1
            // 锚点
            const anchor = nextPos < newChildren.length
              ? newChildren[nextPos].el
              : null

            // 移动
            insert(newVNode.el, container, anchor)
          } else {
            // 当 i === seq[s] 时，说明该位置的节点不需要移动
            // 只需要让 s 指向下一个位置
            s--
          }
        }
      }
    }
  }

  // 用于定义一个异步组件
  function defineAsyncComponent (options) {
    // options 可以是加载器，也可以是配置项
    if (typeof options === 'function') {
      // 如果 options 是加载器，则将其格式化为配置项形式
      options = {
        loader: options
      }
    }

    const { loader } = options

    // 一个用于存储异步加载的组件
    let InnerComp = null

    // 记录重试次数
    let retries = 0

    // 封装 load 函数用来加载异步组件
    function load () {
      return loader()
        // 捕获加载器的错误
        .catch(err => {
          // 如果用户指定了 onError 回调，则将控制权交给用户
          if (options.onError) {
            return new Promise((resolve, reject) => {
              // 重试
              const retry = () => {
                resolve(load())
                retries++
              }
              // 失败
              const fail = () => reject(err)

              // 作为 onError 回调函数的参数，让用户来决定下一步怎么做
              options.onError(retry, fail, retries)
            })
          } else {
            throw err
          }
        })
    }

    // 返回一个包装组件
    return {
      name: 'AsyncComponentWrapper',
      setup () {
        // 异步组件是否加载成功
        const loaded = ref(false)
        // 定义 error，当错误发生时，用户存储错误对象
        const error = shallowRef(null)
        // 定义 loading 表示是否正在加载
        const loading = ref(false)

        let loadingTimer = null

        if (options.delay) {
          // 如果有设置 delay，则开启定时器
          loadingTimer = setTimeout(() => {
            loading.value = true
          }, options.delay)
        } else {
          loading.value = true
        }

        // 调用 load 函数加载组件
        load().then(c => {
          InnerComp = c
          loader.value = true
        })
        // 添加 catch 语句来捕获加载过程中的错误
        .catch(err => error.value = err)
        .finally(() => {
          loading.value = false
          // 加载完毕后，无论成功与否都需要清除延迟定时器
          clearTimeout(loadingTimer)
        })

        let timer = null

        if (options.timeout) {
          // 如果指定了超时时长，则开启一个定时器计时
          timer = setTimeout(() => {
            // 超时后创建一个错误对象，并复制给 error.value
            error.value = new Error(`Async component timed out after ${options.timeout}ms.`)
          }, options.timeout)
        }
        // 包装组件被卸载组清除定时器
        onUnmounted(() => clearTimeout(timer))

        // 占位内容
        const placeholder = { type: VNODE_TYPES.Text, children: '' }

        return () => {
          if (loaded.value) {
            // 如果组件异步加载成功，则渲染被加载的组件
            return { type: InnerComp }
          } else if (error.value && options.errorComponent) {
            // 只有当错误存在且用户配置了 errorComponent 时才展示 Error 组件，同时将 error 作为 props 传递
            return {
              type: options.errorComponent,
              props: {
                error: error.value
              }
            }
          } else if (loading.value && options.loadingComponent) {
            // 如果异步组件正在加载，且用户配置了 loadingComponent 时才展示 Loading 组件
            return { type: options.loadingComponent }
          }

          return placeholder
        }
      }
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
  },
  // 创建文本节点
  createText (text) {
    return document.createTextNode(text)
  },
  // 设置文本节点的内容
  setText(el, text) {
    el.nodeValue = text
  },
  // 创建注释节点
  createComment (comment) {
    return document.createComment(comment)
  },
  // 设置注释节点的内容
  setComment (el, text) {
    el.nodeValue = text
  }
})
