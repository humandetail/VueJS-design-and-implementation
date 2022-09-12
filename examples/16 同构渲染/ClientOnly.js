import { ref, onMounted, defineComponent } from 'vue'

export const ClientOnly = defineComponent({
  setup (_, { slots }) {
    // 标记变量，仅在客户端渲染时为 true
    const show = ref(false)
    // onMounted 钩子只会在客户端执行
    onMounted(() => {
      show.value = true
    })

    // 在服务端什么都不渲染，在客户端才会渲染其插槽中的内容
    return () => (
      show.value && slots.default
        ? slots.default()
        : null
    )
  }
})
