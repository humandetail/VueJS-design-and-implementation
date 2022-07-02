// 用一个全局变量来存储被注册的副作用函数
let activeEffect

// effect 函数用来注册副作用函数
function effect (fn) {
  // 当调用 effect() 函数时，将副作用函数 fn() 赋值给 activeEffect
  activeEffect = fn
  // 执行副作用函数
  fn()
}


// // 存储副作用的“桶”
// const bucket = new WeakMap()

// // 原始数据
// const data = { text: 'Hello world.' }
// // 对原始数据进行代理
// const obj = new Proxy(data, {
//   // 拦截读取操作
//   get (target, key) {
//     // 如果不存在副作用函数，直接返回
//     if (!activeEffect) {
//       return target[key]
//     }

//     // 从 bucket 中取出 depsMap，它是一个 Map 类型
//     let depsMap = bucket.get(target)

//     if (!depsMap) {
//       bucket.set(target, (depsMap = new Map()))
//     }

//     // 再根据 key 从 depsMap 中取出 deps，它是一个 Set 类型
//     // 里面存储着所有与当前 key 相当的副作用函数
//     let deps = depsMap.get(key)

//     if (!deps) {
//       depsMap.set(key, (deps = new Set()))
//     }

//     // 最后将副作用函数存储进 deps 里面
//     deps.add(activeEffect)

//     // 返回属性值
//     return target[key]
//   },

//   // 拦截设置操作
//   set (target, key, value) {
//     // 设置属性值
//     target[key] = value
//     // 根据 target 从 bucket 中取出所有的 depsMap
//     const depsMap = bucket.get(target)

//     if (!depsMap) return true

//     // 根据 key 从 depsMap 中取出所有的副作用函数
//     const effects = depsMap.get(key)

//     effects && effects.forEach(fn => fn())
//     // 返回 true 表示设置操作成功
//     return true
//   }
// })


// 存储副作用的“桶”
const bucket = new WeakMap()

// 原始数据
const data = { text: 'Hello world.' }
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
}

function trigger (target, key) {
  // 根据 target 从 bucket 中取出所有的 depsMap
  const depsMap = bucket.get(target)

  if (!depsMap) return true

  // 根据 key 从 depsMap 中取出所有的副作用函数
  const effects = depsMap.get(key)

  effects && effects.forEach(fn => fn())
}
