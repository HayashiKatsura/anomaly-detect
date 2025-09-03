import { dayjs, cloneDeep, getRandomIntBetween } from "./utils";
import GroupLine from "~icons/ri/group-line";
import Question from "~icons/ri/question-answer-line";
import CheckLine from "~icons/ri/chat-check-line";
import Smile from "~icons/ri/star-smile-line";

const days = ["周日", "周一", "周二", "周三", "周四", "周五", "周六"];
// const days = ["环形污染", "介质层斑块", "涂料污染", "薄膜缺陷", "电路蚀刻缺陷", "光刻胶残留"];


/** 样本总数、未检测数量、已检测数量、检出率 */
const chartData = [
  {
    icon: GroupLine,
    bgColor: "#effaff",
    color: "#41b6ff",
    duration: 2200,
    name: "样本总数",
    value: 12550,
    // percent: "+88%",
    data: [2101, 5288, 4239, 4962, 6752, 5208, 7450] // 平滑折线图数据
  },
  {
    icon: Question,
    bgColor: "#fff5f4",
    color: "#e85f33",
    duration: 1600,
    name: "未检测数量",
    value: 215,
    // percent: "+70%",
    data: [2216, 1148, 1255, 788, 4821, 1973, 4379]
  },
  {
    icon: CheckLine,
    bgColor: "#eff8f4",
    color: "#26ce83",
    duration: 1600,
    name: "已检测数量",
    value: 12335,
    // percent: "+99%",
    data: [861, 1002, 3195, 1715, 3666, 2415, 3645]
  },
  {
    icon: Smile,
    bgColor: "#f6f4fe",
    color: "#7846e5",
    duration: 100,
    name: "检出率",
    value: 98,
    // percent: "+100%",
    data: [49,98]
  }
];

/** 各类别检出数量 */
const barChartData = [
  {
    anomaliesData: [2101, 5288, 4239, 4962, 6752, 5208, 7450], // requireData
    normalData: [2216, 1148, 1255, 1788, 4821, 1973, 4379] // questionData
  },
  {
    anomaliesData: [2101, 3280, 4400, 4962, 5752, 6889, 7600],
    normalData: [2116, 3148, 3255, 3788, 4821, 4970, 5390]
  }
];

/** 类别占比 */
const progressData = [
  {
    type: "环形污染",
    percentage: 7.13,
    duration: 110,
    color: "#41b6ff"
  },
  {
    type: "介质层斑块",
    percentage: 56.01,
    duration: 105,
    color: "#41b6ff"
  },
  {
    type: "涂料污染",
    percentage: 9.98,
    duration: 100,
    color: "#41b6ff"
  },
  {
    type: "薄膜缺陷",
    percentage: 17.72,
    duration: 95,
    color: "#41b6ff"
  },
  {
    type: "电路蚀刻缺陷",
    percentage: 7.13,
    duration: 90,
    color: "#26ce83"
  },
  {
    type: "光刻胶残留",
    percentage: 2.04,
    duration: 85,
    color: "#26ce83"
  },
].reverse();

/** 数据统计 */
const tableData = Array.from({ length: 30 }).map((_, index) => {
  return {
    id: index + 1,
    fileName: `${getRandomIntBetween(1000, 1800) + 1}.png`,
    requiredNumber: getRandomIntBetween(1800, 2000), // 采集样本
    resolveNumber: getRandomIntBetween(1000, 1800), // 检测样本
    type: progressData[getRandomIntBetween(0, 5)].type,
    anomaliesCount: getRandomIntBetween(0, 5),
    questionNumber: getRandomIntBetween(12600, 16999),
    satisfaction: getRandomIntBetween(95, 100),
    date: dayjs().subtract(index, "day").format("YYYY-MM-DD")
  };
});

/** 最新动态 */
const latestNewsData = cloneDeep(tableData)
  .slice(0, 14)
  .map((item, index) => {
    return Object.assign(item, {
      date: `${dayjs().subtract(index, "day").format("YYYY-MM-DD")} ${
        days[dayjs().subtract(index, "day").day()]
      }`
    });
  });

export { chartData, barChartData, progressData, tableData, latestNewsData };
