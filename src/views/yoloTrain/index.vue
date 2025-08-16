<script setup>
defineOptions({
  name: "YoloTrain"
});

import {
  ref,
  reactive,
  computed,
  onMounted,
  onUnmounted,
  nextTick,
  watch
} from "vue";

// API配置
const API_BASE = "http://10.12.44.68:5130/api";

// 响应式数据
const apiConnected = ref(false);
const monitoringActive = ref(false);
const currentSessionId = ref(null);
const currentTrainingData = ref(null);
const sessionStartTime = ref(null);
const logs = ref([]);
const logContainer = ref(null);
const isOperationInProgress = ref(false);
const lastProgressUpdate = ref(null);
const trainingPhase = ref(0); // 训练阶段：1=启动, 2=数据加载, 3=训练中, 4=完成
const waitingTime = ref(0);
const consecutiveFailures = ref(0);
const maxConsecutiveFailures = 50;
const debugInfo = ref(null);
const showDebugInfo = ref(false);

// 定时器
let statusCheckInterval = null;
let progressCheckInterval = null;
let waitingTimer = null;
let connectionCheckInterval = null;

// 训练配置
const config = reactive({
  // 必需参数
  config_yaml_path:
    "/Users/katsura/Documents/code/ultralytics/ultralytics/cfg/models/v8/yolov8.yaml",
  data_yaml: "/Users/katsura/Documents/code/ultralytics/dataset/mydata.yaml",

  // 可选参数
  weight_path: "", // 预训练权重路径
  pr_name: "", // 文件名称
  desc: "", // 描述
  save_path: "./runs/detect", // 训练结果保存路径
  batch_size: 8, // 批次大小
  epochs: 100, // 训练轮数
  image_size: 640, // 图片尺寸
  learning_rate: 0.01, // 学习率
  device: "cpu", // 设备
  freeze: null, // 冻结层数
  rtd_yolo: "yolo" // 模型类型
});

// 计算属性
const hasActiveTraining = computed(() => !!currentSessionId.value);
const isConfigValid = computed(
  () => config.data_yaml && config.config_yaml_path && config.epochs > 0
);
const progressPercentage = computed(() => {
  if (!currentTrainingData.value) return 0;
  const { epoch, total_epochs } = currentTrainingData.value;
  return Math.min(100, (epoch / total_epochs) * 100);
});

const trainingElapsedTime = computed(() => {
  if (!sessionStartTime.value) return 0;
  return Date.now() / 1000 - sessionStartTime.value;
});

const timeSinceLastUpdate = computed(() => {
  if (!lastProgressUpdate.value) return 0;
  return Math.floor((Date.now() - lastProgressUpdate.value) / 1000);
});

const isProgressHealthy = computed(() => {
  return timeSinceLastUpdate.value < 60 && consecutiveFailures.value < 10;
});

const estimatedTimeRemaining = computed(() => {
  if (!currentTrainingData.value || !sessionStartTime.value) return "N/A";

  const { epoch, total_epochs } = currentTrainingData.value;
  const elapsed = trainingElapsedTime.value;
  const avgTimePerEpoch = elapsed / epoch;
  const remainingEpochs = total_epochs - epoch;

  return formatDuration(avgTimePerEpoch * remainingEpochs);
});

const isTrainingCompleted = computed(() => {
  return trainingPhase.value === 4;
});

// 监听训练数据变化
watch(currentTrainingData, newData => {
  if (newData) {
    trainingPhase.value = 3; // 进入训练阶段
    lastProgressUpdate.value = Date.now();
    consecutiveFailures.value = 0;
    addLog(
      `进度更新: Epoch ${newData.epoch}, mAP50: ${(newData.metrics.mAP50 * 100).toFixed(1)}%`,
      "success"
    );
  }
});

// API方法
const checkApiConnection = async () => {
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 5000);

    const response = await fetch(`${API_BASE}/health`, {
      method: "GET",
      signal: controller.signal
    });

    clearTimeout(timeoutId);

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }

    const result = await response.json();
    const wasConnected = apiConnected.value;
    apiConnected.value = result.success;

    if (!wasConnected && result.success) {
      addLog("API连接已恢复", "success");
    } else if (wasConnected && !result.success) {
      addLog("API连接已断开", "error");
    }

    return result.success;
  } catch (error) {
    const wasConnected = apiConnected.value;
    apiConnected.value = false;

    if (wasConnected) {
      addLog(`API连接失败: ${error.message}`, "error");
    }

    return false;
  }
};

const startTraining = async () => {
  if (!isConfigValid.value) {
    addLog("请填写完整的训练配置", "error");
    return;
  }

  if (isOperationInProgress.value) {
    addLog("操作正在进行中，请稍候", "warning");
    return;
  }

  try {
    isOperationInProgress.value = true;
    trainingPhase.value = 1;
    addLog("正在启动训练...", "info");

    // 验证配置
    const sanitizedConfig = { ...config };
    if (sanitizedConfig.freeze === null || sanitizedConfig.freeze === "") {
      delete sanitizedConfig.freeze;
    }

    const response = await fetch(`${API_BASE}/training/start`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify(sanitizedConfig)
    });

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }

    const result = await response.json();

    if (result.success) {
      currentSessionId.value = result.session_id;
      sessionStartTime.value = Date.now() / 1000;
      trainingPhase.value = 2;

      addLog(`训练启动成功，会话ID: ${result.session_id}`, "success");
      addLog(`保存目录: ${result.save_dir || "默认目录"}`, "info");

      // 开始监控进度
      startProgressMonitoring();
    } else {
      throw new Error(result.message || "启动失败");
    }
  } catch (error) {
    addLog(`训练启动失败: ${error.message}`, "error");
    trainingPhase.value = 0;
  } finally {
    isOperationInProgress.value = false;
  }
};

const stopTraining = async () => {
  if (!currentSessionId.value || isOperationInProgress.value) return;

  try {
    isOperationInProgress.value = true;
    addLog("正在停止训练...", "info");

    const response = await fetch(
      `${API_BASE}/training/stop/${currentSessionId.value}`,
      {
        method: "POST"
      }
    );

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }

    const result = await response.json();

    if (result.success) {
      addLog("训练已停止", "warning");

      // 检查是否自动重置了
      if (result.auto_reset) {
        addLog("状态已自动重置", "info");
        // 立即执行前端重置
        resetTrainingState();
        stopProgressMonitoring();
      } else {
        // 如果后端没有自动重置，等待3秒后检查状态
        setTimeout(async () => {
          await checkTrainingStatus();
        }, 3000);
      }
    } else {
      throw new Error(result.message || "停止失败");
    }
  } catch (error) {
    addLog(`停止训练失败: ${error.message}`, "error");
  } finally {
    isOperationInProgress.value = false;
  }
};

// 新增：手动压缩训练结果的方法
const zipTrainingResults = async () => {
  if (!currentSessionId.value || isOperationInProgress.value) return;

  try {
    isOperationInProgress.value = true;
    addLog("正在压缩训练结果...", "info");

    const response = await fetch(
      `${API_BASE}/training/zip/${currentSessionId.value}`,
      {
        method: "POST"
      }
    );

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }

    const result = await response.json();

    if (result.success) {
      addLog(`压缩完成: ${result.zip_path}`, "success");
      addLog(`原始目录: ${result.save_dir}`, "info");
    } else {
      throw new Error(result.message || "压缩失败");
    }
  } catch (error) {
    addLog(`压缩失败: ${error.message}`, "error");
  } finally {
    isOperationInProgress.value = false;
  }
};

const refreshStatus = async () => {
  if (isOperationInProgress.value) return;

  try {
    isOperationInProgress.value = true;
    addLog("正在刷新状态...", "info");

    const response = await fetch(`${API_BASE}/training/status`);

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }

    const result = await response.json();

    if (result.success && result.data) {
      let foundActive = false;

      // 查找活跃的训练会话
      for (const [sessionId, sessionInfo] of Object.entries(result.data)) {
        if (["running", "starting"].includes(sessionInfo.status)) {
          currentSessionId.value = sessionId;
          sessionStartTime.value = sessionInfo.start_time;
          trainingPhase.value = sessionInfo.status === "running" ? 3 : 2;
          foundActive = true;

          addLog(
            `发现活跃训练会话: ${sessionId} (${sessionInfo.status})`,
            "info"
          );

          // 开始监控进度
          startProgressMonitoring();
          break;
        }
      }

      if (!foundActive) {
        addLog("没有发现活跃的训练会话", "info");
        resetTrainingState();
      }
    } else {
      addLog("获取状态失败", "warning");
    }
  } catch (error) {
    addLog(`刷新状态失败: ${error.message}`, "error");
  } finally {
    isOperationInProgress.value = false;
  }
};

const checkTrainingProgress = async () => {
  if (!currentSessionId.value) return;

  try {
    const [progressResponse, statusResponse] = await Promise.all([
      fetch(`${API_BASE}/training/progress/${currentSessionId.value}`),
      fetch(`${API_BASE}/training/status/${currentSessionId.value}`)
    ]);

    // 处理进度数据
    if (progressResponse.ok) {
      const progressResult = await progressResponse.json();

      // 保存调试信息
      if (progressResult.debug) {
        debugInfo.value = progressResult.debug;
      }

      if (progressResult.success && progressResult.data) {
        currentTrainingData.value = progressResult.data;
        lastProgressUpdate.value = Date.now();
        consecutiveFailures.value = 0;

        console.log(
          `进度更新: Epoch ${progressResult.data.epoch}, mAP50: ${(progressResult.data.metrics.mAP50 * 100).toFixed(1)}%`
        );
      } else {
        consecutiveFailures.value++;
        console.log(
          `进度获取失败 ${consecutiveFailures.value}/${maxConsecutiveFailures}`
        );
      }
    } else {
      consecutiveFailures.value++;
      console.log(
        `进度API失败 ${consecutiveFailures.value}/${maxConsecutiveFailures}`
      );
    }

    // 处理状态数据
    if (statusResponse.ok) {
      const statusResult = await statusResponse.json();

      if (statusResult.success && statusResult.data) {
        const status = statusResult.data.status;

        switch (status) {
          case "completed":
            addLog(`训练完成: ${currentSessionId.value}`, "success");
            addLog("训练结果已自动打包压缩", "info");
            trainingPhase.value = 4;
            stopProgressMonitoring();
            break;
          case "error":
            addLog(`训练出错: ${currentSessionId.value}`, "error");
            stopProgressMonitoring();
            break;
          case "stopped":
            addLog(`训练已停止: ${currentSessionId.value}`, "warning");
            stopProgressMonitoring();
            // 如果是停止状态，自动重置
            setTimeout(() => {
              resetTrainingState();
            }, 2000);
            break;
          case "running":
            if (trainingPhase.value < 3) {
              trainingPhase.value = 3;
            }
            break;
        }
      }
    }

    // 健康检查
    if (consecutiveFailures.value >= maxConsecutiveFailures) {
      addLog(
        `连续${maxConsecutiveFailures}次获取进度失败，可能训练已异常终止`,
        "error"
      );
      stopProgressMonitoring();
    }
  } catch (error) {
    consecutiveFailures.value++;
    console.error("进度检查失败:", error);

    if (consecutiveFailures.value >= maxConsecutiveFailures) {
      addLog("进度监控失败次数过多，停止监控", "error");
      stopProgressMonitoring();
    }
  }
};

const startProgressMonitoring = () => {
  if (progressCheckInterval) return; // 避免重复启动

  monitoringActive.value = true;
  waitingTime.value = 0;
  consecutiveFailures.value = 0; // 重置失败计数
  addLog("开始监控训练进度...", "info");

  // 立即检查一次
  checkTrainingProgress();

  // 启动等待计时器
  waitingTimer = setInterval(() => {
    waitingTime.value++;
  }, 1000);

  // 每5秒检查一次进度
  progressCheckInterval = setInterval(checkTrainingProgress, 5000);

  // 如果60秒后还没有数据，自动触发CSV扫描
  setTimeout(() => {
    if (
      !currentTrainingData.value &&
      currentSessionId.value &&
      monitoringActive.value
    ) {
      addLog("60秒后仍无数据，自动触发CSV扫描...", "warning");
      forceCsvScan();
    }
  }, 60000);
};

const stopProgressMonitoring = () => {
  if (progressCheckInterval) {
    clearInterval(progressCheckInterval);
    progressCheckInterval = null;
  }

  if (waitingTimer) {
    clearInterval(waitingTimer);
    waitingTimer = null;
  }

  monitoringActive.value = false;

  if (currentSessionId.value) {
    addLog("停止监控训练进度", "info");
  }
};

const resetTraining = () => {
  stopProgressMonitoring();
  resetTrainingState();
  addLog("训练状态已重置", "info");
};

const resetTrainingState = () => {
  currentSessionId.value = null;
  currentTrainingData.value = null;
  sessionStartTime.value = null;
  lastProgressUpdate.value = null;
  trainingPhase.value = 0;
  waitingTime.value = 0;
  consecutiveFailures.value = 0;
  debugInfo.value = null;
  showDebugInfo.value = false;
};

const debugSession = async () => {
  if (!currentSessionId.value || isOperationInProgress.value) return;

  try {
    isOperationInProgress.value = true;
    const response = await fetch(`${API_BASE}/debug/${currentSessionId.value}`);

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }

    const result = await response.json();

    if (result.success) {
      console.log("调试信息:", result.debug_data);
      debugInfo.value = result.debug_data;
      showDebugInfo.value = true;

      const debug = result.debug_data;
      addLog("=== 调试信息 ===", "info");
      addLog(`会话状态: ${debug.session_details?.status || "N/A"}`, "info");
      addLog(`CSV路径: ${debug.session_details?.csv_path || "未设置"}`, "info");
      addLog(`CSV存在: ${debug.csv_info?.exists || false}`, "info");
      addLog(`CSV行数: ${debug.csv_content?.rows || 0}`, "info");
      addLog(
        `保存目录: ${debug.session_details?.save_dir || "未设置"}`,
        "info"
      );

      if (debug.csv_content && debug.csv_content.last_few_rows?.length > 0) {
        const lastRow =
          debug.csv_content.last_few_rows[
            debug.csv_content.last_few_rows.length - 1
          ];
        addLog(`最新数据: Epoch ${lastRow.epoch || "N/A"}`, "info");
      }
    } else {
      throw new Error(result.error || "调试失败");
    }
  } catch (error) {
    addLog(`调试失败: ${error.message}`, "error");
  } finally {
    isOperationInProgress.value = false;
  }
};

const forceCsvScan = async () => {
  if (!currentSessionId.value || isOperationInProgress.value) return;

  try {
    isOperationInProgress.value = true;
    addLog("重新扫描CSV文件...", "info");

    const response = await fetch(
      `${API_BASE}/force_csv_scan/${currentSessionId.value}`,
      {
        method: "POST"
      }
    );

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }

    const result = await response.json();

    if (result.success) {
      addLog(`CSV扫描成功: ${result.csv_path || "未找到"}`, "success");

      // 2秒后检查进度
      setTimeout(() => {
        checkTrainingProgress();
      }, 2000);
    } else {
      throw new Error(result.message || "扫描失败");
    }
  } catch (error) {
    addLog(`CSV扫描失败: ${error.message}`, "error");
  } finally {
    isOperationInProgress.value = false;
  }
};

const checkTrainingStatus = async () => {
  if (!currentSessionId.value) return;

  try {
    const response = await fetch(
      `${API_BASE}/training/status/${currentSessionId.value}`
    );

    if (response.ok) {
      const result = await response.json();

      if (result.success && result.data) {
        const status = result.data.status;

        if (["completed", "error", "stopped"].includes(status)) {
          addLog(
            `训练状态已更新: ${status}`,
            status === "completed" ? "success" : "warning"
          );

          if (status === "completed") {
            trainingPhase.value = 4;
          }

          stopProgressMonitoring();
        }
      }
    }
  } catch (error) {
    console.error("检查训练状态失败:", error);
  }
};

const toggleDebugInfo = () => {
  showDebugInfo.value = !showDebugInfo.value;
};

// 工具方法
const addLog = (message, type = "info") => {
  logs.value.push({
    message,
    type,
    timestamp: new Date()
  });

  // 保持日志数量
  if (logs.value.length > 200) {
    logs.value = logs.value.slice(-150);
  }

  // 滚动到底部
  nextTick(() => {
    if (logContainer.value) {
      logContainer.value.scrollTop = logContainer.value.scrollHeight;
    }
  });
};

const clearLogs = () => {
  logs.value = [];
  addLog("日志已清空", "info");
};

const exportLogs = () => {
  const logText = logs.value
    .map(
      log =>
        `[${formatLogTime(log.timestamp)}] ${log.type.toUpperCase()}: ${log.message}`
    )
    .join("\n");

  const blob = new Blob([logText], { type: "text/plain" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `yolo_training_logs_${new Date().toISOString().slice(0, 19).replace(/:/g, "-")}.txt`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);

  addLog("日志已导出", "success");
};

const formatTime = timestamp => {
  return new Date(timestamp * 1000).toLocaleTimeString();
};

const formatLogTime = timestamp => {
  return timestamp.toLocaleTimeString();
};

const formatDuration = seconds => {
  if (seconds < 60) return `${Math.floor(seconds)}秒`;

  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const secs = Math.floor(seconds % 60);

  if (hours > 0) {
    return `${hours}小时${minutes}分钟${secs}秒`;
  } else {
    return `${minutes}分钟${secs}秒`;
  }
};

const formatNumber = (num, decimals = 6) => {
  if (typeof num !== "number") return "N/A";
  return num.toFixed(decimals);
};

const formatPercentage = num => {
  if (typeof num !== "number") return "N/A";
  return (num * 100).toFixed(2) + "%";
};

const getTrainingStatusText = () => {
  switch (trainingPhase.value) {
    case 1:
      return "启动中";
    case 2:
      return "加载数据";
    case 3:
      return "训练中";
    case 4:
      return "已完成";
    default:
      return "未知";
  }
};

// 定期检查连接状态
const checkConnections = async () => {
  await checkApiConnection();
};

// 生命周期
onMounted(async () => {
  addLog("YOLO训练控制器已启动", "info");

  // 检查API连接
  await checkApiConnection();

  // 刷新训练状态
  await refreshStatus();

  // 定期检查连接
  connectionCheckInterval = setInterval(checkConnections, 15000);
});

onUnmounted(() => {
  // 清理定时器
  if (connectionCheckInterval) {
    clearInterval(connectionCheckInterval);
  }
  if (progressCheckInterval) {
    clearInterval(progressCheckInterval);
  }
  if (waitingTimer) {
    clearInterval(waitingTimer);
  }

  addLog("YOLO训练控制器已关闭", "info");
});
</script>

<template>
  <div class="yolo-simple-controller">
    <div class="header">
      <h1>🎯 训练监视器</h1>
      <div class="status-indicators">
        <div class="status-item" :class="{ connected: apiConnected }">
          <span class="indicator" />
          API: {{ apiConnected ? "已连接" : "未连接" }}
        </div>
        <div class="status-item" :class="{ connected: monitoringActive }">
          <span class="indicator" />
          状态: {{ monitoringActive ? "活跃" : "停止" }}
        </div>
        <div v-if="hasActiveTraining" class="status-item">
          <span class="indicator training" />
          训练: {{ getTrainingStatusText() }}
        </div>
      </div>
    </div>

    <!-- 训练配置 -->
    <div v-if="!hasActiveTraining" class="config-section">
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
          <select v-model="config.config_yaml_path">
            <option
              value="/home/panxiang/coding/kweilx/ultralytics/ultralytics/cfg/models/sussess/yolo12.yaml"
            >
              yolov12.yaml
            </option>
            <option value="yolov8n.pt">yolov8n.pt (预训练)</option>
            <option value="yolov8s.pt">yolov8s.pt (预训练)</option>
            <option value="yolov8m.pt">yolov8m.pt (预训练)</option>
          </select>
        </div>
        <div class="form-group">
          <label>数据配置文件:</label>
          <select v-model="config.data_yaml">
            <option
              value="/home/panxiang/coding/kweilx/ultralytics/_project/mydata/_a_datasets/multi_class/damage_131/mydata.yaml"
            >
              mydata.yaml
            </option>
            <option value="">请选择数据配置文件...</option>
          </select>
          <div>上传数据集</div>
        </div>
        <div class="form-group">
          <label>预训练权重路径:</label>
          <input
            v-model="config.weight_path"
            type="text"
            placeholder="可选，留空使用默认权重"
          />
        </div>

        <!-- 训练参数 -->
        <div class="form-group">
          <label>训练轮数:</label>
          <input
            v-model.number="config.epochs"
            type="number"
            min="1"
            max="2000"
          />
        </div>
        <div class="form-group">
          <label>批次大小:</label>
          <input
            v-model.number="config.batch_size"
            type="number"
            min="1"
            max="128"
          />
        </div>
        <div class="form-group">
          <label>图像尺寸:</label>
          <input
            v-model.number="config.image_size"
            type="number"
            min="320"
            max="1280"
            step="32"
          />
        </div>
        <div class="form-group">
          <label>学习率:</label>
          <input
            v-model.number="config.learning_rate"
            type="number"
            step="0.001"
            min="0.0001"
            max="1"
          />
        </div>

        <!-- 设备和其他设置 -->
        <div class="form-group">
          <label>设备:</label>
          <select v-model="config.device">
            <option value="cpu">CPU</option>
            <option value="0">GPU 0</option>
            <option value="1">GPU 1</option>
          </select>
        </div>
        <div class="form-group">
          <label>冻结层数:</label>
          <input
            v-model.number="config.freeze"
            type="number"
            min="0"
            max="50"
            placeholder="可选，留空不冻结"
          />
        </div>
        <div class="form-group">
          <label>项目名称:</label>
          <input
            v-model="config.pr_name"
            type="text"
            placeholder="可选，自动生成"
          />
        </div>
        <div class="form-group">
          <label>描述:</label>
          <input
            v-model="config.desc"
            type="text"
            placeholder="可选，训练描述"
          />
        </div>
      </div>
    </div>

    <!-- 控制按钮 -->
    <div class="control-section">
      <button
        :disabled="
          !apiConnected ||
          hasActiveTraining ||
          !isConfigValid ||
          isOperationInProgress
        "
        class="btn btn-start"
        @click="startTraining"
      >
        {{
          hasActiveTraining
            ? "训练进行中..."
            : isOperationInProgress
              ? "启动中..."
              : "🚀 开始训练"
        }}
      </button>

      <button
        :disabled="!apiConnected || !currentSessionId || isOperationInProgress"
        class="btn btn-stop"
        @click="stopTraining"
      >
        {{ isOperationInProgress ? "停止中..." : "⏹️ 停止训练" }}
      </button>

      <button
        class="btn btn-secondary"
        :disabled="isOperationInProgress"
        @click="refreshStatus"
      >
        🔄 刷新状态
      </button>

      <button
        :disabled="!currentSessionId || isOperationInProgress"
        class="btn btn-info"
        @click="debugSession"
      >
        🔍 调试信息
      </button>

      <button
        :disabled="!currentSessionId || isOperationInProgress"
        class="btn btn-warning"
        @click="forceCsvScan"
      >
        📁 重新扫描CSV
      </button>

      <!-- 手动压缩按钮 -->
      <button
        :disabled="
          !currentSessionId || isOperationInProgress || !isTrainingCompleted
        "
        class="btn btn-package"
        @click="zipTrainingResults"
      >
        📦 下载训练结果
      </button>

      <button
        :disabled="isOperationInProgress"
        class="btn btn-danger"
        @click="resetTraining"
      >
        🔄 重置
      </button>
    </div>

    <!-- 连接检测提示 -->
    <div v-if="!apiConnected" class="connection-warning">
      <div class="warning-content">
        <h4>⚠️ API连接失败</h4>
        <p>无法连接到训练服务器</p>
        <button class="btn btn-small btn-info" @click="checkApiConnection">
          🔄 重新连接
        </button>
      </div>
    </div>

    <!-- 训练状态 -->
    <div v-if="hasActiveTraining" class="training-status">
      <h3>训练状态 - {{ currentSessionId }}</h3>

      <!-- 训练生命周期指示器 -->
      <div class="lifecycle-indicator">
        <div
          class="lifecycle-step"
          :class="{ active: trainingPhase >= 1, completed: trainingPhase > 1 }"
        >
          <span class="step-number">1</span>
          <span class="step-text">训练启动</span>
        </div>
        <div
          class="lifecycle-step"
          :class="{ active: trainingPhase >= 2, completed: trainingPhase > 2 }"
        >
          <span class="step-number">2</span>
          <span class="step-text">数据加载</span>
        </div>
        <div
          class="lifecycle-step"
          :class="{ active: trainingPhase >= 3, completed: trainingPhase > 3 }"
        >
          <span class="step-number">3</span>
          <span class="step-text">模型训练</span>
        </div>
        <div class="lifecycle-step" :class="{ active: trainingPhase >= 4 }">
          <span class="step-number">4</span>
          <span class="step-text">训练完成</span>
        </div>
      </div>

      <!-- 调试信息显示 -->
      <div v-if="debugInfo && showDebugInfo" class="debug-info">
        <h4>🔍 调试信息</h4>
        <div class="debug-details">
          <p>
            <strong>会话存在:</strong>
            {{ debugInfo.session_exists ? "是" : "否" }}
          </p>
          <p><strong>CSV路径:</strong> {{ debugInfo.csv_path || "未找到" }}</p>
          <p><strong>状态:</strong> {{ debugInfo.status || "未知" }}</p>
          <p><strong>连续失败次数:</strong> {{ consecutiveFailures }}</p>
          <p>
            <strong>最后更新:</strong>
            {{
              lastProgressUpdate ? formatTime(lastProgressUpdate / 1000) : "无"
            }}
          </p>
        </div>
      </div>

      <!-- 等待数据提示 -->
      <div
        v-if="!currentTrainingData && !isTrainingCompleted"
        class="no-data-warning"
      >
        <div class="warning-content">
          <h4>⏳ 等待训练数据...</h4>
          <p>训练已启动，但尚未获取到进度数据。这可能是因为：</p>
          <ul>
            <li>训练刚刚开始，CSV文件还未生成 ({{ waitingTime }}秒)</li>
            <li>第一个epoch还未完成</li>
            <li>文件路径检测问题</li>
          </ul>
          <div class="waiting-progress">
            <div
              class="waiting-bar"
              :style="{ width: Math.min(100, (waitingTime / 60) * 100) + '%' }"
            />
          </div>
          <div class="warning-actions">
            <button
              class="btn btn-small btn-info"
              :disabled="isOperationInProgress"
              @click="debugSession"
            >
              🔍 检查状态
            </button>
            <button
              class="btn btn-small btn-warning"
              :disabled="isOperationInProgress"
              @click="forceCsvScan"
            >
              📁 扫描文件
            </button>
            <button
              class="btn btn-small btn-secondary"
              @click="toggleDebugInfo"
            >
              {{ showDebugInfo ? "隐藏" : "显示" }}调试
            </button>
          </div>
        </div>
      </div>

      <!-- 有数据时显示详细信息 -->
      <div v-if="currentTrainingData">
        <!-- 进度条 -->
        <div class="progress-section">
          <div class="progress-info">
            <span
              >Epoch {{ currentTrainingData.epoch }}/{{
                currentTrainingData.total_epochs
              }}</span
            >
            <span
              >{{ progressPercentage.toFixed(1) }}% ({{
                formatDuration(trainingElapsedTime)
              }})</span
            >
          </div>
          <div class="progress-bar">
            <div
              class="progress-fill"
              :style="{ width: progressPercentage + '%' }"
            />
          </div>
          <div class="progress-details">
            <span>预计剩余: {{ estimatedTimeRemaining }}</span>
            <span>更新间隔: {{ timeSinceLastUpdate }}秒前</span>
          </div>
        </div>

        <!-- 指标卡片 -->
        <div class="metrics-grid">
          <div class="metric-card">
            <h4>🔥 训练损失</h4>
            <div class="metrics">
              <div class="metric">
                <span>Box:</span>
                <span>{{
                  formatNumber(currentTrainingData.train_losses.box_loss)
                }}</span>
              </div>
              <div class="metric">
                <span>Obj:</span>
                <span>{{
                  formatNumber(currentTrainingData.train_losses.obj_loss)
                }}</span>
              </div>
              <div class="metric">
                <span>Cls:</span>
                <span>{{
                  formatNumber(currentTrainingData.train_losses.cls_loss)
                }}</span>
              </div>
              <div class="metric total">
                <span>总计:</span>
                <span>{{
                  formatNumber(currentTrainingData.train_losses.total_loss)
                }}</span>
              </div>
            </div>
          </div>

          <div class="metric-card">
            <h4>✅ 验证损失</h4>
            <div class="metrics">
              <div class="metric">
                <span>Box:</span>
                <span>{{
                  formatNumber(currentTrainingData.val_losses.box_loss)
                }}</span>
              </div>
              <div class="metric">
                <span>Obj:</span>
                <span>{{
                  formatNumber(currentTrainingData.val_losses.obj_loss)
                }}</span>
              </div>
              <div class="metric">
                <span>Cls:</span>
                <span>{{
                  formatNumber(currentTrainingData.val_losses.cls_loss)
                }}</span>
              </div>
              <div class="metric total">
                <span>总计:</span>
                <span>{{
                  formatNumber(currentTrainingData.val_losses.total_loss)
                }}</span>
              </div>
            </div>
          </div>

          <div class="metric-card">
            <h4>📊 评估指标</h4>
            <div class="metrics">
              <div class="metric">
                <span>Precision:</span>
                <span>{{
                  formatPercentage(currentTrainingData.metrics.precision)
                }}</span>
              </div>
              <div class="metric">
                <span>Recall:</span>
                <span>{{
                  formatPercentage(currentTrainingData.metrics.recall)
                }}</span>
              </div>
              <div class="metric highlight">
                <span>mAP@0.5:</span>
                <span>{{
                  formatPercentage(currentTrainingData.metrics.mAP50)
                }}</span>
              </div>
              <div class="metric highlight">
                <span>mAP@0.5:0.95:</span>
                <span>{{
                  formatPercentage(currentTrainingData.metrics.mAP50_95)
                }}</span>
              </div>
            </div>
          </div>

          <div class="metric-card">
            <h4>⚙️ 其他信息</h4>
            <div class="metrics">
              <div class="metric">
                <span>学习率:</span>
                <span>{{
                  formatNumber(currentTrainingData.learning_rate, 6)
                }}</span>
              </div>
              <div class="metric">
                <span>运行时间:</span>
                <span>{{ formatDuration(trainingElapsedTime) }}</span>
              </div>
              <div class="metric">
                <span>最后更新:</span>
                <span>{{ formatTime(currentTrainingData.timestamp) }}</span>
              </div>
              <div class="metric">
                <span>监控状态:</span>
                <span
                  :class="{
                    'text-success': isProgressHealthy,
                    'text-danger': !isProgressHealthy
                  }"
                >
                  {{ isProgressHealthy ? "正常" : "异常" }}
                </span>
              </div>
            </div>
          </div>
        </div>
      </div>

      <!-- 训练完成状态 -->
      <div v-if="isTrainingCompleted" class="completion-status">
        <div class="completion-content">
          <h4>✅ 训练已完成</h4>
          <p>训练会话 {{ currentSessionId }} 已成功完成</p>
          <div class="completion-info">
            <p>🗜️ 训练结果已自动打包压缩</p>
            <p>📦 可以手动点击"压缩结果"按钮重新打包</p>
          </div>
          <div class="completion-actions">
            <button
              class="btn btn-package"
              :disabled="isOperationInProgress"
              @click="zipTrainingResults"
            >
              📦 重新压缩
            </button>
            <button class="btn btn-secondary" @click="resetTraining">
              🔄 开始新的训练
            </button>
          </div>
        </div>
      </div>
    </div>

    <!-- 日志区域 -->
    <div class="log-section">
      <div class="log-header">
        <h3>操作日志</h3>
        <div class="log-controls">
          <button class="btn btn-small btn-secondary" @click="clearLogs">
            🗑️ 清空
          </button>
          <button class="btn btn-small btn-info" @click="exportLogs">
            💾 导出
          </button>
        </div>
      </div>
      <div ref="logContainer" class="log-container">
        <div
          v-for="(log, index) in logs"
          :key="index"
          class="log-entry"
          :class="log.type"
        >
          <span class="log-time">{{ formatLogTime(log.timestamp) }}</span>
          <span class="log-message">{{ log.message }}</span>
        </div>
        <div v-if="logs.length === 0" class="log-empty">暂无日志记录</div>
      </div>
    </div>
  </div>
</template>

<style scoped>


@keyframes pulse {
  0%,
  100% {
    opacity: 1;
  }

  50% {
    opacity: 0.5;
  }
}

/* 响应式设计 */
@media (width <= 768px) {
  .yolo-simple-controller {
    padding: 15px;
  }

  .header {
    flex-direction: column;
    gap: 15px;
    max-width: 100%;
    padding: 20px;
    text-align: center;
  }

  .header h1 {
    font-size: 24px;
  }

  .config-section,
  .training-status,
  .log-section {
    max-width: 100%;
    padding: 20px;
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

  .lifecycle-indicator {
    flex-direction: column;
    gap: 15px;
  }

  .lifecycle-step:not(:last-child)::after {
    display: none;
  }
}

@media (width <= 480px) {
  .yolo-simple-controller {
    padding: 10px;
  }

  .header,
  .config-section,
  .training-status,
  .log-section {
    padding: 15px;
  }

  .header h1 {
    font-size: 20px;
  }

  .config-section h3,
  .training-status h3 {
    font-size: 18px;
  }
}

.debug-info {
  padding: 15px;
  margin-bottom: 20px;
  background: #e3f2fd;
  border: 1px solid #90caf9;
  border-radius: 8px;
}

.debug-info h4 {
  margin: 0 0 10px;
  color: #1565c0;
}

.debug-details {
  font-size: 13px;
  color: #1976d2;
}

.debug-details p {
  margin: 5px 0;
}

/* 完成状态信息样式 */
.completion-info {
  padding: 15px;
  margin: 15px 0;
  background: #e8f5e8;
  border: 1px solid #c3e6cb;
  border-radius: 8px;
}

.completion-info p {
  margin: 5px 0;
  font-size: 14px;
  color: #155724;
}

/* 新增按钮样式 */
.btn-package {
  color: white;
  background-color: #6f42c1;
}

.btn-package:hover:not(:disabled) {
  background-color: #5a32a3;
}

/* 原有样式 */
.yolo-simple-controller {
  display: flex;
  flex-direction: column;
  align-items: center;
  max-width: 1200px;
  min-height: 100vh;
  padding: 20px;
  margin: 0 auto;
  font-family: "Segoe UI", Tahoma, Geneva, Verdana, sans-serif;
  background: #f5f5f5;
}

.header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  width: 100%;
  max-width: 1000px;
  padding: 25px 30px;
  margin-bottom: 30px;
  background: white;
  border-radius: 12px;
  box-shadow: 0 2px 15px rgb(0 0 0 / 10%);
}

.header h1 {
  margin: 0;
  font-size: 28px;
  font-weight: 600;
  color: #333;
}

.status-indicators {
  display: flex;
  gap: 15px;
}

.status-item {
  display: flex;
  gap: 8px;
  align-items: center;
  font-size: 14px;
  color: #666;
}

.status-item.connected {
  color: #28a745;
}

.indicator {
  width: 10px;
  height: 10px;
  background-color: #dc3545;
  border-radius: 50%;
}

.status-item.connected .indicator {
  background-color: #28a745;
}

.indicator.training {
  background-color: #007bff;
  animation: pulse 2s infinite;
}

.connection-warning {
  width: 100%;
  max-width: 1000px;
  padding: 25px;
  margin-bottom: 25px;
  background: #f8d7da;
  border: 1px solid #f5c6cb;
  border-left: 5px solid #dc3545;
  border-radius: 10px;
}

.connection-warning .warning-content h4 {
  margin: 0 0 15px;
  font-size: 18px;
  color: #721c24;
}

.connection-warning .warning-content p {
  margin-bottom: 10px;
  color: #721c24;
}

.connection-warning .warning-content ul {
  margin: 10px 0 20px 20px;
  color: #721c24;
}

.lifecycle-indicator {
  display: flex;
  justify-content: space-between;
  padding: 20px;
  margin-bottom: 30px;
  background: #f8f9fa;
  border-radius: 10px;
}

.lifecycle-step {
  position: relative;
  display: flex;
  flex: 1;
  flex-direction: column;
  align-items: center;
}

.lifecycle-step:not(:last-child)::after {
  position: absolute;
  top: 15px;
  right: -50%;
  z-index: 1;
  width: 100%;
  height: 2px;
  content: "";
  background-color: #dee2e6;
}

.lifecycle-step.active:not(:last-child)::after,
.lifecycle-step.completed:not(:last-child)::after {
  background-color: #28a745;
}

.step-number {
  position: relative;
  z-index: 2;
  display: flex;
  align-items: center;
  justify-content: center;
  width: 30px;
  height: 30px;
  font-weight: bold;
  color: #6c757d;
  background-color: #dee2e6;
  border-radius: 50%;
}

.lifecycle-step.active .step-number {
  color: white;
  background-color: #007bff;
}

.lifecycle-step.completed .step-number {
  color: white;
  background-color: #28a745;
}

.step-text {
  margin-top: 8px;
  font-size: 12px;
  color: #6c757d;
  text-align: center;
}

.lifecycle-step.active .step-text,
.lifecycle-step.completed .step-text {
  font-weight: 600;
  color: #333;
}

.waiting-progress {
  width: 100%;
  height: 8px;
  margin: 15px 0;
  overflow: hidden;
  background-color: #e9ecef;
  border-radius: 4px;
}

.waiting-bar {
  height: 100%;
  background: linear-gradient(90deg, #ffc107, #fd7e14);
  border-radius: 4px;
  transition: width 1s ease;
}

.progress-details {
  display: flex;
  justify-content: space-between;
  margin-top: 8px;
  font-size: 12px;
  color: #6c757d;
}

.completion-status {
  padding: 25px;
  margin-bottom: 25px;
  background: #d4edda;
  border: 1px solid #c3e6cb;
  border-left: 5px solid #28a745;
  border-radius: 10px;
}

.completion-content h4 {
  margin: 0 0 15px;
  font-size: 18px;
  color: #155724;
}

.completion-content p {
  margin-bottom: 20px;
  color: #155724;
}

.completion-actions {
  display: flex;
  gap: 10px;
  justify-content: center;
}

.log-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 20px;
}

.log-controls {
  display: flex;
  gap: 10px;
}

.log-empty {
  padding: 20px;
  font-style: italic;
  color: #6c757d;
  text-align: center;
}

.text-success {
  color: #28a745 !important;
}

.text-danger {
  color: #dc3545 !important;
}

.btn-danger {
  color: white;
  background-color: #dc3545;
}

.btn-danger:hover:not(:disabled) {
  background-color: #c82333;
}

.config-section {
  width: 100%;
  max-width: 1000px;
  padding: 30px;
  margin-bottom: 25px;
  background: white;
  border-radius: 12px;
  box-shadow: 0 2px 15px rgb(0 0 0 / 10%);
}

.config-section h3 {
  padding-bottom: 10px;
  margin-top: 0;
  margin-bottom: 25px;
  font-size: 20px;
  font-weight: 600;
  color: #333;
  text-align: center;
  border-bottom: 2px solid #f0f0f0;
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
  margin-bottom: 8px;
  font-size: 14px;
  font-weight: 600;
  color: #555;
}

.form-group input,
.form-group select {
  padding: 12px 15px;
  font-size: 14px;
  background: #fff;
  border: 2px solid #e1e5e9;
  border-radius: 8px;
  transition: all 0.3s ease;
}

.form-group input:focus,
.form-group select:focus {
  outline: none;
  border-color: #007bff;
  box-shadow: 0 0 0 3px rgb(0 123 255 / 10%);
}

.control-section {
  display: flex;
  flex-wrap: wrap;
  gap: 15px;
  justify-content: center;
  width: 100%;
  max-width: 1000px;
  margin-bottom: 30px;
}

.btn {
  min-width: 140px;
  padding: 14px 28px;
  font-size: 15px;
  font-weight: 600;
  cursor: pointer;
  border: none;
  border-radius: 8px;
  box-shadow: 0 2px 8px rgb(0 0 0 / 10%);
  transition: all 0.3s ease;
}

.btn:disabled {
  cursor: not-allowed;
  opacity: 0.5;
}

.btn-start {
  color: white;
  background-color: #28a745;
}

.btn-start:hover:not(:disabled) {
  background-color: #218838;
}

.btn-stop {
  color: white;
  background-color: #dc3545;
}

.btn-stop:hover:not(:disabled) {
  background-color: #c82333;
}

.btn-secondary {
  color: white;
  background-color: #6c757d;
}

.btn-secondary:hover:not(:disabled) {
  background-color: #545b62;
}

.btn-info {
  color: white;
  background-color: #17a2b8;
}

.btn-info:hover:not(:disabled) {
  background-color: #138496;
}

.btn-warning {
  color: #212529;
  background-color: #ffc107;
}

.btn-warning:hover:not(:disabled) {
  background-color: #e0a800;
}

.btn-small {
  min-width: auto;
  padding: 8px 16px;
  font-size: 12px;
}

.training-status {
  width: 100%;
  max-width: 1000px;
  padding: 30px;
  margin-bottom: 30px;
  background: white;
  border-radius: 12px;
  box-shadow: 0 2px 15px rgb(0 0 0 / 10%);
}

.training-status h3 {
  padding-bottom: 10px;
  margin-top: 0;
  margin-bottom: 25px;
  font-size: 20px;
  font-weight: 600;
  color: #333;
  text-align: center;
  border-bottom: 2px solid #f0f0f0;
}

.no-data-warning {
  padding: 25px;
  margin-bottom: 25px;
  background: #fff3cd;
  border: 1px solid #ffeaa7;
  border-left: 5px solid #ffc107;
  border-radius: 10px;
}

.warning-content h4 {
  margin: 0 0 15px;
  font-size: 18px;
  color: #856404;
}

.warning-content p {
  margin-bottom: 10px;
  color: #856404;
}

.warning-content ul {
  margin: 10px 0 20px 20px;
  color: #856404;
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
  padding: 20px;
  margin-bottom: 30px;
  background: #f8f9fa;
  border-radius: 10px;
}

.progress-info {
  display: flex;
  justify-content: space-between;
  margin-bottom: 12px;
  font-size: 15px;
  font-weight: 600;
  color: #555;
}

.progress-bar {
  width: 100%;
  height: 24px;
  overflow: hidden;
  background-color: #e9ecef;
  border-radius: 12px;
  box-shadow: inset 0 2px 4px rgb(0 0 0 / 10%);
}

.progress-fill {
  height: 100%;
  background: linear-gradient(90deg, #28a745, #20c997);
  border-radius: 12px;
  transition: width 0.8s ease;
}

.metrics-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(300px, 1fr));
  gap: 25px;
}

.metric-card {
  padding: 25px;
  background: #f8f9fa;
  border-left: 5px solid #007bff;
  border-radius: 12px;
  box-shadow: 0 2px 10px rgb(0 0 0 / 5%);
  transition:
    transform 0.2s ease,
    box-shadow 0.2s ease;
}

.metric-card:hover {
  box-shadow: 0 4px 20px rgb(0 0 0 / 10%);
  transform: translateY(-2px);
}

.metric-card h4 {
  margin: 0 0 15px;
  font-size: 16px;
  color: #333;
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
  padding-top: 8px;
  font-weight: bold;
  border-top: 1px solid #dee2e6;
}

.metric.highlight span:last-child {
  color: #28a745;
}

.log-section {
  width: 100%;
  max-width: 1000px;
  padding: 30px;
  background: white;
  border-radius: 12px;
  box-shadow: 0 2px 15px rgb(0 0 0 / 10%);
}

.log-section h3 {
  padding-bottom: 10px;
  margin-bottom: 20px;
  font-size: 18px;
  font-weight: 600;
  color: #333;
  text-align: center;
  border-bottom: 2px solid #f0f0f0;
}

.log-container {
  height: 280px;
  padding: 20px;
  overflow-y: auto;
  font-family: "JetBrains Mono", "Courier New", monospace;
  font-size: 13px;
  line-height: 1.5;
  color: #d4d4d4;
  background: #1e1e1e;
  border: 1px solid #333;
  border-radius: 10px;
  box-shadow: inset 0 2px 4px rgb(0 0 0 / 30%);
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
  padding: 2px 0;
  margin-bottom: 5px;
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
  margin-right: 10px;
  color: #888;
}

.log-message {
  white-space: pre-wrap;
}

/* 调试信息样式 */
</style>
