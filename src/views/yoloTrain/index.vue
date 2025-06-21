<template>
  <div class="yolo-simple-controller">
    <div class="header">
      <h1>🎯 YOLO训练控制器</h1>
      <div class="status-indicators">
        <div class="status-item" :class="{ connected: apiConnected }">
          <span class="indicator"></span>
          API: {{ apiConnected ? '已连接' : '未连接' }}
        </div>
        <div class="status-item" :class="{ connected: wsConnected }">
          <span class="indicator"></span>
          实时监控: {{ wsConnected ? '已连接' : '未连接' }}
        </div>
      </div>
    </div>

    <!-- 训练配置 -->
    <div class="config-section" v-if="!hasActiveTraining">
      <h3>训练配置</h3>
      <div class="config-form">
        <div class="form-group">
          <label>模型:</label>
          <select v-model="config.model">
            <option value="yolov8n.pt">YOLOv8n (快速)</option>
            <option value="yolov8s.pt">YOLOv8s</option>
            <option value="yolov8m.pt">YOLOv8m</option>
            <option value="yolov8l.pt">YOLOv8l</option>
            <option value="yolov8x.pt">YOLOv8x (精确)</option>
          </select>
        </div>
        <div class="form-group">
          <label>数据配置:</label>
          <input type="text" v-model="config.data" placeholder="path/to/dataset.yaml" required>
        </div>
        <div class="form-group">
          <label>训练轮数:</label>
          <input type="number" v-model="config.epochs" min="1" max="1000">
        </div>
        <div class="form-group">
          <label>批次大小:</label>
          <input type="number" v-model="config.batch" min="1" max="128">
        </div>
        <div class="form-group">
          <label>图像尺寸:</label>
          <input type="number" v-model="config.imgsz" min="320" max="1280" step="32">
        </div>
        <div class="form-group">
          <label>设备:</label>
          <input type="text" v-model="config.device" placeholder="0 (GPU) 或 cpu">
        </div>
      </div>
    </div>

    <!-- 控制按钮 -->
    <div class="control-section">
      <button
        @click="startTraining"
        :disabled="!apiConnected || hasActiveTraining || !isConfigValid"
        class="btn btn-start"
      >
        {{ hasActiveTraining ? '训练进行中...' : '🚀 开始训练' }}
      </button>

      <button
        @click="stopTraining"
        :disabled="!apiConnected || !currentSessionId"
        class="btn btn-stop"
      >
        ⏹️ 停止训练
      </button>

      <button @click="refreshStatus" class="btn btn-secondary">
        🔄 刷新状态
      </button>
    </div>

    <!-- 训练状态 -->
    <div class="training-status" v-if="currentTrainingData">
      <h3>训练状态</h3>

      <!-- 进度条 -->
      <div class="progress-section">
        <div class="progress-info">
          <span>Epoch {{ currentTrainingData.epoch }}/{{ currentTrainingData.total_epochs }}</span>
          <span>{{ progressPercentage.toFixed(1) }}%</span>
        </div>
        <div class="progress-bar">
          <div class="progress-fill" :style="{ width: progressPercentage + '%' }"></div>
        </div>
      </div>

      <!-- 指标卡片 -->
      <div class="metrics-grid">
        <div class="metric-card">
          <h4>🔥 训练损失</h4>
          <div class="metrics">
            <div class="metric">
              <span>Box:</span>
              <span>{{ currentTrainingData.train_losses.box_loss.toFixed(6) }}</span>
            </div>
            <div class="metric">
              <span>Obj:</span>
              <span>{{ currentTrainingData.train_losses.obj_loss.toFixed(6) }}</span>
            </div>
            <div class="metric">
              <span>Cls:</span>
              <span>{{ currentTrainingData.train_losses.cls_loss.toFixed(6) }}</span>
            </div>
            <div class="metric total">
              <span>总计:</span>
              <span>{{ currentTrainingData.train_losses.total_loss.toFixed(6) }}</span>
            </div>
          </div>
        </div>

        <div class="metric-card">
          <h4>✅ 验证损失</h4>
          <div class="metrics">
            <div class="metric">
              <span>Box:</span>
              <span>{{ currentTrainingData.val_losses.box_loss.toFixed(6) }}</span>
            </div>
            <div class="metric">
              <span>Obj:</span>
              <span>{{ currentTrainingData.val_losses.obj_loss.toFixed(6) }}</span>
            </div>
            <div class="metric">
              <span>Cls:</span>
              <span>{{ currentTrainingData.val_losses.cls_loss.toFixed(6) }}</span>
            </div>
            <div class="metric total">
              <span>总计:</span>
              <span>{{ currentTrainingData.val_losses.total_loss.toFixed(6) }}</span>
            </div>
          </div>
        </div>

        <div class="metric-card">
          <h4>📊 评估指标</h4>
          <div class="metrics">
            <div class="metric">
              <span>Precision:</span>
              <span>{{ (currentTrainingData.metrics.precision * 100).toFixed(2) }}%</span>
            </div>
            <div class="metric">
              <span>Recall:</span>
              <span>{{ (currentTrainingData.metrics.recall * 100).toFixed(2) }}%</span>
            </div>
            <div class="metric highlight">
              <span>mAP@0.5:</span>
              <span>{{ (currentTrainingData.metrics.mAP50 * 100).toFixed(2) }}%</span>
            </div>
            <div class="metric highlight">
              <span>mAP@0.5:0.95:</span>
              <span>{{ (currentTrainingData.metrics.mAP50_95 * 100).toFixed(2) }}%</span>
            </div>
          </div>
        </div>

        <div class="metric-card">
          <h4>⚙️ 其他信息</h4>
          <div class="metrics">
            <div class="metric">
              <span>学习率:</span>
              <span>{{ currentTrainingData.learning_rate.toFixed(6) }}</span>
            </div>
            <div class="metric">
              <span>会话ID:</span>
              <span>{{ currentSessionId || 'N/A' }}</span>
            </div>
            <div class="metric">
              <span>最后更新:</span>
              <span>{{ formatTime(currentTrainingData.timestamp) }}</span>
            </div>
          </div>
        </div>
      </div>
    </div>

    <!-- 日志区域 -->
    <div class="log-section">
      <h3>操作日志</h3>
      <div class="log-container" ref="logContainer">
        <div
          v-for="(log, index) in logs"
          :key="index"
          class="log-entry"
          :class="log.type"
        >
          <span class="log-time">{{ formatLogTime(log.timestamp) }}</span>
          <span class="log-message">{{ log.message }}</span>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, reactive, computed, onMounted, onUnmounted, nextTick } from 'vue'

// API配置
const API_BASE = 'http://localhost:5000/api'
const WS_URL = 'ws://localhost:8765'

// 响应式数据
const apiConnected = ref(false)
const wsConnected = ref(false)
const ws = ref(null)
const currentSessionId = ref(null)
const currentTrainingData = ref(null)
const logs = ref([])
const logContainer = ref(null)

// 训练配置
const config = reactive({
  model: 'yolov8n.pt',
  data: '',
  epochs: 100,
  batch: 16,
  imgsz: 640,
  device: '0'
})

// 计算属性
const hasActiveTraining = computed(() => !!currentSessionId.value)
const isConfigValid = computed(() => config.data && config.model && config.epochs > 0)
const progressPercentage = computed(() => {
  if (!currentTrainingData.value) return 0
  const { epoch, total_epochs } = currentTrainingData.value
  return (epoch / total_epochs) * 100
})

// API方法
const checkApiConnection = async () => {
  try {
    const response = await fetch(`${API_BASE}/training/status`)
    apiConnected.value = response.ok
    return response.ok
  } catch (error) {
    apiConnected.value = false
    return false
  }
}

const startTraining = async () => {
  if (!isConfigValid.value) {
    addLog('请填写完整的训练配置', 'error')
    return
  }

  try {
    addLog('正在启动训练...', 'info')

    const response = await fetch(`${API_BASE}/training/start`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(config)
    })

    const result = await response.json()

    if (result.success) {
      currentSessionId.value = result.session_id
      addLog(`训练启动成功，会话ID: ${result.session_id}`, 'success')
    } else {
      addLog(`训练启动失败: ${result.message}`, 'error')
    }
  } catch (error) {
    addLog(`API调用失败: ${error.message}`, 'error')
  }
}

const stopTraining = async () => {
  if (!currentSessionId.value) return

  try {
    addLog('正在停止训练...', 'info')

    const response = await fetch(`${API_BASE}/training/stop/${currentSessionId.value}`, {
      method: 'POST'
    })

    const result = await response.json()

    if (result.success) {
      addLog('训练已停止', 'warning')
      currentSessionId.value = null
      currentTrainingData.value = null
    } else {
      addLog(`停止训练失败: ${result.message}`, 'error')
    }
  } catch (error) {
    addLog(`API调用失败: ${error.message}`, 'error')
  }
}

const refreshStatus = async () => {
  try {
    const response = await fetch(`${API_BASE}/training/status`)
    const result = await response.json()

    if (result.success && result.data) {
      // 查找活跃的训练会话
      for (const [sessionId, sessionInfo] of Object.entries(result.data)) {
        if (sessionInfo.status === 'running' || sessionInfo.status === 'starting') {
          currentSessionId.value = sessionId
          addLog(`发现活跃训练会话: ${sessionId}`, 'info')
          break
        }
      }
    }
  } catch (error) {
    addLog(`刷新状态失败: ${error.message}`, 'error')
  }
}

// WebSocket方法
const connectWebSocket = () => {
  try {
    ws.value = new WebSocket(WS_URL)

    ws.value.onopen = () => {
      wsConnected.value = true
      addLog('WebSocket连接成功', 'success')
    }

    ws.value.onmessage = (event) => {
      const data = JSON.parse(event.data)
      handleWebSocketMessage(data)
    }

    ws.value.onclose = () => {
      wsConnected.value = false
      addLog('WebSocket连接断开', 'error')

      // 5秒后重连
      setTimeout(() => {
        if (!wsConnected.value) {
          addLog('尝试重新连接WebSocket...', 'info')
          connectWebSocket()
        }
      }, 5000)
    }

    ws.value.onerror = (error) => {
      addLog('WebSocket连接错误', 'error')
    }
  } catch (error) {
    addLog('WebSocket连接失败', 'error')
  }
}

const handleWebSocketMessage = (data) => {
  switch (data.type) {
    case 'connected':
      addLog(data.message, 'success')
      break

    case 'training_started':
      addLog(`训练开始，CSV文件: ${data.csv_path}`, 'info')
      break

    case 'training_progress':
      currentTrainingData.value = data
      // 不在日志中显示每次进度更新，避免刷屏
      break

    case 'training_completed':
      addLog(`训练完成: ${data.session_id}`, 'success')
      currentSessionId.value = null
      break

    case 'training_stopped':
      addLog(`训练已停止: ${data.session_id}`, 'warning')
      currentSessionId.value = null
      currentTrainingData.value = null
      break

    case 'training_error':
      addLog(`训练错误: ${data.error}`, 'error')
      break
  }
}

// 工具方法
const addLog = (message, type = 'info') => {
  logs.value.push({
    message,
    type,
    timestamp: new Date()
  })

  // 保持日志数量
  if (logs.value.length > 200) {
    logs.value = logs.value.slice(-150)
  }

  // 滚动到底部
  nextTick(() => {
    if (logContainer.value) {
      logContainer.value.scrollTop = logContainer.value.scrollHeight
    }
  })
}

const formatTime = (timestamp) => {
  return new Date(timestamp * 1000).toLocaleTimeString()
}

const formatLogTime = (timestamp) => {
  return timestamp.toLocaleTimeString()
}

// 定期检查连接状态
const checkConnections = async () => {
  await checkApiConnection()
}

// 生命周期
onMounted(async () => {
  // 检查API连接
  await checkApiConnection()

  // 连接WebSocket
  connectWebSocket()

  // 刷新训练状态
  await refreshStatus()

  // 定期检查连接
  setInterval(checkConnections, 10000) // 每10秒检查一次
})

onUnmounted(() => {
  if (ws.value) {
    ws.value.close()
  }
})
</script>

<style scoped>
.yolo-simple-controller {
  max-width: 1200px;
  margin: 0 auto;
  padding: 20px;
  font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
  background: #f5f5f5;
  min-height: 100vh;
}

.header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 30px;
  padding: 20px;
  background: white;
  border-radius: 12px;
  box-shadow: 0 2px 10px rgba(0,0,0,0.1);
}

.header h1 {
  color: #333;
  margin: 0;
  font-size: 28px;
}

.status-indicators {
  display: flex;
  gap: 15px;
}

.status-item {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 14px;
  color: #666;
}

.status-item.connected {
  color: #28a745;
}

.indicator {
  width: 10px;
  height: 10px;
  border-radius: 50%;
  background-color: #dc3545;
}

.status-item.connected .indicator {
  background-color: #28a745;
}

.config-section {
  background: white;
  padding: 25px;
  border-radius: 12px;
  margin-bottom: 20px;
  box-shadow: 0 2px 10px rgba(0,0,0,0.1);
}

.config-section h3 {
  margin-top: 0;
  margin-bottom: 20px;
  color: #333;
}

.config-form {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(250px, 1fr));
  gap: 20px;
}

.form-group {
  display: flex;
  flex-direction: column;
}

.form-group label {
  font-weight: bold;
  margin-bottom: 5px;
  color: #555;
}

.form-group input, .form-group select {
  padding: 10px 12px;
  border: 1px solid #ddd;
  border-radius: 6px;
  font-size: 14px;
}

.control-section {
  display: flex;
  gap: 10px;
  margin-bottom: 30px;
  flex-wrap: wrap;
}

.btn {
  padding: 12px 24px;
  border: none;
  border-radius: 6px;
  font-size: 14px;
  font-weight: bold;
  cursor: pointer;
  transition: all 0.3s ease;
}

.btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.btn-start {
  background-color: #28a745;
  color: white;
}

.btn-start:hover:not(:disabled) {
  background-color: #218838;
}

.btn-stop {
  background-color: #dc3545;
  color: white;
}

.btn-stop:hover:not(:disabled) {
  background-color: #c82333;
}

.btn-secondary {
  background-color: #6c757d;
  color: white;
}

.btn-secondary:hover:not(:disabled) {
  background-color: #545b62;
}

.training-status {
  background: white;
  padding: 25px;
  border-radius: 12px;
  margin-bottom: 30px;
  box-shadow: 0 2px 10px rgba(0,0,0,0.1);
}

.training-status h3 {
  margin-top: 0;
  margin-bottom: 20px;
  color: #333;
}

.progress-section {
  margin-bottom: 30px;
}

.progress-info {
  display: flex;
  justify-content: space-between;
  margin-bottom: 10px;
  font-weight: bold;
  color: #555;
}

.progress-bar {
  width: 100%;
  height: 20px;
  background-color: #e9ecef;
  border-radius: 10px;
  overflow: hidden;
}

.progress-fill {
  height: 100%;
  background: linear-gradient(90deg, #28a745, #20c997);
  transition: width 0.5s ease;
}

.metrics-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(280px, 1fr));
  gap: 20px;
}

.metric-card {
  background: #f8f9fa;
  padding: 20px;
  border-radius: 8px;
  border-left: 4px solid #007bff;
}

.metric-card h4 {
  margin: 0 0 15px 0;
  color: #333;
  font-size: 16px;
}

.metrics {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.metric {
  display: flex;
  justify-content: space-between;
  font-size: 14px;
}

.metric span:first-child {
  color: #666;
}

.metric span:last-child {
  font-weight: bold;
  color: #333;
}

.metric.total {
  border-top: 1px solid #dee2e6;
  padding-top: 8px;
  font-weight: bold;
}

.metric.highlight span:last-child {
  color: #28a745;
}

.log-section {
  background: white;
  padding: 20px;
  border-radius: 12px;
  box-shadow: 0 2px 10px rgba(0,0,0,0.1);
}

.log-section h3 {
  margin-bottom: 15px;
  color: #333;
}

.log-container {
  background: #1e1e1e;
  color: #d4d4d4;
  padding: 15px;
  border-radius: 8px;
  height: 250px;
  overflow-y: auto;
  font-family: 'Courier New', monospace;
  font-size: 13px;
  line-height: 1.4;
}

.log-entry {
  margin-bottom: 5px;
  padding: 2px 0;
}

.log-entry.success {
  color: #4caf50;
}

.log-entry.error {
  color: #f44336;
}

.log-entry.warning {
  color: #ff9800;
}

.log-entry.info {
  color: #2196f3;
}

.log-time {
  color: #888;
  margin-right: 10px;
}

/* 响应式设计 */
@media (max-width: 768px) {
  .yolo-simple-controller {
    padding: 10px;
  }

  .header {
    flex-direction: column;
    gap: 15px;
    text-align: center;
  }

  .config-form {
    grid-template-columns: 1fr;
  }

  .control-section {
    justify-content: center;
  }

  .metrics-grid {
    grid-template-columns: 1fr;
  }
}
</style>
