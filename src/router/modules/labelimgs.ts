// 最简代码，也就是这些字段必须有
import { labelimgs } from "@/router/enums";

export default {
  path: "/labelimgs",
  redirect: "/labelimgs/index",
  meta: {
    title: "🏷️ 图像标注",
    rank: labelimgs
  },
  children: [
    {
      path: "/labelimgs/index",
      name: "Labelimgs",
      component: () => import("@/views/labelimgs/index.vue"),
      meta: {
        title: "🏷️ 图像标注",
        // showParent: true
      }
    }
  ]
}satisfies RouteConfigsTable;
