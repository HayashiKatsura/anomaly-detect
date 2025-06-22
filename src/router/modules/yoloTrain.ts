// 最简代码，也就是这些字段必须有
import { yoloTrain } from "@/router/enums";

export default {
  path: "/yoloTrain",
  redirect: "/yoloTrain/index",
  meta: {
    title: "🚀 Yolo训练",
    rank: yoloTrain
  },
  children: [
    {
      path: "/yoloTrain/index",
      name: "YoloTrain",
      component: () => import("@/views/yoloTrain/index.vue"),
      meta: {
        title: "🚀 Yolo训练",
        // showParent: true
      }
    }
  ]
}satisfies RouteConfigsTable;
