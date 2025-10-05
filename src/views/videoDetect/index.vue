<template>
  <div class="detector-container">
    <div class="header">
      <h1>🎯 YOLOv8 实时目标检测</h1>
      <p>基于 ONNX Runtime Web 的浏览器端实时检测</p>
    </div>

    <!-- 控制面板 -->
    <div class="control-panel">
      <div class="button-group">
        <button
          @click="toggleDetection"
          :disabled="!modelLoaded || !cameraReady"
          class="btn btn-main"
        >
          {{ isDetecting ? '⏸ 暂停检测' : '▶ 开始检测' }}
        </button>

        <button
          @click="restartCamera"
          class="btn btn-secondary"
        >
          🔄 重启摄像头
        </button>
      </div>

      <!-- 状态信息 -->
      <div class="stats">
        <div class="stat-item">
          <div class="stat-label">模型状态</div>
          <div class="stat-value" :class="{ loaded: modelLoaded }">
            {{ loadingStatus }}
          </div>
        </div>
        <div class="stat-item">
          <div class="stat-label">摄像头</div>
          <div class="stat-value" :class="{ loaded: cameraReady }">
            {{ cameraReady ? '✅ 就绪' : '⏳ 准备中...' }}
          </div>
        </div>
        <div class="stat-item">
          <div class="stat-label">检测对象</div>
          <div class="stat-value detection">{{ detectionCount }}</div>
        </div>
        <div class="stat-item">
          <div class="stat-label">FPS</div>
          <div class="stat-value fps">{{ fps }}</div>
        </div>
        <div class="stat-item">
          <div class="stat-label">推理时间</div>
          <div class="stat-value inference">{{ inferenceTime }}ms</div>
        </div>
      </div>
    </div>

    <!-- 视频显示区域 -->
    <div class="video-container">
      <video
        ref="videoRef"
        autoplay
        playsinline
        muted
      ></video>
      <canvas ref="canvasRef"></canvas>

      <div v-if="!modelLoaded || !cameraReady" class="overlay">
        <div class="overlay-content">
          <div class="loading-spinner"></div>
          <p v-if="!modelLoaded">{{ loadingStatus }}</p>
          <p v-else-if="!cameraReady">正在启动摄像头...</p>
        </div>
      </div>
    </div>

    <!-- 检测列表 -->
    <div v-if="detectedObjects.length > 0" class="detected-list">
      <h3>🎯 检测到的对象</h3>
      <div class="objects-grid">
        <div
          v-for="(obj, index) in detectedObjects"
          :key="index"
          class="object-card"
          :style="{ borderColor: obj.color }"
        >
          <div class="object-icon" :style="{ background: obj.color }">
            {{ getObjectEmoji(obj.label) }}
          </div>
          <div class="object-info">
            <div class="object-label">{{ obj.label }}</div>
            <div class="object-confidence">{{ (obj.confidence * 100).toFixed(1) }}%</div>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, onMounted, onUnmounted, watch } from 'vue';
import * as ort from 'onnxruntime-web';

// ==================== 配置项 ====================
const MODEL_PATH = '/yolov8n.onnx'; // 模型路径（放在 public 目录下）
const CONF_THRESHOLD = 0.25;        // 置信度阈值
const IOU_THRESHOLD = 0.45;         // NMS IoU 阈值
const INPUT_SIZE = 640;             // 模型输入尺寸

// COCO 数据集 80 个类别
const COCO_CLASSES = [
  'person', 'bicycle', 'car', 'motorcycle', 'airplane', 'bus', 'train', 'truck', 'boat', 'traffic light',
  'fire hydrant', 'stop sign', 'parking meter', 'bench', 'bird', 'cat', 'dog', 'horse', 'sheep', 'cow',
  'elephant', 'bear', 'zebra', 'giraffe', 'backpack', 'umbrella', 'handbag', 'tie', 'suitcase', 'frisbee',
  'skis', 'snowboard', 'sports ball', 'kite', 'baseball bat', 'baseball glove', 'skateboard', 'surfboard',
  'tennis racket', 'bottle', 'wine glass', 'cup', 'fork', 'knife', 'spoon', 'bowl', 'banana', 'apple',
  'sandwich', 'orange', 'broccoli', 'carrot', 'hot dog', 'pizza', 'donut', 'cake', 'chair', 'couch',
  'potted plant', 'bed', 'dining table', 'toilet', 'tv', 'laptop', 'mouse', 'remote', 'keyboard', 'cell phone',
  'microwave', 'oven', 'toaster', 'sink', 'refrigerator', 'book', 'clock', 'vase', 'scissors', 'teddy bear',
  'hair drier', 'toothbrush'
];

// 为每个类别生成固定颜色
const COLORS = Array.from({ length: 80 }, (_, i) => {
  const hue = (i * 137.508) % 360;
  return `hsl(${hue}, 75%, 55%)`;
});

// 类别对应的 emoji
const CLASS_EMOJIS = {
  'person': '👤', 'bicycle': '🚲', 'car': '🚗', 'motorcycle': '🏍️', 'airplane': '✈️',
  'bus': '🚌', 'train': '🚆', 'truck': '🚚', 'boat': '⛵', 'bird': '🐦',
  'cat': '🐱', 'dog': '🐕', 'horse': '🐴', 'sheep': '🐑', 'cow': '🐄',
  'elephant': '🐘', 'bear': '🐻', 'zebra': '🦓', 'giraffe': '🦒', 'bottle': '🍾',
  'cup': '☕', 'fork': '🍴', 'knife': '🔪', 'spoon': '🥄', 'bowl': '🥣',
  'banana': '🍌', 'apple': '🍎', 'sandwich': '🥪', 'orange': '🍊', 'pizza': '🍕',
  'donut': '🍩', 'cake': '🍰', 'chair': '🪑', 'couch': '🛋️', 'bed': '🛏️',
  'toilet': '🚽', 'tv': '📺', 'laptop': '💻', 'mouse': '🖱️', 'keyboard': '⌨️',
  'cell phone': '📱', 'book': '📚', 'clock': '🕐', 'vase': '🏺', 'scissors': '✂️'
};

// 响应式状态
const videoRef = ref(null);
const canvasRef = ref(null);
const session = ref(null);
const isDetecting = ref(false);
const modelLoaded = ref(false);
const cameraReady = ref(false);
const loadingStatus = ref('正在初始化...');
const fps = ref(0);
const detectionCount = ref(0);
const inferenceTime = ref(0);
const detectedObjects = ref([]);

let animationFrameId = null;
let lastTime = Date.now();

// 配置 ONNX Runtime Web - 使用本地 CDN
ort.env.wasm.wasmPaths = {
  'ort-wasm.wasm': 'https://cdn.jsdelivr.net/npm/onnxruntime-web@1.17.0/dist/ort-wasm.wasm',
  'ort-wasm-simd.wasm': 'https://cdn.jsdelivr.net/npm/onnxruntime-web@1.17.0/dist/ort-wasm-simd.wasm',
  'ort-wasm-threaded.wasm': 'https://cdn.jsdelivr.net/npm/onnxruntime-web@1.17.0/dist/ort-wasm-threaded.wasm',
  'ort-wasm-simd-threaded.wasm': 'https://cdn.jsdelivr.net/npm/onnxruntime-web@1.17.0/dist/ort-wasm-simd-threaded.wasm'
};

// 获取对象对应的 emoji
const getObjectEmoji = (label) => {
  return CLASS_EMOJIS[label] || '📦';
};

// 从固定路径加载模型 - 使用多种后端尝试
const loadModel = async () => {
  const backends = [
    { name: 'CPU (推荐)', providers: ['cpu'] },
    { name: 'WASM', providers: ['wasm'] },
    { name: 'WebGL', providers: ['webgl'] }
  ];

  for (const backend of backends) {
    try {
      loadingStatus.value = `正在使用 ${backend.name} 加载模型...`;
      console.log(`尝试使用 ${backend.name} 后端...`);

      session.value = await ort.InferenceSession.create(MODEL_PATH, {
        executionProviders: backend.providers,
        graphOptimizationLevel: 'all'
      });

      modelLoaded.value = true;
      loadingStatus.value = `✅ 已加载 (${backend.name})`;
      console.log(`✅ 模型加载成功！使用后端: ${backend.name}`);
      console.log('输入名称:', session.value.inputNames);
      console.log('输出名称:', session.value.outputNames);
      return; // 成功后退出

    } catch (error) {
      console.warn(`${backend.name} 后端失败:`, error.message);

      // 如果是最后一个后端，显示错误
      if (backend === backends[backends.length - 1]) {
        console.error('❌ 所有后端都失败了');
        loadingStatus.value = '❌ 加载失败';

        let errorMsg = '模型加载失败！\n\n';

        if (error.message.includes('fetch') || error.message.includes('Failed to load')) {
          errorMsg += '无法找到模型文件！\n\n';
          errorMsg += '请确保:\n';
          errorMsg += `1. 文件 yolov8n.onnx 在 public 目录下\n`;
          errorMsg += `2. 文件大小约 6MB（不是几KB）\n`;
          errorMsg += `3. 重启开发服务器: npm run dev`;
        } else {
          errorMsg += `错误详情: ${error.message}\n\n`;
          errorMsg += '请尝试:\n';
          errorMsg += '1. 使用最新版 Chrome 浏览器\n';
          errorMsg += '2. 清除浏览器缓存 (Ctrl+Shift+Delete)\n';
          errorMsg += '3. 检查控制台的详细错误信息';
        }

        alert(errorMsg);
      }
    }
  }
};

// 启动摄像头
const startCamera = async () => {
  try {
    const stream = await navigator.mediaDevices.getUserMedia({
      video: {
        width: { ideal: 1280 },
        height: { ideal: 720 },
        facingMode: 'user' // 'user' 前置摄像头, 'environment' 后置摄像头
      }
    });

    videoRef.value.srcObject = stream;
    await videoRef.value.play();
    cameraReady.value = true;
    console.log('📷 摄像头已启动');

    // 摄像头就绪后自动开始检测
    if (modelLoaded.value) {
      isDetecting.value = true;
    }
  } catch (error) {
    console.error('❌ 摄像头启动失败:', error);
    alert('无法访问摄像头，请检查浏览器权限设置');
  }
};

// 停止摄像头
const stopCamera = () => {
  if (videoRef.value?.srcObject) {
    const tracks = videoRef.value.srcObject.getTracks();
    tracks.forEach(track => track.stop());
    videoRef.value.srcObject = null;
    cameraReady.value = false;
  }
};

// 重启摄像头
const restartCamera = async () => {
  stopCamera();
  isDetecting.value = false;
  await new Promise(resolve => setTimeout(resolve, 500));
  await startCamera();
};

// 预处理图像
const preprocessImage = (canvas, width, height) => {
  const ctx = canvas.getContext('2d');
  const imageData = ctx.getImageData(0, 0, width, height);
  const { data } = imageData;

  const red = [];
  const green = [];
  const blue = [];

  for (let i = 0; i < data.length; i += 4) {
    red.push(data[i] / 255.0);
    green.push(data[i + 1] / 255.0);
    blue.push(data[i + 2] / 255.0);
  }

  return Float32Array.from([...red, ...green, ...blue]);
};

// 计算 IoU
const calculateIoU = (box1, box2) => {
  const x1 = Math.max(box1.x, box2.x);
  const y1 = Math.max(box1.y, box2.y);
  const x2 = Math.min(box1.x + box1.width, box2.x + box2.width);
  const y2 = Math.min(box1.y + box1.height, box2.y + box2.height);

  const intersection = Math.max(0, x2 - x1) * Math.max(0, y2 - y1);
  const area1 = box1.width * box1.height;
  const area2 = box2.width * box2.height;
  const union = area1 + area2 - intersection;

  return union > 0 ? intersection / union : 0;
};

// NMS 非极大值抑制
const nms = (boxes, iouThreshold = IOU_THRESHOLD) => {
  const sorted = [...boxes].sort((a, b) => b.confidence - a.confidence);
  const selected = [];

  while (sorted.length > 0) {
    const current = sorted.shift();
    selected.push(current);

    for (let i = sorted.length - 1; i >= 0; i--) {
      if (calculateIoU(current, sorted[i]) > iouThreshold) {
        sorted.splice(i, 1);
      }
    }
  }

  return selected;
};

// 后处理 YOLOv8 输出
const postprocess = (output, modelWidth, modelHeight, videoWidth, videoHeight) => {
  const boxes = [];
  const data = output.data;

  const numClasses = 80;
  const numBoxes = 8400;

  for (let i = 0; i < numBoxes; i++) {
    let maxScore = 0;
    let maxIndex = 0;

    for (let j = 0; j < numClasses; j++) {
      const score = data[i + (4 + j) * numBoxes];
      if (score > maxScore) {
        maxScore = score;
        maxIndex = j;
      }
    }

    if (maxScore > CONF_THRESHOLD) {
      const cx = data[i];
      const cy = data[i + numBoxes];
      const w = data[i + 2 * numBoxes];
      const h = data[i + 3 * numBoxes];

      const x = (cx - w / 2) * videoWidth / modelWidth;
      const y = (cy - h / 2) * videoHeight / modelHeight;
      const width = w * videoWidth / modelWidth;
      const height = h * videoHeight / modelHeight;

      boxes.push({
        x, y, width, height,
        confidence: maxScore,
        class: maxIndex,
        label: COCO_CLASSES[maxIndex],
        color: COLORS[maxIndex]
      });
    }
  }

  return nms(boxes);
};

// 绘制检测结果
const drawBoxes = (boxes) => {
  const canvas = canvasRef.value;
  const ctx = canvas.getContext('2d');

  ctx.clearRect(0, 0, canvas.width, canvas.height);

  boxes.forEach(box => {
    // 绘制边界框
    ctx.strokeStyle = box.color;
    ctx.lineWidth = 3;
    ctx.strokeRect(box.x, box.y, box.width, box.height);

    // 准备标签
    const label = `${box.label} ${(box.confidence * 100).toFixed(1)}%`;
    ctx.font = 'bold 16px Arial';
    const textMetrics = ctx.measureText(label);
    const textWidth = textMetrics.width;
    const textHeight = 20;

    // 绘制标签背景
    ctx.fillStyle = box.color;
    ctx.fillRect(box.x, box.y - textHeight - 4, textWidth + 10, textHeight + 4);

    // 绘制标签文字
    ctx.fillStyle = 'white';
    ctx.fillText(label, box.x + 5, box.y - 8);
  });

  detectionCount.value = boxes.length;
  detectedObjects.value = boxes;
};

// 主检测循环
const detect = async () => {
  if (!session.value || !videoRef.value || !isDetecting.value) return;

  const video = videoRef.value;
  const canvas = canvasRef.value;

  if (video.readyState === video.HAVE_ENOUGH_DATA) {
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;

    // 创建临时画布
    const inputCanvas = document.createElement('canvas');
    inputCanvas.width = INPUT_SIZE;
    inputCanvas.height = INPUT_SIZE;
    const inputCtx = inputCanvas.getContext('2d');
    inputCtx.drawImage(video, 0, 0, INPUT_SIZE, INPUT_SIZE);

    // 预处理
    const inputData = preprocessImage(inputCanvas, INPUT_SIZE, INPUT_SIZE);

    try {
      const startTime = performance.now();

      // 推理
      const tensor = new ort.Tensor('float32', inputData, [1, 3, INPUT_SIZE, INPUT_SIZE]);
      const feeds = { images: tensor };
      const results = await session.value.run(feeds);

      const endTime = performance.now();
      inferenceTime.value = Math.round(endTime - startTime);

      // 后处理
      const outputName = session.value.outputNames[0];
      const output = results[outputName];
      const boxes = postprocess(output, INPUT_SIZE, INPUT_SIZE, video.videoWidth, video.videoHeight);

      // 绘制
      drawBoxes(boxes);

      // 计算 FPS
      const now = Date.now();
      const elapsed = now - lastTime;
      fps.value = Math.round(1000 / elapsed);
      lastTime = now;

    } catch (error) {
      console.error('推理错误:', error);
    }
  }

  animationFrameId = requestAnimationFrame(detect);
};

// 切换检测状态
const toggleDetection = () => {
  isDetecting.value = !isDetecting.value;

  if (!isDetecting.value && animationFrameId) {
    cancelAnimationFrame(animationFrameId);
    animationFrameId = null;
  }
};

// 监听检测状态
watch(isDetecting, (newVal) => {
  if (newVal && session.value && cameraReady.value) {
    lastTime = Date.now();
    detect();
  } else if (animationFrameId) {
    cancelAnimationFrame(animationFrameId);
    animationFrameId = null;
  }
});

// 组件挂载时初始化
onMounted(async () => {
  await loadModel();
  await startCamera();
});

// 组件卸载时清理
onUnmounted(() => {
  stopCamera();
  if (animationFrameId) {
    cancelAnimationFrame(animationFrameId);
  }
});
</script>

<style scoped>
* {
  box-sizing: border-box;
}

.detector-container {
  min-height: 100vh;
  background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
  padding: 2rem;
  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', 'Arial', sans-serif;
}

.header {
  text-align: center;
  margin-bottom: 2rem;
}

.header h1 {
  font-size: 2.5rem;
  font-weight: 800;
  color: white;
  margin: 0 0 0.5rem 0;
  text-shadow: 2px 2px 4px rgba(0,0,0,0.2);
}

.header p {
  color: rgba(255, 255, 255, 0.95);
  font-size: 1.1rem;
}

.control-panel {
  background: white;
  border-radius: 16px;
  padding: 2rem;
  margin-bottom: 2rem;
  box-shadow: 0 20px 60px rgba(0, 0, 0, 0.3);
}

.button-group {
  display: flex;
  gap: 1rem;
  margin-bottom: 1.5rem;
  flex-wrap: wrap;
}

.btn {
  flex: 1;
  min-width: 200px;
  padding: 1rem 2rem;
  border: none;
  border-radius: 12px;
  font-weight: 700;
  font-size: 1.1rem;
  cursor: pointer;
  transition: all 0.3s ease;
  color: white;
  box-shadow: 0 4px 15px rgba(0,0,0,0.2);
}

.btn:hover:not(:disabled) {
  transform: translateY(-2px);
  box-shadow: 0 6px 25px rgba(0,0,0,0.3);
}

.btn:active {
  transform: translateY(0);
}

.btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
  transform: none;
}

.btn-main {
  background: linear-gradient(135deg, #f093fb 0%, #f5576c 100%);
}

.btn-secondary {
  background: linear-gradient(135deg, #4facfe 0%, #00f2fe 100%);
}

.stats {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(140px, 1fr));
  gap: 1rem;
}

.stat-item {
  background: linear-gradient(135deg, #667eea15 0%, #764ba215 100%);
  border-radius: 12px;
  padding: 1rem;
  text-align: center;
  border: 2px solid #e2e8f0;
}

.stat-label {
  color: #64748b;
  font-size: 0.8rem;
  font-weight: 700;
  margin-bottom: 0.5rem;
  text-transform: uppercase;
  letter-spacing: 0.5px;
}

.stat-value {
  font-size: 1.5rem;
  font-weight: 800;
  color: #2d3748;
}

.stat-value.loaded {
  color: #10b981;
}

.stat-value.detection {
  color: #667eea;
}

.stat-value.fps {
  color: #f5576c;
}

.stat-value.inference {
  color: #f59e0b;
}

.video-container {
  position: relative;
  background: #000;
  border-radius: 16px;
  overflow: hidden;
  box-shadow: 0 30px 90px rgba(0, 0, 0, 0.4);
  max-width: 1400px;
  margin: 0 auto;
}

.video-container video {
  width: 100%;
  display: block;
}

.video-container canvas {
  position: absolute;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
  pointer-events: none;
}

.overlay {
  position: absolute;
  inset: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  background: rgba(0, 0, 0, 0.9);
  backdrop-filter: blur(10px);
}

.overlay-content {
  text-align: center;
  color: white;
  padding: 2rem;
}

.loading-spinner {
  width: 60px;
  height: 60px;
  border: 4px solid rgba(255, 255, 255, 0.3);
  border-top-color: #fff;
  border-radius: 50%;
  animation: spin 1s linear infinite;
  margin: 0 auto 1.5rem;
}

@keyframes spin {
  to { transform: rotate(360deg); }
}

.overlay-content p {
  font-size: 1.3rem;
  margin: 0.5rem 0;
  font-weight: 600;
}

.detected-list {
  background: white;
  border-radius: 16px;
  padding: 2rem;
  margin-top: 2rem;
  box-shadow: 0 20px 60px rgba(0, 0, 0, 0.3);
}

.detected-list h3 {
  margin: 0 0 1.5rem 0;
  color: #2d3748;
  font-size: 1.5rem;
  font-weight: 800;
}

.objects-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(180px, 1fr));
  gap: 1rem;
}

.object-card {
  display: flex;
  align-items: center;
  gap: 1rem;
  padding: 1rem;
  background: #f8fafc;
  border-radius: 12px;
  border: 2px solid;
  transition: all 0.3s ease;
}

.object-card:hover {
  transform: translateY(-2px);
  box-shadow: 0 4px 12px rgba(0,0,0,0.1);
}

.object-icon {
  width: 48px;
  height: 48px;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 10px;
  font-size: 24px;
}

.object-info {
  flex: 1;
}

.object-label {
  font-weight: 700;
  color: #2d3748;
  font-size: 0.95rem;
  margin-bottom: 0.25rem;
  text-transform: capitalize;
}

.object-confidence {
  font-size: 0.85rem;
  color: #64748b;
  font-weight: 600;
}

@media (max-width: 768px) {
  .detector-container {
    padding: 1rem;
  }

  .header h1 {
    font-size: 1.75rem;
  }

  .control-panel {
    padding: 1.5rem;
  }

  .button-group {
    flex-direction: column;
  }

  .btn {
    min-width: 100%;
  }

  .stats {
    grid-template-columns: repeat(2, 1fr);
  }

  .objects-grid {
    grid-template-columns: repeat(auto-fill, minmax(150px, 1fr));
  }
}
</style>
