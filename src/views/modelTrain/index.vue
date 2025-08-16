<script setup lang="ts">
import splitpane, { ContextProps } from "@/components/ReSplitPane";
import { onMounted, reactive, ref, computed } from "vue";
import { ElMessage, ElNotification } from "element-plus";
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

const formValues = ref({});
const columns = ref([
  {
    label: "数据集",
    width: 120,
    prop: "dataYamlId",
    valueType: "select",
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
]);

const state = ref({
  status: "1",
  name: "",
  rate: 4,
  progress: 100,
  switch: true,
  time: new Date().toString(),
  endTime: []
});

const rules = {
  name: [
    {
      required: true,
      message: "请输入名称"
    }
  ]
};
const confirmDialog = () => {};

const cancelDialog = () => {};
</script>

<template>
  <el-card shadow="never">
    <template #header>
      <div class="card-header">
        <p class="font-medium">训练面板</p>
      </div>
    </template>
    <div class="split-pane">
      <splitpane :splitSet="settingLR">
        <!-- #paneL 表示指定该组件为左侧面板 -->
        <template #paneL>
          <!-- 自定义左侧面板的内容 -->
          <splitpane :splitSet="settingTB">
            <template #paneL>
              <el-scrollbar
                ><div class="dv-b">显示训练图像和日志</div></el-scrollbar
              >
            </template>

            <template #paneR>
              <el-scrollbar>
                <div class="dv-c">显示终端信息</div>
              </el-scrollbar>
            </template>
          </splitpane>
        </template>
        <!-- #paneR 表示指定该组件为右侧面板 -->

        <template #paneR>
          <el-scrollbar>
            <div class="dv-b">
              <PlusForm
                v-model="state"
                :columns="columns"
                :rules="rules"
                label-position="top"
                @change="handleChange"
                @submit="handleSubmit"
                @submit-error="handleSubmitError"
                @reset="handleReset"
              />
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
    padding-top: 10vh;
    color: rgba($color: #000, $alpha: 80%);
  }

  .dv-c {
    padding-top: 18vh;
    color: rgba($color: #ce272d, $alpha: 80%);
  }
}
</style>
