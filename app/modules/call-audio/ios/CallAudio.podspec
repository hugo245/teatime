Pod::Spec.new do |s|
  s.name           = 'CallAudio'
  s.version        = '1.0.0'
  s.summary        = 'Routes TeaTime call audio to the loudspeaker'
  s.description    = 'Configures the WebRTC audio session for video calls'
  s.license        = 'MIT'
  s.author         = 'TeaTime'
  s.homepage       = 'https://github.com/hugo245/teatime'
  s.platforms      = { :ios => '16.4' }
  s.swift_version  = '5.9'
  s.source         = { git: 'https://github.com/hugo245/teatime.git' }
  s.static_framework = true

  s.dependency 'ExpoModulesCore'

  s.source_files = '**/*.{h,m,swift}'
  s.pod_target_xcconfig = {
    'DEFINES_MODULE' => 'YES',
    'SWIFT_COMPILATION_MODE' => 'wholemodule'
  }
end
