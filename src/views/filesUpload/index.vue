<script setup lang="ts">
import splitpane, { ContextProps } from "@/components/ReSplitPane";
import { onMounted, reactive, ref, computed } from "vue";
import { ElMessage, ElNotification } from "element-plus";

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
  Download
} from "@element-plus/icons-vue";
import { downloadByData } from "@pureadmin/utils";

defineOptions({
  name: "FilesUpload"
});

const uploading = ref(false);
const tableData = ref([]);
const pageSize = ref(16);
const pageNum = ref(1);
const filteredData = ref([]);
const total = ref(0);
const allData = ref([]);
const sortProp = ref("");
const sortOrder = ref("");
const fileName = ref("");
const previewUrl = ref("");
const fileExt = ref(null);
const textContent = ref("");
const uploadFileList = ref([]);
const dialogVisible = ref(false);
const uploadMode = ref("random");
const selectedFolderId = ref(null);

const settingLR: ContextProps = reactive({
  minPercent: 20,
  defaultPercent: 60,
  split: "vertical"
});

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
// 获取表单数据
const getTableData = () => {
  axios
    .get(API_URL + "/show_storage/images", { responseType: "text" })
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
          console.log(allData.value);
          console.log(typeof allData.value);
          filterAndSortData();
        }
      } catch (error) {
        console.error("解析CSV数据失败:", error);
      }
    })
    .catch(error => {
      console.error("加载CSV文件失败:", error);
    });
};

// 过滤和排序数据
const filterAndSortData = () => {
  // 搜索过滤
  let filtered = allData.value;
  console.log("filtered:", filtered);
  if (fileName.value) {
    const searchTerm = fileName.value.toLowerCase();
    filtered = filtered.filter(item =>
      item.file_name.toLowerCase().includes(searchTerm)
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
const submitFilesUpload = () => {
  if (uploadFileList.value.length === 0) {
    ElMessage.warning("请选择要上传的文件");
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
        getTableData();
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

const previewFile = async file => {
  let file_name = file.file_name;
  // 获取文件扩展名并转换为小写
  fileExt.value = file_name.toLowerCase().split(".").pop();
  console.log("fileExt", fileExt.value);

  // 定义图像文件扩展名
  const imageExtensions = ["png", "jpg", "jpeg"];

  // 定义文本文件扩展名
  const textExtensions = ["yaml", "yml", "txt"];

  if (imageExtensions.includes(fileExt.value)) {
    // 执行读取图像的函数
    try {
      textContent.value = "";
      const res = await axios.get(`${API_URL}/show_image/${file.file_id}`);
      previewUrl.value = res.data.data.image_url; // 直接更新响应式变量
    } catch (error) {
      console.error("预览失败:", error);
      ElNotification.error({
        title: "预览失败",
        message: error.message,
        showClose: false,
        duration: 1000
      });
    }
  } else if (textExtensions.includes(fileExt.value)) {
    // 执行读取文本的函数
    try {
      previewUrl.value = "";
      const res = await axios.get(`${API_URL}/show_text/${file.file_id}`);
      console.log("txt", res.data.data);

      textContent.value = res.data.data; // 直接更新响应式变量
    } catch (error) {
      console.error("预览失败:", error);
      ElNotification.error({
        title: "预览失败",
        message: error.message,
        showClose: false,
        duration: 1000
      });
    }
  } else {
    // 可选：处理不支持的文件类型
    // ElNotification.info({
    //   title: "不支持预览的类型",
    //   message: fileExt.value,
    //   showClose: false,
    //   duration: 1000
    // });
    return;
  }
};
const deleteFile = async file => {
  try {
    const res = await axios.delete(`${API_URL}/delete_file/${file.file_id}`);
    previewUrl.value = "";
    textContent.value = "";
    ElNotification.success({
      title: "删除成功",
      message: "删除成功: " + file.file_name,
      showClose: false,
      duration: 1000
    });
  } catch (error) {
    console.error("删除失败:", file.file_name);
    ElNotification.error({
      title: "删除失败",
      message: "删除失败: " + error.message,
      showClose: false,
      duration: 1000
    });
  } finally {
    getTableData();
  }
};

// 文件下载
const downloadFiles = async file => {
  ElNotification.warning({
    title: "正在下载...",
    showClose: false,
    duration: 1000
  });
  let file_name = file.file_name;
  try {
    await axios
      .get(`${API_URL}/download_file/${file.file_id}`, {
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

// 计算属性：语法高亮后的内容
const highlightedContent = computed(() => {
  if (!textContent.value) return "";

  try {
    return Prism.highlight(textContent.value, Prism.languages.yaml, "yaml");
  } catch (e) {
    console.warn("语法高亮失败:", e);
    return textContent.value;
  }
});

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
        <div class="action-buttons-container">
          <el-button :icon="Upload" type="primary" @click="openRandomUpload">
            上传文件
          </el-button>
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

        <el-dialog
          v-model="dialogVisible"
          :title="uploadMode === 'folder' ? '上传到当前文件夹' : '上传文件'"
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
                支持上传以下文件类型：.pt、png、jpg、jpeg、zip、rar、7z，总大小不超过100MB。
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
      </div>
    </template>

    <div class="split-pane">
      <splitpane :splitSet="settingLR">
        <!-- #paneL 表格面板 -->
        <template #paneL>
          <!-- 自定义右侧面板的内容 -->
          <el-scrollbar>
            <div class="dv-a">
              <!-- 文件数据表格 -->
              <div class="flex flex-col relative justify-center align-center">
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
                      label="文件类型"
                      prop="type"
                      sortable
                    />
                    <el-table-column
                      align="center"
                      label="文件描述"
                      prop="comment"
                      sortable
                    />
                    <el-table-column
                      align="center"
                      label="上传时间"
                      prop="create_time"
                      sortable
                    />

                    <el-table-column align="center" label="操作">
                      <template v-slot="scope">
                        <el-button
                          v-if="scope.row.comment.includes('folder')"
                          :icon="Upload"
                          type="default"
                          @click.stop="openFolderUpload(scope.row)"
                        />

                        <el-button
                          v-if="true"
                          :icon="Download"
                          type="default"
                          @click.stop="downloadFiles(scope.row)"
                        />

                        <el-popconfirm
                          confirm-button-text="删除"
                          cancel-button-text="取消"
                          :icon="Delete"
                          icon-color="#626AEF"
                          title="是否确认删除？"
                          @confirm="deleteFile(scope.row)"
                          @cancel="console.log('cancel!')"
                        >
                          <template #reference>
                            <el-button :icon="Delete" />
                          </template>
                        </el-popconfirm>
                      </template>
                    </el-table-column>
                  </el-table>
                </div>
              </div>
            </div>
          </el-scrollbar>
        </template>

        <!-- #paneR 显示面板 -->
        <template #paneR>
          <!-- 自定义右侧面板的内容 -->
          <el-scrollbar>
            <div class="dv-a">
              <!--              图像-->
              <div v-if="['png', 'jpg', 'jpeg'].includes(fileExt)">
                <el-image
                  style="width: 100%; height: 100%; object-fit: contain"
                  :src="previewUrl"
                  :zoom-rate="1.2"
                  :max-scale="7"
                  :min-scale="0.2"
                  :preview-src-list="[previewUrl]"
                  show-progress
                  :initial-index="0"
                  fit="contain"
                />
              </div>
              <!--              txt-->
              <div v-else-if="['yaml', 'yml', 'txt'].includes(fileExt)" />
              <pre>
                <code class="text-left" v-html="highlightedContent"/>
              </pre>
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
</style>
