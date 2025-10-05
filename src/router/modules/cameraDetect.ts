// 最简代码，也就是这些字段必须有
import { cameraDetect } from "@/router/enums";

export default {
  path: "/cameraDetect",
  redirect: "/cameraDetect/index",
  meta: {
    title: "🚀 拍照检测",
    rank: cameraDetect
  },
  children: [
    {
      path: "/cameraDetect/index",
      name: "cameraDetect",
      component: () => import("@/views/cameraDetect/index.vue"),
      meta: {
        title: "🚀 拍照检测"
        // showParent: true
      }
    }
  ]
} satisfies RouteConfigsTable;
