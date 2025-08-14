<script setup>
defineOptions({
  name: "Labelimgs"
});

</script>

<template>
  <div></div>
</template>

<style scoped>
/* 按钮禁用状态 */
button:disabled {
  opacity: 0.5;
  cursor: not-allowed;
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
  background-color: #10b981 !important;
  color: white !important;
}

/* 键盘快捷键样式 */
kbd {
  font-family: 'Courier New', monospace;
  font-weight: bold;
  font-size: 11px;
  padding: 2px 4px;
  border-radius: 3px;
  border: 1px solid #ccc;
  box-shadow: 0 1px 2px rgba(0,0,0,0.2);
  display: inline-block;
  min-width: 16px;
  text-align: center;
}

/* 悬停矩形动画 */
.rect-hovered {
  animation: pulse-highlight 1s ease-in-out infinite;
}

@keyframes pulse-highlight {
  0%, 100% {
    opacity: 1;
  }
  50% {
    opacity: 0.7;
  }
}
</style>
