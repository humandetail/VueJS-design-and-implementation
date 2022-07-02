// 用一个全局变量来存储被注册的副作用函数
let activeEffect
// 用一个 effect 栈来临时存储副作用函数
const effectStack = []

function effect (fn, options = {}) {
  const effectFn = () => {
    cleanUp(effectFn)
    
    activeEffect = effectFn
    
    // 在副作用函数执行之前，将当前的副作用函数压入栈
    effectStack.push(effectFn)
    
    // 执行副作用函数，并将其返回值交给 res
    const res = fn()
    
    // 将可能的内层嵌套中入栈的副作用函数弹出
    effectStack.pop()
    
    // 恢复之前的副作用函数
    activeEffect = effectStack.at(-1)

    // 返回 res 的结果
    return res
  }
  
  effectFn.deps = []

  // 将 options 挂载到 effectFn 上
  effectFn.options = options
  
  // 只有在非 lazy 的情况下，立即执行
  if (!options.lazy) {
    effectFn()
  }

  // 将副作用函数作为返回值返回
  return effectFn
}

// 存储副作用的“桶”
const bucket = new WeakMap()

// 原始数据
const data = { foo: 1 }
// const data = { foo: true, bar: true }
// 对原始数据进行代理
const obj = new Proxy(data, {
  // 拦截读取操作
  get (target, key) {
    track(target, key)

    // 返回属性值
    return target[key]
  },

  // 拦截设置操作
  set (target, key, value) {
    // 设置属性值
    target[key] = value
    
    trigger(target, key)

    // 返回 true 表示设置操作成功
    return true
  }
})

function track (target, key) {
  // 如果不存在副作用函数，直接返回
  if (!activeEffect) return

  // 从 bucket 中取出 depsMap，它是一个 Map 类型
  let depsMap = bucket.get(target)

  if (!depsMap) {
    bucket.set(target, (depsMap = new Map()))
  }

  // 再根据 key 从 depsMap 中取出 deps，它是一个 Set 类型
  // 里面存储着所有与当前 key 相当的副作用函数
  let deps = depsMap.get(key)

  if (!deps) {
    depsMap.set(key, (deps = new Set()))
  }

  // 最后将副作用函数存储进 deps 里面
  deps.add(activeEffect)

  // deps 就是一个与当前副作用函数存在联系的依赖集合
  // 将其添加到 activeEffect.deps 中
  activeEffect.deps.push(deps)
}

function trigger (target, key) {
  // 根据 target 从 bucket 中取出所有的 depsMap
  const depsMap = bucket.get(target)

  if (!depsMap) return true

  // 根据 key 从 depsMap 中取出所有的副作用函数
  const effects = depsMap.get(key)

  // effects && effects.forEach(fn => fn())

  // 用一个新的 Set 来完成 forEach 操作，防止添加时进入死循环
  const effectsToRun = new Set()

  effects && effects.forEach(effectFn => {
    // 如果 trigger 触发执行副作用函数与当前正在执行的副作用函数相同，则不触发
    if (effectFn !== activeEffect) {
      effectsToRun.add(effectFn)
    }
  })
  effectsToRun.forEach(effectFn => {
    // 如果该副作用函数存在调度器，则调用该调度器，并将副作用函数作为参数传递
    if (effectFn.options.scheduler) {
      effectFn.options.scheduler(effectFn)
    } else {
      // 否则直接执行副作用函数
      effectFn()
    }
  })
}

function cleanUp (effectFn) {
  effectFn.deps.forEach(deps => {
    // 将 effectFn 从依赖集合中移除
    deps.delete(effectFn)
  })

  // 最后需要重置 effectFn.deps 数组
  effectFn.deps.length = 0
}

function computed (getter) {
  // 用来缓存上一次计算的值
  let value
  // dirty 标志用来标识是否需要重新计算值
  let dirty

  const effectFn = effect(getter, {
    lazy: true,
    // 在调度器中将 dirty 设置为 true
    shceduler () {
      dirty = true
      // 当计算属性的响应式数据变化时，手动调用 trigger() 函数触发响应
      trigger(obj, 'value')
    }
  })
  
  const obj = {
    get value () {
      if (dirty) {
        value = effectFn()
        dirty = true
      }
      // 当读取 value 时，手动调用 track() 函数进行追踪
      return value
    }
  }
  
  return obj
}

function watch (source, cb, options = {}) {
  // 定义一个getter
  let getter

  if (typeof source === 'function') {
    getter = source
  } else {
    getter = () => traverse(source)
  }

  // 定义新值与旧值
  let newValue
  let oldValue

  // cleanup 用来存储用户注册的过期回调
  let cleanup
  // 定义 onInvalidate 函数
  const onInvalidate = (fn) => {
    // 将过期回调存储到 cleanup 中
    cleanup = fn
  }

  // 提取 scheduler 调度函数作为一个独立的 job 函数
  const job = () => {
    // 在 scheduler 中重新执行副作用函数，拿到新值
    newValue = effectFn()
    // 在调用回调函数 cb() 之前，先调用过期回调
    if (cleanup) {
      cleanup()
    }
    // 将旧值与新值作为回调函数的参数
    // 将 onInvalidate 作为回调函数的第三个参数，以便用户使用
    cb(newValue, oldValue, onInvalidate)
    // 回调函数执行完毕后
    // 将 newValue 的值存到 oldValue 中，下一次就能拿到正确的旧值
    oldValue = newValue
  }

  const effectFn = effect(
    // 执行 getter
    () => getter(),
    {
      lazy: true,
      scheduler: () => {
        if (options.flush === 'post') {
          // 如果 flush 是 'post'，则将调度函数放到微任务队列中执行
          Promise.resolve().then(job)
        } else {
          // 这相当于 flush 是 'sync' 的行为
          job()
        }
      }
    }
  )

  if (options.immediate) {
    // 当 immediate 为 true 时，立即执行 job，从而触发回调执行
    job()
  } else {
    // 手动调用副作用函数，拿到的就是旧值
    oldValue = effectFn()
  }
}

function traverse (value, seen = new Set()) {
  // 如果要读取的数据是一个原型类型
  // 或者已经被读取过了，那么什么都不做
  if (typeof value !== 'object' || value === null || seen.has(value)) {
    return
  }

  // 将数据加入 seen 中，代表已经读取过了，避免死循环
  seen.add(value)

  // 暂时不考虑数组等其他结构
  // 假设 value 是一个对象，那么我们可以使用 for...in 读取对象的每一个值，并递归地调用 traverse 进行处理
  for (const key in value) {
    traverse(value[key], seen)
  }

  return value
}
