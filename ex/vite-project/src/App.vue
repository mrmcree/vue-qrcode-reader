<template>
  <div>
    <view class="py-5 text-center w-full" v-if="loading">
      loading
    </view>
    <qrcode-stream
      class="qrcode-wrap"
      :zoom="zoom"
      :paused="paused"
      :torch="torch"
      :constraints="selectedConstraints"
      :track="paintBoundingBox"
      @error="onError"
      @detect="onDetect"
      @camera-on="onCameraReady"
    >
      <i class="i-material-symbols-cancel text-white fixed text-lg top-5 left-5 z-10" @click="handleClose"></i>
      <div class="qr-scanner" v-if="!loading">
        <div class="box" >
          <div class="line" :style="{animationPlayState: paused ? 'paused': 'running'}"></div>
          <div class="angle"></div>
        </div>
      </div>
      <div class="torch-wrap flex  text-white text-2xl items-end justify-center" @click="() => (torch = !torch)" v-if="isSupportTorch">

        打开大量的拉拉
        <i class="i-ion:md-flash  " v-if="!torch"></i>
        <i class="i-ion:md-flash-off" v-else></i>

      </div>

    </qrcode-stream>

  </div>
</template>
<script setup lang="ts">
import { ref } from 'vue'

// https://gruhn.github.io/vue-qrcode-reader/api/QrcodeStream.html
import QrcodeStream from "./components/QrcodeStream.vue";
const emit = defineEmits(["decode",'close']);
const loading=ref(true)
const error = ref("");
const cameraIsReady = ref(false);
const isSupportTorch = ref(false); // 是否支持闪光灯
const torch = ref(false); // 闪光灯状态
const zoom = ref(3); // 闪光灯状态
const paused=ref(false)
// 相机配置选项: 'user'|'environment' （默认：environment）
const selectedConstraints = ref({ facingMode: "environment" });

// 检测到二维码后绘制画布类型
function paintBoundingBox(detectedCodes: any, ctx: CanvasRenderingContext2D) {
  for (const detectedCode of detectedCodes) {
    const [firstPoint, ...otherPoints] = detectedCode.cornerPoints

    ctx.strokeStyle = 'red'

    ctx.beginPath()
    ctx.moveTo(firstPoint.x, firstPoint.y)
    for (const { x, y } of otherPoints) {
      ctx.lineTo(x, y)
    }
    ctx.lineTo(firstPoint.x, firstPoint.y)
    ctx.closePath()
    ctx.stroke()
  }
}

async function onCameraReady(capabilities: any) {
  paused.value=false
  // NOTE: on iOS we can't invoke `enumerateDevices` before the user has given
  // camera access permission. `QrcodeStream` internally takes care of
  // requesting the permissions. The `camera-on` event should guarantee that this
  // has happened.
  loading.value=false
  try {
    isSupportTorch.value = !!capabilities.torch;
    cameraIsReady.value = true;
    error.value = "";
  } catch (error) {
    onError(error);
    cameraIsReady.value = false;
  }
}


// 错误提示
function onError(err: any) {
  const errorMessages = {
    NotAllowedError: '您需要授予相机访问权限',
    NotFoundError: '这个设备上没有摄像头',
    NotSupportedError: '所需的安全上下文(HTTPS、本地主机)',
    NotReadableError: '相机被占用',
    OverconstrainedError: '安装摄像头不合适',
    StreamApiNotSupportedError: '此浏览器不支持流API',
    InsecureContextError: '仅允许在安全上下文中访问摄像机。使用HTTPS或本地主机，而不是HTTP。',
  }
  const message = errorMessages[err.name] || 'ERROR: 摄像头错误'
 console.log(message)

}
const handleClose=()=>{
  console.log('close')
  emit('close')
}
// 用户摄像头的流后
function onDetect(detectedCodes: any) {
  console.log(detectedCodes)
  paused.value=true

  onDecode(detectedCodes[0]?.rawValue);
//  sleep(1000)
//  paused.value=false
}
const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));


// 解码(交给父组件处理：进行网络请求)
function onDecode(text: string) {
  emit("decode", text);
}


</script>
<style scoped>
.qrcode-wrap {
  position: fixed !important;
  top: 0;
  right: 0;
  bottom: 0;
  left: 0;
  width: 100vw;
  height: 100vh;
  z-index: 1 !important;
  //background: rgba(0, 0, 0, 0.5);
}
.torch-wrap {
  width: 18.75rem;
  height: 12.5rem;
  position: fixed !important;
  left: 50%;
  top: 50%;
  transform: translate(-50%, 0%);
  z-index: 20;
}

.torch {
  position: fixed;
  bottom: -6.25rem;
  left: 50%;
  transform: translateX(-50%);
  z-index: 20;
  color: #fff;
  display: flex;
  flex-direction: column;
  align-items: center;
}
.photo-wrap {
  position: fixed;
  bottom: 2.875rem;
  left: 2.875rem;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 6px;
}

.photo {
  height: 3.125rem;
  width: 3.125rem;
  background-color: rgba(250, 250, 250, 0.8);
  border-radius: 50%;
  display: grid;
  place-items: center;
  cursor: pointer;
}
.qr-scanner-container {
  position: relative;
  width: 100%;
  height: 100%;

  .close-view {
    width: 30px;
    height: 30px;
    padding:0;
    position: absolute;
    top: 20px;
    right: 20px;
    border-radius: 50%;
    background-color: #fff;
    color: #000;
    text-align: center;
    line-height: 30px;
    font-size: 20px;
    cursor: pointer;
    z-index: 1000000;
  }
}

.qr-scanner {
  background-image: linear-gradient(
    0deg,
    transparent 24%,
    rgba(32, 255, 77, 0.1) 25%,
    rgba(32, 255, 77, 0.1) 26%,
    transparent 27%,
    transparent 74%,
    rgba(32, 255, 77, 0.1) 75%,
    rgba(32, 255, 77, 0.1) 76%,
    transparent 77%,
    transparent
  ),
  linear-gradient(
    90deg,
    transparent 24%,
    rgba(32, 255, 77, 0.1) 25%,
    rgba(32, 255, 77, 0.1) 26%,
    transparent 27%,
    transparent 74%,
    rgba(32, 255, 77, 0.1) 75%,
    rgba(32, 255, 77, 0.1) 76%,
    transparent 77%,
    transparent
  );
  background-size: 3rem 3rem;
  background-position: -1rem -1rem;
  width: 100%;
  /* height: 100%; */
  height: 100vh;
  position: relative;
  background-color: #1110;

  /* background-color: #111; */
}

.qr-scanner .box {
  width: 213px;
  height: 213px;
  position: absolute;
  left: 50%;
  top: 50%;
  transform: translate(-50%, -50%);
  overflow: hidden;
  border: 0.1rem solid rgba(0, 255, 51, 0.2);
  /* background: url('http://resource.beige.world/imgs/gongconghao.png') no-repeat center center; */
}

.qr-scanner .line {
  height: calc(100% - 2px);
  width: 100%;
  background: linear-gradient(180deg, rgba(0, 255, 51, 0) 43%, #00ff33 211%);
  border-bottom: 3px solid #00ff33;
  transform: translateY(-100%);
  animation: radar-beam 2s infinite alternate;
  animation-timing-function: cubic-bezier(0.53, 0, 0.43, 0.99);
  animation-delay: 1.4s;
}

.qr-scanner .box:after,
.qr-scanner .box:before,
.qr-scanner .angle:after,
.qr-scanner .angle:before {
  content: '';
  display: block;
  position: absolute;
  width: 3vw;
  height: 3vw;

  border: 0.2rem solid transparent;
}

.qr-scanner .box:after,
.qr-scanner .box:before {
  top: 0;
  border-top-color: #00ff33;
}

.qr-scanner .angle:after,
.qr-scanner .angle:before {
  bottom: 0;
  border-bottom-color: #00ff33;
}

.qr-scanner .box:before,
.qr-scanner .angle:before {
  left: 0;
  border-left-color: #00ff33;
}

.qr-scanner .box:after,
.qr-scanner .angle:after {
  right: 0;
  border-right-color: #00ff33;
}

@keyframes radar-beam {
  0% {
    transform: translateY(-100%);
  }

  100% {
    transform: translateY(0);
  }
}
</style>

