import { tableData } from "../../data";
import { delay } from "@pureadmin/utils";
import { ref, onMounted, reactive } from "vue";
import type { PaginationProps } from "@pureadmin/table";
import ThumbUp from "~icons/ri/thumb-up-line";
import Hearts from "~icons/ri/hearts-line";
import Empty from "./empty.svg?component";

// 数据统计看板
export function useColumns() {
  const dataList = ref([]);
  const loading = ref(true);
  const columns: TableColumnList = [
    {
      sortable: true,
      label: "序号",
      prop: "id"
    },
    {
      sortable: true,
      label: "文件名",
      prop: "fileName",
      filterMultiple: false,
      filterClassName: "pure-table-filter",
      filters: [
        { text: "≥16000", value: "more" },
        { text: "<16000", value: "less" }
      ],
      filterMethod: (value, { requiredNumber }) => {
        return value === "more"
          ? requiredNumber >= 16000
          : requiredNumber < 16000;
      }
    },
    {
      sortable: true,
      label: "异常数量",
      prop: "anomaliesCount"
    },
    {
      sortable: true,
      label: "最多异常类别",
      prop: "type"
    },
    {
      sortable: true,
      label: "统计日期",
      prop: "date"
    },
    {
      label: "操作",
      fixed: "right",
      slot: "operation"
    }
  ];

  /** 分页配置 */
  const pagination = reactive<PaginationProps>({
    pageSize: 10,
    currentPage: 1,
    layout: "prev, pager, next",
    total: 0,
    align: "center"
  });

  function onCurrentChange(page: number) {
    console.log("onCurrentChange", page);
    loading.value = true;
    delay(300).then(() => {
      loading.value = false;
    });
  }

  onMounted(() => {
    dataList.value = tableData;
    pagination.total = dataList.value.length;
    loading.value = false;
  });

  return {
    Empty,
    loading,
    columns,
    dataList,
    pagination,
    onCurrentChange
  };
}
