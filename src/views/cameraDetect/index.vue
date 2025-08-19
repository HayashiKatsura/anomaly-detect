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
  ArrowRight,
  Camera
} from "@element-plus/icons-vue";
import { downloadByData } from "@pureadmin/utils";

defineOptions({
  name: "CameraDetect"
});

const settingLR: ContextProps = reactive({
  minPercent: 20,
  defaultPercent: 70,
  split: "vertical"
});

const settingTB: ContextProps = reactive({
  minPercent: 20,
  defaultPercent: 80,
  split: "horizontal"
});

// 响应式数据
const videoRef = ref(null);
const canvasRef = ref(null);
const isCameraOn = ref(false);
const photoMode = ref("manual"); // 'manual' | 'auto'
const autoInterval = ref(3); // 自动拍照间隔（秒）
const isAutoPhotoActive = ref(false);
const currentCapturedImages = ref([]); // 当前已拍摄的图片列表
const totalCapturedImages = ref(0); // 总共已拍摄的图片数量
const showFlash = ref(false);
const isUploading = ref(false);
const error = ref("");
const collectData = ref([]);
const totalCollectData = ref([]);
const allData = ref([]);
const conf = ref(0.25);
const modelOptions = ref([]);
const modelValue = ref(""); // 先给空值
const weightsData = ref([]);
const multipleTableRef = ref(null);
const multipleSelection = ref([]);
const detectTableData = ref([]);
const toBeDetectedIds = ref([]); //待检测的图像id
const handleSelectionChange = val => {
  multipleSelection.value = val;
  console.log("val", val);
  // toBeDetectedIds.value = val.map(item => item.file_id);
  // console.log("toBeDetectedIds", toBeDetectedIds.value);
};

// 定时器
let stream = null;
let autoPhotoTimer = null;

// 获取权重信息
const getTableData = () => {
  axios
    .get(API_URL + "/show_storage/weights,cameras", { responseType: "text" })
    .then(res => {
      try {
        const data = JSON.parse(res.data);
        if (data.length === 0) {
          allData.value = [];
          totalCollectData.value = [];
          return;
        } else {
          allData.value = data.data;
          weightsData.value = allData.value.filter(
            item => item.file_comment == "upload_weights"
          );
          console.log("weightsData", weightsData.value);
          modelOptions.value = weightsData.value.map(item => ({
            value: item.file_id,
            label: item.file_real_name
          }));
          if (modelOptions.value.length > 0) {
            modelValue.value = modelOptions.value[0].value;
          }
          totalCollectData.value = allData.value.filter(item =>
            item.file_comment.includes("camera")
          );
          console.log("totalCollectData", totalCollectData.value);
        }
      } catch (error) {
        console.error("解析CSV数据失败:", error);
      }
    })
    .catch(error => {
      console.error("加载CSV文件失败:", error);
    });
};

// 开启/关闭摄像头
const toggleCamera = async () => {
  if (isCameraOn.value) {
    await stopCamera();
  } else {
    await startCamera();
  }
};

// 启动摄像头
const startCamera = async () => {
  try {
    error.value = "";
    stream = await navigator.mediaDevices.getUserMedia({
      //摄像头分辨率配置
      video: {
        width: { ideal: 1280 },
        height: { ideal: 720 },
        facingMode: "user"
      },
      audio: false
    });

    if (videoRef.value) {
      videoRef.value.srcObject = stream;
      isCameraOn.value = true;
    }
  } catch (err) {
    console.error("启动摄像头失败:", err);

    error.value = "";
    ElNotification.error({
      title: "无法访问摄像头，请检查权限设置",
      showClose: false,
      duration: 1000
    });
  }
};

// 停止摄像头
const stopCamera = () => {
  if (stream) {
    stream.getTracks().forEach(track => track.stop());
    stream = null;
  }

  if (videoRef.value) {
    videoRef.value.srcObject = null;
  }

  isCameraOn.value = false;
  stopAutoPhoto();
};

// 设置拍照模式
const setPhotoMode = mode => {
  photoMode.value = mode;
  if (mode === "manual") {
    stopAutoPhoto();
  }
};

// 拍照功能
const takePhoto = () => {
  if (!videoRef.value || !canvasRef.value) return;

  const video = videoRef.value;
  const canvas = canvasRef.value;
  const ctx = canvas.getContext("2d");

  // 设置canvas尺寸，实际拍照分辨率，拍照时使用的是摄像头的实际分辨率
  canvas.width = video.videoWidth;
  canvas.height = video.videoHeight;

  // 绘制当前视频帧到canvas
  ctx.drawImage(video, 0, 0, canvas.width, canvas.height);

  // 转换为base64
  const dataUrl = canvas.toDataURL("image/jpeg", 0.8);
  const timestamp = getFormattedTimestamp();
  const shortUuid = generateShortUuid();

  // 添加到拍摄列表
  currentCapturedImages.value.push({
    dataUrl,
    timestamp: timestamp,
    blob: dataURLtoBlob(dataUrl),
    name: `camera-collect-${timestamp}-${shortUuid}.png`,
    file_id: `images-${timestamp}-${shortUuid}`
  });

  // 添加到数据列表
  collectData.value.push({
    name: `camera-collect-${shortUuid}.png`,
    date: timestamp,
    status: false, // 检测状态，默认未检测
    file_id: `images-${timestamp}-${shortUuid}`
  });

  //计数列表
  totalCapturedImages.value += 1;

  // 显示拍照闪光效果
  showFlash.value = true;
  setTimeout(() => {
    showFlash.value = false;
  }, 200);

  // 检查是否需要自动上传
  if (currentCapturedImages.value.length >= 10) {
    autoUploadImages();
  }
};

// 开始/停止自动拍照
const toggleAutoPhoto = () => {
  if (isAutoPhotoActive.value) {
    stopAutoPhoto();
  } else {
    startAutoPhoto();
  }
};

const startAutoPhoto = () => {
  if (autoPhotoTimer) return;

  isAutoPhotoActive.value = true;
  autoPhotoTimer = setInterval(() => {
    takePhoto();
  }, autoInterval.value * 1000);
};

const stopAutoPhoto = () => {
  if (autoPhotoTimer) {
    clearInterval(autoPhotoTimer);
    autoPhotoTimer = null;
  }
  isAutoPhotoActive.value = false;
};

// 删除单张图片
const removeImage = index => {
  currentCapturedImages.value.splice(index, 1);
};

// 清空所有图片
const clearAllImages = () => {
  totalCapturedImages.value -= currentCapturedImages.value.length;
  currentCapturedImages.value = [];
  collectData.value = [];
};

// 手动上传
const manualUpload = () => {
  if (currentCapturedImages.value.length > 0) {
    autoUploadImages();
  }
};

// 自动上传图片到后端
const autoUploadImages = async () => {
  if (isUploading.value || currentCapturedImages.value.length === 0) return;

  isUploading.value = true;
  error.value = "";

  try {
    const formData = new FormData();
    // 添加所有图片到FormData
    currentCapturedImages.value.forEach((image, index) => {
      formData.append("files", image.blob, `${image.file_id},${image.name}`);
      toBeDetectedIds.value.push(image.file_id);
    });

    // 添加元数据
    formData.append("total_count", currentCapturedImages.value.length);
    formData.append("upload_time", new Date().toISOString());

    // 发送到后端 - 请根据实际后端API修改URL
    const response = await axios.post(`${API_URL}/upload_file/null`, formData, {
      headers: {
        "Content-Type": "multipart/form-data"
      }
    });
    // 上传成功后清空图片列表
    currentCapturedImages.value = [];
    ElNotification.success({
      title: "上传成功",
      showClose: false,
      duration: 1000
    });

    detectFiles();
  } catch (err) {
    console.error("上传错误:", err);
    error.value = "上传失败，请稍后重试";
    ElNotification.success({
      title: "上传失败",
      message: `上传失败，${err}`,
      showClose: false,
      duration: 1000
    });
  } finally {
    isUploading.value = false;
    getTableData();
    toBeDetectedIds.value = [];
  }
};

// 工具函数：dataURL转Blob
const dataURLtoBlob = dataurl => {
  const arr = dataurl.split(",");
  const mime = arr[0].match(/:(.*?);/)[1];
  const bstr = atob(arr[1]);
  let n = bstr.length;
  const u8arr = new Uint8Array(n);
  while (n--) {
    u8arr[n] = bstr.charCodeAt(n);
  }
  return new Blob([u8arr], { type: mime });
};

// 生成格式化时间戳 (yyyyMMddHHmmss)
const getFormattedTimestamp = () => {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");
  const hours = String(now.getHours()).padStart(2, "0");
  const minutes = String(now.getMinutes()).padStart(2, "0");
  const seconds = String(now.getSeconds()).padStart(2, "0");
  return `${year}${month}${day}${hours}${minutes}${seconds}`;
};

// 生成UUID前10位
const generateShortUuid = (index = 10) => {
  if (crypto.randomUUID) {
    // 现代浏览器支持
    if (index > 0) return crypto.randomUUID().substring(0, index);
    return crypto.randomUUID();
  } else {
    // 兼容性方案
    if (index > 0)
      return "xxxxxxxxxxxx"
        .replace(/[x]/g, function () {
          return ((Math.random() * 16) | 0).toString(16);
        })
        .substring(0, index);
    return "xxxxxxxxxxxx".replace(/[x]/g, function () {
      return ((Math.random() * 16) | 0).toString(16);
    });
  }
};

const previewFile = async file => {
  if (String(file.file_id).includes("folder")) {
    return;
  }
  // 读取图像的函数
  try {
    const res = await axios.get(`${API_URL}/show_image/${file.file_id}`);
    detectTableData.value = res.data.data.detect_result; // 直接更新响应式变量
    ElNotification.success({
      title: "已存在检测结果",
      message: "",
      showClose: false,
      duration: 1000
    });
  } catch (error) {
    console.error("预览失败:", error);
    ElNotification.error({
      title: "检测失败",
      message: "",
      showClose: false,
      duration: 1000
    });
  }
};

//挂载完成
onMounted(() => {
  getTableData();
});

// 组件卸载时清理资源
onUnmounted(() => {
  stopCamera();
  stopAutoPhoto();
});

// 文件下载
const downloadFiles = async () => {
  ElNotification.warning({
    title: "正在下载...",
    showClose: false,
    duration: 1000
  });
  // let file_name = file.file_real_name;
  let file_name = config.name;
  console.log("saveFolderId", saveFolderId.value);
  console.log("file_name", file_name);

  try {
    await axios
      .get(`${API_URL}/download_file/${saveFolderId.value}`, {
        responseType: "blob"
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

const detectFiles = async () => {
  let images_id = toBeDetectedIds.value.join(",");
  ElNotification.warning({
    title: "正在检测...",
    message: "",
    showClose: false,
    duration: 1000
  });
  try {
    const res = await axios.get(API_URL + "/detect_file", {
      params: {
        weight_id: modelValue.value,
        conf: conf.value,
        images_id: images_id,
        camera:true
      }
    });

    // // 轮询检查数据
    // const checkData = () => {
    //   if (res.data.data && res.data.data.length > 0) {
    //     detectTableData.value = res.data.data;
    //     if (!String(file.file_id).includes("folder")) {
    //       detectUrl.value = res.data.data[0].detect_image_base64;
    //     }
    //   } else {
    //     // 1s后再次检查
    //     setTimeout(checkData, 1000);
    //   }
    // };
    // checkData();
  } catch (error) {
    console.error("检测失败:", error.message);
    ElNotification.error({
      title: "检测失败",
      message: error.message,
      showClose: false,
      duration: 1000
    });
  } finally {
    getTableData();
  }
};

// 添加方法来计算检测状态
const getDetectionStatus = row => {
  // 如果是文件夹（有 children 属性）
  if (row.children && Array.isArray(row.children)) {
    if (row.children.length === 0) {
      return "📁空文件夹";
    }

    // 检查所有子文件的检测状态
    const detectedChildren = row.children.filter(
      child => child.is_detected && child.is_detected !== "False"
    );

    const totalChildren = row.children.length;
    const detectedCount = detectedChildren.length;

    if (detectedCount === totalChildren) {
      return "✔已检测";
    } else if (detectedCount === 0) {
      return "📷待检测";
    } else {
      return `⏳${detectedCount}/${totalChildren}`;
    }
  }

  // 如果是普通文件
  return row.is_detected === "False" ? "📷待检测" : "✔已检测";
};
</script>

<template>
  <el-card shadow="never">
    <template #header>
      <div class="card-header">
        <div class="header flex justify-between">
          <!-- 状态信息 -->
          <div>
            <div class="flex text-center space-x-4">
              <!-- 摄像头开关 -->
              <div>
                <div v-if="!isCameraOn">
                  <el-button
                    size="small"
                    type="success"
                    round
                    plain
                    @click="toggleCamera"
                    >开启摄像头</el-button
                  >
                </div>
                <div v-else>
                  <el-button
                    size="small"
                    type="danger"
                    round
                    plain
                    @click="toggleCamera"
                    >关闭摄像头</el-button
                  >
                </div>
              </div>

              <!-- 拍照模式选择 -->
              <div v-if="isCameraOn" class="flex items-center space-x-2">
                <div>拍照模式</div>
                <el-radio-group
                  v-model="photoMode"
                  size="small"
                  fill="#f56c6c"
                  @change="setPhotoMode(photoMode)"
                >
                  <el-radio-button label="手动拍照" value="manual" />
                  <el-radio-button label="自动拍照" value="auto" />
                </el-radio-group>
              </div>
            </div>
          </div>

          <div class="flex space-x-2.5 items-center">
            <!-- 自动拍照设置 -->
            <div
              v-if="isCameraOn && photoMode === 'auto'"
              class="flex items-center space-x-2.5"
            >
              <div v-if="currentCapturedImages.length > 0">
                <el-button
                  size="small"
                  :icon="Delete"
                  type="danger"
                  round
                  plain
                  @click="clearAllImages"
                  >清空当前照片</el-button
                >
              </div>
              <div>
                <label class="text-gray-700">拍照间隔（秒）:</label>
                <input
                  v-model.number="autoInterval"
                  type="number"
                  min="1"
                  max="60"
                  class="w-10 px-3 py-1 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
              <div>
                <div v-if="!isAutoPhotoActive">
                  <el-button
                    size="small"
                    type="success"
                    round
                    plain
                    @click="toggleAutoPhoto"
                    >开始自动拍照</el-button
                  >
                </div>
                <div v-else>
                  <el-button
                    size="small"
                    type="danger"
                    round
                    plain
                    @click="toggleAutoPhoto"
                    >停止自动拍照</el-button
                  >
                </div>
              </div>
            </div>
            <!-- <div>
              <el-button type="primary" @click="detectFiles"
                >Batch_detect_Test</el-button
              >
            </div> -->
            <div class="flex items-center space-x-2">
              <span class="block text-sm text-gray-600">模型</span>
              <el-select
                size="small"
                v-model="modelValue"
                filterable
                clearable
                placeholder="Select"
                style="width: 100px"
              >
                <el-option
                  style="color: hotpink"
                  v-for="item in modelOptions"
                  :key="item.value"
                  :label="item.label"
                  :value="item.value"
                />
              </el-select>
            </div>
            <div class="flex items-center space-x-2">
              <span class="block text-sm text-gray-600">已拍摄</span>
              <span class="block text-lg font-semibold text-blue-600"
                >{{ totalCapturedImages }} 张</span
              >
            </div>
            <!-- 手动拍照按钮 -->
            <div
              v-if="isCameraOn && photoMode === 'manual'"
              class="flex justify-center"
            >
              <el-button
                type="info"
                size="small"
                plain
                round
                @click="takePhoto"
              >
                <div class="flex items-center space-x-2">
                  <el-icon
                    class="rounded-lg transition-all duration-200 transform hover:scale-120"
                    ><Camera
                  /></el-icon>
                  <div
                    class="text-black font-bold rounded-lg transition-all duration-200 transform hover:scale-120"
                  >
                    拍照
                  </div>
                </div>
              </el-button>
            </div>

            <div v-if="isCameraOn && currentCapturedImages.length > 0 && photoMode === 'manual'">
              <el-button
                size="small"
                :icon="Upload"
                type="info"
                round
                plain
                @click="manualUpload"
                >上传照片
              </el-button>
            </div>
            <div class="flex items-center space-x-2">
              <span class="block text-sm text-gray-600">上传状态</span>
              <span
                :class="[
                  'block text-lg font-semibold',
                  isUploading ? 'text-yellow-600' : 'text-green-600'
                ]"
              >
                {{ isUploading ? "上传中..." : "就绪" }}
              </span>
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
                  <div
                    class="max-w-4xl mx-auto p-6 bg-white rounded-lg shadow-lg"
                  >
                    <!-- 摄像头预览区域 -->
                    <div class="relative flex justify-center">
                      <div class="relative">
                        <video
                          v-show="isCameraOn"
                          ref="videoRef"
                          autoplay
                          playsinline
                          muted
                          loop
                          class="w-full max-w-lg h-auto border-4 border-gray-300 rounded-lg shadow-lg"
                        />

                        <!-- 拍照提示 -->
                        <div
                          v-if="showFlash"
                          class="absolute inset-0 bg-white opacity-80 rounded-lg"
                        />

                        <!-- 摄像头关闭时的占位符 -->
                        <div
                          v-if="!isCameraOn"
                          class="w-full max-w-lg h-64 bg-gray-200 border-4 border-gray-300 rounded-lg flex items-center justify-center"
                        >
                          <div class="text-center text-gray-500">
                            <svg
                              class="w-16 h-16 mx-auto mb-4"
                              fill="currentColor"
                              viewBox="0 0 20 20"
                            >
                              <path
                                fill-rule="evenodd"
                                d="M4 5a2 2 0 00-2 2v6a2 2 0 002 2h12a2 2 0 002-2V7a2 2 0 00-2-2h-1.586l-.707-.707A1 1 0 0012.293 4H7.707a1 1 0 00-.707.293L6.586 5H4zm6 9a3 3 0 100-6 3 3 0 000 6z"
                                clip-rule="evenodd"
                              />
                            </svg>
                            <p>摄像头未开启</p>
                          </div>
                        </div>
                      </div>
                    </div>

                    <!-- 拍摄的照片预览 -->
                    <!-- <div v-if="currentCapturedImages.length > 0" class="mb-6">
                      <h3 class="text-xl font-semibold mb-4 text-gray-800">
                        拍摄的照片 ({{ currentCapturedImages.length }}/10)
                      </h3>
                      <div
                        class="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-5 gap-4"
                      >
                        <div
                          v-for="(image, index) in currentCapturedImages"
                          :key="index"
                          class="relative group"
                        >
                          <img
                            :src="image.dataUrl"
                            :alt="`Photo ${index + 1}`"
                            class="w-full h-24 object-cover rounded-lg border-2 border-gray-200 shadow-sm hover:shadow-md transition-shadow duration-200"
                          />
                          <button
                            @click="removeImage(index)"
                            class="absolute -top-2 -right-2 w-6 h-6 bg-red-500 text-white rounded-full text-xs opacity-0 group-hover:opacity-100 transition-opacity duration-200 hover:bg-red-600"
                          >
                            ×
                          </button>
                          <div
                            class="absolute bottom-1 left-1 bg-black bg-opacity-50 text-white text-xs px-1 rounded"
                          >
                            {{ index + 1 }}
                          </div>
                        </div>
                      </div>
                    </div> -->

                    <!-- 操作按钮 -->
                    <!-- <div
                      v-if="currentCapturedImages.length > 0"
                      class="flex justify-center space-x-4"
                    >
                      <button
                        @click="clearAllImages"
                        class="px-4 py-2 bg-gray-500 hover:bg-gray-600 text-white rounded-lg transition-all duration-200"
                      >
                        清空所有照片
                      </button>
                      <button
                        @click="manualUpload"
                        :disabled="isUploading || currentCapturedImages.length === 0"
                        class="px-4 py-2 bg-green-500 hover:bg-green-600 disabled:bg-gray-400 text-white rounded-lg transition-all duration-200"
                      >
                        手动上传照片
                      </button>
                    </div> -->
                  </div>

                  <!-- 隐藏的canvas用于拍照 -->
                  <canvas ref="canvasRef" style="display: none" />
                </div>
              </el-scrollbar>
            </template>

            <template #paneR>
              <el-scrollbar>
                <div class="dv-b">
                  <div>
                    <el-table :data="detectTableData" border stripe>
                      <el-table-column
                        align="center"
                        label="文件名称"
                        prop="file_name"
                        sortable
                      />
                      <el-table-column
                        align="center"
                        label="类别"
                        width="100"
                        prop="cls"
                        sortable
                      />
                      <el-table-column
                        align="center"
                        label="置信度"
                        width="100"
                        prop="conf"
                        sortable
                      />
                      <el-table-column
                        align="center"
                        label="YOLO坐标"
                        prop="yolo_coord"
                        sortable
                      />
                      <el-table-column
                        align="center"
                        label="像素坐标"
                        prop="detect_coord"
                        sortable
                      />
                      <el-table-column
                        align="center"
                        label="目标面积"
                        width="150"
                        prop="detect_area"
                        sortable
                      />
                      <el-table-column
                        align="center"
                        label="图像尺寸"
                        prop="image_size"
                        sortable
                      />
                    </el-table>
                  </div>
                </div>
              </el-scrollbar>
            </template>
          </splitpane>
        </template>

        <!-- #paneR 表示指定该组件为右侧面板 -->
        <template #paneR>
          <el-scrollbar>
            <div>
              <el-table
                :data="totalCollectData"
                style="width: 100%"
                ref="multipleTableRef"
                row-key="file_id"
                @row-click="previewFile"
                @selection-change="handleSelectionChange"
              >
                <el-table-column align="center" type="selection" width="30" />
                <el-table-column
                  align="center"
                  fixed
                  prop="file_create_time"
                  label="日期"
                  sortable
                />
                <el-table-column
                  align="center"
                  prop="file_real_name"
                  label="名称"
                  sortable
                />
                <el-table-column
                  align="center"
                  label="状态"
                  prop="is_detected"
                  sortable
                >
                  <template v-slot="scope">
                    <span>{{ getDetectionStatus(scope.row) }}</span>
                  </template>
                </el-table-column>
                <el-table-column align="center" label="查看" min-width="120">
                  <template v-slot="scope">
                    <el-button
                      v-if="scope.row.is_detected"
                      link
                      type="primary"
                      size="small"
                    >
                      点击查看细节
                    </el-button>
                  </template>
                </el-table-column>
              </el-table>
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
</style>
