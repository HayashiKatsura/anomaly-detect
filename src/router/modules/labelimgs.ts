// 最简代码，也就是这些字段必须有
export default {
  path: "/labelimgs",
  redirect: "/labelimgs/index",
  meta: {
    title: "图像标注"
  },
  children: [
    {
      path: "/labelimgs/index",
      name: "Labelimgs",
      component: () => import("@/views/labelimgs/index.vue"),
      meta: {
        title: "图像标注"
      }
    }
  ]
};
