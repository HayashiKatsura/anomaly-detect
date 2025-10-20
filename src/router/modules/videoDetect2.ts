// 最简代码，也就是这些字段必须有
import { videoDetect2 } from "@/router/enums";

export default {
  path: "/videoDetect2",
  redirect: "/videoDetect2/index",
  meta: {
    title: "🚀 摄像头检测",
    rank: videoDetect2
  },
  children: [
    {
      path: "/videoDetect2/index",
      name: "videoDetect2",
      component: () => import("@/views/videoDetect2/index.vue"),
      meta: {
        title: "🚀 视频检测"
        // showParent: true
      }
    }
  ]
} satisfies RouteConfigsTable;
