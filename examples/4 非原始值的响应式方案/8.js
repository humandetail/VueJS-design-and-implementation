const TriggerType = {
  ADD: 'ADD',
  SET: 'SET',
  DELETE: 'DELETE'
}

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

let ITERATE_KEY = Symbol()
const RAW = 'RAW'

const arrayInstrumentations = {}
;['includes', 'indexOf', 'lastIndexOf'].forEach(method => {
  const originMethod = Array.prototype[method]

  arrayInstrumentations[method] = function (...args) {
    // this 是代理对象，先在代理对象中查找，将结果存到 res 中
    let res = originMethod.apply(this, args)

    if (res === false) {
      // res 为 false 说明没找到
      // 通过 this[Symbol.for(RAW)] 拿到原始数组，再去其中查找并更新 res 的值
      res = originMethod.apply(this[Symbol.for(RAW)], args)
    }

    // 返回最终的结果
    return res
  }
})

// 声明一个标记变量，代表是否进行追踪。默认值为 true，即允许追踪
let shouldTrack = true
// 重写数组的 'push', 'pop', 'unshift', 'shift', 'splice' 方法
;['push', 'pop', 'unshift', 'shift', 'splice'].forEach(method => {
  const originMethod = Array.prototype[method]

  arrayInstrumentations[method] = function (...args) {
    // 在调用原始方法之前，先禁止追踪
    shouldTrack = false

    let res = originMethod.apply(this, args)

    // 在调用原始方法之后，允许追踪
    shouldTrack = true

    return res
  }
})

// 声明一个对象，将自定义的 add 方法定义到该对象下
const mutableInstrumentations = {
  add (key) {
    const target = this[Symbol.for(RAW)]
    let res

    // 先判断是否存在该值
    const hadKey = target.has(key)

    // 只有该值不存在的情况下，才需要触发响应
    if (!hadKey) {
      // 因为 target 是原始对象，所以不再需要 bind
      res = target.add(key)
  
      // 调用 trigger() 函数触发响应，并指定操作类型为 ADD
      trigger(target, key, TriggerType.ADD)
    }

    return res
  },

  delete (key) {
    const target = this[Symbol.for(RAW)]

    // 先判断是否存在该值
    const hadKey = target.has(key)
    
    const res = target.delete(key)

    // 只有该值存在的情况下，才需要触发响应
    if (hadKey) {
      // 调用 trigger() 函数触发响应，并指定操作类型为 DELETE
      trigger(target, key, TriggerType.DELETE)
    }

    return res
  },

  get (key) {
    const target = this[Symbol.for(RAW)]

    // 先判断读取的 key 是否存在
    const had = target.has(key)

    // 追踪依赖
    track(target, key)

    // 如果存在，则返回结果
    if (had) {
    	const res = target.get(key)
      // 如果值仍然是一个可代理的数据，则返回使用 reactive() 包装的响应式数据
      return typeof res === 'object' && res !== null
        ? reactive(res)
        : res
    }
  },

  set (key, value) {
    const target = this[Symbol.for(RAW)]

    const had = target.has(key)

    // 获取旧值
    const oldVal = target.get(key)
    // 如果存在 value[Symbol.for(RAW)] 则设置为 value[Symbol.for(RAW)] 的值
    // 否则说明 value 是一个原始数据，设置 value 即可
    const rawValue = value[Symbol.for(RAW)] || value
    // 设置新值
    target.set(key, rawValue)

    // 如果不存在，说明是 ADD 操作
    if (!had) {
      trigger(target, key, TriggerType.ADD)
    } else if (oldVal !== value || (oldVal === oldVal && value === value)) {
      // 如果不存在，并且值变了，则是 SET 类型的操作
      trigger(target, key, TriggerType.SET)
    }
  },

  forEach (callback, thisArg) {
    // wrap 函数用来把可以代理的值转换为响应式数据
    const wrap = val => typeof val === 'object' ? reactive(val) : val
    const target = this[Symbol.for(RAW)]
    // 与 ITERATE_KEY 建立响应联系
    track(target, ITERATE_KEY)
    // 通过原始数据对象调用 forEach 方法，并把 callback 传递过去
    target.forEach((v, k) => {
      // 手动调用 callback，用 wrap 函数包裹 value 和 key 后再传递给 callback
      // 这样就实现了深响应
      // 通过 call 调用，并传递 thisArg
      callback.call(thisArg, wrap(v), wrap(k), this)
    })
  },

  [Symbol.iterator]: iterationMethod,

  entries: iterationMethod,

  values: valuesIterationMethod,

  keys: keysIterationMethod
}

// 抽离为独立函数，方便复用
function iterationMethod () {
  const target = this[Symbol.for(RAW)]

  // 获取原始迭代器方法
  const itr = target[Symbol.iterator]()

  const wrap = val => typeof val === 'object' && val !== null
    ? reactive(val)
    : val

  // 调用 track() 函数建立响应联系
  track(target, ITERATE_KEY)

  // 返回自定义的迭代器
  return {
    next () {
      const { value, done } = itr.next()

      return {
        // 如果 value 不是 undefined 则对其进行包裹
        value: value ? [wrap(value[0]), wrap(value[1])] : value,
        done
      }
    },

    // 实现可迭代协议
    [Symbol.iterator] () {
      return this
    }
  }
}

function valuesIterationMethod () {
  const target = this[Symbol.for(RAW)]

  // 通过 target.values 获取原始迭代器方法
  const itr = target.values()

  const wrap = val => typeof val === 'object' && val !== null
    ? reactive(val)
    : val

  // 调用 track() 函数建立响应联系
  track(target, ITERATE_KEY)

  // 返回自定义的迭代器
  return {
    next () {
      const { value, done } = itr.next()

      return {
        // value 是值，而非键值对，所以只需要包裹 value 即可
        value: wrap(value),
        done
      }
    },

    // 实现可迭代协议
    [Symbol.iterator] () {
      return this
    }
  }
}

const MAP_KEY_ITERATE_KEY = Symbol()

function keysIterationMethod () {
  const target = this[Symbol.for(RAW)]

  // 通过 target.keys 获取原始迭代器方法
  const itr = target.keys()

  const wrap = val => typeof val === 'object' && val !== null
    ? reactive(val)
    : val

  // 调用 track() 函数建立副作用函数与 MAP_KEY_ITERATE_KEY 的响应联系
  track(target, MAP_KEY_ITERATE_KEY)

  // 返回自定义的迭代器
  return {
    next () {
      const { value, done } = itr.next()

      return {
        // value 是值，而非键值对，所以只需要包裹 value 即可
        value: wrap(value),
        done
      }
    },

    // 实现可迭代协议
    [Symbol.iterator] () {
      return this
    }
  }
}

// 定义一个 Set 集合，存储所有集合类型字符串
// 用于判断 target 的类型
const COLLECTION_TYPE = new Set([
  '[object Map]',
  '[object Set]',
  '[object WeakMap]',
  '[object WeakSet]'
])
// 封装 createReactive() 函数，多接收一个参数 isShallow，代表是否为浅响应，默认为 false
// 增加第三个参数，isReadonly 代表是否为只读，默认为 false
function createReactive (obj, isShallow = false, isReadonly = false) {
  return new Proxy(obj, {
    // 拦截读取操作
    get (target, key, receiver) {
      // 集合类型有不同的处理方案
      if (COLLECTION_TYPE.has(Object.prototype.toString.call(target))) {
        // 如果读取的是 Symbol.for(RAW) 属性，则返回原始数据对象 target
        if (key === Symbol.for(RAW)) {
          return target
        }

        if (key === 'size') {
          // 调用 track() 函数进行依赖追踪
          track(target, ITERATE_KEY)
          // 如果读取的是 size 属性，
          // 指定 receiver 为原始对象 target
          return Reflect.get(target, key, target)
        }

        // 返回定义在 mutableInstrumentations 对象下的方法
        return mutableInstrumentations[key]
      }
      // 代理对象可以通过 Symbol.for(RAW) 属性访问原始数据
      if (key === Symbol.for(RAW)) {
        return target
      }

      // 如果操作的目标对象是数组，并且 key 存在于 arrayInstrumentations 上，
      // 那么返回定义在 arrayInstrumentations 上的值
      if (Array.isArray(target) && arrayInstrumentations.hasOwnProperty(key)) {
        return Reflect.get(arrayInstrumentations, key, receiver)
      }

      // 非只读的时候才需要建立响应联系
      // 如果 key 的类型是 symbol，则不进行追踪
      if (!isReadonly && typeof key !== 'symbol') {
        track(target, key)
      }
  
      // 得到原始值结果
      const res = Reflect.get(target, key, receiver)

      // 如果是浅响应，直接返回原始值
      if (isShallow) {
        return res
      }

      if (typeof res === 'object' && res !== null) {
        // 如果数据是只读，则调用 readonly 对值进行包装
        return isReadonly
          ? readonly(res)
          : reactive(res)
      }

      return res
    },
  
    // 拦截设置操作
    set (target, key, newVal, receiver) {
      // 如果是只读的，则打印警告信息
      if (isReadonly) {
        console.warn(`属性 ${key} 是只读的`)
        return true
      }

      // 先获取旧值
      const oldVal = target[key]

      // 如果属性不存在，则说明是在新增属性
      // 否则是修改属性
      const type = Array.isArray(target)
        // 如果代理目标是数组，则检测被设置的索引值是否小于数组长度，
        // 如果是，则视作 SET 操作，否则是 ADD 操作
        ? Number(key) < target.length ? TriggerType.SET : TriggerType.ADD
        : Object.prototype.hasOwnProperty.call(target, key) ? TriggerType.SET : TriggerType.ADD

      // 设置属性值
      const res = Reflect.set(target, key, newVal, receiver)

      // target === receiver[Symbol.for(RAW)] 说明 receiver 就是 target 的代理对象
      if (target === receiver[Symbol.for(RAW)]) {
        // 比较新值与旧值，只有当不全等的时候
        // 并且它们都不是 NaN 时才触发响应
        if (
          oldVal !== newVal &&
          (
            oldVal === oldVal ||
            newVal === newVal
          )
        ) {
          // 增加第四个参数，即触发响应的新值
          trigger(target, key, type, newVal)
        }
      }
  
      return res
    },

    ownKeys (target) {
      // 如果操作目标 target 是数组，则使用 length 属性作为 key 并建立响应联系
      track(target, Array.isArray(target) ? 'length' : ITERATE_KEY)
      return Reflect.ownKeys(target)
    },

    deleteProperty (target, key) {
      // 如果是只读的，则打印警告信息
      if (isReadonly) {
        console.warn(`属性 ${key} 是只读的`)
        return true
      }

      // 检查被操作的属性是否是对象自己的属性
      const hadKey = Object.prototype.hasOwnProperty.call(target, key)
      
      const res = Reflect.deleteProperty(target, key)
      
      if (res && hadKey) {
        // 只有当被删除的属性是对象自己的属性并且成功删除时，才触发更新
        trigger(target, key, 'DELETE')
      }
      
      return res
    },

    // 拦截函数调用
    apply (target, thisArg, argsList) {
      Reflect.apply(target, thisArg, argsList)
    }
  })
}

// 定义一个 Map 实例，用来缓存原始对象到代理对象的映射
const reactiveMap = new Map()

function reactive (obj) {
  // 先通过原始对象 obj 寻找之前创建的代理对象
  const existionProxy = reactiveMap.get(obj)
  // 如果已经代理过的对象，直接返回已有的代理对象
  if (existionProxy) {
    return existionProxy
  }

  // 否则，创建新的代理对象
  const proxy = createReactive(obj)
  // 并把新的代理对象存储到 Map 中，从而避免重复创建
  reactiveMap.set(obj, proxy)

  return proxy
}

function shallowReactive (obj) {
  return createReactive(obj, true)
}

function readonly (obj) {
  return createReactive(obj, false, true /* 只读 */)
}

function shallowReadonly (obj) {
  return createReactive(obj, true /* shallow */, true /* 只读 */)
}

function track (target, key) {
  // 当禁止追踪时，直接返回
  if (!activeEffect || !shouldTrack) return

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

function trigger (target, key, type, newVal) {
  // 根据 target 从 bucket 中取出所有的 depsMap
  const depsMap = bucket.get(target)

  if (!depsMap) return true

  // 根据 key 从 depsMap 中取出所有的副作用函数
  const effects = depsMap.get(key)
  // 根据 ITERATE_KEY 从 depsMap 中取出所有的副作用函数
  const iterateEffects = depsMap.get(ITERATE_KEY)

  // 用一个新的 Set 来完成 forEach 操作，防止添加时进入死循环
  const effectsToRun = new Set()

  effects && effects.forEach(effectFn => {
    // 如果 trigger 触发执行副作用函数与当前正在执行的副作用函数相同，则不触发
    if (effectFn !== activeEffect) {
      effectsToRun.add(effectFn)
    }
  })

  // 只有当操作类型为 'ADD' 或 'DELETE' 时，才触发与 ITERATE_KEY 相关联的副作用函数重新执行
  if (
    type === TriggerType.ADD ||
    type === TriggerType.DELETE ||
    // 如果操作类型是 SET，并且数据类型是 Map
    // 也应该触发那些与 ITERATE_KEY 相联系的副作用函数重新执行
    (
      type === TriggerType.SET &&
      Object.prototype.toString.call(target) === '[object Map]'
    )
  ) {
    iterateEffects && iterateEffects.forEach(effectFn => {
      // 如果 trigger 触发执行副作用函数与当前正在执行的副作用函数相同，则不触发
      if (effectFn !== activeEffect) {
        effectsToRun.add(effectFn)
      }
    })
  }

  // 操作类型为 ADD 或 DELETE
  // 则是 Map 类型的数据
  if (
    (type === TriggerType.ADD || type === TriggerType.DELETE) &&
    Object.prototype.toString.call(target) === '[object Map]'
  ) {
    // 取出那些与 MAP_KEY_ITERATE_KEY 相关联的副作用函数并执行
    const iterateEffects = depsMap.get(MAP_KEY_ITERATE_KEY)
    iterateEffects && iterateEffects.forEach(effectFn => {
      // 如果 trigger 触发执行副作用函数与当前正在执行的副作用函数相同，则不触发
      if (effectFn !== activeEffect) {
        effectsToRun.add(effectFn)
      }
    })
  }

  // 当操作类型为 ADD 且目标对象是数组时，
  // 应取出并执行与 length 相关联的副作用函数
  if (type === TriggerType.ADD && Array.isArray(target)) {
    const lengthEffects = depsMap.get('length')
    lengthEffects && lengthEffects.forEach(effectFn => {
      if (effectFn !== activeEffect) {
        effectsToRun.add(effectFn)
      }
    })
  }

  // 如果操作目标是数组，并且修改了 length 属性
  if (Array.isArray(target) && key === 'length') {
    // 对于索引大于或等于新的 length 值的元素，
    // 需要把所有相关联的副作用函数取出并添加到 effectsToRun 中待执行
    depsMap.forEach((effects, key) => {
      if (key >= newVal) {
        effects.forEach(effectFn => {
          if (effectFn !== activeEffect) {
            effectsToRun.add(effectFn)
          }
        })
      }
    })
  }

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
  // 如果要读取的数据是一个原始类型
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
