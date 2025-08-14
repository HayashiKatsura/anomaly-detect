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
  Download
} from "@element-plus/icons-vue";
import {
  downloadByOnlineUrl,
  downloadByBase64,
  downloadByData,
  downloadByUrl
} from "@pureadmin/utils";
defineOptions({
  name: "FilesUpload"
});

const settingLR: ContextProps = reactive({
  minPercent: 20,
  defaultPercent: 60,
  split: "vertical"
});

const settingTB: ContextProps = reactive({
  minPercent: 20,
  defaultPercent: 40,
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
const sortProp = ref("");
const sortOrder = ref("");
const fileName = ref("");
const previewUrl = ref("");
const currentFile = ref(null);
const fileExt = ref(null);
const yamlContent = ref("");

// 获取表单数据
const getTableData = () => {
  axios
    .get(API_URL + "/get_table_data", { responseType: "text" })
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
          // allData.value.forEach(file => {
          //   // 使用正则替换掉'data'以前的所有字符
          //   file.file_path = file.file_path.replace(/^.*?data/, 'data');
          // });
          console.log(allData.value);
          console.log(typeof allData.value);
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
  let filtered = allData.value;
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
  // axios.post(API_URL+'/upload_files', formData, {
  // axios.post(API_URL + '/images', formData, {
  axios
    .post(API_URL + "/upload_file", formData, {
      headers: { "Content-Type": "multipart/form-data" }
    })
    .then(response => {
      if (response.data.code === 200) {
        ElMessage.success("文件上传成功");
        dialogVisible.value = false;
        uploadFileList.value = [];
        // // 上传成功后，若有图片文件，批量存储图片信息
        // const uploadedFiles = response.data.data?.uploaded_files || [];
        // const imageExts = [".png", ".jpg", ".jpeg"];
        // const imageList = [];
        // uploadedFiles.forEach(file => {
        //   if (file.box_data) {
        //     file.box_data.forEach(item => {
        //       if (
        //         item.file_type === "file" &&
        //         imageExts.some(ext =>
        //           item.file_real_name.toLowerCase().endsWith(ext)
        //         )
        //       ) {
        //         // 提取 file_id 最后36位（UUID），去掉"-"，转hashCode，取正整数
        //         let picId = "";
        //         if (item.file_id && item.file_id.length >= 36) {
        //           let uuid = item.file_id.slice(-36);
        //           let uuidNoDash = uuid.replace(/-/g, "");
        //           // picId = hashCode(uuidNoDash);
        //         }
        //         imageList.push({
        //           picId: picId,
        //           picName: item.file_real_name,
        //           picUrl: item.file_path,
        //           uploadDate: uploadDate
        //         });
        //       }
        //     });
        //   }
        // });
        // if (imageList.length > 0) {
        //   axios
        //     .post("/api/image/saveList", imageList)
        //     .then(() => {
        //       // 可选：提示保存成功
        //     })
        //     .catch(() => {
        //       ElMessage.error("图片信息存储失败");
        //     });
        // }
        // // 上传成功后重新加载CSV数据
        // this.load();
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
  let file_path = file.file_path;
  // 获取文件扩展名并转换为小写
  fileExt.value = file_path.toLowerCase().split(".").pop();
  console.log("fileExt", fileExt.value);

  // 定义图像文件扩展名
  const imageExtensions = ["png", "jpg", "jpeg"];

  // 定义文本文件扩展名
  const textExtensions = ["yaml", "yml", "txt"];

  if (imageExtensions.includes(fileExt.value)) {
    // 执行读取图像的函数
    try {
      const res = await axios.post(API_URL + "/show_image", {
        file_path: file_path
      });
      previewUrl.value = res.data.data.url; // 直接更新响应式变量
      console.log("预览URL:", previewUrl.value); // 调试输出
    } catch (error) {
      console.error("预览失败:", error);
      ElMessage.error("预览失败: " + error.message);
    }
  } else if (textExtensions.includes(fileExt.value)) {
    // 执行读取文本的函数
    try {
      const res = await axios.post(API_URL + "/get_yaml", {
        file_path: file_path
      });
      console.log("txt", res.data.data);

      yamlContent.value = res.data.data; // 直接更新响应式变量
    } catch (error) {
      console.error("预览失败:", error);
      ElMessage.error("预览失败: " + error.message);
    }
  } else {
    // 可选：处理不支持的文件类型
    console.warn(`不支持的文件类型: ${fileExt.value}`);
  }
};
const deleteFile = async file => {
  currentFile.value = file;
  try {
    const res = await axios.post(API_URL + "/delete_file", {
      file_path: file.file_path
    });
    console.log("删除成功:", file.file_path); // 调试输出
    ElMessage.success("删除成功: " + file.file_path);
  } catch (error) {
    console.error("删除失败:", file.file_path);
    ElMessage.error("删除失败: " + error.message);
  } finally {
    getTableData();
  }
};

// 文件下载
const downloadFiles = async file => {
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
          <el-button :icon="Upload" type="primary" @click="dialogVisible = true"
            >上传文件</el-button
          >
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

        <el-dialog v-model="dialogVisible" title="上传文件" width="30%">
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
                支持上传以下文件类型：.pt、png、jpg、jpeg、zip、rar、7z，总大小不超过100MB。上传时只能选择单一文件类型。
              </div>
            </template>
          </el-upload>
          <template #footer>
            <span class="dialog-footer">
              <el-button @click="dialogVisible = false">取消</el-button>
              <el-button
                :loading="uploading"
                type="primary"
                @click="submitFilesUpload"
                >上传文件</el-button
              >
            </span>
          </template>
        </el-dialog>
      </div>
    </template>

    <div class="split-pane">
      <splitpane :splitSet="settingLR">
        <!-- #paneL 表示指定该组件为左侧面板 -->
        <template #paneL>
          <!-- 自定义右侧面板的内容 -->
          <el-scrollbar>
            <div class="dv-a">
              <!-- 文件数据表格 -->
              <div class="flex flex-col relative justify-center align-center">
                <div>
                  <el-table
                    :data="tableData"
                    border
                    stripe
                    @sort-change="handleSortChange"
                    @row-click="previewFile"
                  >
                    <!--                    <el-table-column-->
                    <!--                      label="文件ID"-->
                    <!--                      fixed-->
                    <!--                      prop="file_id"-->
                    <!--                      sortable-->
                    <!--                      width="320"-->
                    <!--                    />-->
                    <el-table-column
                      align="center"
                      label="文件名称"
                      prop="file_real_name"
                      sortable
                    />
                    <el-table-column
                      align="center"
                      label="文件类型"
                      prop="file_type"
                      sortable
                    />
                    <!--                    <el-table-column-->
                    <!--                      label="文件路径"-->
                    <!--                      prop="file_path"-->
                    <!--                      sortable-->
                    <!--                    />-->
                    <el-table-column
                      align="center"
                      label="文件描述"
                      prop="file_comment"
                      sortable
                    />
                    <el-table-column
                      align="center"
                      label="上传时间"
                      prop="file_create_time"
                      sortable
                    />

                    <el-table-column align="center" label="操作">
                      <template v-slot="scope">
                        <el-button
                          v-if="true"
                          :icon="Delete"
                          type="default"
                          @click="deleteFile(scope.row)"
                        />
                        <el-button
                          v-if="true"
                          :icon="Download"
                          type="default"
                          @click="downloadFiles(scope.row)"
                        />
                      </template>
                    </el-table-column>
                  </el-table>
                </div>
              </div>
            </div>
          </el-scrollbar>
        </template>

        <!-- #paneR 表示指定该组件为右侧面板 -->
        <template #paneR>
          <!-- 自定义右侧面板的内容 -->
          <el-scrollbar>
            <div class="dv-a">
              <!--              图像-->
              <div v-if="['png', 'jpg', 'jpeg'].includes(fileExt)">
                <img
                  :src="previewUrl"
                  style="height: 100%; width: 100%; object-fit: contain"
                  alt=""
                  fit="contain"
                />
              </div>
              <!--              yaml-->
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
  text-align: center;
  color: #666;
}

.error {
  color: #e53e3e;
  background: #fed7d7;
}

.yaml-content {
  overflow: auto;
  max-height: 600px;
}

pre {
  margin: 0;
  padding: 20px;
  text-align: left !important; /* 强制左对齐 */
  white-space: pre !important; /* 保持原始空白字符 */
  font-family: "Fira Code", "Consolas", "Monaco", monospace;
  font-size: 14px;
  line-height: 1.5;
}

code {
  display: block;
  text-align: left !important; /* 强制左对齐 */
  white-space: pre !important; /* 保持原始格式 */
  background: none !important;
  padding: 0 !important;
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
