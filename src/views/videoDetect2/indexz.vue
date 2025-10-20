<template>
  <div class="container">
    <h1 class="title">视频目标检测系统</h1>

    <!-- 1. 视频上传区 -->
    <el-card class="card upload-card">
      <el-upload
        class="uploader"
        action=""
        :auto-upload="false"
        :on-change="handleFileSelect"
        :show-file-list="false"
        accept="video/*"
      >
        <el-button type="primary" :disabled="isProcessing">选择视频</el-button>
      </el-upload>
      
      <div v-if="selectedFile" class="file-info">
        已选文件：{{ selectedFile.name }}（{{ formatSize(selectedFile.size) }}）
        <el-button 
          type="success" 
          @click="startDetection" 
          class="ml-4"
          :disabled="isProcessing"
        >
          开始检测
        </el-button>
      </div>
    </el-card>

    <!-- 2. 检测进度区 -->
    <el-card v-if="isProcessing" class="card progress-card">
      <el-progress :percentage="progress" stroke-width="6"></el-progress>
      <p class="progress-text">处理进度：{{ progress }}%（请勿刷新页面）</p>
    </el-card>

    <!-- 3. 结果展示区 -->
    <el-card v-if="resultUrl" class="card result-card">
      <div class="result-header">
        <h2 class="result-title">检测结果</h2>
        <el-button 
          type="primary" 
          size="small" 
          @click="downloadCsv"
          class="mr-2"  
          :disabled="isDownloading"
          
        >
      <template v-if="isDownloading">下载中...</template>
      <template v-else>下载目标时间CSV</template>
    </el-button>
        <el-button 
          type="danger" 
          size="small" 
          @click="closeVideo"
          class="close-btn"
        >
          关闭视频
        </el-button>
      </div>
      <video 
        class="result-video" 
        controls 
        :src="resultUrl"
        autoplay
        @error="handleVideoError"
        ref="resultVideo"  
      >
        您的浏览器不支持视频播放
      </video>
    </el-card>
  </div>
</template>

<script setup>
import { ref, onUnmounted } from "vue";
import { ElMessage } from "element-plus";
import axios from 'axios';  // 导入axios
import { API_URL } from "@/url.js";


// 状态管理
const selectedFile = ref(null);
const isProcessing = ref(false);
const progress = ref(0);
const resultUrl = ref("");
const taskId = ref("");
const progressTimer = ref(null);  // 用于存储定时器
const resultVideo = ref(null);  // 视频元素引用

const isClosing = ref(false);  // 标记是否正在关闭视频

// 新增：下载状态控制
const isDownloading = ref(false);  // 防止重复点击
const handleVideoError = (e) => {
   // 如果是主动关闭视频，不显示错误提示
  if (isClosing.value) return;
  
  console.error("视频播放错误:", e.target.error);
  const errorMsgMap = {
    1: "视频加载已中断",
    2: "视频格式不支持",
    3: "视频解码失败",
    4: "网络错误导致视频加载失败"
  };
  ElMessage.error(`视频播放失败：${errorMsgMap[e.target.error.code] || "未知错误"}`);
};

// 关闭视频功能
const closeVideo = () => {
  // 停止视频播放
    // 标记为正在关闭，阻止错误提示
  isClosing.value = true;
  if (resultVideo.value) {
    resultVideo.value.pause();  // 暂停播放
    resultVideo.value.src = ""; // 清除视频源
  }
  resultUrl.value = "";  // 清除结果URL
  isDownloading.value = false;  // 重置下载状态
  ElMessage.info("视频已关闭");
};
// 1. 处理文件选择
const handleFileSelect = (file) => {
  selectedFile.value = file.raw;
  resultUrl.value = "";  // 重置之前的结果
};

// 2. 格式化文件大小（B→KB/MB）
const formatSize = (bytes) => {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(2)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
};


// 新增：CSV下载函数
const downloadCsv = async () => {
  if (!taskId.value) {
    ElMessage.warning("未获取到任务ID，无法下载");
    return;
  }

  isDownloading.value = true;  // 标记为正在下载
  try {
    // 调用后端CSV下载接口（需后端配合实现）
    const response = await axios.get(
      `${API_URL}/api/download_csv/${taskId.value}`,
      {
        responseType: "blob",  // 关键：指定响应为二进制文件
        timeout: 30000  // 超时时间30秒
      }
    );

    // 从响应头获取文件名（后端需设置Content-Disposition）
    const fileName = getFileNameFromHeader(response.headers);
    // 创建下载链接
    const url = URL.createObjectURL(new Blob([response.data]));
    const link = document.createElement("a");
    link.href = url;
    link.download = fileName;  // 设置下载文件名
    document.body.appendChild(link);
    link.click();  // 触发下载

    // 清理资源
    document.body.removeChild(link);
    URL.revokeObjectURL(url);

    ElMessage.success("CSV文件下载成功");
  } catch (err) {
    console.error("CSV下载失败：", err);
    ElMessage.error(`下载失败：${err.response?.data?.msg || "文件不存在"}`);
  } finally {
    isDownloading.value = false;  // 重置下载状态
  }
};

// 辅助函数：从响应头提取文件名
const getFileNameFromHeader = (headers) => {
  const disposition = headers["content-disposition"];
  if (!disposition) return "目标时间记录.csv";  // 默认文件名
  // 解析文件名（处理中文编码）
  const match = disposition.match(/filename="?([^";]+)"?/);
  if (match && match[1]) {
    return decodeURIComponent(escape(match[1]));  // 解码中文文件名
  }
  return "目标时间记录.csv";
};

// 3. 启动检测（上传视频+轮询进度）
const startDetection = async () => {
  if (!selectedFile.value) {
    ElMessage.warning('请先选择视频文件');
    return;
  }
  
  // 创建FormData对象
  const formData = new FormData();
  formData.append("video", selectedFile.value);
  
  try {
    // 使用axios.post上传视频
    const res = await axios.post(API_URL+"/api/upload", formData, {
      headers: {
        'Content-Type': 'multipart/form-data'  // 重要：指定表单数据类型
      },
      // 添加上传进度监控
      onUploadProgress: (progressEvent) => {
        const percent = Math.round((progressEvent.loaded * 100) / progressEvent.total);
        console.log(`上传进度: ${percent}%`);
      }
    });
    
    if (res.data.code !== 200) throw new Error(res.data.msg);
    
    taskId.value = res.data.task_id;
    isProcessing.value = true;
    progress.value = 0;
    
    // 清除可能存在的旧定时器
    if (progressTimer.value) clearInterval(progressTimer.value);
    
    // 轮询进度
    progressTimer.value = setInterval(async () => {
      try {
        const progressRes = await axios.get(API_URL+"/api/progress/"+taskId.value);
        
        if (progressRes.data.code === 200) {
          progress.value = progressRes.data.progress;
          
          // 进度100%时，获取结果视频URL并停止轮询
          if (progress.value === 100) {
            clearInterval(progressTimer.value);
            isProcessing.value = false;
            resultUrl.value = API_URL+"/api/result/"+taskId.value
           // resultUrl.value = `${API_URL}/api/result/${taskId.value}`;
            ElMessage.success("检测完成！");
          }
          console.log("url:"+resultUrl.value);
          // 处理错误状态
          if (progress.value === -1) {
            clearInterval(progressTimer.value);
            isProcessing.value = false;
            ElMessage.error("检测过程中发生错误");
          }
        }
      } catch (err) {
        clearInterval(progressTimer.value);
        isProcessing.value = false;
        ElMessage.error(`获取进度失败：${err.message}`);
      }
    }, 1000);
    
  } catch (err) {
    ElMessage.error(`上传失败：${err.response?.data?.msg || err.message}`);
    isProcessing.value = false;
  }
};

// 组件卸载时清除定时器
onUnmounted(() => {
  if (progressTimer.value) {
    clearInterval(progressTimer.value);
  }
});
</script>

<style scoped>
.container { max-width: 1000px; margin: 20px auto; padding: 0 20px; }
.title { text-align: center; margin-bottom: 30px; }
.card { margin-bottom: 20px; box-shadow: 0 2px 8px rgba(0,0,0,0.1); }
.file-info { margin-top: 15px; color: #666; }
.progress-card { padding: 20px; }
.progress-text { margin-top: 10px; text-align: center; color: #666; }
.result-title { margin-bottom: 15px; }
.result-video {
  width: 100%;
  max-height: 500px; 
  border-radius: 4px;
  object-fit: contain; 
  }
.result-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 15px;
}
.close-btn {
  align-self: flex-start;
}
.mr-2 {
  margin-right: 8px;  /* 下载按钮与关闭按钮的间距 */
}
</style>
