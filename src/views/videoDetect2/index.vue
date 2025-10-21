<script setup lang="ts">
import splitpane, { ContextProps } from "@/components/ReSplitPane";
import { onMounted, reactive, ref, computed } from "vue";
import { ElMessage, ElNotification } from "element-plus";
import axios from "axios";
import { API_URL } from "@/url.js";
import { downloadByData } from "@pureadmin/utils";
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

defineOptions({
  name: "FilesDetect"
});

const settingLR: ContextProps = reactive({
  minPercent: 50,
  defaultPercent: 50,
  split: "vertical"
});

const settingTB: ContextProps = reactive({
  minPercent: 20,
  defaultPercent: 30,
  split: "horizontal"
});

const tableData = ref([]);
const pageSize = ref(16);
const pageNum = ref(1);
const filteredData = ref([]);
const total = ref(0);
const allData = ref([]);

const imagesData = ref([]);
const weightsData = ref([]);

const sortProp = ref("");
const sortOrder = ref("");
const fileName = ref("");
const previewUrl = ref("");
const detectUrl = ref("");
const currentFile = ref(null);
const conf = ref(0.25);
const detectTableData = ref([]);
const modelOptions = ref([]);
const modelValue = ref(""); // 先给空值
const isDetected = ref(false);

const isProcessing = ref(true);
const progress = ref(0);
const progressTimer = ref(null); // 用于存储定时器

// 视频相关
// const videos = ref([])
// const currentVideo = ref(null)
const videoPlayer = ref(null);
const videoDuration = ref(0);

const currentVideoUrl = ref("");
const currentDetectedVideoUrl = ref("");

// 视频加载完成
const onVideoLoaded = () => {
  if (videoPlayer.value) {
    videoDuration.value = videoPlayer.value.duration;
  }
};

// 视频加载错误
const onVideoError = error => {
  console.error("视频加载失败:", error);
  alert("视频加载失败，请检查文件格式或网络连接");
};

// 格式化时间
const formatTime = seconds => {
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  return `${mins}:${secs.toString().padStart(2, "0")}`;
};

// 获取表单数据
const getTableData = () => {
  axios
    .get(API_URL + "/show_storage/weights,images", { responseType: "text" })
    .then(res => {
      try {
        const data = JSON.parse(res.data);
        if (data.length === 0) {
          allData.value = [];
          total.value = 0;
          tableData.value = [];
          return;
        } else {
          allData.value = data.data;
          console.log("allData", allData.value);

          imagesData.value = allData.value.filter(
            item =>
              // item.file_comment == "upload_images" ||
              // item.file_comment == "image-folder"
              item.comment == "upload_videos" ||
              String(item.file_id).includes("videos-folder")
          );
          console.log("imagesData", imagesData.value);
          weightsData.value = allData.value.filter(
            // item => item.file_comment == "upload_weights"
            item => String(item.file_name).includes(".pt")
          );
          console.log("weightsData", weightsData.value);
          modelOptions.value = weightsData.value.map(item => ({
            value: item.file_id,
            label: item.file_real_name
          }));
          if (modelOptions.value.length > 0) {
            modelValue.value = modelOptions.value[0].value;
          }

          filterAndSortData();
        }
      } catch (error) {
        console.error("解析CSV数据失败:", error);
        ElMessage.error("无法解析文件数据: " + error.message);
      }
    })
    .catch(error => {
      console.error("加载CSV文件失败:", error);
      ElMessage.error("加载文件数据失败: " + error.message);
    });
};

// 过滤和排序数据
const filterAndSortData = () => {
  // 搜索过滤
  let filtered = imagesData.value;
  console.log("filtered:", filtered);
  if (fileName.value) {
    const searchTerm = fileName.value.toLowerCase();
    filtered = filtered.filter(item =>
      item.file_real_name.toLowerCase().includes(searchTerm)
    );
  }

  // 排序
  if (sortProp.value && sortOrder.value) {
    filtered.sort((a, b) => {
      let valA = a[sortProp.value];
      let valB = b[sortProp.value];

      // 如果是数值，进行数值排序
      if (!isNaN(Number(valA)) && !isNaN(Number(valB))) {
        valA = Number(valA);
        valB = Number(valB);
      } else {
        valA = String(valA).toLowerCase();
        valB = String(valB).toLowerCase();
      }

      if (sortOrder.value === "ascending") {
        return valA > valB ? 1 : -1;
      } else {
        return valA < valB ? 1 : -1;
      }
    });
  }

  filteredData.value = filtered;
  total.value = filtered.length;
  applyPagination();
};

// 应用分页
const applyPagination = () => {
  const start = (pageNum.value - 1) * pageSize.value;
  const end = Math.min(start + pageSize.value, filteredData.value.length);
  tableData.value = filteredData.value.slice(start, end);
};

// 分页大小变化
const handleSizeChange = newPageSize => {
  pageSize.value = newPageSize;
  applyPagination();
};

// 页码变化
const handleCurrentChange = newPageNum => {
  pageNum.value = newPageNum;
  applyPagination();
};

// 处理排序变化
const handleSortChange = column => {
  sortProp.value = column.prop;
  sortOrder.value = column.order;
  filterAndSortData();
};

const previewFile = async file => {
  currentFile.value = file;
  console.log(file);

  if (String(file.file_id).includes("folder")) {
    return;
  }
  // 读取图像的函数
  try {
    // const res = await axios.get(`${API_URL}/show_image/${file.file_id}`);
    currentVideoUrl.value = `${API_URL}/show_image/${file.file_id}/video`;

    const detectRes = await axios.get(
      `${API_URL}/valid_params/${file.file_id}`
    );
    if (detectRes.data.data.file_id) {
      currentDetectedVideoUrl.value = `${API_URL}/show_image/${file.file_id}/detectVideo`;

      // 轮询检查数据
      const checkData = () => {
        if (
          detectRes.data.data.detect_table &&
          detectRes.data.data.detect_table.length > 0
        ) {
          detectTableData.value = detectRes.data.data.detect_table;
        } else {
          // 1s后再次检查
          setTimeout(checkData, 1000);
        }
      };
      checkData();
    }
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

const detectFiles = async file => {
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
        image_id: file.file_id,
        conf: conf.value
      }
    });

    isProcessing.value = true;
    progress.value = 0;

    // 清除可能存在的旧定时器
    if (progressTimer.value) clearInterval(progressTimer.value);

    // 轮询进度
    // progressTimer.value = setInterval(async () => {
    //   try {
    //     const progressRes = await axios.get(API_URL+"/api/progress/"+taskId.value);

    //     if (progressRes.data.code === 200) {
    //       progress.value = progressRes.data.progress;

    //       // 进度100%时，获取结果视频URL并停止轮询
    //       if (progress.value === 100) {
    //         clearInterval(progressTimer.value);
    //         isProcessing.value = false;
    //         resultUrl.value = API_URL+"/api/result/"+taskId.value
    //        // resultUrl.value = `${API_URL}/api/result/${taskId.value}`;
    //         ElMessage.success("检测完成！");
    //       }
    //       console.log("url:"+resultUrl.value);
    //       // 处理错误状态
    //       if (progress.value === -1) {
    //         clearInterval(progressTimer.value);
    //         isProcessing.value = false;
    //         ElMessage.error("检测过程中发生错误");
    //       }
    //     }
    //   } catch (err) {
    //     clearInterval(progressTimer.value);
    //     isProcessing.value = false;
    //     ElMessage.error(`获取进度失败：${err.message}`);
    //   }
    // }, 1000);
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
// TODO: 检测文件夹下载存在问题
// 文件下载
const downloadFiles = async (file, only_video_csv = false) => {
  // console.log("downloadFiles", file);
  let file_name = file.file_name;
  if (only_video_csv) {
    file_name += "detected.csv";
  }

  ElNotification.warning({
    title: "正在下载...",
    message: "",
    showClose: false,
    duration: 1000
  });
  try {
    await axios
      .get(`${API_URL}/download_file/${file.file_id}`, {
        responseType: "blob",
        params: {
          file_id: file.file_id,
          only_video_csv: only_video_csv
        }
      })
      .then(({ data }) => {
        if (data.type === "application/zip") {
          file_name += ".zip";
        }
        downloadByData(data, file_name);
      });
    ElNotification.success({
      title: "下载成功",
      message: "",
      showClose: false,
      duration: 1000
    });
  } catch (error) {
    // ElMessage.error("下载失败: " + error.message);
    ElNotification.error({
      title: "下载失败",
      message: error.message,
      showClose: false,
      duration: 1000
    });
  }
};

// 添加方法来计算检测状态
const getDetectionStatus = row => {
  // 如果是文件夹（有 children 属性）
  // console.log("getDetectionStatus", row);
  if (row.children && Array.isArray(row.children)) {
    if (row.children.length === 0) {
      return "📁空文件夹";
    }

    // 检查所有子文件的检测状态
    const detectedChildren = row.children.filter(
      child => child.is_detected && String(child.is_detected) !== "null"
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
  return String(row.is_detected) === "null" ? "📷待检测" : "✔已检测";
};

const shouldShowDownloadButton = row => {
  // 文件夹：所有子文件都检测完成才显示
  if (row.children && Array.isArray(row.children)) {
    return (
      row.children.length > 0 &&
      row.children.every(child => child.is_detected !== "False")
    );
  }

  // 单文件：自己检测完成就显示
  return row.is_detected !== "False";
};
//挂载完成
onMounted(() => {
  getTableData();
});
</script>

<template>
  <el-card shadow="never">
    <!-- 表头提示 -->
    <template #header>
      <div class="card-header flex items-center space-x-10">
        <div>
          <el-select
            v-model="modelValue"
            filterable
            clearable
            placeholder="Select"
            style="width: 120px"
          >
            <el-option
              v-for="item in modelOptions"
              :key="item.value"
              :label="item.label"
              :value="item.value"
            />
          </el-select>
        </div>
        <div>
          <el-radio-group v-model="conf" :disabled="false">
            <el-radio-button :value="0.25">0.25</el-radio-button>
            <el-radio-button :value="0.5">0.5</el-radio-button>
            <el-radio-button :value="0.75">0.75</el-radio-button>
          </el-radio-group>
        </div>

        <!-- 分页控件 -->
        <div class="pagination-container">
          <el-pagination
            :current-page="pageNum"
            :page-size="pageSize"
            :page-sizes="[16, 32, 64]"
            :total="total"
            layout="total, sizes, prev, pager, next, jumper"
            @size-change="handleSizeChange"
            @current-change="handleCurrentChange"
          />
        </div>

        <!-- 搜索区域 -->
        <div class="search-container flex">
          <el-input
            v-model="fileName"
            :prefix-icon="Search"
            class="search-input"
            clearable
            placeholder="请输入文件名称"
          />
          <el-button
            :icon="Search"
            class="search-button"
            type="primary"
            @click="getTableData"
            >搜索</el-button
          >
        </div>
        <!-- 2. 检测进度区 -->
        <!-- <div>
          <div v-if="isProcessing" class="card progress-card">
            <el-progress :percentage="progress" stroke-width="6"></el-progress>
            <p class="progress-text">
              处理进度：{{ progress }}%（请勿刷新页面）
            </p>
          </div>
        </div> -->
      </div>
    </template>

    <div class="split-pane">
      <splitpane :splitSet="settingLR">
        <!-- #paneL 左侧表格 -->
        <template #paneL>
          <splitpane :splitSet="settingTB">
            <template #paneL>
              <el-scrollbar>
                <div class="dv-a">
                  <!-- 文件数据表格 -->
                  <div
                    class="flex flex-col relative justify-center align-center"
                  >
                    <div>
                      <el-table
                        :data="tableData"
                        row-key="file_id"
                        border
                        stripe
                        default-expand-all
                        @sort-change="handleSortChange"
                        @row-click="previewFile"
                      >
                        <el-table-column
                          align="center"
                          label="文件名称"
                          prop="file_name"
                          sortable
                        />
                        <el-table-column
                          align="center"
                          label="上传时间"
                          prop="create_time"
                          sortable
                        />
                        <el-table-column
                          align="center"
                          label="检测状态"
                          prop="is_detected"
                          sortable
                        >
                          <template v-slot="scope">
                            <el-button
                              type="default"
                              @click.stop="detectFiles(scope.row)"
                            >
                              <span>{{ getDetectionStatus(scope.row) }}</span>
                            </el-button>
                          </template>
                        </el-table-column>
                        <el-table-column align="center" label="下载结果">
                          <template v-slot="scope">
                            <!-- <el-button
                              v-if="shouldShowDownloadButton(scope.row)"
                              :icon="Download"
                              type="default"
                              @click.stop="downloadFiles(scope.row, false)"
                            >
                              下载结果
                            </el-button> -->
                            <el-button
                              v-if="shouldShowDownloadButton(scope.row)"
                              :icon="Download"
                              type="default"
                              @click.stop="downloadFiles(scope.row, true)"
                            >
                              下载结果表格
                            </el-button>
                          </template>
                        </el-table-column>
                      </el-table>
                    </div>
                  </div>
                </div>
              </el-scrollbar>
            </template>

            <template #paneR>
              <el-scrollbar>
                <div class="dv-a">
                  <!-- 检测数据表格 -->
                  <div
                    class="flex flex-col relative justify-center align-center"
                  >
                    <div>
                      <el-table
                        :data="detectTableData"
                        border
                        stripe
                        @sort-change="handleSortChange"
                      >
                        <el-table-column
                          align="center"
                          label="目标段ID"
                          prop="seg_id"
                          sortable
                        />
                        <el-table-column
                          align="center"
                          label="目标类别"
                          prop="class"
                          sortable
                        />
                        <el-table-column
                          align="center"
                          label="中间帧时间"
                          prop="mid_frame_time"
                          sortable
                        />
                        <el-table-column
                          align="center"
                          label="中间帧索引"
                          prop="mid_frame_idx"
                          sortable
                        />
                        <el-table-column
                          align="center"
                          label="目标置信度"
                          prop="confidence"
                          sortable
                        />
                        <el-table-column
                          align="center"
                          label="持续时间(秒)"
                          width="150"
                          prop="duration_sec"
                          sortable
                        />
                      </el-table>
                    </div>
                  </div>
                </div>
              </el-scrollbar>
            </template>
          </splitpane>
        </template>

        <!-- #paneR 展示面板 -->
        <template #paneR>
          <el-scrollbar>
            <div class="dv-a">
              <!-- 检测后视频播放器 -->
              <div class="video-section">
                <div v-if="currentDetectedVideoUrl" class="video-player">
                  <video
                    :key="currentDetectedVideoUrl"
                    :src="currentDetectedVideoUrl"
                    controls
                    @error="onVideoError"
                  />
                </div>
              </div>
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
    //padding-top: 30vh;
    color: rgba($color: dodgerblue, $alpha: 80%);
  }

  .dv-b {
    padding-top: 10vh;
    color: rgba($color: #000, $alpha: 80%);
  }

  .dv-c {
    padding-top: 18vh;
    color: rgba($color: #ce272d, $alpha: 80%);
  }
}

.yaml-viewer {
  width: 100%;
  text-align: left !important; /* 强制左对齐 */
}

.loading,
.error {
  padding: 20px;
  color: #666;
  text-align: center;
}

.error {
  color: #e53e3e;
  background: #fed7d7;
}

.yaml-content {
  max-height: 600px;
  overflow: auto;
}

pre {
  padding: 20px;
  margin: 0;
  font-family: "Fira Code", Consolas, Monaco, monospace;
  font-size: 14px;
  line-height: 1.5;
  text-align: left !important; /* 强制左对齐 */
  white-space: pre !important; /* 保持原始空白字符 */
}

code {
  display: block;
  padding: 0 !important;
  text-align: left !important; /* 强制左对齐 */
  white-space: pre !important; /* 保持原始格式 */
  background: none !important;
}

/* 滚动条样式 */
.yaml-content::-webkit-scrollbar {
  width: 8px;
  height: 8px;
}

.yaml-content::-webkit-scrollbar-track {
  background: #2d3748;
}

.yaml-content::-webkit-scrollbar-thumb {
  background: #4a5568;
  border-radius: 4px;
}

.yaml-content::-webkit-scrollbar-thumb:hover {
  background: #718096;
}

.video-player-container {
  max-width: 1200px;
  margin: 0 auto;
  padding: 20px;
}

.video-list {
  display: flex;
  gap: 10px;
  flex-wrap: wrap;
  margin-bottom: 20px;
}

.video-list button {
  padding: 10px 20px;
  border: 2px solid #ddd;
  background: white;
  cursor: pointer;
  border-radius: 5px;
  transition: all 0.3s;
}

.video-list button:hover {
  border-color: #42b983;
}

.video-list button.active {
  background: #42b983;
  color: white;
  border-color: #42b983;
}

.player video {
  width: 100%;
  max-height: 600px;
  background: #000;
  border-radius: 8px;
}

.video-info {
  margin-top: 10px;
  padding: 15px;
  background: #f5f5f5;
  border-radius: 5px;
}

.placeholder {
  text-align: center;
  padding: 100px;
  color: #999;
  font-size: 18px;
}

.progress-text {
  margin-top: 10px;
  text-align: center;
  color: #666;
}
</style>
