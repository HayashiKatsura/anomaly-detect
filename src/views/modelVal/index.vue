<script setup lang="ts">
import splitpane, { ContextProps } from "@/components/ReSplitPane";
import { onMounted, reactive, ref, computed } from "vue";
import { ElMessage } from "element-plus";
import axios from "axios";
import { API_URL } from "@/url.js";
import { PlusDialogForm } from "plus-pro-components";
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
  name: "ModelVal"
});

const settingLR: ContextProps = reactive({
  minPercent: 20,
  defaultPercent: 75,
  split: "vertical"
});

const settingTB: ContextProps = reactive({
  minPercent: 15,
  defaultPercent: 85,
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

const dataYamlOptions = ref([]);
const dataYamlId = ref(""); // 先给空值

const showType = ref(false); //展示类型 True 单张展示， False 全部展示
const visible = ref(false);
const formValues = ref({});
const columns = ref([]);

const srcList = [
  "https://fuss10.elemecdn.com/a/3f/3302e58f9a181d2509f3dc0fa68b0jpeg.jpeg",
  "https://fuss10.elemecdn.com/1/34/19aa98b1fcb2781c4fba33d850549jpeg.jpeg",
  "https://fuss10.elemecdn.com/0/6f/e35ff375812e6b0020b6b4e8f9583jpeg.jpeg",
  "https://fuss10.elemecdn.com/9/bb/e27858e973f5d7d3904835f46abbdjpeg.jpeg",
  "https://fuss10.elemecdn.com/d/e6/c4d93a3805b3ce3f323f7974e6f78jpeg.jpeg",
  "https://fuss10.elemecdn.com/3/28/bbf893f792f03a54408b3b7a7ebf0jpeg.jpeg",
  "https://fuss10.elemecdn.com/2/11/6535bcfb26e4c79b48ddde44f4b6fjpeg.jpeg",
  "https://fuss10.elemecdn.com/a/3f/3302e58f9a181d2509f3dc0fa68b0jpeg.jpeg",
  "https://fuss10.elemecdn.com/1/34/19aa98b1fcb2781c4fba33d850549jpeg.jpeg",
  "https://fuss10.elemecdn.com/0/6f/e35ff375812e6b0020b6b4e8f9583jpeg.jpeg"
];
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

          // 待验证的图片
          imagesData.value = allData.value.filter(
            item =>
              item.file_comment == "upload_image" ||
              item.file_comment == "image-folder"
          );
          // console.log("imagesData", imagesData.value);

          // 待验证的模型
          weightsData.value = allData.value.filter(
            item => item.file_comment == "upload_weight"
          );
          // console.log("weightsData", weightsData.value);
          modelOptions.value = weightsData.value.map(item => ({
            value: item.file_id,
            label: item.file_real_name
          }));
          if (modelOptions.value.length > 0) {
            modelValue.value = modelOptions.value[0].value;
          }

          // 待验证的数据集文件
          dataYamlOptions.value = allData.value
            .filter(item => item.file_comment == "upload_yaml")
            .map(item => ({
              value: item.file_id,
              label: item.file_real_name
            }));
          if (dataYamlOptions.value.length > 0) {
            dataYamlId.value = dataYamlOptions.value[0].value;
          }

          columns.value = [
            {
              label: "数据集",
              width: 120,
              prop: "dataYamlId",
              valueType: "select",
              options: dataYamlOptions.value
            },
            {
              label: "置信度",
              prop: "conf",
              valueType: "radio",
              options: [
                {
                  label: "0.25",
                  value: "0.25"
                },
                {
                  label: "0.5",
                  value: "0.5"
                },
                {
                  label: "0.75",
                  value: "0.75"
                }
              ]
            }
          ];

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

const previewFile = async file => {
  currentFile.value = file;
  if (String(file.file_id).includes("folder")) {
    return;
  }
  // 读取图像的函数
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

const valWeights = async file => {
  visible.value = true;
  try {
    const res = await axios.get(API_URL + "/val_weight", {
      params: valWeightsParams.value
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
    console.error("验证失败:", error.message);
    ElMessage.error("验证失败: " + error.message);
  } finally {
    getTableData();
    valWeightsParams.value = {};
  }
};

// TODO: 验证文件夹下载存在问题
// 文件下载
const downloadFiles = async file => {
  console.log("downloadFiles", file);
  let file_name = file.file_real_name;
  try {
    await axios
      .get(`${API_URL}/download_file/${file.file_id}`, {
        responseType: "blob",
        params: {
          detect_id: file.is_detected
        }
      })
      .then(({ data }) => {
        if (data.type === "application/zip") {
          file_name += ".zip";
        }
        downloadByData(data, file_name);
      });
  } catch (error) {
    ElMessage.error("下载失败: " + error.message);
  }
};

// 添加方法来计算验证状态
const getDetectionStatus = row => {
  // 如果是文件夹（有 children 属性）
  if (row.children && Array.isArray(row.children)) {
    if (row.children.length === 0) {
      return "📁空文件夹";
    }

    // 检查所有子文件的验证状态
    const detectedChildren = row.children.filter(
      child => child.is_detected && child.is_detected !== "False"
    );

    const totalChildren = row.children.length;
    const detectedCount = detectedChildren.length;

    if (detectedCount === totalChildren) {
      return "✔已验证";
    } else if (detectedCount === 0) {
      return "📷待验证";
    } else {
      return `⏳${detectedCount}/${totalChildren}`;
    }
  }

  // 如果是普通文件
  return row.is_detected === "False" ? "📷待验证" : "✔已验证";
};

const shouldShowDownloadButton = row => {
  // 文件夹：所有子文件都验证完成才显示
  if (row.children && Array.isArray(row.children)) {
    return (
      row.children.length > 0 &&
      row.children.every(child => child.is_detected !== "False")
    );
  }

  // 单文件：自己验证完成就显示
  return row.is_detected !== "False";
};

const handleOpen = () => {
  visible.value = true;
  console.log("columns", columns);
};

const valWeightsParams = ref({});
const confirmDialog = filedValues => {
  visible.value = false;
  valWeightsParams.value = filedValues;
};
const cancelDialog = () => {
  visible.value = false;
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
      <div class="card-header flex justify-between">
        <!-- 切换预览模式 -->
        <div class="hover:cursor-pointer" @click="showType = !showType">
          <el-text class="mx-1" type="warning">切换预览模式</el-text>
        </div>

        <!-- 弹出表单 -->
        <PlusDialogForm
          v-model:visible="visible"
          v-model="formValues"
          title="确认验证项"
          :form="{ columns }"
          @confirm="confirmDialog"
          @cancel="cancelDialog"
        />

        <div class="flex items-center space-x-5">
          <!-- 分页控件 -->
          <div class="pagination-container">
            <el-pagination
              :current-page="pageNum"
              :page-size="pageSize"
              :page-sizes="[16, 32, 64]"
              :total="total"
              layout="total, sizes, prev, pager, next"
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
              placeholder="输入文件名称"
              style="width: 150px"
            />
            <el-button
              style="width: 65px"
              :icon="Search"
              class="search-button"
              type="primary"
              @click="getTableData"
              >搜索</el-button
            >
          </div>
        </div>
      </div>
    </template>

    <div class="split-pane">
      <splitpane :splitSet="settingLR">
        <!-- #paneL 左侧表格 -->
        <template #paneL>
          <splitpane :splitSet="settingTB">
            <template #paneL>
              <div v-if="!showType" class="h-full w-full">
                <el-image
                  style="width: 100%; height: 100%; object-fit: contain"
                  :src="srcList[0]"
                  :zoom-rate="1.2"
                  :max-scale="7"
                  :min-scale="0.2"
                  :preview-src-list="srcList"
                  show-progress
                  :initial-index="0"
                  fit="contain"
                />
              </div>
              <div
                v-if="showType"
                class="w-full h-full grid grid-cols-5 grid-rows-2 gap-2 p-4"
              >
                <div
                  v-for="(item, index) in srcList"
                  :key="index"
                  class="relative overflow-hidden rounded-lg border border-gray-200"
                >
                  <el-image
                    class="w-full h-full object-cover"
                    :src="item"
                    :zoom-rate="1.2"
                    :max-scale="7"
                    :min-scale="0.2"
                    :preview-src-list="srcList"
                    :show-progress="true"
                    :initial-index="index"
                    fit="cover"
                  />
                </div>
              </div>
            </template>

            <template #paneR>
              <el-scrollbar>
                <div class="dv-a">
                  <!-- 验证数据表格 -->
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
                          label="置信度"
                          prop="file_name"
                          sortable
                        />
                        <el-table-column
                          align="center"
                          label="mAP50"
                          prop="cls"
                          sortable
                        />
                        <el-table-column
                          align="center"
                          label="precision"
                          prop="cls"
                          sortable
                        />
                        <el-table-column
                          align="center"
                          label="recall"
                          prop="cls"
                          sortable
                        />
                        <el-table-column
                          align="center"
                          label="mAP75"
                          prop="conf"
                          sortable
                        />
                        <el-table-column
                          align="center"
                          label="mAP50-95"
                          prop="yolo_coord"
                          sortable
                        />
                        <el-table-column
                          align="center"
                          label="black"
                          prop="detect_coord"
                          sortable
                        />
                        <el-table-column
                          align="center"
                          label="damage"
                          prop="detect_area"
                          sortable
                        />
                        <el-table-column
                          align="center"
                          label="ink"
                          prop="image_size"
                          sortable
                        />
                        <el-table-column
                          align="center"
                          label="residue"
                          prop="image_size"
                          sortable
                        />
                        <el-table-column
                          align="center"
                          label="pi"
                          prop="image_size"
                          sortable
                        />
                        <el-table-column
                          align="center"
                          label="circle"
                          prop="image_size"
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
              <!--              原始图像-->
              <div class="flex flex-col relative justify-center align-center">
                <div>
                  <el-table
                    :data="weightsData"
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
                      prop="file_real_name"
                      sortable
                    />
                    <el-table-column
                      align="center"
                      label="上传时间"
                      prop="file_create_time"
                      sortable
                    />
                    <!-- <el-table-column
                          align="center"
                          label="验证状态"
                          prop="is_detected"
                          sortable
                        >
                          <template v-slot="scope">
                            <el-button
                              v-if="true"
                              type="default"
                              @click.stop="valWeights(scope.row)"
                            >
                              <span>{{
                                scope.row.is_detected === "False"
                                  ? "📷待验证"
                                  : "✔已验证"
                              }}</span>
                            </el-button>
                          </template>
                        </el-table-column> -->
                    <el-table-column
                      align="center"
                      label="验证状态"
                      prop="is_detected"
                      sortable
                    >
                      <template v-slot="scope">
                        <el-button
                          type="default"
                          @click.stop="valWeights(scope.row)"
                        >
                          <span>{{ getDetectionStatus(scope.row) }}</span>
                        </el-button>
                      </template>
                    </el-table-column>

                    <!-- <el-table-column align="center" label="下载结果">
                          <template v-slot="scope">
                            <el-button
                              v-if="scope.row.is_detected != 'False'"
                              :icon="Download"
                              type="default"
                              @click.stop="downloadFiles(scope.row)"
                            >
                              下载
                            </el-button>
                          </template>
                        </el-table-column> -->
                    <el-table-column align="center" label="下载结果">
                      <template v-slot="scope">
                        <el-button
                          v-if="shouldShowDownloadButton(scope.row)"
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
