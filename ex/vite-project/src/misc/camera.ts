import { StreamApiNotSupportedError, InsecureContextError, StreamLoadTimeoutError } from './errors'
import { eventOn, timeout } from './callforth'
import shimGetUserMedia from './shimGetUserMedia'
import { assertNever } from './util'

type StartTaskResult = {
  type: 'start'
  data: {
    videoEl: HTMLVideoElement
    stream: MediaStream
    capabilities: Partial<MediaTrackCapabilities>
    constraints: MediaTrackConstraints
    isTorchOn: boolean
  }
}

type StopTaskResult = {
  type: 'stop'
  data: {}
}

type FailedTask = {
  type: 'failed'
  error: Error
}

type TaskResult = StartTaskResult | StopTaskResult | FailedTask

let taskQueue: Promise<TaskResult> = Promise.resolve({ type: 'stop', data: {} })

type CreateObjectURLCompat = (obj: MediaSource | Blob | MediaStream) => string
let videotrack =null
let isTorchOning=false
export  async function setZoom(zoom = 1) {
  if(videotrack==null) return
  await videotrack.applyConstraints({ advanced: [{ zoom: zoom }] })

}
export async function setTorch(torch: boolean){
  if(videotrack==null) return
  await videotrack.applyConstraints({ advanced: [{ torch: torch }] })
  isTorchOning=torch
}
async function runStartTask(
  videoEl: HTMLVideoElement,
  constraints: MediaTrackConstraints,
  torch: boolean,
  zoom:number
): Promise<{
  data : {
    isTorchOn : boolean;
    capabilities : Partial<MediaTrackCapabilities>;
    stream : MediaStream;
    track : MediaStreamTrack;
    constraints : MediaTrackConstraints;
    videoEl : HTMLVideoElement
  };
  type : string
}> {
  console.debug(
    '[vue-qrcode-reader] starting camera with constraints: ',
    JSON.stringify(constraints)
  )

  // At least in Chrome `navigator.mediaDevices` is undefined when the page is
  // loaded using HTTP rather than HTTPS. Thus `STREAM_API_NOT_SUPPORTED` is
  // initialized with `false` although the API might actually be supported.
  // So although `getUserMedia` already should have a built-in mechanism to
  // detect insecure context (by throwing `NotAllowedError`), we have to do a
  // manual check before even calling `getUserMedia`.
  if (window.isSecureContext !== true) {
    throw new InsecureContextError()
  }

  if (navigator?.mediaDevices?.getUserMedia === undefined) {
    throw new StreamApiNotSupportedError()
  }

  // This is a browser API only shim. It patches the global window object which
  // is not available during SSR. So we lazily apply this shim at runtime.
  shimGetUserMedia()

  console.debug('[vue-qrcode-reader] calling getUserMedia')
  const stream = await navigator.mediaDevices.getUserMedia({
    audio: false,
    video: constraints
  })

  if (videoEl.srcObject !== undefined) {
    videoEl.srcObject = stream
  } else if (videoEl.mozSrcObject !== undefined) {
    videoEl.mozSrcObject = stream
  } else if (window.URL.createObjectURL) {
    videoEl.src = (window.URL.createObjectURL as CreateObjectURLCompat)(stream)
  } else if (window.webkitURL) {
    videoEl.src = (window.webkitURL.createObjectURL as CreateObjectURLCompat)(stream)
  } else {
    videoEl.src = stream.id
  }

  // In the WeChat browser on iOS,
  // 'loadeddata' event won't get fired
  // unless video is explictly triggered by play()
  videoEl.play()

  console.debug('[vue-qrcode-reader] waiting for video element to load')
  await Promise.race([
    eventOn(videoEl, 'loadeddata'),

    // On iOS devices in PWA mode, QrcodeStream works initially, but after
    // killing and restarting the PWA, all video elements fail to load camera
    // streams and never emit the `loadeddata` event. Looks like this is
    // related to a WebKit issue (see #298). No workarounds at the moment.
    // To at least detect this situation, we throw an error if the event
    // has not been emitted after a 6 second timeout.
    timeout(6_000).then(() => {
      throw new StreamLoadTimeoutError()
    })
  ])
  console.debug('[vue-qrcode-reader] video element loaded')

  // According to: https://oberhofer.co/mediastreamtrack-and-its-capabilities/#queryingcapabilities
  // On some devices, getCapabilities only returns a non-empty object after
  // some delay. There is no appropriate event so we have to add a constant timeout
  await timeout(500)

  const [track] = stream.getVideoTracks()
  videotrack=track
  const capabilities: Partial<MediaTrackCapabilities> = track?.getCapabilities?.() ?? {}

  let isTorchOn = false
  if (torch && capabilities.torch) {

    await track.applyConstraints({ advanced: [{ torch: true }] })
    isTorchOn = true
  }
  if(capabilities.zoom){
    await track.applyConstraints({ advanced: [{ zoom: zoom }] })
  }


  console.debug('[vue-qrcode-reader] camera ready')
  return {
    type: 'start',
    data: {
      videoEl,
      stream,
      track,
      capabilities,
      constraints,
      isTorchOn
    }
  }
}

export async function start(
  videoEl: HTMLVideoElement,
  {
    constraints,
    torch,
    restart = false,
    zoom= 1
  }: {
    constraints: MediaTrackConstraints
    torch: boolean
    restart?: boolean,
    zoom:number
  }
): Promise<Partial<MediaTrackCapabilities>> {
  // update the task queue synchronously
  taskQueue = taskQueue
    .then((prevTaskResult) => {
      if (prevTaskResult.type === 'start') {
        // previous task is a start task
        // we'll check if we can reuse the previous result
        const {
          data: {
            videoEl: prevVideoEl,
            stream: prevStream,
            constraints: prevConstraints,
            isTorchOn: prevIsTorchOn,
          }
        } = prevTaskResult
        // TODO: Should we keep this object comparison
        // this code only checks object sameness not equality
        // deep comparison requires snapshots and value by value check
        // which seem too much
        if (
          !restart &&
          videoEl === prevVideoEl &&
          constraints === prevConstraints &&
          torch === prevIsTorchOn
        ) {
          // things didn't change, reuse the previous result
          return prevTaskResult
        }
        // something changed, restart (stop then start)
        return runStopTask(prevVideoEl, prevStream, prevIsTorchOn).then(() =>
          runStartTask(videoEl, constraints, torch,zoom)
        )
      } else if (prevTaskResult.type === 'stop' || prevTaskResult.type === 'failed') {
        // previous task is a stop/error task
        // we can safely start
        return runStartTask(videoEl, constraints, torch,zoom)
      }

      assertNever(prevTaskResult)
    })
    .catch((error: Error) => {
      console.debug(`[vue-qrcode-reader] starting camera failed with "${error}"`)
      return { type: 'failed', error }
    })

  // await the task queue asynchronously
  const taskResult = await taskQueue

  if (taskResult.type === 'stop') {
    // we just synchronously updated the task above
    // to make the latest task a start task
    // so this case shouldn't happen
    throw new Error('Something went wrong with the camera task queue (start task).')
  } else if (taskResult.type === 'failed') {
    throw taskResult.error
  } else if (taskResult.type === 'start') {
    // return the data we want
    return taskResult.data.capabilities
  }

  assertNever(taskResult)
}

async function runStopTask(
  videoEl: HTMLVideoElement,
  stream: MediaStream,
  isTorchOn: boolean
): Promise<StopTaskResult> {
  console.debug('[vue-qrcode-reader] stopping camera')

  videoEl.src = ''
  videoEl.srcObject = null
  videoEl.load()

  // wait for load() to emit error
  // because src and srcObject are empty
  await eventOn(videoEl, 'error')

  for (const track of stream.getTracks()) {
    isTorchOn ?? (await track.applyConstraints({ advanced: [{ torch: false }] }))
    isTorchOning ?? (await track.applyConstraints({ advanced: [{ torch: false }] }))
    stream.removeTrack(track)
    track.stop()
  }

  return {
    type: 'stop',
    data: {}
  }
}

export async function stop() {
  // update the task queue synchronously
  taskQueue = taskQueue.then((prevTaskResult) => {
    if (prevTaskResult.type === 'stop' || prevTaskResult.type === 'failed') {
      // previous task is a stop task
      // no need to stop again
      return prevTaskResult
    }
    const {
      data: { videoEl, stream, isTorchOn }
    } = prevTaskResult
    return runStopTask(videoEl, stream, isTorchOn)
  })
  // await the task queue asynchronously
  const taskResult = await taskQueue
  if (taskResult.type === 'start') {
    // we just synchronously updated the task above
    // to make the latest task a stop task
    // so this case shouldn't happen
    throw new Error('Something went wrong with the camera task queue (stop task).')
  }
}
