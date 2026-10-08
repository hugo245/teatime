import AVFoundation
import ExpoModulesCore

public class CallAudioModule: Module {
  public func definition() -> ModuleDefinition {
    Name("CallAudio")

    OnCreate {
      CallAudioModule.configureWebRTCSession()
    }

    Function("prepare") {
      CallAudioModule.configureWebRTCSession()
    }

    Function("release") {}

    Function("routeToSpeakerIfNeeded") {
      let session = AVAudioSession.sharedInstance()
      let usesReceiver = session.currentRoute.outputs.contains { $0.portType == .builtInReceiver }
      if usesReceiver {
        try? session.overrideOutputAudioPort(.speaker)
      }
    }
  }

  private static func configureWebRTCSession() {
    guard let configClass = NSClassFromString("RTCAudioSessionConfiguration") as? NSObject.Type else {
      return
    }
    let getter = NSSelectorFromString("webRTCConfiguration")
    let setter = NSSelectorFromString("setWebRTCConfiguration:")
    guard configClass.responds(to: getter), configClass.responds(to: setter) else {
      return
    }
    guard let config = configClass.perform(getter)?.takeUnretainedValue() as? NSObject else {
      return
    }
    let options: AVAudioSession.CategoryOptions = [.defaultToSpeaker, .allowBluetooth, .allowBluetoothA2DP]
    config.setValue(AVAudioSession.Category.playAndRecord.rawValue, forKey: "category")
    config.setValue(AVAudioSession.Mode.videoChat.rawValue, forKey: "mode")
    config.setValue(NSNumber(value: options.rawValue), forKey: "categoryOptions")
    _ = configClass.perform(setter, with: config)
  }
}
