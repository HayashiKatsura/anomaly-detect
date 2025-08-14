// 最简代码，也就是这些字段必须有
import { filesDetect } from "@/router/enums";

export default {
  path: "/filesDetect",
  redirect: "/filesDetect/index",
  meta: {
    title: "🚀 文件检测",
    rank: filesDetect
  },
  children: [
    {
      path: "/filesDetect/index",
      name: "FilesDetect",
      component: () => import("@/views/filesDetect/index.vue"),
      meta: {
        title: "🚀 文件检测",
        // showParent: true
      }
    }
  ]
}satisfies RouteConfigsTable;
