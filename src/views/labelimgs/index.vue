<script setup>
defineOptions({
  name: "Labelimgs"
});
</script>

<template>
  <div />
</template>

<style scoped>


@keyframes pulse-highlight {
  0%,
  100% {
    opacity: 1;
  }

  50% {
    opacity: 0.7;
  }
}

button:disabled {
  cursor: not-allowed;
  opacity: 0.5;
}

/* 添加一些过渡效果 */
.transition-colors {
  transition: background-color 0.2s ease;
}

.transition-all {
  transition: all 0.2s ease;
}

/* 绘制模式下的鼠标样式 */
.cursor-crosshair {
  cursor: crosshair;
}

/* 绘制模式工具按钮高亮 */
.draw-mode-active {
  color: white !important;
  background-color: #10b981 !important;
}

/* 键盘快捷键样式 */
kbd {
  display: inline-block;
  min-width: 16px;
  padding: 2px 4px;
  font-family: "Courier New", monospace;
  font-size: 11px;
  font-weight: bold;
  text-align: center;
  border: 1px solid #ccc;
  border-radius: 3px;
  box-shadow: 0 1px 2px rgb(0 0 0 / 20%);
}

/* 悬停矩形动画 */
.rect-hovered {
  animation: pulse-highlight 1s ease-in-out infinite;
}

/* 按钮禁用状态 */
</style>
