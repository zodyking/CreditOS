<script setup lang="ts">
const { init } = useTheme()
onMounted(init)
useHead({
  titleTemplate: t => (t ? `${t} · CreditOS` : 'CreditOS'),
})
</script>

<template>
  <div>
    <NuxtLayout>
      <NuxtPage />
    </NuxtLayout>
    <ToastHost />
  </div>
</template>
