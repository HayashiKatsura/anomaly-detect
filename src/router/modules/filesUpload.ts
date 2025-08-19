// 最简代码，也就是这些字段必须有
import { filesUpload } from "@/router/enums";

export default {
  path: "/filesUpload",
  redirect: "/filesUpload/index",
  meta: {
    title: "📃 文件上传",
    rank: filesUpload
  },
  children: [
    {
      path: "/filesUpload/index",
      name: "FilesUpload",
      component: () => import("@/views/filesUpload/index.vue"),
      meta: {
        title: "📃 文件上传"
        // showParent: true
      }
    }
  ]
} satisfies RouteConfigsTable;
