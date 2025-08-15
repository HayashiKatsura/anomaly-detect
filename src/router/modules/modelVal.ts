// 最简代码，也就是这些字段必须有
import { modelVal } from "@/router/enums";

export default {
  path: "/modelVal",
  redirect: "/modelVal/index",
  meta: {
    title: "🚀 模型验证",
    rank: modelVal
  },
  children: [
    {
      path: "/modelVal/index",
      name: "modelVal",
      component: () => import("@/views/modelVal/index.vue"),
      meta: {
        title: "🚀 模型验证"
        // showParent: true
      }
    }
  ]
} satisfies RouteConfigsTable;
