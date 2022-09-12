function createRenderer (options) {
  function hydrate (vnode, container) {
    hydrateNode(container.firstChild, vnode)
  }

  function hydrateNode (node, vnode) {
    const { type } = vnode
    // 1. 让 vnode.el 引用真实 DOM
    vnode.el = node

    // 2. 检查虚拟 DOM 的类型，如果是组件，则调用 mountComponent 函数完成激活
    if (typeof type === 'object') {
      mountComponent(vnode, node.parentNode, null)
    } else if (typeof type === 'string') {
      // 3. 检查真实 DOM 的类型与虚拟 DOM 的类型是否匹配
      if (node.nodeType !== 1) {
        console.error('mismatch')
        console.error('服务端渲染的真实 DOM 节点是：', node)
        console.error('客户端渲染的虚拟 DOM 节点是：', vnode)
      } else {
        // 4. 如果是普通元素，则调用 hydrateElement 完成激活
        hydrateElement(node, vnode)
      }
    }

    // 5. 重要：hydrateNode 函数需要返回当前节点的下一个兄弟节点，以便继续进行后续的激活操作
    return node.nextSibling
  }

  function hydrateElement (el, vnode) {
    // 1. 为 DOM 元素添加事件
    if (vnode.props) {
      for (const key in vnode.props) {
        // 只有事件类型的 props 需要处理
        if (/^on/.test(key)) {
          patchProps(el, key, null, vnode.props[key])
        }
      }
    }

    // 2. 递归地激活子节点
    if (Array.isArray(vnode.children)) {
      let nextNode = el.firstChild
      const len = vnode.children.length

      for (let i = 0; i < len; i++) {
        // 激活子节点，注意，每当激活一个子节点，hydrateNode 函数会返回当前子节点的下一个兄弟节点
        // 于是可以进行后续的激活
        nextNode = hydrateNode(nextNode, vnode.children[i])
      }
    }
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
      mounted: [],
      // 只有 KeepAlive 组件的实例下会有 keepAliveCtx 属性
      keepAliveCtx: null
    }

    // 检测当前要挂载的组件是否是 KeepAlive 组件
    const isKeepAlive = vnode.type.__isKeepAlive
    if (isKeepAlive) {
      // 在 KeepAlive 组件实例上添加 keepAliveCtx 对象
      instance.keepAliveCtx = {
        // move 函数用于移动一段 vnode
        move (vnode, container, anchor) {
          // 本质上是将组件渲染的内容移动到指定容器中，即隐藏容器中
          insert(vnode.component.subTree.el, container, anchor)
        },
        createElement
      }
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

    instance.update = effect(() => {
      // 调用 render() 函数时，将其 this 设置为 state，
      // 从而 render() 函数内部可以通过 this 访问组件自身状态数据
      const subTree = render.call(renderContext, renderContext)

      // 检测组件是否已经被挂载
      if (!instance.isMounted) {
        // 在这里调用 beforeMount() 钩子
        beforeMount && beforeMount.call(renderContext)

        // 如果 vnode.el 存在，则意味着要执行激活
        if (vnode.el) {
          // 直接调用 hydrateNode 完成激活
          hydrateNode(vnode.el, subTree)
        } else {
          // 正常挂载
          patch(null, subTree, container, anchor)
        }
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

  return {
    hydrate
  }
}