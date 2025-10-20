<template>
  <div class="video-player-container">
    <h2>视频播放器</h2>

    <!-- 视频列表 -->
    <div class="video-list">
      <button
        v-for="video in videos"
        :key="video.name"
        @click="selectVideo(video)"
        :class="{ active: currentVideo?.name === video.name }"
      >
        {{ video.name }}
      </button>
    </div>

    <!-- 视频播放器 -->
    <div v-if="currentVideo" class="player">
      <video
        ref="videoPlayer"
        controls
        autoplay
        :src="currentVideo.url"
        @loadedmetadata="onVideoLoaded"
        @error="onVideoError"
      >
        您的浏览器不支持视频播放
      </video>

      <div class="video-info">
        <p>当前播放: {{ currentVideo.name }}</p>
        <p v-if="videoDuration">时长: {{ formatTime(videoDuration) }}</p>
      </div>
    </div>

    <div v-else class="placeholder">
      请选择视频
    </div>
  </div>
</template>

<script setup>
import { ref, onMounted } from 'vue'
import axios from 'axios'

const API_BASE = 'http://10.12.44.68:5130'  // 后端地址

const videos = ref([])
const currentVideo = ref(null)
const videoPlayer = ref(null)
const videoDuration = ref(0)

// 获取视频列表
const fetchVideos = async () => {
  try {
    const response = await axios.get(`${API_BASE}/api/videos`)
    videos.value = response.data.videos.map(v => ({
      ...v,
      url: `${API_BASE}${v.url}`
    }))

  } catch (error) {
    console.error('获取视频列表失败:', error)
  }
  console.log("videos.value",videos.value);
  console.log("videos",videos.value);
}

// 选择视频
const selectVideo = (video) => {
  console.log(video,video);

  currentVideo.value = video
  videoDuration.value = 0

  console.log(currentVideo,currentVideo.value);


}

// 视频加载完成
const onVideoLoaded = () => {
  if (videoPlayer.value) {
    videoDuration.value = videoPlayer.value.duration
  }
}

// 视频加载错误
const onVideoError = (error) => {
  console.error('视频加载失败:', error)
  alert('视频加载失败，请检查文件格式或网络连接')
}

// 格式化时间
const formatTime = (seconds) => {
  const mins = Math.floor(seconds / 60)
  const secs = Math.floor(seconds % 60)
  return `${mins}:${secs.toString().padStart(2, '0')}`
}

onMounted(() => {
  fetchVideos()
})
</script>

<style scoped>
.video-player-container {
  max-width: 1200px;
  margin: 0 auto;
  padding: 20px;
}

.video-list {
  display: flex;
  gap: 10px;
  flex-wrap: wrap;
  margin-bottom: 20px;
}

.video-list button {
  padding: 10px 20px;
  border: 2px solid #ddd;
  background: white;
  cursor: pointer;
  border-radius: 5px;
  transition: all 0.3s;
}

.video-list button:hover {
  border-color: #42b983;
}

.video-list button.active {
  background: #42b983;
  color: white;
  border-color: #42b983;
}

.player video {
  width: 100%;
  max-height: 600px;
  background: #000;
  border-radius: 8px;
}

.video-info {
  margin-top: 10px;
  padding: 15px;
  background: #f5f5f5;
  border-radius: 5px;
}

.placeholder {
  text-align: center;
  padding: 100px;
  color: #999;
  font-size: 18px;
}
</style>
