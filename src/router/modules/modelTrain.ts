// 最简代码，也就是这些字段必须有
import { modelTrain } from "@/router/enums";

export default {
  path: "/modelTrain",
  redirect: "/modelTrain/index",
  meta: {
    title: "🚀 模型训练",
    rank: modelTrain
  },
  children: [
    {
      path: "/modelTrain/index",
      name: "modelTrain",
      component: () => import("@/views/modelTrain/index.vue"),
      meta: {
        title: "🚀 模型训练"
        // showParent: true
      }
    }
  ]
} satisfies RouteConfigsTable;
