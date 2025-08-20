<script setup lang="ts">
import splitpane, { ContextProps } from "@/components/ReSplitPane";
import {
  ref,
  reactive,
  computed,
  onMounted,
  onUnmounted,
  nextTick,
  watch
} from "vue";
import { ElMessname, ElNotification } from "element-plus";
import axios from "axios";
import { API_URL } from "@/url.js";
import { PlusForm } from "plus-pro-components";
import {
  Delete,
  Search,
  Upload,
  UploadFilled,
  View,
  Download,
  SetUp,
  ArrowLeft,
  ArrowRight
} from "@element-plus/icons-vue";
import { downloadByData } from "@pureadmin/utils";

defineOptions({
  name: "ModelTrain"
});

const settingLR: ContextProps = reactive({
  minPercent: 20,
  defaultPercent: 80,
  split: "vertical"
});

const settingTB: ContextProps = reactive({
  minPercent: 20,
  defaultPercent: 80,
  split: "horizontal"
});

const rules = reactive({
  name: [
    { required: true, messname: "Please input Activity name", trigger: "blur" },
    { min: 3, max: 5, messname: "Length should be 3 to 5", trigger: "blur" }
  ],
  size: [
    { required: true, messname: "请输入图像尺寸" },
    { type: "number", messname: "尺寸必须为数字" },
    {
      validator: (rule, value) => value >= 240,
      messname: "尺寸最小为240"
    }
  ]
});

const formRef = ref(null);

// 训练配置
const config = reactive({
  name: "1",
  trainData: "",
  type: "yolo",
  version: "YOLOv8",
  device: "gpu",
  size: 640,
  batch: 16,
  lr: 0.01,
  epoch: 10,
  dataset_example:'dataset'
});

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
const saveFolderId = ref(null);
const showRequireTrain = ref(true);
const showRequireTrainData = ref(false);

// 定时器
let statusCheckInterval = null;
let progressCheckInterval = null;
let waitingTimer = null;
let connectionCheckInterval = null;

// 定期检查连接状态
const checkConnections = async () => {
  await checkApiConnection();
};

// API方法
const checkApiConnection = async () => {
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 5000);

    const response = await fetch(`${API_URL}/health`, {
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
  // if (!isConfigValid.value) {
  //   addLog("请填写完整的训练配置", "error");
  //   return;
  // }

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
    // if (sanitizedConfig.freeze === null || sanitizedConfig.freeze === "") {
    //   delete sanitizedConfig.freeze;
    // }

    const response = await fetch(`${API_URL}/training/start`, {
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
    saveFolderId.value = result.save_folder_id;
    console.log("saveFolderId", saveFolderId.value);
    console.log("result", result);

    if (result.success) {
      currentSessionId.value = result.session_id;
      sessionStartTime.value = Date.now() / 1000;
      trainingPhase.value = 2;

      addLog(`训练启动成功，会话ID: ${result.session_id}`, "success");
      addLog(`保存目录: ${result.save_dir || "默认目录"}`, "info");

      // 开始监控进度
      showRequireTrain.value = false;
      showRequireTrainData.value = true;
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

// 重置表单
const resetConfig = formEl => {
  if (!formEl) return;
  formEl.resetFields();
};

const stopTraining = async () => {
  if (!currentSessionId.value || isOperationInProgress.value) return;

  try {
    isOperationInProgress.value = true;
    addLog("正在停止训练...", "info");

    const response = await fetch(
      `${API_URL}/training/stop/${currentSessionId.value}`,
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

// 计算属性
const hasActiveTraining = computed(() => !!currentSessionId.value);
const progressPercentage = computed(() => {
  if (!currentTrainingData.value) return 0;
  const { epoch, total_epochs } = currentTrainingData.value;
  return Math.min(100, (epoch - 1 / total_epochs) * 100);
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

  console.log("elapsed", elapsed);
  console.log("avgTimePerEpoch", avgTimePerEpoch);
  console.log("remainingEpochs", remainingEpochs);

  return formatDuration(avgTimePerEpoch * remainingEpochs * 3);
});

const isTrainingCompleted = computed(() => {
  return trainingPhase.value === 4;
});

// 监听训练数据变化
watch(currentTrainingData, newData => {
  if (newData) {
    showRequireTrainData.value = false;
    trainingPhase.value = 3; // 进入训练阶段
    lastProgressUpdate.value = Date.now();
    consecutiveFailures.value = 0;
    addLog(
      `进度更新: Epoch ${newData.epoch}, mAP50: ${(newData.metrics.mAP50 * 100).toFixed(1)}%`,
      "success"
    );
  }
});

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

// 新增：手动压缩训练结果的方法
const zipTrainingResults = async () => {
  if (!currentSessionId.value || isOperationInProgress.value) return;

  try {
    isOperationInProgress.value = true;
    addLog("正在压缩训练结果...", "info");

    const response = await fetch(
      `${API_URL}/training/zip/${currentSessionId.value}`,
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

    const response = await fetch(`${API_URL}/training/status`);

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
      fetch(`${API_URL}/training/progress/${currentSessionId.value}`),
      fetch(`${API_URL}/training/status/${currentSessionId.value}`)
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
    const response = await fetch(`${API_URL}/debug/${currentSessionId.value}`);

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
      `${API_URL}/force_csv_scan/${currentSessionId.value}`,
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
      `${API_URL}/training/status/${currentSessionId.value}`
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

// 文件下载
const downloadFiles = async () => {
  ElNotification.warning({
    title: "正在下载...",
    showClose: false,
    duration: 1000
  });
  // let file_name = file.file_real_name;
  let file_name = config.dataset_example;
  // console.log("saveFolderId", saveFolderId.value);
  // console.log("file_name", file_name);

  try {
    await axios
      .get(`${API_URL}/download_file/null`, {
        responseType: "blob",
        params: {dataset_example:true}
      })
      .then(({ data }) => {
        if (data.type === "application/zip") {
          file_name += ".zip";
        }
        downloadByData(data, file_name);
      });
    ElNotification.success({
      title: "下载成功",
      showClose: false,
      duration: 1000
    });
  } catch (error) {
    ElNotification.error({
      title: "下载失败",
      message: error.message,
      showClose: false,
      duration: 1000
    });
  }
};

// 文件上传
const uploadMode = ref("random");
const selectedFolderId = ref(null);
const dialogVisible = ref(false);
const uploadFileList = ref([]);
const uploading = ref(false);

// 随机上传
const openRandomUpload = () => {
  uploadMode.value = "random";
  selectedFolderId.value = null;
  dialogVisible.value = true;
};
// 指定文件夹上传
const openFolderUpload = row => {
  selectedFolderId.value = row.file_id;
  uploadMode.value = "folder";
  selectedFolderId.value = row.file_id;
  dialogVisible.value = true;
};
const closeDialog = () => {
  uploadFileList.value = [];
  dialogVisible.value = false;
  uploadMode.value = "random";
  selectedFolderId.value = null;
};
// 文件上传
const submitFilesUpload = () => {
  if (uploadFileList.value.length === 0) {
    // ElMessage.warning("请选择要上传的文件");
    return;
  }
  uploading.value = true;
  const formData = new FormData();
  uploadFileList.value.forEach(file => {
    formData.append("files", file.raw);
  });
  ElNotification.warning({
    title: "正在上传...",
    message: "",
    showClose: false,
    duration: 1000
  });

  axios
    .post(`${API_URL}/upload_file/${selectedFolderId.value}`, formData, {
      headers: { "Content-Type": "multipart/form-data" }
    })
    .then(response => {
      if (response.data.code === 200) {
        dialogVisible.value = false;
        uploadFileList.value = [];
        // getTableData();
        ElNotification.success({
          title: "上传成功",
          message: "",
          showClose: false,
          duration: 1000
        });
      } else {
        ElNotification.error({
          title: "上传失败",
          message: response.data.msg,
          showClose: false,
          duration: 1000
        });
      }
    })
    .catch(error => {
      console.error("上传错误:", error);
      ElNotification.error({
        title: "上传失败",
        message: error.response?.data?.msg || error.message || "未知错误",
        showClose: false,
        duration: 1000
      });
    })
    .finally(() => {
      uploading.value = false;
    });
};

// 文件选择变化处理
const handleFileChangeUnified = file => {
  // 定义允许的文件扩展名及分组
  const allowed = {
    archive: [".zip", ".rar", ".7z"],
    config: [".yaml", ".yml"]
  };
  const fileName = file.raw.name.toLowerCase();
  // 判断当前文件所属分组
  let fileGroup = null;
  for (const group in allowed) {
    if (allowed[group].some(ext => fileName.endsWith(ext))) {
      fileGroup = group;
      break;
    }
  }
  if (!fileGroup) {
    ElNotification.error({
      title: "文件类型不支持!",
      showClose: false,
      duration: 1000
    });
    uploadFileList.value.pop();
    return;
  }
  // 检查上传列表中是否存在文件且类型必须一致
  if (uploadFileList.value.length > 1) {
    // 取第一个文件所属分组
    const firstName = uploadFileList.value[0].raw.name.toLowerCase();
    let firstGroup = null;
    for (const group in allowed) {
      if (allowed[group].some(ext => firstName.endsWith(ext))) {
        firstGroup = group;
        break;
      }
    }
    if (firstGroup && firstGroup !== fileGroup) {
      // ElMessage.error("一次只能上传同一类型的文件!");
      uploadFileList.value.pop();
      return;
    }
  }
  // 累计总大小判断（单位：字节）
  const totalSize = uploadFileList.value.reduce(
    (sum, f) => sum + f.raw.size,
    0
  );
  if (totalSize > 104857600) {
    // ElMessage.error("总大小不能超过100MB!");
    uploadFileList.value.pop();
  }
};
</script>

<template>
  <el-card shadow="never">
    <template #header>
      <div class="card-header">
        <div class="header flex justify-between">
          <div>🎯 训练监视器</div>
          <div class="status-indicators flex space-x-5">
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

            <div v-if="!apiConnected">
              <el-button type="danger" plain @click="checkApiConnection"
                >🔄 重新连接</el-button
              >
            </div>
          </div>
        </div>
      </div>
    </template>
    <div class="split-pane">
      <splitpane :splitSet="settingLR">
        <!-- #paneL 表示指定该组件为左侧面板 -->
        <template #paneL>
          <!-- 自定义左侧面板的内容 -->
          <splitpane :splitSet="settingTB">
            <template #paneL>
              <el-scrollbar>
                <div class="dv-b">
                  <div>
                    <!-- 连接检测提示 -->
                    <!-- <div v-if="!apiConnected" class="connection-warning">
                      <div class="warning-content">
                        <h4>无法连接到训练服务器</h4>

                        <el-button
                          type="primary"
                          @click="checkApiConnection"
                          :disabled="
                            !apiConnected ||
                            !currentSessionId ||
                            isOperationInProgress
                          "
                          >{{
                            isOperationInProgress ? "停止中..." : "⏹️ 停止训练"
                          }}</el-button
                        >
                        <el-button
                          type="primary"
                          :disabled="isOperationInProgress"
                          @click="refreshStatus"
                          >🔄 刷新状态</el-button
                        >
                        <el-button
                          type="primary"
                          :disabled="!currentSessionId || isOperationInProgress"
                          @click="forceCsvScan"
                          >📁 重新扫描CSV</el-button
                        >

                        <el-button
                          type="primary"
                          :disabled="
                            !currentSessionId ||
                            isOperationInProgress ||
                            !isTrainingCompleted
                          "
                          @click="zipTrainingResults"
                        >
                          📦 下载训练结果
                        </el-button>
                        <el-button
                          type="primary"
                          :disabled="isOperationInProgress"
                          @click="resetTraining"
                        >
                          🔄 重置
                        </el-button>
                      </div>
                    </div> -->
                  </div>
                  <!-- <div> -->
                  <!-- 有数据时显示详细信息 -->
                  <div v-if="showRequireTrain" class="loader">
                    点击开始训练
                    <span />
                  </div>
                  <div v-if="showRequireTrainData" class="loader">
                    等待训练进度
                    <span />
                  </div>
                  <div v-if="currentTrainingData">
                    <div>
                      <!-- 进度条 -->
                      <div class="progress-section">
                        <div class="progress-info">
                          <span
                            >Epoch {{ currentTrainingData.epoch - 1 }}/{{
                              currentTrainingData.total_epochs
                            }}</span
                          >
                          <span
                            >{{ progressPercentage.toFixed(1) }}% ({{
                              formatDuration(trainingElapsedTime)
                            }})</span
                          >
                          <span
                            v-if="
                              currentTrainingData.epoch - 1 ===
                              currentTrainingData.total_epochs
                            "
                          >
                            <el-button type="success" @click="downloadFiles"
                              >下载训练结果</el-button
                            >
                          </span>
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
                                formatNumber(
                                  currentTrainingData.train_losses.box_loss
                                )
                              }}</span>
                            </div>
                            <div class="metric">
                              <span>Obj:</span>
                              <span>{{
                                formatNumber(
                                  currentTrainingData.train_losses.obj_loss
                                )
                              }}</span>
                            </div>
                            <div class="metric">
                              <span>Cls:</span>
                              <span>{{
                                formatNumber(
                                  currentTrainingData.train_losses.cls_loss
                                )
                              }}</span>
                            </div>
                            <div class="metric total">
                              <span>总计:</span>
                              <span>{{
                                formatNumber(
                                  currentTrainingData.train_losses.total_loss
                                )
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
                                formatNumber(
                                  currentTrainingData.val_losses.box_loss
                                )
                              }}</span>
                            </div>
                            <div class="metric">
                              <span>Obj:</span>
                              <span>{{
                                formatNumber(
                                  currentTrainingData.val_losses.obj_loss
                                )
                              }}</span>
                            </div>
                            <div class="metric">
                              <span>Cls:</span>
                              <span>{{
                                formatNumber(
                                  currentTrainingData.val_losses.cls_loss
                                )
                              }}</span>
                            </div>
                            <div class="metric total">
                              <span>总计:</span>
                              <span>{{
                                formatNumber(
                                  currentTrainingData.val_losses.total_loss
                                )
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
                                formatPercentage(
                                  currentTrainingData.metrics.precision
                                )
                              }}</span>
                            </div>
                            <div class="metric">
                              <span>Recall:</span>
                              <span>{{
                                formatPercentage(
                                  currentTrainingData.metrics.recall
                                )
                              }}</span>
                            </div>
                            <div class="metric highlight">
                              <span>mAP@0.5:</span>
                              <span>{{
                                formatPercentage(
                                  currentTrainingData.metrics.mAP50
                                )
                              }}</span>
                            </div>
                            <div class="metric highlight">
                              <span>mAP@0.5:0.95:</span>
                              <span>{{
                                formatPercentage(
                                  currentTrainingData.metrics.mAP50_95
                                )
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
                                formatNumber(
                                  currentTrainingData.learning_rate,
                                  6
                                )
                              }}</span>
                            </div>
                            <div class="metric">
                              <span>运行时间:</span>
                              <span>{{
                                formatDuration(trainingElapsedTime)
                              }}</span>
                            </div>
                            <div class="metric">
                              <span>最后更新:</span>
                              <span>{{
                                formatTime(currentTrainingData.timestamp)
                              }}</span>
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
                  </div>
                </div>
              </el-scrollbar>
            </template>

            <template #paneR>
              <el-scrollbar>
                <div class="dv-b">
                  <!-- 日志区域 -->
                  <div class="log-section">
                    <div class="log-header">
                      <el-text class="mx-1" type="info">操作日志</el-text>
                      <div class="log-controls">
                        <el-button type="info" round plain @click="clearLogs"
                          >🗑️ 清空</el-button
                        >
                        <el-button
                          type="success"
                          round
                          plain
                          @click="exportLogs"
                          >💾 导出</el-button
                        >
                      </div>
                    </div>
                    <div ref="logContainer" class="log-container">
                      <div
                        v-for="(log, index) in logs"
                        :key="index"
                        class="log-entry"
                        :class="log.type"
                      >
                        <span class="log-time">{{
                          formatLogTime(log.timestamp)
                        }}</span>
                        <span class="log-message">{{ log.message }}</span>
                      </div>
                      <div v-if="logs.length === 0" class="log-empty">
                        暂无日志记录
                      </div>
                    </div>
                  </div>
                </div>
              </el-scrollbar>
            </template>
          </splitpane>
        </template>
        <!-- #paneR 表示指定该组件为右侧面板 -->

        <template #paneR>
          <el-dialog
            v-model="dialogVisible"
            :title="uploadMode === 'folder' ? '上传到当前文件夹' : '上传数据集压缩文件'"
            width="30%"
            @close="closeDialog"
          >
            <el-upload
              v-model:file-list="uploadFileList"
              :auto-upload="false"
              :on-change="handleFileChangeUnified"
              action="#"
              class="upload-container"
              drag
              multiple
            >
              <el-icon class="el-icon--upload">
                <upload-filled />
              </el-icon>
              <div class="el-upload__text">
                拖拽文件到此处或 <em>点击上传</em>
              </div>
              <template #tip>
                <div class="el-upload__tip">
                  支持上传zip、rar、7z压缩文件，总大小不超过100MB。
                </div>
              </template>
            </el-upload>

            <template #footer>
              <span class="dialog-footer">
                <el-button @click="closeDialog">取消</el-button>
                <el-button
                  :loading="uploading"
                  type="primary"
                  @click="submitFilesUpload"
                >
                  上传
                </el-button>
              </span>
            </template>
          </el-dialog>
          <el-scrollbar>
            <div class="dv-b">
              <el-card style="height: 100vh">
                <el-form
                  ref="formRef"
                  style="max-width: 600px"
                  :model="config"
                  label-width="auto"
                  class="demo-config"
                  :rules="rules"
                >
                  <el-form-item label="项目名称" prop="name">
                    <el-input
                      v-model.number="config.name"
                      type="text"
                      autocomplete="off"
                    />
                  </el-form-item>
                  <el-form-item label="数据集" prop="trainData">
                    <el-select
                      v-model="config.trainData"
                      placeholder="Activity zone"
                    >
                      <el-option label="Zone one" value="shanghai" />
                      <el-option label="Zone two" value="beijing" />
                    </el-select>
                    <div class="flex">
                      <el-button
                        class="rounded-lg transition-all duration-200 transform hover:scale-130"
                        size="small"
                        type="text"
                        @click.stop="openRandomUpload"
                        >上传数据集</el-button
                      >
                      <el-button
                        class="rounded-lg transition-all duration-200 transform hover:scale-130"
                        size="small"
                        type="text"
                        @click.stop="downloadFiles"
                        >下载数据集样本</el-button
                      >
                    </div>
                  </el-form-item>
                  <el-form-item label="模型类型" prop="type">
                    <el-select v-model="config.type" placeholder="选择训练模型">
                      <el-option label="YOLO" value="yolo" />
                      <el-option label="RT-DETR" value="detr" />
                    </el-select>
                  </el-form-item>

                  <el-form-item label="版本" prop="version">
                    <el-select
                      v-model="config.version"
                      placeholder="选择训练版本"
                    >
                      <el-option label="YOLOv8" value="YOLOv8" />
                      <el-option label="YOLOv11" value="YOLOv11" />
                      <el-option label="YOLOv12" value="YOLOv12" />
                      <el-option label="ChipsYOLO" value="ChipsYOLO" />
                    </el-select>
                  </el-form-item>

                  <el-form-item label="训练设备" prop="device">
                    <el-select
                      v-model="config.device"
                      placeholder="选择训练设备"
                    >
                      <el-option label="CPU" value="cpu" />
                      <el-option label="GPU" value="gpu" />
                    </el-select>
                  </el-form-item>

                  <el-form-item label="图像尺寸" prop="size">
                    <el-input
                      v-model.number="config.size"
                      type="text"
                      placeholder="请输入图像尺寸"
                    />
                  </el-form-item>

                  <el-form-item label="批次大小" prop="batch">
                    <el-input
                      v-model.number="config.batch"
                      placeholder="请输入批次大小"
                    />
                  </el-form-item>

                  <el-form-item label="学习率" prop="lr">
                    <el-input
                      v-model.number="config.lr"
                      placeholder="请输入学习率"
                    />
                  </el-form-item>

                  <el-form-item label="训练次数" prop="epoch">
                    <el-input
                      v-model.number="config.epoch"
                      placeholder="请输入训练次数"
                    />
                  </el-form-item>
                  <!-- @click="submitForm(formRef)" -->
                  <el-form-item>
                    <el-button
                      type="success"
                      :disabled="
                        !apiConnected ||
                        hasActiveTraining ||
                        isOperationInProgress
                      "
                      plain
                      @click="startTraining"
                    >
                      {{
                        hasActiveTraining
                          ? "训练进行中..."
                          : isOperationInProgress
                            ? "启动中..."
                            : "🚀 开始训练"
                      }}
                    </el-button>
                    <el-button type="info" plain @click="resetConfig(formRef)"
                      >重置参数</el-button
                    >
                  </el-form-item>
                </el-form>
              </el-card>
            </div>
          </el-scrollbar>
        </template>
      </splitpane>
    </div>
  </el-card>
</template>

<style lang="scss" scoped>
.split-pane {
  width: 100%;
  height: calc(100vh - 300px);
  font-size: 50px;
  text-align: center;
  border: 1px solid #e5e6eb;

  .dv-a {
    padding-top: 30vh;
    color: rgba($color: dodgerblue, $alpha: 80%);
  }

  .dv-b {
    color: rgba($color: #000, $alpha: 80%);
  }

  .dv-c {
    padding-top: 18vh;
    color: rgba($color: #ce272d, $alpha: 80%);
  }
}

.status-indicators {
  display: flex;
  gap: 15px;
}

.indicator {
  width: 10px;
  height: 10px;
  background-color: #dc3545;
  border-radius: 50%;
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

.status-item.connected .indicator {
  background-color: #28a745;
}

.config-section,
.training-status,
.log-section {
  max-width: 100%;
  padding: 20px;
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

.log-section {
  width: 100%;
  // max-width: 1000px;
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

.log-message {
  white-space: pre-wrap;
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

.log-time {
  margin-right: 10px;
  color: #888;
}

.connection-warning {
  width: 100%;
  // max-width: 1000px;
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

.log-empty {
  padding: 20px;
  font-style: italic;
  color: #6c757d;
  text-align: center;
}

.progress-section {
  padding: 20px;
  margin-bottom: 12px;
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
  height: 12px;
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

.progress-details {
  display: flex;
  justify-content: space-between;
  margin-top: 8px;
  font-size: 12px;
  color: #6c757d;
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

.loader {
  position: absolute;
  top: 50%;
  left: 50%;
  transform: translate(-50%, -50%);
  width: 150px;
  height: 150px;
  background: transparent;
  border: 3px solid rgba(0, 102, 255, 0.1);
  border-radius: 50%;
  text-align: center;
  line-height: 150px;
  font-family: sans-serif;
  font-size: 20px;
  color: #0066ff;
  letter-spacing: 2px;
  text-transform: uppercase;
  text-shadow: 0 0 10px #0066ff;
  box-shadow: 0 0 20px rgba(0, 0, 0, 0.15);
}

.loader::before {
  content: "";
  position: absolute;
  top: -3px;
  left: -3px;
  width: 100%;
  height: 100%;
  border: 3px solid transparent;
  border-top: 3px solid #0066ff;
  border-right: 3px solid #0066ff;
  border-radius: 50%;
  animation: animateC 2s linear infinite;
}

.loader span {
  display: block;
  position: absolute;
  top: calc(50% - 2px);
  left: 50%;
  width: 50%;
  height: 4px;
  background: transparent;
  transform-origin: left;
  animation: animate 2s linear infinite;
}

.loader span::before {
  content: "";
  position: absolute;
  width: 16px;
  height: 16px;
  border-radius: 50%;
  background: #00aeff;
  top: -6px;
  right: -8px;
  box-shadow: 0 0 20px 5px #0066ff;
}

@keyframes animateC {
  0% {
    transform: rotate(0deg);
  }

  100% {
    transform: rotate(360deg);
  }
}

@keyframes animate {
  0% {
    transform: rotate(45deg);
  }

  100% {
    transform: rotate(405deg);
  }
}
</style>
