<script setup>
defineOptions({
  name: "Labelimgs"
});
import { ref, reactive, computed, nextTick, onMounted, onUnmounted } from 'vue'

const activeLayer = ref('damage')
const zoom = ref(61)

const mouseX = ref(0)
const mouseY = ref(0)

const measurements = reactive({
  distance: '79μm',
  area: '3342 μm²',
  volume: '8000 μm³'
})

// 矩形绘制相关状态
const isDrawing = ref(false)
const allRectangles = ref({}) // 存储所有图片的矩形数据，key为图片索引
const currentRect = ref(null)
const imageElement = ref(null)
const svgElement = ref(null)
const isDrawMode = ref(false)
const hoveredRectId = ref(null) // 鼠标悬停的矩形ID

// 当前图片的矩形数组（计算属性）
const rectangles = computed({
  get: () => allRectangles.value[currentImageIndex.value] || [],
  set: (value) => {
    allRectangles.value[currentImageIndex.value] = value
  }
})

// 图像相关数据（支持标注URL）
const images = ref([
  // {
  //   imageUrl: 'https://zjut-anomalies-source.oss-cn-hangzhou.aliyuncs.com/15210A-Bin-041.png',
  //   annotationUrl: 'https://zjut-anomalies-source.oss-cn-hangzhou.aliyuncs.com/15210A-Bin-041.txt' // 可以在这里添加标注URL
  // },
  // {
  //   imageUrl: 'https://zjut-anomalies-source.oss-cn-hangzhou.aliyuncs.com/15260A-F1-Bin-001.png',
  //   annotationUrl: null
  // },
  // {
  //   imageUrl: 'https://zjut-anomalies-source.oss-cn-hangzhou.aliyuncs.com/15260A-F1-Bin-005.png',
  //   annotationUrl: null
  // },
  // {
  //   imageUrl: 'https://zjut-anomalies-source.oss-cn-hangzhou.aliyuncs.com/15260A-F1-Bin-006.png',
  //   annotationUrl: null
  // }
])

const currentImageIndex = ref(0)

// 计算当前图像URL
const imageUrl = computed(() => {
  return images.value[currentImageIndex.value]?.imageUrl
})

// 切换到下一张图片
const nextImage = () => {
  // 清除悬停状态
  hoveredRectId.value = null

  if (currentImageIndex.value < images.value.length - 1) {
    currentImageIndex.value++
  } else {
    // 循环到第一张
    currentImageIndex.value = 0
  }

  console.log(`切换到图片${currentImageIndex.value + 1}，该图片有${rectangles.value.length}个矩形`)
}

// 切换到上一张图片
const previousImage = () => {
  // 清除悬停状态
  hoveredRectId.value = null

  if (currentImageIndex.value > 0) {
    currentImageIndex.value--
  } else {
    // 循环到最后一张
    currentImageIndex.value = images.value.length - 1
  }

  console.log(`切换到图片${currentImageIndex.value + 1}，该图片有${rectangles.value.length}个矩形`)
}


// 获取图像在容器中的实际位置和尺寸
const getImageBounds = () => {
  if (!imageElement.value) return null

  const imageRect = imageElement.value.getBoundingClientRect()
  const containerRect = imageElement.value.parentElement.getBoundingClientRect()

  return {
    left: imageRect.left - containerRect.left,
    top: imageRect.top - containerRect.top,
    width: imageRect.width,
    height: imageRect.height,
    naturalWidth: imageElement.value.naturalWidth,
    naturalHeight: imageElement.value.naturalHeight
  }
}

// 将鼠标坐标转换为相对于图像的比例坐标
const mouseToImageCoords = (clientX, clientY) => {
  const bounds = getImageBounds()
  if (!bounds) return null

  const containerRect = svgElement.value.getBoundingClientRect()
  const x = clientX - containerRect.left - bounds.left
  const y = clientY - containerRect.top - bounds.top

  // 转换为相对于图像尺寸的比例（0-1）
  const relativeX = Math.max(0, Math.min(1, x / bounds.width))
  const relativeY = Math.max(0, Math.min(1, y / bounds.height))

  return { x: relativeX, y: relativeY }
}

// 开始绘制矩形 - 只有鼠标按下时才开始
const startDrawing = (event) => {
  console.log('startDrawing 被调用, isDrawMode:', isDrawMode.value, 'isDrawing:', isDrawing.value)

  // 只有在绘制模式开启且当前没有在绘制时才开始新的绘制
  if (!isDrawMode.value) {
    console.log('绘制模式未开启，忽略')
    return
  }

  if (isDrawing.value) {
    console.log('正在绘制中，忽略新的开始')
    return
  }

  const coords = mouseToImageCoords(event.clientX, event.clientY)
  if (!coords) {
    console.log('坐标转换失败')
    return
  }

  console.log('🟢 开始新的绘制，坐标:', coords)

  isDrawing.value = true
  currentRect.value = {
    x1: coords.x,
    y1: coords.y,
    x2: coords.x,
    y2: coords.y,
    id: Date.now()
  }
}

// 更新矩形大小 - 只有在正在绘制时才响应
const updateDrawing = (event) => {
//   // 先检查基本条件
//   if (!isDrawMode.value) return
//   if (!isDrawing.value) return
//   if (!currentRect.value) return

//   const coords = mouseToImageCoords(event.clientX, event.clientY)
//   if (!coords) return

//   // 只有在真正绘制时才更新
//   currentRect.value.x2 = coords.x
//   currentRect.value.y2 = coords.y

// // 同步更新全局鼠标坐标
//   mouseX.value = coords.x
  //   mouseY.value = coords.y
  const coords = mouseToImageCoords(event.clientX, event.clientY)
  if (!coords) return

  // 不管是否在绘制模式，都更新全局坐标
  mouseX.value = coords.x
  mouseY.value = coords.y

  // 下面这部分仍然保留，仅在绘制模式下更新矩形
  if (!isDrawMode.value || !isDrawing.value || !currentRect.value) return

  currentRect.value.x2 = coords.x
  currentRect.value.y2 = coords.y
}

const handleMouseMove = (event) => {
  const coords = mouseToImageCoords(event.clientX, event.clientY)
  if (coords) {
    mouseX.value = coords.x
    mouseY.value = coords.y
  }
}

// 完成矩形绘制 - 鼠标抬起时完成并完全停止
const finishDrawing = (event) => {
  console.log('finishDrawing 被调用, isDrawing:', isDrawing.value)

  if (!isDrawing.value || !currentRect.value) {
    console.log('没有正在绘制的矩形，忽略')
    return
  }

  console.log('🔴 完成绘制，准备保存')

  // 确保矩形有一定的大小（避免意外点击）
  const width = Math.abs(currentRect.value.x2 - currentRect.value.x1)
  const height = Math.abs(currentRect.value.y2 - currentRect.value.y1)

  console.log('矩形尺寸:', { width, height })

  if (width > 0.01 && height > 0.01) {
    // 获取当前图片的矩形数组，如果不存在则创建空数组
    const currentRects = allRectangles.value[currentImageIndex.value] || []

    // 添加新矩形，包含类型信息
    const newRect = {
      ...currentRect.value,
      classId: selectedClassId.value
    }
    const newRects = [...currentRects, newRect]

    // 更新当前图片的矩形数组
    allRectangles.value[currentImageIndex.value] = newRects

    console.log(`✅ 保存完成，图片${currentImageIndex.value + 1}现有${newRects.length}个矩形`)
  } else {
    console.log('矩形太小，不保存')
  }

  // 立即重置状态
  const oldDrawing = isDrawing.value
  const oldRect = currentRect.value

  isDrawing.value = false
  currentRect.value = null

  console.log('🛑 绘制状态已重置:', {
    '之前isDrawing': oldDrawing,
    '现在isDrawing': isDrawing.value,
    '之前currentRect': oldRect ? 'existed' : 'null',
    '现在currentRect': currentRect.value
  })

  // 防止事件冒泡
  event.stopPropagation()
  event.preventDefault()
}

// 删除矩形
const deleteRectangle = (id) => {
  const currentRects = allRectangles.value[currentImageIndex.value] || []
  const newRects = currentRects.filter(rect => rect.id !== id)
  allRectangles.value[currentImageIndex.value] = newRects

  console.log(`从图片${currentImageIndex.value + 1}删除矩形后:`, newRects)
  console.log('所有图片的矩形数据:', allRectangles.value)
}

// 清空当前图片的所有矩形
const clearAllRectangles = () => {
  allRectangles.value[currentImageIndex.value] = []
  console.log(`已清空图片${currentImageIndex.value + 1}的所有矩形`)
  console.log('所有图片的矩形数据:', allRectangles.value)
}

// 切换绘制模式
const toggleDrawMode = () => {
  isDrawMode.value = !isDrawMode.value
  console.log('绘制模式:', isDrawMode.value ? '开启' : '关闭')
}

// 处理工具栏点击事件
const handleToolbarClick = (item, index) => {
  // 先重置所有工具的active状态（除了绘制工具）
  if (item.label !== '绘制矩形') {
    toolbarItems.forEach(tool => {
      if (tool.label !== '绘制矩形') {
        tool.active = false
      }
    })
  }

  // 根据不同的工具执行不同的操作
  switch (item.label) {
    case '下一个图像':
      nextImage()
      item.active = true
      break
    case '上一个图像':
      previousImage()
      item.active = true
      break
    case '绘制矩形':
      toggleDrawMode()
      item.active = isDrawMode.value
      break
    case '清空矩形':
      clearAllRectangles()
      item.active = true
      break
    case '打开文件':
      console.log('打开文件')
      item.active = true
      break
    case '保存':
      console.log('=== 保存YOLO格式标注数据 ===')
      console.log(`当前图片${currentImageIndex.value + 1}的矩形:`, rectangles.value)
      if (rectangles.value.length > 0) {
        const yoloContent = formatRectanglesToYolo(rectangles.value)
        console.log('YOLO格式内容:')
        console.log(yoloContent)
      }
      console.log('所有图片的矩形数据:', allRectangles.value)

      // 统计信息
      const totalRects = Object.values(allRectangles.value).reduce((sum, rects) => sum + rects.length, 0)
      console.log(`总计: ${Object.keys(allRectangles.value).length}张图片，${totalRects}个矩形`)
      item.active = true
      break
    // 可以根据需要添加更多功能
    default:
      console.log(`点击了: ${item.label}`)
      item.active = true
  }
}

// 处理图像加载错误
const handleImageError = () => {
  console.error('图像加载失败')
}

// 键盘事件处理
const handleKeyDown = (event) => {
  // 防止在输入框等元素中触发快捷键
  if (event.target.tagName === 'INPUT' || event.target.tagName === 'TEXTAREA' || event.target.tagName === 'SELECT') {
    return
  }

  switch (event.key.toLowerCase()) {
    case 'a':
      event.preventDefault()
      previousImage()
      console.log('快捷键: A - 上一张图片')
      break
    case 'd':
      event.preventDefault()
      nextImage()
      console.log('快捷键: D - 下一张图片')
      break
    case 'w':
      event.preventDefault()
      toggleDrawMode()
      console.log('快捷键: W - 切换绘制模式')
      break
    case 'delete':
    case 'backspace':
      event.preventDefault()
      if (hoveredRectId.value) {
        deleteRectangle(hoveredRectId.value)
        console.log('快捷键: Del - 删除悬停矩形')
      }
      break
    // 数字键0-5快速切换标注类型
    case '0':
    case '1':
    case '2':
    case '3':
    case '4':
    case '5':
      event.preventDefault()
      const classId = parseInt(event.key)
      if (classId < anomaliesType.length) {
        selectedClassId.value = classId
        const typeName = getClassName(classId)
        console.log(`快捷键: ${classId} - 切换到类型 ${typeName}`)
      }
      break
  }
}

// 鼠标进入矩形
const onRectMouseEnter = (rectId) => {
  hoveredRectId.value = rectId
}

// 鼠标离开矩形
const onRectMouseLeave = () => {
  hoveredRectId.value = null
}

// 组件挂载时添加键盘监听
onMounted(() => {
  document.addEventListener('keydown', handleKeyDown)
  console.log('快捷键已启用: A(上一张) D(下一张) W(绘制模式) 0-5(类型切换) Del(删除悬停矩形)')
})

// 组件卸载时移除键盘监听
onUnmounted(() => {
  document.removeEventListener('keydown', handleKeyDown)
})
const rectToSVGCoords = (rect) => {
  const bounds = getImageBounds()
  if (!bounds) return { x: 0, y: 0, width: 0, height: 0 }

  const x1 = Math.min(rect.x1, rect.x2) * bounds.width + bounds.left
  const y1 = Math.min(rect.y1, rect.y2) * bounds.height + bounds.top
  const x2 = Math.max(rect.x1, rect.x2) * bounds.width + bounds.left
  const y2 = Math.max(rect.y1, rect.y2) * bounds.height + bounds.top

  return {
    x: x1,
    y: y1,
    width: x2 - x1,
    height: y2 - y1
  }
}

const toolbarItems = [
  { icon: '📁', label: '打开文件', active: false },
  { icon: '🔧', label: '打开目录', active: false },
  // { icon: '📊', label: '改变热图目录', active: false },
  { icon: '⬆️', label: '上一个图像(A)', active: false },
  { icon: '⬇️', label: '下一个图像(D)', active: false },

  // { icon: '✓', label: '验证图像', active: true },
  { icon: '💾', label: '保存', active: false },
  { icon: '📐', label: '绘制矩形(W)', active: false },
  { icon: '🗑️', label: '清空矩形', active: false },
  // { icon: '❌', label: '删除选择的记录', active: false },
  { icon: '🔍', label: '放大画面', active: false }
]

// 类型定义（6种YOLO类型）
const anomaliesType = [
  { id: 0, name: 'black', label: '黑斑', color: 'bg-red-200', active: false },
  { id: 1, name: 'damage', label: '正崩', color: 'bg-blue-200', active: false },
  { id: 2, name: 'ink', label: '污染', color: 'bg-green-200', active: false },
  { id: 3, name: 'resuide', label: '溢胶', color: 'bg-yellow-200', active: false },
  { id: 4, name: 'pi', label: '过曝', color: 'bg-purple-200', active: false },
  { id: 5, name: 'circle', label: '紫色圆圈', color: 'bg-pink-200', active: false },
]

// 当前选择的标注类型
const selectedClassId = ref(0)

// 根据类型ID获取颜色
const getClassColor = (classId) => {
  const colors = [
    { fill: 'rgba(239, 68, 68, 0.2)', stroke: '#dc2626' },   // red - black
    { fill: 'rgba(59, 130, 246, 0.2)', stroke: '#2563eb' },  // blue - damage
    { fill: 'rgba(34, 197, 94, 0.2)', stroke: '#16a34a' },   // green - ink
    { fill: 'rgba(251, 191, 36, 0.2)', stroke: '#d97706' },  // yellow - resuide
    { fill: 'rgba(147, 51, 234, 0.2)', stroke: '#9333ea' },  // purple - pi
    { fill: 'rgba(236, 72, 153, 0.2)', stroke: '#db2777' }   // pink - circle
  ]
  return colors[classId] || colors[0]
}

// 根据类型ID获取名称
const getClassName = (classId) => {
  const type = anomaliesType.find(t => t.id === classId)
  return type ? type.name : 'unknown'
}
</script>

<template>
  <!-- <div class="h-screen flex bg-gray-100"> -->
  <div class="h-full flex bg-gray-100">
    <!-- 左侧功能区 (10%) -->
    <div class="w-[10%] bg-gray-200 border-r border-gray-300 flex flex-col">
      <div class="p-2 border-b border-gray-300">
        <h3 class="text-sm font-medium text-gray-700 mb-2">工具栏</h3>
      </div>
      <div class="flex-1 overflow-y-auto">
        <div v-for="(item, index) in toolbarItems" :key="index"
             class="p-2 border-b border-gray-200 hover:bg-gray-100 cursor-pointer transition-colors"
             :class="{ 'bg-blue-100': item.active }"
             @click="handleToolbarClick(item, index)">
          <div class="flex flex-col items-center text-xs">
            <span class="text-lg mb-1">{{ item.icon }}</span>
            <span class="text-center text-gray-600 leading-tight">{{ item.label }}</span>
          </div>
        </div>
      </div>
      <!-- <div class="p-2 border-t border-gray-300">
        <div class="text-xs text-gray-500 text-center">{{ zoom }}%</div>
      </div> -->
    </div>

    <!-- 中间图像渲染区 (70%) -->
    <div class="w-[70%] bg-black relative flex items-center justify-center overflow-hidden">
      <!-- 图像容器 -->
      <div class="relative w-full h-full flex items-center justify-center">
        <!-- 实际图像 -->
        <img
          v-if="imageUrl"
          ref="imageElement"
          :src="imageUrl"
          class="max-w-full max-h-full object-contain"
          alt="显微镜图像"
          @error="handleImageError"
          @load="async () => {
            await nextTick()
            const currentImageData = images.value[currentImageIndex.value]
            if (currentImageData?.annotationUrl && !allRectangles.value[currentImageIndex.value]) {
              try {
                const response = await fetch(currentImageData.annotationUrl)
                const txtContent = await response.text()
                const rectangles = parseYoloAnnotation(txtContent)
                allRectangles.value[currentImageIndex.value] = rectangles
                console.log(`加载图片${currentImageIndex.value + 1}的YOLO标注:`, rectangles)
              } catch (error) {
                console.log('加载标注失败，使用空标注:', error)
                allRectangles.value[currentImageIndex.value] = []
              }
            } else if (!allRectangles.value[currentImageIndex.value]) {
              allRectangles.value[currentImageIndex.value] = []
            }
          }"
        />

        <!-- 无图像时的占位符 -->
        <div
          v-else
          class="w-full h-full bg-gray-800 flex items-center justify-center text-gray-400 text-lg"
        >
          <div class="text-center">
            <div class="text-4xl mb-4">🔬</div>
            <div>请加载图像</div>
          </div>
        </div>

        <!-- SVG绘制叠加层 -->
        <svg
          v-if="imageUrl"
          ref="svgElement"
          class="absolute inset-0 w-full h-full"
          :class="{ 'cursor-crosshair': isDrawMode }"
          @mousedown.stop.prevent="startDrawing"
          @mousemove.stop="updateDrawing"
          @mouseup.stop.prevent="finishDrawing"
        >
          <!-- 已完成的矩形 -->
          <g v-for="rect in rectangles" :key="rect.id">
            <rect
              :x="rectToSVGCoords(rect).x"
              :y="rectToSVGCoords(rect).y"
              :width="rectToSVGCoords(rect).width"
              :height="rectToSVGCoords(rect).height"
              :fill="hoveredRectId === rect.id ? 'rgba(255, 255, 0, 0.4)' : getClassColor(rect.classId).fill"
              :stroke="hoveredRectId === rect.id ? '#fbbf24' : getClassColor(rect.classId).stroke"
              :stroke-width="hoveredRectId === rect.id ? '3' : '2'"
              class="cursor-pointer transition-all duration-200"
              @click.stop="deleteRectangle(rect.id)"
              @mouseenter="onRectMouseEnter(rect.id)"
              @mouseleave="onRectMouseLeave"
            />
            <!-- 类型标签 -->
            <text
              :x="rectToSVGCoords(rect).x + 5"
              :y="rectToSVGCoords(rect).y + 15"
              fill="white"
              stroke="black"
              stroke-width="1"
              font-size="12"
              font-weight="bold"
              class="pointer-events-none"
            >
              {{ getClassName(rect.classId) }}
            </text>
          </g>

          <!-- 正在绘制的矩形 -->
          <g v-if="isDrawing && currentRect">
            <rect
              :x="rectToSVGCoords(currentRect).x"
              :y="rectToSVGCoords(currentRect).y"
              :width="rectToSVGCoords(currentRect).width"
              :height="rectToSVGCoords(currentRect).height"
              :fill="getClassColor(selectedClassId).fill"
              :stroke="getClassColor(selectedClassId).stroke"
              stroke-width="2"
              stroke-dasharray="5,5"
            />
            <!-- 正在绘制的类型标签 -->
            <text
              :x="rectToSVGCoords(currentRect).x + 5"
              :y="rectToSVGCoords(currentRect).y + 15"
              fill="white"
              :stroke="getClassColor(selectedClassId).stroke"
              stroke-width="1"
              font-size="12"
              font-weight="bold"
              class="pointer-events-none"
            >
              {{ getClassName(selectedClassId) }}
            </text>
          </g>
        </svg>

      </div>

      <!-- 绘制模式提示 -->
      <div
        v-if="isDrawMode"
        class="absolute top-4 left-4 bg-green-600 bg-opacity-90 text-white px-3 py-1 rounded text-sm"
      >
        🎯 绘制模式 - 拖拽绘制矩形
      </div>

      <!-- 矩形数量显示 -->
      <div
        v-if="rectangles.length > 0"
        class="absolute top-4 right-4 bg-red-600 bg-opacity-90 text-white px-3 py-1 rounded text-sm"
      >
        当前图片: {{ rectangles.length }}个矩形
      </div>

      <!-- 总体统计显示 -->
      <div
        v-if="Object.keys(allRectangles).length > 0"
        class="absolute top-12 right-4 bg-blue-600 bg-opacity-90 text-white px-3 py-1 rounded text-sm"
      >
        总计: {{ Object.values(allRectangles).reduce((sum, rects) => sum + rects.length, 0) }}个矩形
      </div>

      <!-- 图像导航控制 -->
      <div class="absolute top-4 left-1/2 transform -translate-x-1/2 bg-black bg-opacity-50 text-white px-3 py-1 rounded text-sm">
        {{ currentImageIndex + 1 }} / {{ images.length }}
      </div>

      <!-- 左右切换按钮 -->
      <!-- <button
        @click="previousImage"
        class="absolute left-4 top-1/2 transform -translate-y-1/2 bg-black bg-opacity-50 text-white p-2 rounded-full hover:bg-opacity-70 transition-all"
        :disabled="images.length <= 1">
        ⬅️
      </button>
      <button
        @click="nextImage"
        class="absolute right-4 top-1/2 transform -translate-y-1/2 bg-black bg-opacity-50 text-white p-2 rounded-full hover:bg-opacity-70 transition-all"
        :disabled="images.length <= 1">
        ➡️
      </button> -->

      <!-- 悬停矩形提示 -->
      <!-- <div
        v-if="hoveredRectId"
        class="absolute top-16 left-4 bg-yellow-500 bg-opacity-90 text-black px-3 py-1 rounded text-sm font-medium"
      >
        🎯 悬停矩形 - 按Del删除
      </div> -->

      <!-- 缩放控制 -->
      <!-- <div class="absolute bottom-4 left-4 bg-black bg-opacity-50 text-white px-2 py-1 rounded text-sm">
        158x
      </div> -->

      <!-- 坐标显示 -->
      <div class="absolute bottom-4 right-4 bg-black bg-opacity-50 text-white px-2 py-1 rounded text-sm">
          X: {{ Math.round(mouseX * 1000) / 1000 }};
          Y: {{ Math.round(mouseY * 1000) / 1000 }}
      </div>
    </div>

    <!-- 右侧信息区 (20%) -->
    <div class="w-[20%] bg-white border-l border-gray-300 flex flex-col">
      <!-- 异常标签展示 -->
      <div class="p-3 border-b border-gray-200">
        <h4 class="text-sm font-medium mb-2">标注类型选择</h4>
        <div class="space-y-1">
          <div v-for="layer in anomaliesType" :key="layer.id"
               class="flex items-center justify-between p-2 rounded cursor-pointer transition-colors"
               :class="selectedClassId === layer.id ? 'bg-blue-100 border border-blue-300' : 'hover:bg-gray-50'"
               @click="selectedClassId = layer.id">
            <div class="flex items-center">
              <input
                type="radio"
                :checked="selectedClassId === layer.id"
                :value="layer.id"
                @change="selectedClassId = layer.id"
                class="mr-2"
              />
              <span class="text-xs mx-1 font-medium">{{ layer.name }}</span>
              <span class="text-xs text-gray-500">({{ layer.label }})</span>
            </div>
            <div class="flex items-center space-x-1">
              <kbd class="bg-gray-200 px-1 rounded text-xs">{{ layer.id }}</kbd>
            </div>
          </div>
        </div>
        <div class="mt-2 text-xs text-blue-600">
          当前选择: <strong>{{ getClassName(selectedClassId) }}</strong>
          <!-- <span class="text-gray-500">(按 <kbd class="bg-gray-200 px-1 rounded">{{ selectedClassId }}</kbd> 快速切换)</span> -->
        </div>
      </div>

      <!-- 矩形列表 -->
      <div class="p-3 border-b border-gray-200" v-if="rectangles.length > 0">
        <h4 class="text-sm font-medium mb-2">
          当前图片的矩形 ({{ rectangles.length }})
          <span class="text-xs text-gray-500">- 图像{{ currentImageIndex + 1 }}</span>
        </h4>
        <div class="space-y-1 max-h-32 overflow-y-auto">
          <div v-for="(rect, index) in rectangles" :key="rect.id"
               class="flex items-center justify-between p-2 rounded text-xs transition-all duration-200"
               :class="hoveredRectId === rect.id ? 'bg-yellow-100 border border-yellow-400' : 'bg-gray-50 hover:bg-gray-100'">
            <div class="flex items-center">
              <span :class="hoveredRectId === rect.id ? 'font-bold text-yellow-800' : ''">
                矩形 {{ index + 1 }}
                <span v-if="hoveredRectId === rect.id" class="ml-1">🎯</span>
              </span>
            </div>
            <button
              @click="deleteRectangle(rect.id)"
              class="text-red-500 hover:text-red-700 font-bold">
              ✕
            </button>
          </div>
        </div>
        <div v-if="hoveredRectId" class="mt-2 text-xs text-yellow-700 bg-yellow-50 p-2 rounded">
          💡 按 <kbd class="bg-yellow-200 px-1 rounded">Del</kbd> 键删除悬停的矩形
        </div>
      </div>

      <!-- 文件列表 -->
      <div class="flex-1 p-3 overflow-y-auto">
        <h4 class="text-sm font-medium mb-2">文件列表</h4>
        <div class="space-y-1">
          <div v-for="(image, index) in images" :key="index"
               class="text-xs text-gray-600 py-1 px-2 hover:bg-gray-100 rounded cursor-pointer transition-colors"
               :class="{ 'bg-blue-100 text-blue-800': index === currentImageIndex }"
               @click="currentImageIndex = index; hoveredRectId = null">
            <div class="flex justify-between items-center">
              <!-- <span>图像{{ index + 1 }}.tif</span> -->
              <!-- <span>{{ images[index + 1]}}</span> -->
              <!-- <span>{{ (images[index + 1] && images[index + 1]['imageUrl']) }}</span> -->
               <span>{{ images[index + 1] && images[index + 1]['imageUrl'] ? images[index + 1]['imageUrl'].split('/').pop() : '' }}</span>

              <div class="flex items-center space-x-1">
                <span v-if="image.annotationUrl"
                      class="bg-green-500 text-white px-1 rounded text-xs"
                      title="有标注文件">
                  A
                </span>
                <span v-if="allRectangles[index]?.length"
                      class="bg-red-500 text-white px-1 rounded text-xs">
                  {{ allRectangles[index].length }}
                </span>
              </div>
            </div>
          </div>
        </div>
      </div>

      <!-- 指针信息 -->
      <!-- <div class="p-3 border-t border-gray-200">
        <h4 class="text-sm font-medium mb-2">指针信息</h4>
        <div class="space-y-1 text-xs">
          <div class="flex justify-between">
            <span>距离:</span>
            <span>{{ measurements.distance }}</span>
          </div>
          <div class="flex justify-between">
            <span>面积:</span>
            <span>{{ measurements.area }}</span>
          </div>
          <div class="flex justify-between">
            <span>体积:</span>
            <span>{{ measurements.volume }}</span>
          </div>
        </div>
      </div> -->
    </div>
  </div>
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
