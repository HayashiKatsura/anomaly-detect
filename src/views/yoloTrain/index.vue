<template>
  <div class="yolo-simple-controller">
    <div class="header">
      <h1>🎯 YOLO训练控制器</h1>
      <div class="status-indicators">
        <div class="status-item" :class="{ connected: apiConnected }">
          <span class="indicator"></span>
          API: {{ apiConnected ? '已连接' : '未连接' }}
        </div>
        <div class="status-item" :class="{ connected: monitoringActive }">
          <span class="indicator"></span>
          监控: {{ monitoringActive ? '活跃' : '停止' }}
        </div>
      </div>
    </div>

    <!-- 训练配置 -->
    <div class="config-section" v-if="!hasActiveTraining">
      <h3>训练配置</h3>
      <div class="config-form">
        <!-- 基础配置 -->
        <div class="form-group">
          <label>模型类型:</label>
          <select v-model="config.rtd_yolo">
            <option value="yolo">YOLO</option>
            <option value="rtdetr">RT-DETR</option>
          </select>
        </div>
        <div class="form-group">
          <label>模型配置文件:</label>
          <!-- <input type="text" v-model="config.config_yaml_path" placeholder="yolov8n.pt 或模型配置文件路径" required> -->
          <select v-model="config.config_yaml_path">
            <option value="/Users/katsura/Documents/code/ultralytics/ultralytics/cfg/models/v8/yolov8.yaml">yolov8.yaml</option>
          </select>
        </div>
        <div class="form-group">
          <label>数据配置文件:</label>
          <!-- <input type="text" v-model="config.data_yaml" placeholder="path/to/dataset.yaml" required> -->
          <select v-model="config.data_yaml">
            <option value="/Users/katsura/Documents/code/ultralytics/dataset/mydata.yaml">mydata.yaml</option>
          </select>
        </div>
        <div class="form-group">
          <label>预训练权重路径:</label>
          <input type="text" v-model="config.weight_path" placeholder="可选，留空使用默认权重">
        </div>

        <!-- 训练参数 -->
        <div class="form-group">
          <label>训练轮数:</label>
          <input type="number" v-model.number="config.epochs" min="1" max="2000">
        </div>
        <div class="form-group">
          <label>批次大小:</label>
          <input type="number" v-model.number="config.batch_size" min="1" max="128">
        </div>
        <div class="form-group">
          <label>图像尺寸:</label>
          <input type="number" v-model.number="config.image_size" min="320" max="1280" step="32">
        </div>
        <div class="form-group">
          <label>学习率:</label>
          <input type="number" v-model.number="config.learning_rate" step="0.001" min="0.0001" max="1">
        </div>

        <!-- 设备和其他设置 -->
        <div class="form-group">
          <label>设备:</label>
          <input type="text" v-model="config.device" placeholder="0 (GPU) 或 cpu">
        </div>
        <div class="form-group">
          <label>冻结层数:</label>
          <input type="number" v-model.number="config.freeze" min="0" max="50" placeholder="可选，留空不冻结">
        </div>
        <div class="form-group">
          <label>项目名称:</label>
          <input type="text" v-model="config.pr_name" placeholder="可选，自动生成">
        </div>
        <div class="form-group">
          <label>描述:</label>
          <input type="text" v-model="config.desc" placeholder="可选，训练描述">
        </div>
        <div class="form-group">
          <label>保存路径:</label>
          <input type="text" v-model="config.save_path" placeholder="训练结果保存目录">
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

      <button @click="debugSession" :disabled="!currentSessionId" class="btn btn-info">
        🔍 调试信息
      </button>

      <button @click="forceCsvScan" :disabled="!currentSessionId" class="btn btn-warning">
        📁 重新扫描CSV
      </button>
    </div>

    <!-- 训练状态 -->
    <div class="training-status" v-if="hasActiveTraining">
      <h3>训练状态 - {{ currentSessionId }}</h3>

      <!-- 如果没有数据，显示提示 -->
      <div v-if="!currentTrainingData" class="no-data-warning">
        <div class="warning-content">
          <h4>⏳ 等待训练数据...</h4>
          <p>训练已启动，但尚未获取到进度数据。这可能是因为：</p>
          <ul>
            <li>训练刚刚开始，CSV文件还未生成</li>
            <li>第一个epoch还未完成</li>
            <li>文件路径检测问题</li>
          </ul>
          <div class="warning-actions">
            <button @click="debugSession" class="btn btn-small btn-info">🔍 检查状态</button>
            <button @click="forceCsvScan" class="btn btn-small btn-warning">📁 扫描文件</button>
          </div>
        </div>
      </div>

      <!-- 有数据时显示详细信息 -->
      <div v-if="currentTrainingData">
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
                <span>运行时间:</span>
                <span>{{ formatDuration(currentTrainingData.timestamp - sessionStartTime) }}</span>
              </div>
              <div class="metric">
                <span>最后更新:</span>
                <span>{{ formatTime(currentTrainingData.timestamp) }}</span>
              </div>
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
defineOptions({
  name: "YoloTrain"
});

import { ref, reactive, computed, onMounted, onUnmounted, nextTick } from 'vue'

// API配置
const API_BASE = 'http://localhost:5130/api'

// 响应式数据
const apiConnected = ref(false)
const monitoringActive = ref(false)
const currentSessionId = ref(null)
const currentTrainingData = ref(null)
const sessionStartTime = ref(null)
const logs = ref([])
const logContainer = ref(null)

// 定时器
let statusCheckInterval = null
let progressCheckInterval = null

// 训练配置
const config = reactive({
  // 必需参数
  config_yaml_path: 'yolov8n.pt',  // 模型配置文件路径
  data_yaml: '',                   // 数据配置文件路径

  // 可选参数
  weight_path: '',                 // 预训练权重路径
  pr_name: '',                     // 文件名称
  desc: '',                        // 描述
  save_path: './runs/detect',      // 训练结果保存路径
  batch_size: 8,                   // 批次大小
  epochs: 100,                     // 训练轮数
  image_size: 640,                 // 图片尺寸
  learning_rate: 0.01,             // 学习率
  device: 0,                       // 设备
  freeze: null,                    // 冻结层数
  rtd_yolo: 'yolo'                 // 模型类型
})

// 计算属性
const hasActiveTraining = computed(() => !!currentSessionId.value)
const isConfigValid = computed(() => config.data_yaml && config.config_yaml_path && config.epochs > 0)
const progressPercentage = computed(() => {
  if (!currentTrainingData.value) return 0
  const { epoch, total_epochs } = currentTrainingData.value
  return (epoch / total_epochs) * 100
})

// API方法
const checkApiConnection = async () => {
  try {
    const response = await fetch(`${API_BASE}/health`)
    const result = await response.json()
    apiConnected.value = result.success
    return result.success
  } catch (error) {
    apiConnected.value = false
    return false
  }
}

const startTraining = async () => {
  if (!isConfigValid.value) {
    addLog('请填写数据配置文件和模型配置文件', 'error')
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
      sessionStartTime.value = Date.now() / 1000
      addLog(`训练启动成功，会话ID: ${result.session_id}`, 'success')

      // 开始监控进度
      startProgressMonitoring()
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
      stopProgressMonitoring()
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
          sessionStartTime.value = sessionInfo.start_time
          addLog(`发现活跃训练会话: ${sessionId}`, 'info')

          // 开始监控进度
          startProgressMonitoring()
          break
        }
      }
    }
  } catch (error) {
    addLog(`刷新状态失败: ${error.message}`, 'error')
  }
}

const checkTrainingProgress = async () => {
  if (!currentSessionId.value) return

  try {
    const response = await fetch(`${API_BASE}/training/progress/${currentSessionId.value}`)
    const result = await response.json()

    if (result.success) {
      if (result.data) {
        currentTrainingData.value = result.data
        // 只在有实际数据时记录
        console.log(`进度更新: Epoch ${result.data.epoch}, mAP50: ${(result.data.metrics.mAP50 * 100).toFixed(1)}%`)
      } else {
        // 显示调试信息帮助诊断
        if (result.debug) {
          console.log('进度调试信息:', result.debug)

          // 如果CSV存在但没有数据，可能需要等待
          if (result.debug.csv_exists && result.debug.csv_rows === 0) {
            console.log('CSV文件存在但没有数据，继续等待...')
          }
        }
      }
    } else {
      console.error('获取进度失败:', result.message)
    }

    // 同时检查训练状态
    const statusResponse = await fetch(`${API_BASE}/training/status/${currentSessionId.value}`)
    const statusResult = await statusResponse.json()

    if (statusResult.success && statusResult.data) {
      const status = statusResult.data.status
      if (status === 'completed') {
        addLog(`训练完成: ${currentSessionId.value}`, 'success')
        stopProgressMonitoring()
      } else if (status === 'error') {
        addLog(`训练出错: ${currentSessionId.value}`, 'error')
        stopProgressMonitoring()
      } else if (status === 'stopped') {
        addLog(`训练已停止: ${currentSessionId.value}`, 'warning')
        stopProgressMonitoring()
      }
    }

  } catch (error) {
    // 静默处理错误，避免刷屏
    console.error('进度检查失败:', error)
  }
}

const startProgressMonitoring = () => {
  if (progressCheckInterval) return // 避免重复启动

  monitoringActive.value = true
  addLog('开始监控训练进度...', 'info')

  // 立即检查一次
  checkTrainingProgress()

  // 每2秒检查一次进度（比之前更频繁）
  progressCheckInterval = setInterval(checkTrainingProgress, 2000)

  // 10秒后如果还没有数据，主动触发CSV扫描
  setTimeout(() => {
    if (!currentTrainingData.value && currentSessionId.value) {
      addLog('10秒后仍无数据，自动触发CSV扫描...', 'warning')
      forceCsvScan()
    }
  }, 10000)
}

const stopProgressMonitoring = () => {
  if (progressCheckInterval) {
    clearInterval(progressCheckInterval)
    progressCheckInterval = null
  }

  monitoringActive.value = false
  currentSessionId.value = null
  currentTrainingData.value = null
  addLog('停止监控训练进度', 'info')
}

const debugSession = async () => {
  if (!currentSessionId.value) return

  try {
    const response = await fetch(`${API_BASE}/debug/${currentSessionId.value}`)
    const result = await response.json()

    if (result.success) {
      console.log('调试信息:', result.debug_data)

      // 显示调试信息到日志
      const debug = result.debug_data
      addLog('=== 调试信息 ===', 'info')
      addLog(`会话状态: ${debug.session_details?.status}`, 'info')
      addLog(`CSV路径: ${debug.session_details?.csv_path || '未设置'}`, 'info')
      addLog(`CSV存在: ${debug.csv_info?.exists || false}`, 'info')
      addLog(`CSV行数: ${debug.csv_content?.rows || 0}`, 'info')
      addLog(`保存目录: ${debug.session_details?.save_dir || '未设置'}`, 'info')

      if (debug.csv_content && debug.csv_content.last_few_rows?.length > 0) {
        addLog(`最新数据: Epoch ${debug.csv_content.last_few_rows[debug.csv_content.last_few_rows.length - 1].epoch || 'N/A'}`, 'info')
      }

    } else {
      addLog(`调试失败: ${result.error}`, 'error')
    }
  } catch (error) {
    addLog(`调试API调用失败: ${error.message}`, 'error')
  }
}

const forceCsvScan = async () => {
  if (!currentSessionId.value) return

  try {
    addLog('重新扫描CSV文件...', 'info')

    const response = await fetch(`${API_BASE}/force_csv_scan/${currentSessionId.value}`, {
      method: 'POST'
    })
    const result = await response.json()

    if (result.success) {
      addLog(`CSV扫描成功: ${result.csv_path || '未找到'}`, 'success')

      // 立即检查进度
      setTimeout(() => {
        checkTrainingProgress()
      }, 2000)
    } else {
      addLog(`CSV扫描失败: ${result.message}`, 'error')
    }
  } catch (error) {
    addLog(`CSV扫描API调用失败: ${error.message}`, 'error')
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

const formatDuration = (seconds) => {
  const hours = Math.floor(seconds / 3600)
  const minutes = Math.floor((seconds % 3600) / 60)
  const secs = Math.floor(seconds % 60)
  return `${hours}h ${minutes}m ${secs}s`
}

// 定期检查连接状态
const checkConnections = async () => {
  await checkApiConnection()
}

// 生命周期
onMounted(async () => {
  // 检查API连接
  await checkApiConnection()

  // 刷新训练状态
  await refreshStatus()

  // 定期检查连接
  statusCheckInterval = setInterval(checkConnections, 10000) // 每10秒检查一次
})

onUnmounted(() => {
  // 清理定时器
  if (statusCheckInterval) {
    clearInterval(statusCheckInterval)
  }
  if (progressCheckInterval) {
    clearInterval(progressCheckInterval)
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
  display: flex;
  flex-direction: column;
  align-items: center;
}

.header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 30px;
  padding: 25px 30px;
  background: white;
  border-radius: 12px;
  box-shadow: 0 2px 15px rgba(0,0,0,0.1);
  width: 100%;
  max-width: 1000px;
}

.header h1 {
  color: #333;
  margin: 0;
  font-size: 28px;
  font-weight: 600;
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
  padding: 30px;
  border-radius: 12px;
  margin-bottom: 25px;
  box-shadow: 0 2px 15px rgba(0,0,0,0.1);
  width: 100%;
  max-width: 1000px;
}

.config-section h3 {
  margin-top: 0;
  margin-bottom: 25px;
  color: #333;
  font-size: 20px;
  font-weight: 600;
  text-align: center;
  border-bottom: 2px solid #f0f0f0;
  padding-bottom: 10px;
}

.config-form {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(320px, 1fr));
  gap: 25px;
  align-items: start;
}

.form-group {
  display: flex;
  flex-direction: column;
}

.form-group label {
  font-weight: 600;
  margin-bottom: 8px;
  color: #555;
  font-size: 14px;
}

.form-group input, .form-group select {
  padding: 12px 15px;
  border: 2px solid #e1e5e9;
  border-radius: 8px;
  font-size: 14px;
  transition: all 0.3s ease;
  background: #fff;
}

.form-group input:focus, .form-group select:focus {
  outline: none;
  border-color: #007bff;
  box-shadow: 0 0 0 3px rgba(0, 123, 255, 0.1);
}

.form-group input[type="number"] {
  -moz-appearance: textfield;
}

.form-group input[type="number"]::-webkit-outer-spin-button,
.form-group input[type="number"]::-webkit-inner-spin-button {
  -webkit-appearance: none;
  margin: 0;
}

.control-section {
  display: flex;
  gap: 15px;
  margin-bottom: 30px;
  flex-wrap: wrap;
  justify-content: center;
  width: 100%;
  max-width: 1000px;
}

.btn {
  padding: 14px 28px;
  border: none;
  border-radius: 8px;
  font-size: 15px;
  font-weight: 600;
  cursor: pointer;
  transition: all 0.3s ease;
  min-width: 140px;
  box-shadow: 0 2px 8px rgba(0,0,0,0.1);
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

.btn-info {
  background-color: #17a2b8;
  color: white;
}

.btn-info:hover:not(:disabled) {
  background-color: #138496;
}

.btn-warning {
  background-color: #ffc107;
  color: #212529;
}

.btn-warning:hover:not(:disabled) {
  background-color: #e0a800;
}

.btn-small {
  padding: 8px 16px;
  font-size: 12px;
  min-width: auto;
}

.training-status {
  background: white;
  padding: 30px;
  border-radius: 12px;
  margin-bottom: 30px;
  box-shadow: 0 2px 15px rgba(0,0,0,0.1);
  width: 100%;
  max-width: 1000px;
}

.training-status h3 {
  margin-top: 0;
  margin-bottom: 25px;
  color: #333;
  font-size: 20px;
  font-weight: 600;
  text-align: center;
  border-bottom: 2px solid #f0f0f0;
  padding-bottom: 10px;
}

.no-data-warning {
  background: #fff3cd;
  border: 1px solid #ffeaa7;
  border-radius: 10px;
  padding: 25px;
  margin-bottom: 25px;
  border-left: 5px solid #ffc107;
}

.warning-content h4 {
  margin: 0 0 15px 0;
  color: #856404;
  font-size: 18px;
}

.warning-content p {
  color: #856404;
  margin-bottom: 10px;
}

.warning-content ul {
  color: #856404;
  margin: 10px 0 20px 20px;
}

.warning-content li {
  margin-bottom: 5px;
}

.warning-actions {
  display: flex;
  gap: 10px;
  justify-content: center;
  margin-top: 20px;
}

.progress-section {
  margin-bottom: 30px;
  padding: 20px;
  background: #f8f9fa;
  border-radius: 10px;
}

.progress-info {
  display: flex;
  justify-content: space-between;
  margin-bottom: 12px;
  font-weight: 600;
  color: #555;
  font-size: 15px;
}

.progress-bar {
  width: 100%;
  height: 24px;
  background-color: #e9ecef;
  border-radius: 12px;
  overflow: hidden;
  box-shadow: inset 0 2px 4px rgba(0,0,0,0.1);
}

.progress-fill {
  height: 100%;
  background: linear-gradient(90deg, #28a745, #20c997);
  transition: width 0.8s ease;
  border-radius: 12px;
}

.metrics-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(300px, 1fr));
  gap: 25px;
}

.metric-card {
  background: #f8f9fa;
  padding: 25px;
  border-radius: 12px;
  border-left: 5px solid #007bff;
  box-shadow: 0 2px 10px rgba(0,0,0,0.05);
  transition: transform 0.2s ease, box-shadow 0.2s ease;
}

.metric-card:hover {
  transform: translateY(-2px);
  box-shadow: 0 4px 20px rgba(0,0,0,0.1);
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
  padding: 30px;
  border-radius: 12px;
  box-shadow: 0 2px 15px rgba(0,0,0,0.1);
  width: 100%;
  max-width: 1000px;
}

.log-section h3 {
  margin-bottom: 20px;
  color: #333;
  font-size: 18px;
  font-weight: 600;
  text-align: center;
  border-bottom: 2px solid #f0f0f0;
  padding-bottom: 10px;
}

.log-container {
  background: #1e1e1e;
  color: #d4d4d4;
  padding: 20px;
  border-radius: 10px;
  height: 280px;
  overflow-y: auto;
  font-family: 'JetBrains Mono', 'Courier New', monospace;
  font-size: 13px;
  line-height: 1.5;
  border: 1px solid #333;
  box-shadow: inset 0 2px 4px rgba(0,0,0,0.3);
}

.log-container::-webkit-scrollbar {
  width: 8px;
}

.log-container::-webkit-scrollbar-track {
  background: #2a2a2a;
  border-radius: 4px;
}

.log-container::-webkit-scrollbar-thumb {
  background: #555;
  border-radius: 4px;
}

.log-container::-webkit-scrollbar-thumb:hover {
  background: #666;
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

.log-message {
  white-space: pre-wrap;
}

/* 响应式设计 */
@media (max-width: 768px) {
  .yolo-simple-controller {
    padding: 15px;
  }

  .header {
    flex-direction: column;
    gap: 15px;
    text-align: center;
    padding: 20px;
    max-width: 100%;
  }

  .header h1 {
    font-size: 24px;
  }

  .config-section, .training-status, .log-section {
    padding: 20px;
    max-width: 100%;
  }

  .config-form {
    grid-template-columns: 1fr;
    gap: 20px;
  }

  .control-section {
    flex-direction: column;
    align-items: center;
    max-width: 100%;
  }

  .btn {
    width: 100%;
    max-width: 280px;
  }

  .metrics-grid {
    grid-template-columns: 1fr;
  }

  .status-indicators {
    justify-content: center;
  }
}

@media (max-width: 480px) {
  .yolo-simple-controller {
    padding: 10px;
  }

  .header, .config-section, .training-status, .log-section {
    padding: 15px;
  }

  .header h1 {
    font-size: 20px;
  }

  .config-section h3, .training-status h3 {
    font-size: 18px;
  }
}
</style>
