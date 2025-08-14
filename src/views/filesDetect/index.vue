<script setup lang="ts">
import splitpane, { ContextProps } from "@/components/ReSplitPane";
import { onMounted, reactive, ref, computed } from "vue";
import { ElMessage } from "element-plus";
import axios from "axios";
import { API_URL } from "@/url.js";
import Prism from "prismjs";

// 导入 YAML 语言支持和主题
import "prismjs/components/prism-yaml";
import "prismjs/themes/prism-tomorrow.css";

import {
  Delete,
  Search,
  Upload,
  UploadFilled,
  View,
  Download,
  SetUp
} from "@element-plus/icons-vue";
import {
  downloadByOnlineUrl,
  downloadByBase64,
  downloadByData,
  downloadByUrl
} from "@pureadmin/utils";
defineOptions({
  name: "FilesDetect"
});

const settingLR: ContextProps = reactive({
  minPercent: 20,
  defaultPercent: 80,
  split: "vertical"
});

const settingTB: ContextProps = reactive({
  minPercent: 20,
  defaultPercent: 50,
  split: "horizontal"
});

const uploadFileList = ref([]);
const dialogVisible = ref(false);
const uploading = ref(false);
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
const fileExt = ref(null);
const yamlContent = ref("");
const conf = ref(0.25);
const detectTableData = ref([]);

// 获取表单数据
const getTableData = () => {
  axios
    .get(API_URL + "/show_storage", { responseType: "text" })
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
          imagesData.value = allData.value.filter(
            item =>
              item.file_comment == "upload_image" ||
              item.file_comment == "image-folder"
          );
          console.log("imagesData", imagesData.value);
          weightsData.value = allData.value.filter(
            item => item.file_comment == "upload_weight"
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
  // let filtered = allData.value;
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

// 文件选择变化处理
const handleFileChangeUnified = file => {
  // 定义允许的文件扩展名及分组
  const allowed = {
    weight: [".pt"],
    image: [".png", ".jpg", ".jpeg"],
    archive: [".zip", ".rar", ".7z"]
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
    ElMessage.error("文件类型不支持!");
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
      ElMessage.error("一次只能上传同一类型的文件!");
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
    ElMessage.error("总大小不能超过100MB!");
    uploadFileList.value.pop();
  }
};

// 文件上传
const submitFilesDetect = () => {
  if (uploadFileList.value.length === 0) {
    ElMessage.warning("请选择要上传的文件");
    return;
  }
  uploading.value = true;
  const formData = new FormData();
  uploadFileList.value.forEach(file => {
    formData.append("files", file.raw);
  });

  axios
    .post(API_URL + "/upload_file", formData, {
      headers: { "Content-Type": "multipart/form-data" }
    })
    .then(response => {
      if (response.data.code === 200) {
        ElMessage.success("文件上传成功");
        dialogVisible.value = false;
        uploadFileList.value = [];
        getTableData();
      } else {
        ElMessage.error(response.data.code + ": " + response.data.msg);
      }
    })
    .catch(error => {
      console.error("上传错误:", error);
      ElMessage.error(
        "上传失败: " +
          (error.response?.data?.msg || error.message || "未知错误")
      );
    })
    .finally(() => {
      uploading.value = false;
    });
};

const previewFile = async file => {
  currentFile.value = file;
  // 执行读取图像的函数
  try {
    const res = await axios.get(`${API_URL}/show_image/${file.file_id}`);
    previewUrl.value = res.data.data.image_url; // 直接更新响应式变量
    detectUrl.value = res.data.data.detect_url; // 直接更新响应式变量
    detectTableData.value = res.data.data.detect_result; // 直接更新响应式变量
  } catch (error) {
    console.error("预览失败:", error);
    ElMessage.error("预览失败: " + error.message);
  }
};

// const detectFiles = async file => {
//   try {
//     const res = await axios.get(API_URL + "/detect_file", {
//       params: {
//         weight_id: modelValue.value,
//         image_id: file.file_id,
//         conf: conf.value
//       }
//     });
//     detectTableData.value = res.data.data;
//     console.log("detectTableData", detectTableData.value);
//   } catch (error) {
//     console.error("删除失败:", file.file_path);
//     ElMessage.error("删除失败: " + error.message);
//   } finally {
//     getTableData();
//   }
// };

const detectFiles = async file => {
  try {
    const res = await axios.get(API_URL + "/detect_file", {
      params: {
        weight_id: modelValue.value,
        image_id: file.file_id,
        conf: conf.value
      }
    });

    // 轮询检查数据
    const checkData = () => {
      if (res.data.data && res.data.data.length > 0) {
        detectTableData.value = res.data.data;
        if (!String(file.file_id).includes("folder")) {
          detectUrl.value = res.data.data[0].detect_image_base64;
        }
      } else {
        // 1s后再次检查
        setTimeout(checkData, 1000);
      }
    };

    checkData();
  } catch (error) {
    console.error("检测失败:", error.message);
    ElMessage.error("检测失败: " + error.message);
  } finally {
    getTableData();
  }
};

// 文件下载
const downloadFiles = async file => {
  console.log("downloadFiles:", file);
  try {
    let file_path = file.file_path;
    let save_name = file_path.substring(file_path.lastIndexOf("/") + 1);

    await axios
      .get(API_URL + "/download_file", {
        responseType: "blob",
        params: { file_path: file_path }
      })
      .then(({ data }) => {
        // console.log("download", data.type);
        if (data.type === "application/zip") {
          save_name += ".zip";
        }
        downloadByData(data, save_name);
      });
  } catch (error) {
    ElMessage.error("下载失败: " + error.message);
  }
};

// hashCode 计算函数
const hashCode = str => {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    hash = (hash << 5) - hash + str.charCodeAt(i);
    hash |= 0; // 转为32位整数
  }
  return Math.abs(hash);
};

// 计算属性：语法高亮后的内容
const highlightedContent = computed(() => {
  if (!yamlContent.value) return "";

  try {
    return Prism.highlight(yamlContent.value, Prism.languages.yaml, "yaml");
  } catch (e) {
    console.warn("语法高亮失败:", e);
    return yamlContent.value;
  }
});
const modelOptions = ref([]);
const modelValue = ref(""); // 先给空值

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
        <!-- <div class="action-buttons-container">
          <el-button :icon="Upload" type="primary" @click="dialogVisible = true"
            >上传文件</el-button
          >
        </div> -->
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
      </div>
    </template>

    <div class="split-pane">
      <splitpane :splitSet="settingLR">
        <!-- #paneL 表示指定该组件为左侧面板 -->
        <template #paneL>
          <!-- 自定义右侧面板的内容 -->
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
                        row-key="file_folder_id"
                        border
                        stripe
                        default-expand-all
                        @sort-change="handleSortChange"
                        @row-click="previewFile"
                      >
                        <el-table-column
                          align="center"
                          label="文件名称"
                          prop="file_real_name"
                          sortable
                        />
                        <el-table-column
                          align="center"
                          label="上传时间"
                          prop="file_create_time"
                          sortable
                        />
                        <el-table-column
                          align="center"
                          label="检测"
                          prop="is_detected"
                          sortable
                        >
                          <template v-slot="scope">
                            <!-- 如果 is_detected 为 False，则显示 False，否则显示 True -->
                            <span>{{
                              scope.row.is_detected === "False"
                                ? "False"
                                : "True"
                            }}</span>
                          </template>
                        </el-table-column>

                        <el-table-column align="center" label="操作">
                          <template v-slot="scope">
                            <el-button
                              v-if="true"
                              :icon="SetUp"
                              type="default"
                              @click.stop="detectFiles(scope.row)"
                            >
                              检测
                            </el-button>
                            <el-button
                              v-if="true"
                              :icon="Download"
                              type="default"
                              @click.stop="downloadFiles(scope.row)"
                            >
                              下载
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
                  <!-- 检测结果 -->
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
                          label="文件名称"
                          prop="file_name"
                          sortable
                        />
                        <el-table-column
                          align="center"
                          label="类别"
                          prop="cls"
                          sortable
                        />
                        <el-table-column
                          align="center"
                          label="置信度"
                          prop="conf"
                          sortable
                        />
                        <el-table-column
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
                          prop="detect_area"
                          sortable
                        />
                        <el-table-column
                          align="center"
                          label="图像尺寸"
                          prop="image_size"
                          sortable
                        />
                        <el-table-column align="center" label="下载结果">
                          <template v-slot="scope">
                            <el-button
                              v-if="true"
                              :icon="Download"
                              type="default"
                              @click.stop="downloadFiles(scope.row)"
                            >
                              下载
                            </el-button>
                          </template>
                        </el-table-column>
                      </el-table>
                    </div>
                  </div>
                </div>
              </el-scrollbar>
            </template>
          </splitpane>
        </template>

        <!-- #paneR 表示指定该组件为右侧面板 -->
        <template #paneR>
          <!-- 自定义右侧面板的内容 -->
          <splitpane :splitSet="settingTB">
            <template #paneL>
              <el-scrollbar>
                <div class="dv-a">
                  <!--              图像-->
                  <div>
                    <img
                      :src="previewUrl"
                      style="width: auto; height: 100%; object-fit: contain"
                      alt=""
                      fit="contain"
                    />
                  </div>
                </div>
              </el-scrollbar>
            </template>

            <template #paneR>
              <el-scrollbar>
                <div class="dv-a">
                  <!--              图像-->
                  <div>
                    <img
                      :src="detectUrl"
                      style="width: auto; height: 100%; object-fit: contain"
                      alt=""
                      fit="contain"
                    />
                  </div>
                </div>
              </el-scrollbar>
            </template>
          </splitpane>
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
</style>
