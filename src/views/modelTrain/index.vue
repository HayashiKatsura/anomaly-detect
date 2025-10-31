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
import {
  Upload,
  Download,
  ArrowRight,
  CaretBottom,
  CaretTop,
  Warning
} from "@element-plus/icons-vue";
import { downloadByData } from "@pureadmin/utils";
import {
  getStorage,
  deleteFiles,
  FilesType,
  predictFiles,
  showPredictions,
  validateWeights,
  showValidations,
  startTraining,
  stopTraining,
  getTrainingLog
} from "@/api/ultralytics.ts";

defineOptions({
  name: "ModelTrain"
});

const settingLR: ContextProps = reactive({
  minPercent: 25,
  defaultPercent: 40,
  split: "vertical"
});



// 训练配置
const trainParams = reactive({
  name: "Test",
  dataset_id: "",
  model: "YOLOv8",
  device: "cpu",
  image_size: 640,
  batch_size: 16,
  learning_rate: 0.01,
  epochs: 5,
  dataset_example: "dataset"
});

const trainModelOptions = [
  {
    label: "YOLOv12",
    value: "YOLOv12"
  },
  {
    label: "YOLOv11",
    value: "YOLOv11"
  },
  {
    label: "YOLOv8",
    value: "YOLOv8"
  },
  {
    label: "ChipsYOLO",
    value: "ChipsYOLO"
  },
  {
    label: "DETR",
    value: "DETR"
  }
];

const trainDeviceOptions = [
  {
    label: "CPU",
    value: "cpu"
  },
  {
    label: "GPU",
    value: "gpu"
  }
];

// 响应式数据

const currentSessionId = ref(null);
const trainedWeights = ref([]);
const showTrainedRecord = ref(false);
const showTrainedImages = ref(false);
const showDatasetsSupplement = ref(false);

const trainSettingsVisible = ref(false);
const showDatasetsList = ref(false);
const storageData = ref([]);
const loading = ref(false);
const selectList = ref([]);
const datasetsList = ref([]); // 所有的数据集
const processId = ref(null);
const trainLogConsoleContentURL = ref("");
const trainLogConsoleContent = ref("");

const lastTrainMetrics = ref(null);
const currentTrainMetrics = ref(null);
const currentEpoch = ref(0);
const isTraining = ref(false);
const isTrainingButton = ref(false);

const logBox = ref(null);

const scrollToBottom = () => {
  // 下一帧，等 DOM 更新完成后再滚动
  requestAnimationFrame(() => {
    if (logBox.value) logBox.value.scrollTop = logBox.value.scrollHeight;
  });
};

watch(trainLogConsoleContent, async () => {
  await nextTick();
  scrollToBottom();
});


// 文件下载
const downloadFiles = async (target = "example") => {
  console.log("seesion_id:", currentSessionId.value);
  let params = {};
  let file_name = "";
  if (target === "example") {
    params = { dataset_example: true };
    file_name = trainParams.dataset_example;
  } else if (target === "train_results") {
    params = { train_results: true, seesion_id: currentSessionId.value };
    file_name = trainParams.name;
  } else if (target === "train_log") {
    params = { train_log: true, seesion_id: currentSessionId.value };
    file_name = `${trainParams.name}.log`;
  } else {
    params = { train_results: true, train_id: target.file_id };
    file_name = target.file_name;
  }

  ElNotification.warning({
    title: "正在下载...",
    showClose: false,
    duration: 1000
  });
  try {
    await axios
      .get(`${API_URL}/download_file/null`, {
        responseType: "blob",
        params: params
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



//挂载完成
onMounted(async () => {
  try {
    loading.value = true;
    const response = await getStorage({
      page: 1,
      page_image_size: 100
    });
    storageData.value = response.data.data.files;

    // 数据集数据
    datasetsList.value = storageData.value.filter(file =>
      String(file.kind).includes("dataset")
    );

    trainParams.dataset_id = datasetsList.value[0].id; // 默认选择第一项

    console.log("datasetsList", datasetsList.value);

    // total.value = storageData.value.length
  } catch (error) {
    console.error("获取数据失败:", error);
  } finally {
    loading.value = false;
  }
});

// 启动训练
const preHandleStartTraining = () => {
  trainSettingsVisible.value = true;
  isTraining.value = true;
  isTrainingButton.value = true;
};

const cancelTraining = () => {
  trainSettingsVisible.value = false;
  if (!isTraining.value) isTrainingButton.value = false;
};

const pollingTimer = ref(null);
const unchangedCount = ref(0);
const lastEpochChangeTime = ref(null);
const trainingInterval = ref(5000); // 初始间隔5秒
const MAX_UNCHANGED_COUNT = 3; // 增加到10次，因为训练时间可能较久

const handleStartTraining = async () => {
  isTraining.value = true;
  trainSettingsVisible.value = false;
  try {
    const trainRes = await startTraining(trainParams);
    console.log("trainRes", trainRes.data);
    processId.value = trainRes.data.data.process_id;
    trainLogConsoleContentURL.value = `${API_URL}/show-files/${processId.value}?file_type=${FilesType.TRAINING_LOG}&t=${Date.now()}`;

    // 重置状态
    unchangedCount.value = 0;
    lastEpochChangeTime.value = Date.now();
    trainingInterval.value = 5000;
    currentEpoch.value = null;

    // 开始轮询
    startPolling();
  } catch (error) {
    console.error("训练启动失败:", error);
    ElNotification.error({
      title: "启动训练失败",
      message: "",
      showClose: false,
      duration: 1000
    });
    isTraining.value = false;
    isTrainingButton.value = false;
  }
};

const startPolling = () => {
  // 清除之前的定时器
  if (pollingTimer.value) {
    clearTimeout(pollingTimer.value);
  }

  // 立即执行一次
  handleGetTrainingLog();
};
const handleGetTrainingLog = async () => {
  try {
    const traingLogRes = await getTrainingLog(processId.value);
    const traingLogContent = traingLogRes.data.data;
    console.log("traingLogContent", traingLogContent);
    console.log("traingLogContent.data.length", traingLogContent.data?.length);

    const msg = traingLogContent?.msg || "";

    // 判断消息类型
    if (msg.includes("无")) {
      // 训练日志还未生成或无数据，继续等待
      console.log("训练日志状态:", msg, "- 继续等待...");
      // 这种情况不计入unchangedCount，因为训练可能还未开始
      scheduleNextPoll();
    } else if (msg === "ok") {
      try {
        const trainLogConsoleContentRes = await axios.get(
          trainLogConsoleContentURL.value,
          {
            responseType: "text"
          }
        );
        trainLogConsoleContent.value = trainLogConsoleContentRes.data;
      } catch (error) {
        console.error("读取日志失败:", error);
        trainLogConsoleContent.value = `读取日志失败：${error.message}`;
      }

      // 训练正在进行，处理epoch变化
      const newMetrics = traingLogContent.data.at(-1);
      console.log("newMetrics", newMetrics);
      const newEpoch = newMetrics?.epoch;

      if (newEpoch !== undefined && newEpoch !== null) {
        // 检查 epoch 是否变化
        if (currentEpoch.value !== newEpoch) {
          // epoch 发生变化
          const now = Date.now();
          if (lastEpochChangeTime.value && currentEpoch.value !== null) {
            // 计算动态间隔（epoch变化的时间间隔）
            const calculatedInterval = now - lastEpochChangeTime.value;
            trainingInterval.value = Math.max(calculatedInterval, 3000); // 最小3秒
            console.log(`Epoch变化间隔: ${trainingInterval.value}ms`);
          }

          lastEpochChangeTime.value = now;
          unchangedCount.value = 0; // 重置未变化计数
          currentEpoch.value = newEpoch;
          console.log("currentEpoch", currentEpoch.value);
          currentTrainMetrics.value = newMetrics;
          if (traingLogContent.data?.length == 1) { // TODO 有点不是很同步
            lastTrainMetrics.value = newMetrics;
          } else {
            lastTrainMetrics.value = traingLogContent.data.at(-2);
          }
          // lastTrainMetrics.value = traingLogContent.data.at(-2);

          console.log("currentTrainMetrics", currentTrainMetrics.value);
          console.log("lastTrainMetrics", lastTrainMetrics.value);
          scheduleNextPoll();
        } else {
          // epoch 未变化
          unchangedCount.value++;
          console.log(
            `Epoch未变化次数: ${unchangedCount.value}/${MAX_UNCHANGED_COUNT}`
          );

          // 判断是否继续轮询
          if (unchangedCount.value < MAX_UNCHANGED_COUNT) {
            scheduleNextPoll();
          } else {
            console.log("训练已完成或停止（连续未变化达到阈值），停止轮询");
            stopPolling();
            isTraining.value = false;
            isTrainingButton.value = false;
          }
        }
      } else {
        // msg为ok但没有epoch数据，继续轮询
        console.log("数据格式异常，继续轮询...");
        scheduleNextPoll();
      }
    } else {
      // 其他状态消息
      console.log("训练状态:", msg);
      scheduleNextPoll();
    }
  } catch (error) {
    console.error("获取训练日志失败:", error);
    // 出错时也继续尝试
    unchangedCount.value++;
    if (unchangedCount.value < MAX_UNCHANGED_COUNT) {
      scheduleNextPoll();
    } else {
      console.log("连续失败次数过多，停止轮询");
      stopPolling();
    }
  }
};

// 调度下一次轮询
const scheduleNextPoll = () => {
  pollingTimer.value = setTimeout(() => {
    handleGetTrainingLog();
  }, trainingInterval.value);
};

const stopPolling = () => {
  if (pollingTimer.value) {
    clearTimeout(pollingTimer.value);
    pollingTimer.value = null;
  }
  console.log("轮询已停止");
};

// 组件卸载时清理定时器
onUnmounted(() => {
  stopPolling();
});

const formatTimeSimple = ms => {
  if (!ms || ms < 0) return "0秒";

  const totalSeconds = Math.floor(ms / 1000);
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);

  if (hours > 0) {
    return `约${hours}小时${minutes}分`;
  } else if (minutes > 0) {
    return `约${minutes}分钟`;
  } else {
    return `不到1分钟`;
  }
};
</script>

<template>
  <el-card shadow="never">
    <template #header>
      <div class="card-header">
        <div class="header flex justify-between items-center">
          <div class="flex items-center">
            <div v-if="!isTrainingButton">
              <el-button type="success" plain @click="preHandleStartTraining"
                >✅ 启动训练</el-button
              >
            </div>
            <div v-else>
              <el-button type="danger" plain @click="checkApiConnection"
                >❌ 停止训练</el-button
              >
            </div>
          </div>

          <div class="flex space-x-2 items-center">
            <div>
              <el-button
                type="text"
                class="rounded-lg transition-all duration-200 transform hover:scale-130"
                plain
                @click="showDatasetsList = true"
                >📊 数据集
              </el-button>
            </div>
            <div>|</div>
            <div>
              <el-button
                type="text"
                class="rounded-lg transition-all duration-200 transform hover:scale-130"
                plain
                @click="trainSettingsVisible = true"
                >📝 训练记录
              </el-button>
            </div>
            <div
              v-if="currentTrainMetrics && lastTrainMetrics"
              class="flex items-center"
            >
              <div>|</div>
              <div>
                <el-button
                  class="rounded-lg transition-all duration-200 transform hover:scale-130"
                  type="text"
                  round
                  plain
                  @click="downloadFiles('train_log')"
                  >💾 导出日志</el-button
                >
              </div>
            </div>
          </div>
        </div>
      </div>

      <!-- 训练参数 -->
      <el-dialog
        v-model="trainSettingsVisible"
        title="设置训练参数"
        width="500px"
        draggable
        @close="cancelTraining"
      >
        <div>
          项目名称
          <el-input
            v-model="trainParams.name"
            style="width: 100%; color: #626aef"
            placeholder="输入项目名称"
          />
        </div>
        <div class="full-width-item">
          <div class="flex justify-between">
            <div>数据集</div>
            <div>
              <el-button
                class="rounded-lg transition-all duration-200 transform hover:scale-130"
                image_size="small"
                type="text"
                @click.stop="downloadFiles('example')"
                style="font-image_size: 10"
                >下载数据集样本</el-button
              >
            </div>
          </div>

          <el-select
            v-model="trainParams.dataset_id"
            placeholder="Select"
            style="width: 100%"
            text-color="#626aef"
          >
            <el-option
              v-for="item in datasetsList"
              :key="item.id"
              :label="item.original_filename"
              :value="item.id"
            />
          </el-select>
        </div>

        <div class="full-width-item">
          模型
          <el-select
            v-model="trainParams.model"
            placeholder="Select"
            style="width: 100%"
            text-color="#626aef"
          >
            <el-option
              v-for="item in trainModelOptions"
              :key="item.value"
              :label="item.label"
              :value="item.value"
            />
          </el-select>
        </div>

        <div class="full-width-item">
          设备
          <el-select
            v-model="trainParams.device"
            placeholder="Select"
            style="width: 100%"
            text-color="#626aef"
          >
            <el-option
              v-for="item in trainDeviceOptions"
              :key="item.value"
              :label="item.label"
              :value="item.value"
            />
          </el-select>
        </div>

        <div>
          训练次数
          <el-input
            v-model="trainParams.epochs"
            style="width: 100%; color: #626aef"
            placeholder="输入训练次数"
          />
        </div>

        <div>
          尺寸
          <el-input
            v-model="trainParams.image_size"
            style="width: 100%; color: #626aef"
            placeholder="输入图像尺寸"
          />
        </div>

        <div>
          批次
          <el-input
            v-model="trainParams.batch_size"
            style="width: 100%; color: #626aef"
            placeholder="输入batch_size大小"
          />
        </div>

        <div>
          学习率
          <el-input
            v-model="trainParams.learning_rate"
            style="width: 100%; color: #626aef"
            placeholder="输入学习率"
          />
        </div>

        <template #footer>
          <div class="dialog-footer">
            <el-button @click="cancelTraining">取消训练</el-button>
            <el-button type="primary" @click="handleStartTraining">
              启动训练
            </el-button>
          </div>
        </template>
      </el-dialog>

      <!-- 数据集 -->
      <el-dialog
        v-model="showDatasetsList"
        title="数据集详情"
        width="1200px"
        draggable
      >
        <el-table
          :data="datasetsList"
          border
          stripe
          style="font-image_size: x-small"
          highlight-current-row
          height="350"
        >
          <el-table-column
            align="center"
            label="数据集名称"
            prop="original_filename"
          />
          <el-table-column align="center" label="训练集数量">
            <template #default="scope">
              <div v-if="scope.row?.remark">
                {{ scope.row.remark.train_cases_count }}
              </div>
            </template>
          </el-table-column>
          <el-table-column align="center" label="验证集数量">
            <template #default="scope">
              <div v-if="scope.row?.remark">
                {{ scope.row.remark.val_cases_count }}
              </div>
            </template>
          </el-table-column>
          <el-table-column align="center" label="上一次训练集数量">
            <template #default="scope">
              <div v-if="scope.row?.remark">
                {{ scope.row.remark.last_train_cases_count }}
              </div>
            </template>
          </el-table-column>
          <el-table-column align="center" label="上一次验证集数量">
            <template #default="scope">
              <div v-if="scope.row?.remark">
                {{ scope.row.remark.last_val_cases_count }}
              </div>
            </template>
          </el-table-column>
          <el-table-column align="center" label="训练集数量">
            <template #default="scope">
              <div v-if="scope.row?.remark">
                {{ scope.row.remark.train_cases_count }}
              </div>
            </template>
          </el-table-column>
          <el-table-column align="center" label="训练集数量">
            <template #default="scope">
              <div v-if="scope.row?.remark">
                {{ scope.row.remark.train_cases_count }}
              </div>
            </template>
          </el-table-column>
          <el-table-column align="center" label="标注类别">
            <template #default="scope">
              <div v-if="scope.row?.remark">
                <div
                  v-for="(item, index) in scope.row.remark.names"
                  :key="index"
                >
                  {{ index }}:{{ item }}
                </div>
              </div>
            </template>
          </el-table-column>

          <el-table-column
            align="center"
            label="数据集更新时间"
            prop="updated_at"
          />
          <el-table-column align="center" label="训练次数">
            <template #default="scope">
              <div v-if="scope.row?.remark">
                {{ scope.row.remark.train_count }}
              </div>
            </template>
          </el-table-column>

          <el-table-column align="center" label="最新训练时间">
            <template #default="scope">
              <div v-if="scope.row?.remark">
                {{ scope.row.remark.train_date }}
              </div>
            </template>
          </el-table-column>

          <el-table-column align="center" label="最新性能指标">
            <template #default="scope">
              <div v-if="scope.row?.remark">
                <div
                  v-for="(item, index) in scope.row.remark.metrics"
                  :key="index"
                >
                  {{ index }}:{{ item }}
                </div>
              </div>
            </template>
          </el-table-column>
          <el-table-column align="center" label="操作" prop="recall">
            <template #default="scope">
              <div>补充数据</div>
            </template>
          </el-table-column>
        </el-table>
      </el-dialog>

      <!-- 训练记录展示 -->
      <el-dialog
        v-model="showTrainedRecord"
        title="训练记录"
        width="1000"
        align-center
        close-on-press-escape
        close-on-click-modal
        draggable
      >
        <el-scrollbar>
          <div class="dv-b">
            <el-card>
              <el-table
                :data="trainedWeights"
                row-key="id"
                border
                stripe
                default-expand-all
                @row-click="previewFile"
              >
                <el-table-column
                  align="center"
                  label="项目名称"
                  prop="file_name"
                  sortable
                />
                <el-table-column
                  align="center"
                  label="完成时间"
                  prop="create_time"
                  sortable
                />
                <el-table-column align="center" label="下载结果">
                  <template v-slot="scope">
                    <el-button
                      :icon="Download"
                      type="default"
                      @click.stop="downloadFiles(scope.row)"
                    >
                      下载
                    </el-button>
                  </template>
                </el-table-column>
              </el-table>
            </el-card>
          </div>
        </el-scrollbar>

        <template #footer>
          <div class="dialog-footer">
            <el-button type="primary" @click="showTrainedRecord = false">
              关闭
            </el-button>
          </div>
        </template>
      </el-dialog>

      <!-- 数据集补充 -->
      <el-dialog
        v-model="showDatasetsSupplement"
        title="数据集详情"
        width="75%"
        align-center
        close-on-press-escape
        close-on-click-modal
        draggable
      >
        <el-scrollbar>
          <div class="dv-b">
            <el-card>
              <el-table
                :data="datasetsList"
                row-key="file_id"
                border
                stripe
                default-expand-all
                @row-click="previewFile"
              >
                <el-table-column
                  align="center"
                  label="数据集名称"
                  prop="file_name"
                  sortable
                >
                  <template v-slot="scope">
                    <span>{{
                      String(scope.row.file_name).includes(".")
                        ? String(scope.row.file_name).split(".")[0]
                        : scope.row.file_name
                    }}</span>
                  </template>
                </el-table-column>
                <el-table-column
                  align="center"
                  label="训练集数量"
                  prop="last_train_counts"
                  sortable
                />
                <el-table-column
                  align="center"
                  label="当前训练集数量"
                  prop="train_counts"
                  sortable
                />
                <el-table-column
                  align="center"
                  label="验证集数量"
                  prop="last_val_counts"
                  sortable
                />
                <el-table-column
                  align="center"
                  label="当前验证集数量"
                  prop="val_counts"
                  sortable
                />
                <el-table-column
                  align="center"
                  label="创建时间"
                  prop="create_time"
                  sortable
                />
                <el-table-column
                  align="center"
                  label="更新时间"
                  prop="update_time"
                  sortable
                />
                <el-table-column align="center" label="上传新数据">
                  <template v-slot="scope">
                    <el-button
                      :icon="Upload"
                      type="default"
                      @click.stop="openRandomUpload(scope.row?.file_id)"
                    >
                      上传
                    </el-button>
                  </template>
                </el-table-column>
              </el-table>
            </el-card>
          </div>
        </el-scrollbar>
      </el-dialog>

      <!-- 训练结果示意图 -->
      <el-dialog v-model="showTrainedImages" width="1000" align-center>
        <div
          class="hover:cursor-pointer flex justify-start"
          @click="showType = !showType"
        >
          <el-text v-if="previewUrl.length > 0" class="mx-1" type="warning"
            >切换预览模式</el-text
          >
        </div>
        <!-- 大图预览模式 -->
        <div
          v-if="!showType && previewUrl.length > 0"
          class="h-full w-full bg-gray-200 flex"
        >
          <div
            class="w-[5%] hover:bg-white hover:cursor-pointer"
            @click.stop="changePage(-1)"
          />
          <div class="w-[90%]">
            <el-image
              style="width: 100%; height: 100%; object-fit: contain"
              :src="previewUrl[currentPage]"
              :zoom-rate="1.2"
              :max-scale="7"
              :min-scale="0.2"
              :preview-src-list="previewUrl"
              show-progress
              :initial-index="currentPage"
              fit="contain"
            />
          </div>
          <div
            class="w-[5%] hover:bg-white hover:cursor-pointer"
            @click.stop="changePage(1)"
          />
        </div>
        <!-- 小图预览模式 -->
        <div
          v-if="showType && previewUrl.length > 0"
          class="w-full h-full grid grid-cols-6 grid-rows-2 gap-2 p-4"
        >
          <div
            v-for="(item, index) in previewUrl"
            :key="index"
            class="relative overflow-hidden rounded-lg border border-gray-200"
          >
            <el-image
              class="w-full h-full object-cover"
              :src="item"
              :zoom-rate="1.2"
              :max-scale="7"
              :min-scale="0.2"
              :preview-src-list="previewUrl"
              :show-progress="true"
              :initial-index="index"
              fit="cover"
            />
          </div>
        </div>

        <template #footer>
          <div class="dialog-footer">
            <el-button type="primary" @click="showTrainedImages = false">
              关闭
            </el-button>
          </div>
        </template>
      </el-dialog>
    </template>
    <div class="split-pane">
      <splitpane :splitSet="settingLR">
        <template #paneL>
          <!-- <el-scrollbar> 训练指标 </el-scrollbar> -->
          <div class="flex flex-col h-full">
            <!-- 统计指标 -->
            <div class="flex-[9] flex flex-col h-full">
              <div
                v-if="currentTrainMetrics && currentTrainMetrics"
                class="flex flex-col h-full"
              >
                <div
                  class="flex-[0.5] border-pink-300 border-b-2 flex items-center justify-center text-2xl"
                >
                  <div>性能指标</div>
                </div>
                <div class="flex-[9.5]">
                  <div
                    class="grid grid-cols-3 grid-rows-3 gap-2 w-full h-full flex-1"
                    v-if="currentTrainMetrics && currentTrainMetrics"
                  >
                    <div class="border flex items-center justify-center p-2">
                      <div
                        class="statistic-card flex flex-col justify-center w-full"
                      >
                        <div>
                          <el-statistic
                            :value="currentTrainMetrics['train/box_loss']"
                          >
                            <template #title>
                              <div class="inline-flex items-center text-xl">
                                Train/Box_loss
                                <el-tooltip
                                  effect="dark"
                                  content="边界框回归的损失（Box Loss），表示预测边界框与真实边界框的偏差。数值越小，说明模型预测的边界框位置越接近于真实位置。当损失值逐渐下降时，就说明模型在学习边界框预测。"
                                  placement="top"
                                >
                                  <el-icon style="margin-left: 4px" :size="12">
                                    <Warning />
                                  </el-icon>
                                </el-tooltip>
                              </div>
                            </template>
                          </el-statistic>
                        </div>

                        <div class="statistic-footer">
                          <div class="footer-item">
                            <span>上一轮次</span>
                            <span class="green">
                              {{ lastTrainMetrics["train/box_loss"] }}
                              <el-icon>
                                <CaretTop />
                              </el-icon>
                            </span>
                          </div>
                        </div>
                      </div>
                    </div>
                    <div class="border flex items-center justify-center p-2">
                      <div
                        class="statistic-card flex flex-col justify-center w-full"
                      >
                        <el-statistic
                          :value="currentTrainMetrics['train/cls_loss']"
                        >
                          <template #title>
                            <div class="inline-flex items-center text-xl">
                              Train/Cls_loss
                              <el-tooltip
                                effect="dark"
                                content="分类损失（Classification Loss），表示预测的目标类别与真实类别之间的偏差。数值越小，说明模型分类性能越好。当训练时分类损失值逐步下降，表明模型分类能力逐渐提升。"
                                placement="top"
                              >
                                <el-icon style="margin-left: 4px" :size="12">
                                  <Warning />
                                </el-icon>
                              </el-tooltip>
                            </div>
                          </template>
                        </el-statistic>
                        <div class="statistic-footer">
                          <div class="footer-item">
                            <span>上一轮次</span>
                            <span class="red">
                              {{ lastTrainMetrics["train/cls_loss"] }}
                              <el-icon>
                                <CaretBottom />
                              </el-icon>
                            </span>
                          </div>
                        </div>
                      </div>
                    </div>
                    <div class="border flex items-center justify-center p-2">
                      <div
                        class="statistic-card flex flex-col justify-center w-full"
                      >
                        <el-statistic
                          :value="currentTrainMetrics['train/dfl_loss']"
                          title="New transactions today"
                        >
                          <template #title>
                            <div class="inline-flex items-center text-xl">
                              Train/Dfl_loss
                              <el-tooltip
                                effect="dark"
                                content="分布焦点损失（Distribution Focal Loss），YOLOv8中特有的损失，用于优化边界框预测的精确性。当损失下降表示模型更好地聚焦于关键预测区域，提高边界框的质量。"
                                placement="top"
                              >
                                <el-icon style="margin-left: 4px" :size="12">
                                  <Warning />
                                </el-icon>
                              </el-tooltip>
                            </div>
                          </template>
                        </el-statistic>
                        <div class="statistic-footer">
                          <div class="footer-item">
                            <span>上一轮次</span>
                            <span class="green">
                              {{ lastTrainMetrics["train/dfl_loss"] }}
                              <el-icon>
                                <CaretTop />
                              </el-icon>
                            </span>
                          </div>
                          <div class="footer-item">
                            <el-icon :size="14">
                              <ArrowRight />
                            </el-icon>
                          </div>
                        </div>
                      </div>
                    </div>
                    <div class="border flex items-center justify-center p-2">
                      <div
                        class="statistic-card flex flex-col justify-center w-full"
                      >
                        <el-statistic
                          :value="currentTrainMetrics['val/box_loss']"
                        >
                          <template #title>
                            <div class="inline-flex items-center text-xl">
                              Val/Box_loss
                              <el-tooltip
                                effect="dark"
                                content="边界框回归的损失（Box Loss），表示预测边界框与真实边界框的偏差。数值越小，说明模型预测的边界框位置越接近于真实位置。当损失值逐渐下降时，就说明模型在学习边界框预测。"
                                placement="top"
                              >
                                <el-icon style="margin-left: 4px" :size="12">
                                  <Warning />
                                </el-icon>
                              </el-tooltip>
                            </div>
                          </template>
                        </el-statistic>
                        <div class="statistic-footer">
                          <div class="footer-item">
                            <span>上一轮次</span>
                            <span class="green">
                              {{ lastTrainMetrics["val/box_loss"] }}
                              <el-icon>
                                <CaretTop />
                              </el-icon>
                            </span>
                          </div>
                        </div>
                      </div>
                    </div>
                    <div class="border flex items-center justify-center p-2">
                      <div
                        class="statistic-card flex flex-col justify-center w-full"
                      >
                        <el-statistic
                          :value="currentTrainMetrics['val/cls_loss']"
                        >
                          <template #title>
                            <div class="inline-flex items-center text-xl">
                              Val/Cls_loss
                              <el-tooltip
                                effect="dark"
                                content="分类损失（Classification Loss），表示预测的目标类别与真实类别之间的偏差。数值越小，说明模型分类性能越好。当训练时分类损失值逐步下降，表明模型分类能力逐渐提升。"
                                placement="top"
                              >
                                <el-icon style="margin-left: 4px" :size="12">
                                  <Warning />
                                </el-icon>
                              </el-tooltip>
                            </div>
                          </template>
                        </el-statistic>
                        <div class="statistic-footer">
                          <div class="footer-item">
                            <span>上一轮次</span>
                            <span class="red">
                              {{ lastTrainMetrics["val/cls_loss"] }}
                              <el-icon>
                                <CaretBottom />
                              </el-icon>
                            </span>
                          </div>
                        </div>
                      </div>
                    </div>
                    <div class="border flex items-center justify-center p-2">
                      <div
                        class="statistic-card flex flex-col justify-center w-full"
                      >
                        <el-statistic
                          :value="currentTrainMetrics['val/dfl_loss']"
                          title="New transactions today"
                        >
                          <template #title>
                            <div class="inline-flex items-center text-xl">
                              Val/Dfl_loss
                              <el-tooltip
                                effect="dark"
                                content="分布焦点损失（Distribution Focal Loss），YOLOv8中特有的损失，用于优化边界框预测的精确性。当损失下降表示模型更好地聚焦于关键预测区域，提高边界框的质量。"
                                placement="top"
                              >
                                <el-icon style="margin-left: 4px" :size="12">
                                  <Warning />
                                </el-icon>
                              </el-tooltip>
                            </div>
                          </template>
                        </el-statistic>
                        <div class="statistic-footer">
                          <div class="footer-item">
                            <span>上一轮次</span>
                            <span class="green">
                              {{ lastTrainMetrics["val/dfl_loss"] }}
                              <el-icon>
                                <CaretTop />
                              </el-icon>
                            </span>
                          </div>
                          <div class="footer-item">
                            <el-icon :size="14">
                              <ArrowRight />
                            </el-icon>
                          </div>
                        </div>
                      </div>
                    </div>
                    <div class="border flex items-center justify-center p-2">
                      <div
                        class="statistic-card flex flex-col justify-center w-full"
                      >
                        <el-statistic
                          :value="currentTrainMetrics['metrics/precision(B)']"
                        >
                          <template #title>
                            <div class="inline-flex items-center text-xl">
                              Metrics/Precision(B)
                              <el-tooltip
                                effect="dark"
                                content="精度（Precision），表示模型预测为正样本的准确性。数值越高越好。在训练初期波动较大，后来趋于稳定并逐步提高。B，固定置信度（0.5）"
                                placement="top"
                              >
                                <el-icon style="margin-left: 4px" :size="12">
                                  <Warning />
                                </el-icon>
                              </el-tooltip>
                            </div>
                          </template>
                        </el-statistic>
                        <div class="statistic-footer">
                          <div class="footer-item">
                            <span>上一轮次</span>
                            <span class="green">
                              {{ lastTrainMetrics["metrics/precision(B)"] }}
                              <el-icon>
                                <CaretTop />
                              </el-icon>
                            </span>
                          </div>
                        </div>
                      </div>
                    </div>
                    <div class="border flex items-center justify-center p-2">
                      <div
                        class="statistic-card flex flex-col justify-center w-full"
                      >
                        <el-statistic
                          :value="currentTrainMetrics['metrics/recall(B)']"
                        >
                          <template #title>
                            <div class="inline-flex items-center text-xl">
                              Metrics/Recall(B)
                              <el-tooltip
                                effect="dark"
                                content="召回率（Recall），表示真实正样本中被正确预测为正样本的比例。数值越高越好。召回率提升，说明模型对正样本的捕获能力提高。不能漏掉正样本"
                                placement="top"
                              >
                                <el-icon style="margin-left: 4px" :size="12">
                                  <Warning />
                                </el-icon>
                              </el-tooltip>
                            </div>
                          </template>
                        </el-statistic>
                        <div class="statistic-footer">
                          <div class="footer-item">
                            <span>上一轮次</span>
                            <span class="red">
                              {{ lastTrainMetrics["metrics/recall(B)"] }}
                              <el-icon>
                                <CaretBottom />
                              </el-icon>
                            </span>
                          </div>
                        </div>
                      </div>
                    </div>
                    <div class="border flex items-center justify-center p-2">
                      <div
                        class="statistic-card flex flex-col justify-center w-full"
                      >
                        <el-statistic
                          :value="currentTrainMetrics['metrics/mAP50(B)']"
                          title="New transactions today"
                        >
                          <template #title>
                            <div class="inline-flex items-center text-xl">
                              Metrics/mAP50(B)
                              <el-tooltip
                                effect="dark"
                                content="在 IoU（交并比）阈值为 0.5 时的平均精度。它是对每个类别的 AP（Average Precision）取平均值。 数值越高越好，表示模型在检测目标时的总体表现。 mAP50 在不断提高，说明模型检测能力越来越好。(B) 表示这是针对 Bounding Box（边界框） 的评估指标。"
                                placement="top"
                              >
                                <el-icon style="margin-left: 4px" :size="12">
                                  <Warning />
                                </el-icon>
                              </el-tooltip>
                            </div>
                          </template>
                        </el-statistic>
                        <div class="statistic-footer">
                          <div class="footer-item">
                            <span>上一轮次</span>
                            <span class="green">
                              {{ lastTrainMetrics["metrics/mAP50(B)"] }}
                              <el-icon>
                                <CaretTop />
                              </el-icon>
                            </span>
                          </div>
                          <div class="footer-item">
                            <el-icon :size="14">
                              <ArrowRight />
                            </el-icon>
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
            <!-- 进度条 -->
            <div
              class="flex-[1] items-center h-full"
              v-if="currentTrainMetrics && currentTrainMetrics"
            >
              <div class="flex flex-col h-full">
                <div class="w-full">
                  <el-progress
                    :text-inside="true"
                    :stroke-width="24"
                    :percentage="(currentEpoch / trainParams.epochs) * 100"
                    status="success"
                  />
                </div>
                <div class="flex justify-between">
                  <div>
                    预计剩余
                    {{
                      formatTimeSimple(
                        trainingInterval * (trainParams.epochs - currentEpoch)
                      )
                    }}
                  </div>
                  <div>第 {{ currentEpoch }}/{{ trainParams.epochs }} 轮</div>
                </div>
              </div>
            </div>
          </div>
        </template>

        <!-- #paneR 表示指定该组件为右侧面板 -->
        <template #paneR>
          <div class="dv-b flex flex-col h-full">
            <!-- 日志区域 -->
            <pre ref="logBox" class="log" v-if="trainLogConsoleContent">{{
              trainLogConsoleContent
            }}</pre>
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
  font-image_size: 50px;
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
  font-image_size: 14px;
  color: #666;
}

.status-item.connected {
  color: #28a745;
}

.status-item.connected .indicator {
  background-color: #28a745;
}

.trainParams-section,
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
  .trainParams-section,
  .training-status,
  .log-section {
    padding: 15px;
  }

  .header h1 {
    font-image_size: 20px;
  }

  .trainParams-section h3,
  .training-status h3 {
    font-image_size: 18px;
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
  font-image_size: 18px;
  font-weight: 600;
  color: #333;
  text-align: center;
  border-bottom: 2px solid #f0f0f0;
}

.log-container {
  text-align: start;
  // height: 280px;
  // height: 100%;
  height: 1000px;
  padding: 20px;
  overflow-y: auto;
  font-family: "JetBrains Mono", "Courier New", monospace;
  font-image_size: 13px;
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
  font-image_size: 18px;
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
  font-image_size: 15px;
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
  font-image_size: 12px;
  color: #6c757d;
}

.metrics-grid {
  // display: grid;
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
  font-image_size: 16px;
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
  font-image_size: 14px;
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
  font-image_size: 20px;
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

// 统计组件
:global(h2#card-usage ~ .example .example-showcase) {
  background-color: var(--el-fill-color) !important;
}

.el-statistic {
  --el-statistic-content-font-size: 28px;
}

.statistic-card {
  height: 100%;
  padding: 20px;
  border-radius: 4px;
  background-color: var(--el-bg-color-overlay);
}

.statistic-footer {
  display: flex;
  justify-content: center;
  align-items: center;
  flex-wrap: wrap;
  font-size: 12px;
  color: var(--el-text-color-regular);
}

.statistic-footer .footer-item {
  display: flex;
  justify-content: center;
  align-items: center;
}

.statistic-footer .footer-item span:last-child {
  display: inline-flex;
  align-items: center;
  margin-left: 4px;
}

.green {
  color: var(--el-color-success);
}
.red {
  color: var(--el-color-error);
}

.log {
  text-align: left;
  white-space: pre-wrap;
  word-break: break-word;
  font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
  font-size: 13px;
  line-height: 1.4;
  overflow: auto; /* 关键：可滚动容器 */
  padding: 8px 12px;
  background: #fafafa;
  border-radius: 6px;
}
</style>
