package expo.modules.callaudio

import android.content.Context
import android.media.AudioDeviceInfo
import android.media.AudioManager
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition

class CallAudioModule : Module() {
  private val audioManager: AudioManager?
    get() = appContext.reactContext?.getSystemService(Context.AUDIO_SERVICE) as? AudioManager

  override fun definition() = ModuleDefinition {
    Name("CallAudio")

    Function("prepare") {
      audioManager?.mode = AudioManager.MODE_IN_COMMUNICATION
    }

    Function("routeToSpeakerIfNeeded") {
      val manager = audioManager ?: return@Function
      manager.mode = AudioManager.MODE_IN_COMMUNICATION
      val outputs = manager.getDevices(AudioManager.GET_DEVICES_OUTPUTS)
      val headset = outputs.any {
        it.type == AudioDeviceInfo.TYPE_WIRED_HEADSET ||
          it.type == AudioDeviceInfo.TYPE_WIRED_HEADPHONES ||
          it.type == AudioDeviceInfo.TYPE_BLUETOOTH_SCO ||
          it.type == AudioDeviceInfo.TYPE_BLUETOOTH_A2DP ||
          it.type == AudioDeviceInfo.TYPE_USB_HEADSET
      }
      if (!headset) {
        @Suppress("DEPRECATION")
        manager.isSpeakerphoneOn = true
      }
    }

    Function("release") {
      val manager = audioManager ?: return@Function
      @Suppress("DEPRECATION")
      manager.isSpeakerphoneOn = false
      manager.mode = AudioManager.MODE_NORMAL
    }
  }
}
