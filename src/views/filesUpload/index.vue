<script setup lang="ts">
import splitpane, { ContextProps } from "@/components/ReSplitPane";
import { onMounted, reactive, ref, computed, watch } from "vue";
import { ElMessage, ElNotification } from "element-plus";

import axios from "axios";
import { API_URL } from "@/url.js";
import Prism from "prismjs";
import {
  getStorage,
  deleteFiles,
  uploadFiles,
  downloadFiles
} from "@/api/ultralytics.ts";

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

const storageData = ref([]);
const loading = ref(false);
const selectList = ref([]);

const uploading = ref(false);
const pageSize = ref(30);
const pageNum = ref(1);
const total = ref(0);
const currentFile = ref(null);
const previewUrl = ref("");
const textContent = ref("");
const uploadFileList = ref([]);
const fileUploadVisible = ref(false);
const uploadMode = ref("random");
const selectedFolderId = ref(null);

const fileTypeSelectVisible = ref(false);
const fileTypeSelect = ref(null);
const fileUploadTypeURL = ref(null);
const fileShowTypeURL = ref("all");
const fileShowTypeURLSelection = [
  {
    label: "全部",
    value: "all"
  },
  {
    label: "图片",
    value: "images"
  },
  {
    label: "视频",
    value: "videos"
  },
  {
    label: "权重",
    value: "weights"
  },
  {
    label: "数据集",
    value: "datasets"
  }
];
const uploadAccept = ref(null);

const settingLR: ContextProps = reactive({
  minPercent: 20,
  defaultPercent: 40,
  split: "vertical"
});

// 随机上传
const openRandomUpload = () => {
  uploadMode.value = "random";
  selectedFolderId.value = null;
  fileUploadVisible.value = true;
};

const closeDialog = () => {
  uploadFileList.value = [];
  fileUploadVisible.value = false;
  uploadMode.value = "random";
  selectedFolderId.value = null;
};

// 文件上传
const handleUploadFiles = async () => {
  if (uploadFileList.value.length === 0) {
    ElMessage.warning("请选择要上传的文件");
    return;
  }
  uploading.value = true;
  const filesFormData = new FormData();
  uploadFileList.value.forEach(file => {
    filesFormData.append("files", file.raw);
  });
  ElNotification.warning({
    title: "正在上传...",
    message: "",
    showClose: false,
    duration: 1000
  });

  try {
    await uploadFiles(filesFormData, fileUploadTypeURL.value);
  } catch (error) {
    ElNotification.error({
      title: "上传失败",
      message: error.message,
      showClose: false,
      duration: 1000
    });
  } finally {
    uploading.value = false;
    uploadFileList.value = [];
    fileUploadVisible.value = false;
    handleGetStorage(pageNum.value, pageSize.value, fileShowTypeURL.value);
  }

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
};
const onUploadFileListChange = () => {
  console.log("uploadFileList change", uploadFileList.value);
};

const handleGetStorage = async (page, page_size, file_type) => {
  try {
    loading.value = true;
    const response = await getStorage({
      page: page,
      page_size: page_size,
      file_type: file_type
    });
    storageData.value = response.data.data.files;
    currentFile.value = storageData.value[0];
    previewUrl.value = `${API_URL}/show-files/${currentFile.value.id}`;
    total.value = response.data.data.total;
    console.log("total:", total.value);
  } catch (error) {
    console.error("获取数据失败:", error);
  } finally {
    loading.value = false;
  }
};
//挂载完成
onMounted(async () => {
  await handleGetStorage(pageNum.value, pageSize.value, fileShowTypeURL.value);
});

// 文件选择
const handleSelectionChange = line => {
  line.forEach(item => {
    selectList.value.push(item);
  });
  console.log("selectList", selectList.value);
  console.log("selectList.length", selectList.value.length);
};

// 文件预览
const previewFile = async file => {
  currentFile.value = file;
  console.log("file-id", file);
  previewUrl.value = `${API_URL}/show-files/${file.id}`;
  console.log("previewUrl", previewUrl.value);
};

// 文件删除
const handleDelete = async filesObject => {
  try {
    let fileIds = [];
    if (!filesObject?.length) {
      filesObject = [filesObject]
    }
    filesObject.forEach(async file => {
      fileIds.push(file.id);
    });
    await deleteFiles(fileIds);
    storageData.value = storageData.value.filter(
      file => !fileIds.includes(file.id)
    );
    ElMessage.success("删除成功");
  } catch (error) {
    console.error("删除失败", error);
    ElMessage.error("删除失败");
  } finally {
    selectList.value = [];
  }
};

// 文件下载
const handleDownloadFiles = async filesObject => {
  console.log("fileinfo", typeof filesObject); //object
  ElNotification.warning({
    title: "正在下载...",
    showClose: false,
    duration: 1000
  });
  if (!filesObject?.length) {
    filesObject = [filesObject];
  }

  filesObject.forEach(async file => {
    let original_filename = file.original_filename;
    try {
      const downloadRes = await downloadFiles(file.id);
      downloadByData(downloadRes.data, original_filename);
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
  });
  selectList.value = [];
};

const fileTypeSelectConfirm = fileType => {
  fileTypeSelect.value = fileType;
  fileTypeSelectVisible.value = false;
  fileUploadVisible.value = true;
  if (fileType.includes("image")) {
    uploadAccept.value = "image/*";
    fileUploadTypeURL.value = "images";
  } else if (fileType.includes("video")) {
    uploadAccept.value = "video/*";
    fileUploadTypeURL.value = "videos";
  } else if (fileType.includes("dataset")) {
    uploadAccept.value = ".zip, application/zip";
    fileUploadTypeURL.value = "datasets";
  } else {
    uploadAccept.value = ".pt";
    fileUploadTypeURL.value = "weights";
  }
};

watch(fileShowTypeURL, async newValue => {
  await handleGetStorage(pageNum.value, pageSize.value, newValue);
});

watch(pageSize, async newValue => {
  await handleGetStorage(pageNum.value, newValue, fileShowTypeURL.value);
});

watch(pageNum, async newValue => {
  await handleGetStorage(newValue, pageSize.value, fileShowTypeURL.value);
});
</script>

<template>
  <el-card shadow="never">
    <!-- 表头提示 -->
    <template #header>
      <div class="card-header flex justify-between items-center">
        <div class="action-buttons-container">
          <el-button
            :icon="Upload"
            type="primary"
            @click="fileTypeSelectVisible = true"
          >
            上传文件
          </el-button>
          <el-button
            :icon="Download"
            type="primary"
            @click="handleDownloadFiles(selectList)"
          >
            下载文件
          </el-button>
          <el-button
            :icon="Delete"
            type="danger"
            @click="handleDelete(selectList)"
          >
            删除文件
          </el-button>
        </div>
        <div>
          <el-select
            v-model="fileShowTypeURL"
            placeholder="Select"
            style="width: 100px"
            text-color="#626aef"
          >
            <el-option
              v-for="item in fileShowTypeURLSelection"
              :key="item.value"
              :label="item.label"
              :value="item.value"
            />
          </el-select>
        </div>

        <!-- 文件类型 -->
        <el-dialog
          v-model="fileTypeSelectVisible"
          width="900"
          @close="fileTypeSelectVisible = false"
          draggable
        >
          <!-- 文件类型选择区域 -->
          <div class="py-4">
            <!-- 提示文字 -->
            <div class="text-center mb-8">
              <p class="text-gray-600 text-base">请选择您要上传的文件类型</p>
            </div>

            <!-- 横向四格布局 -->
            <div class="flex gap-4">
              <!-- 图片卡片 -->
              <div
                @click="fileTypeSelectConfirm('image')"
                class="flex-1 cursor-pointer transition-all duration-300 transform relative"
                :class="
                  fileTypeSelect === 'image' ? 'scale-105' : 'hover:scale-102'
                "
              >
                <div
                  class="bg-white rounded-2xl shadow-md overflow-hidden border-2 transition-all duration-300"
                  :class="
                    fileTypeSelect === 'image'
                      ? 'border-blue-400 shadow-lg shadow-blue-100'
                      : 'border-gray-200 hover:border-blue-300 hover:shadow-lg'
                  "
                >
                  <!-- 图标区域 -->
                  <div
                    class="bg-gradient-to-br from-blue-500 to-cyan-400 p-12 flex items-center justify-center relative overflow-hidden"
                  >
                    <!-- 背景装饰 -->
                    <div class="absolute inset-0 opacity-10">
                      <div
                        class="absolute top-2 right-2 w-20 h-20 bg-white rounded-full"
                      ></div>
                      <div
                        class="absolute bottom-2 left-2 w-16 h-16 bg-white rounded-full"
                      ></div>
                    </div>

                    <!-- 图片图标 -->
                    <svg
                      class="w-20 h-20 text-white relative z-10"
                      fill="none"
                      stroke="currentColor"
                      viewBox="0 0 24 24"
                    >
                      <path
                        stroke-linecap="round"
                        stroke-linejoin="round"
                        stroke-width="1.5"
                        d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z"
                      />
                    </svg>
                  </div>

                  <!-- 文字信息 -->
                  <div class="p-4 text-center">
                    <h3 class="text-lg font-bold text-gray-800 mb-1">图片</h3>
                    <p class="text-gray-500 text-xs">JPG, PNG, JPEG</p>
                  </div>

                  <!-- 选中标记 -->
                  <div
                    v-if="fileTypeSelect === 'image'"
                    class="absolute top-3 right-3 z-20"
                  >
                    <div
                      class="w-6 h-6 rounded-full bg-white flex items-center justify-center shadow-md"
                    >
                      <svg
                        class="w-4 h-4 text-blue-500"
                        fill="currentColor"
                        viewBox="0 0 20 20"
                      >
                        <path
                          fill-rule="evenodd"
                          d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z"
                          clip-rule="evenodd"
                        />
                      </svg>
                    </div>
                  </div>
                </div>
              </div>

              <!-- 视频卡片 -->
              <div
                @click="fileTypeSelectConfirm('video')"
                class="flex-1 cursor-pointer transition-all duration-300 transform relative"
                :class="
                  fileTypeSelect === 'video' ? 'scale-105' : 'hover:scale-102'
                "
              >
                <div
                  class="bg-white rounded-2xl shadow-md overflow-hidden border-2 transition-all duration-300"
                  :class="
                    fileTypeSelect === 'video'
                      ? 'border-purple-400 shadow-lg shadow-purple-100'
                      : 'border-gray-200 hover:border-purple-300 hover:shadow-lg'
                  "
                >
                  <!-- 图标区域 -->
                  <div
                    class="bg-gradient-to-br from-purple-500 to-pink-400 p-12 flex items-center justify-center relative overflow-hidden"
                  >
                    <!-- 背景装饰 -->
                    <div class="absolute inset-0 opacity-10">
                      <div
                        class="absolute top-4 left-4 w-18 h-18 bg-white rounded-full"
                      ></div>
                      <div
                        class="absolute bottom-4 right-4 w-14 h-14 bg-white rounded-full"
                      ></div>
                    </div>

                    <!-- 视频图标 -->
                    <svg
                      class="w-20 h-20 text-white relative z-10"
                      fill="none"
                      stroke="currentColor"
                      viewBox="0 0 24 24"
                    >
                      <path
                        stroke-linecap="round"
                        stroke-linejoin="round"
                        stroke-width="1.5"
                        d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z"
                      />
                    </svg>
                  </div>

                  <!-- 文字信息 -->
                  <div class="p-4 text-center">
                    <h3 class="text-lg font-bold text-gray-800 mb-1">视频</h3>
                    <p class="text-gray-500 text-xs">MP4, AVI, MOV</p>
                  </div>

                  <!-- 选中标记 -->
                  <div
                    v-if="fileTypeSelect === 'video'"
                    class="absolute top-3 right-3 z-20"
                  >
                    <div
                      class="w-6 h-6 rounded-full bg-white flex items-center justify-center shadow-md"
                    >
                      <svg
                        class="w-4 h-4 text-purple-500"
                        fill="currentColor"
                        viewBox="0 0 20 20"
                      >
                        <path
                          fill-rule="evenodd"
                          d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z"
                          clip-rule="evenodd"
                        />
                      </svg>
                    </div>
                  </div>
                </div>
              </div>

              <!-- 模型卡片 -->
              <div
                @click="fileTypeSelectConfirm('wegiht')"
                class="flex-1 cursor-pointer transition-all duration-300 transform relative"
                :class="
                  fileTypeSelect === 'wegiht' ? 'scale-105' : 'hover:scale-102'
                "
              >
                <div
                  class="bg-white rounded-2xl shadow-md overflow-hidden border-2 transition-all duration-300"
                  :class="
                    fileTypeSelect === 'wegiht'
                      ? 'border-emerald-400 shadow-lg shadow-emerald-100'
                      : 'border-gray-200 hover:border-emerald-300 hover:shadow-lg'
                  "
                >
                  <!-- 图标区域 -->
                  <div
                    class="bg-gradient-to-br from-emerald-500 to-teal-400 p-12 flex items-center justify-center relative overflow-hidden"
                  >
                    <!-- 背景装饰 -->
                    <div class="absolute inset-0 opacity-10">
                      <div
                        class="absolute top-3 right-3 w-16 h-16 bg-white rounded-lg rotate-12"
                      ></div>
                      <div
                        class="absolute bottom-3 left-3 w-20 h-20 bg-white rounded-lg -rotate-12"
                      ></div>
                    </div>

                    <!-- 3D模型图标 -->
                    <svg
                      class="w-20 h-20 text-white relative z-10"
                      fill="none"
                      stroke="currentColor"
                      viewBox="0 0 24 24"
                    >
                      <path
                        stroke-linecap="round"
                        stroke-linejoin="round"
                        stroke-width="1.5"
                        d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4"
                      />
                    </svg>
                  </div>

                  <!-- 文字信息 -->
                  <div class="p-4 text-center">
                    <h3 class="text-lg font-bold text-gray-800 mb-1">
                      模型权重
                    </h3>
                    <p class="text-gray-500 text-xs">PT</p>
                  </div>

                  <!-- 选中标记 -->
                  <div
                    v-if="fileTypeSelect === 'wegiht'"
                    class="absolute top-3 right-3 z-20"
                  >
                    <div
                      class="w-6 h-6 rounded-full bg-white flex items-center justify-center shadow-md"
                    >
                      <svg
                        class="w-4 h-4 text-emerald-500"
                        fill="currentColor"
                        viewBox="0 0 20 20"
                      >
                        <path
                          fill-rule="evenodd"
                          d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z"
                          clip-rule="evenodd"
                        />
                      </svg>
                    </div>
                  </div>
                </div>
              </div>

              <!-- 数据集卡片 -->
              <div
                @click="fileTypeSelectConfirm('dataset')"
                class="flex-1 cursor-pointer transition-all duration-300 transform relative"
                :class="
                  fileTypeSelect === 'dataset' ? 'scale-105' : 'hover:scale-102'
                "
              >
                <div
                  class="bg-white rounded-2xl shadow-md overflow-hidden border-2 transition-all duration-300"
                  :class="
                    fileTypeSelect === 'dataset'
                      ? 'border-orange-400 shadow-lg shadow-orange-100'
                      : 'border-gray-200 hover:border-orange-300 hover:shadow-lg'
                  "
                >
                  <!-- 图标区域 -->
                  <div
                    class="bg-gradient-to-br from-orange-500 to-amber-400 p-12 flex items-center justify-center relative overflow-hidden"
                  >
                    <!-- 背景装饰 -->
                    <div class="absolute inset-0 opacity-10">
                      <div
                        class="absolute top-2 right-4 w-16 h-16 bg-white rounded-lg rotate-45"
                      ></div>
                      <div
                        class="absolute bottom-4 left-2 w-20 h-20 bg-white rounded-lg -rotate-45"
                      ></div>
                      <div
                        class="absolute top-1/2 left-1/2 w-12 h-12 bg-white rounded-lg rotate-12"
                      ></div>
                    </div>

                    <!-- 数据集图标 -->
                    <svg
                      class="w-20 h-20 text-white relative z-10"
                      fill="none"
                      stroke="currentColor"
                      viewBox="0 0 24 24"
                    >
                      <path
                        stroke-linecap="round"
                        stroke-linejoin="round"
                        stroke-width="1.5"
                        d="M4 7v10c0 2.21 3.582 4 8 4s8-1.79 8-4V7M4 7c0 2.21 3.582 4 8 4s8-1.79 8-4M4 7c0-2.21 3.582-4 8-4s8 1.79 8 4m0 5c0 2.21-3.582 4-8 4s-8-1.79-8-4"
                      />
                    </svg>
                  </div>

                  <!-- 文字信息 -->
                  <div class="p-4 text-center">
                    <h3 class="text-lg font-bold text-gray-800 mb-1">数据集</h3>
                    <p class="text-gray-500 text-xs">ZIP</p>
                  </div>

                  <!-- 选中标记 -->
                  <div
                    v-if="fileTypeSelect === 'dataset'"
                    class="absolute top-3 right-3 z-20"
                  >
                    <div
                      class="w-6 h-6 rounded-full bg-white flex items-center justify-center shadow-md"
                    >
                      <svg
                        class="w-4 h-4 text-orange-500"
                        fill="currentColor"
                        viewBox="0 0 20 20"
                      >
                        <path
                          fill-rule="evenodd"
                          d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z"
                          clip-rule="evenodd"
                        />
                      </svg>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </el-dialog>

        <!-- 文件上传 -->
        <el-dialog
          v-model="fileUploadVisible"
          :title="uploadMode === 'folder' ? '上传到当前文件夹' : '上传文件'"
          width="30%"
          @close="closeDialog"
        >
          <el-upload
            v-model:file-list="uploadFileList"
            :auto-upload="false"
            :on-change="onUploadFileListChange"
            :accept="uploadAccept"
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
              <div class="el-upload__tip">总大小不超过100MB。</div>
            </template>
          </el-upload>

          <template #footer>
            <span class="dialog-footer">
              <el-button @click="closeDialog">取消</el-button>
              <el-button
                :loading="uploading"
                type="primary"
                @click="handleUploadFiles"
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
        <!-- 左侧看板 -->
        <template #paneL>
          <div class="dv-a h-full">
            <div
              v-loading="loading"
              class="flex flex-col relative justify-center h-full"
            >
              <!-- 文件数据表格 -->
              <el-scrollbar>
                <div class="flex-[9]">
                  <el-table
                    :data="storageData"
                    row-key="id"
                    border
                    stripe
                    default-expand-all
                    @row-click="previewFile"
                    highlight-current-row
                    @selection-change="handleSelectionChange"
                  >
                    <el-table-column type="selection" width="35" />
                    <el-table-column
                      align="center"
                      label="文件名称"
                      prop="original_filename"
                      sortable
                    />
                    <el-table-column
                      align="center"
                      label="文件类型"
                      prop="kind"
                      sortable
                    />
                    <el-table-column
                      align="center"
                      label="文件大小"
                      prop="size_bytes"
                      sortable
                    />
                    <el-table-column
                      align="center"
                      label="上传时间"
                      prop="created_at"
                      sortable
                    />

                    <el-table-column align="center" label="操作">
                      <template v-slot="scope">
                        <el-button
                          v-if="true"
                          :icon="Download"
                          type="default"
                          @click.stop="handleDownloadFiles(scope.row)"
                        />

                        <el-popconfirm
                          confirm-button-text="删除"
                          cancel-button-text="取消"
                          :icon="Delete"
                          icon-color="#626AEF"
                          title="是否确认删除？"
                          @confirm="handleDelete(scope.row)"
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
              </el-scrollbar>

              <div class="flex-[1]">
                <div class="flex justify-center">
                  <!-- 分页控件 -->
                  <div class="pagination-container">
                    <el-pagination
                      :current-page="pageNum"
                      :page-size="pageSize"
                      :page-sizes="[10, 20, 30]"
                      :total="total"
                      :pager-count="3"
                      layout="total, sizes, prev, pager, next"
                      @size-change="handleSizeChange"
                      @current-change="handleCurrentChange"
                    />
                  </div>
                </div>
              </div>
            </div>
          </div>
        </template>

        <!-- 右侧看板的内容 -->
        <template #paneR>
          <div
            class="dv-a flex flex-col justify-center items-center w-full h-full"
          >
            <!--图像-->
            <div
              v-if="currentFile?.kind.includes('image')"
              class="justify-center flex-[1] items-center w-full h-full"
            >
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
            <div
              v-else-if="currentFile?.kind.includes('video')"
              class="justify-center flex-[1] items-center w-full h-full"
            >
              <video
                style="width: 100%; height: 100%; object-fit: contain"
                :key="previewUrl"
                :src="previewUrl"
                controls
                @error="null"
              />
            </div>
          </div>
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
    color: rgba($color: dodgerblue, $alpha: 80%);
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

/* 1. 修改输入框内已选中内容的样式 */
::v-deep .el-input__inner {
  color: #626aef; /* 输入框字体颜色 */
  font-image_size: 14px; /* 输入框字体大小 */
}

/* 2. 修改下拉面板中选项的样式（未选中状态） */
::v-deep .el-select-dropdown__item {
  color: #333; /* 未选中选项的字体颜色 */
  font-image_size: 13px; /* 未选中选项的字体大小 */
}

/* 3. 修改下拉面板中选中选项的样式（高亮状态） */
::v-deep .el-select-dropdown__item.selected {
  color: #626aef; /* 选中选项的字体颜色 */
  font-weight: bold; /* 选中选项加粗（可选） */
}

/* 4. 可选：修改下拉面板的整体样式（如背景、边框等） */
::v-deep .el-select-dropdown {
  background: #fafafa; /* 下拉面板背景色 */
  border: 1px solid #eee; /* 下拉面板边框 */
}
</style>
