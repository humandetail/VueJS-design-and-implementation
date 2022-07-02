// 用一个全局变量来存储被注册的副作用函数
let activeEffect

// effect 函数用来注册副作用函数
function effect (fn) {
  // 当调用 effect() 函数时，将副作用函数 fn() 赋值给 activeEffect
  activeEffect = fn
  // 执行副作用函数
  fn()
}

// effect(
//   // 一个匿名的副作用函数
//   () => {
//     document.querySelector('#root').textContent = obj.text
//   }
// )

// 存储副作用的“桶”
const bucket = new Set()

// 原始数据
const data = { text: 'Hello world.' }
// 对原始数据进行代理
const obj = new Proxy(data, {
  // 拦截读取操作
  get (target, key) {
    // 将 activeEffect 中存储的副作用函数加入 bucket 中
    if (activeEffect) {
      bucket.add(activeEffect)
    }
    // 返回属性值
    return target[key]
  },

  // 拦截设置操作
  set (target, key, value) {
    // 设置属性值
    target[key] = value
    // 把副作用函数从 bucket 中取出并执行
    bucket.forEach(fn => fn())
    // 返回 true 表示设置操作成功
    return true
  }
})
