// 最简代码，也就是这些字段必须有
import { videoDetect } from "@/router/enums";

export default {
  path: "/videoDetect",
  redirect: "/videoDetect/index",
  meta: {
    title: "🚀 视频检测",
    rank: videoDetect
  },
  children: [
    {
      path: "/videoDetect/index",
      name: "videoDetect",
      component: () => import("@/views/videoDetect/index.vue"),
      meta: {
        title: "🚀 视频检测"
        // showParent: true
      }
    }
  ]
} satisfies RouteConfigsTable;
