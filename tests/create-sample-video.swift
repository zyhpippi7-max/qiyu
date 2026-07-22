import AVFoundation
import CoreVideo
import Foundation

let output = URL(fileURLWithPath: CommandLine.arguments.dropFirst().first ?? "/tmp/qiyu-editor-test.mp4")
try? FileManager.default.removeItem(at: output)
let width = 360, height = 640, fps: Int32 = 24, seconds = 2
let writer = try AVAssetWriter(outputURL: output, fileType: .mp4)
let input = AVAssetWriterInput(mediaType: .video, outputSettings: [
  AVVideoCodecKey: AVVideoCodecType.h264,
  AVVideoWidthKey: width,
  AVVideoHeightKey: height,
])
input.expectsMediaDataInRealTime = false
let adaptor = AVAssetWriterInputPixelBufferAdaptor(assetWriterInput: input, sourcePixelBufferAttributes: [
  kCVPixelBufferPixelFormatTypeKey as String: kCVPixelFormatType_32BGRA,
  kCVPixelBufferWidthKey as String: width,
  kCVPixelBufferHeightKey as String: height,
])
guard writer.canAdd(input) else { fatalError("无法创建测试视频轨道") }
writer.add(input)
writer.startWriting()
writer.startSession(atSourceTime: .zero)

for frame in 0..<(Int(fps) * seconds) {
  while !input.isReadyForMoreMediaData { Thread.sleep(forTimeInterval: 0.003) }
  var buffer: CVPixelBuffer?
  CVPixelBufferCreate(kCFAllocatorDefault, width, height, kCVPixelFormatType_32BGRA, [
    kCVPixelBufferCGImageCompatibilityKey: true,
    kCVPixelBufferCGBitmapContextCompatibilityKey: true,
  ] as CFDictionary, &buffer)
  guard let buffer else { fatalError("无法创建测试画面") }
  CVPixelBufferLockBaseAddress(buffer, [])
  let bytes = CVPixelBufferGetBaseAddress(buffer)!.assumingMemoryBound(to: UInt8.self)
  let stride = CVPixelBufferGetBytesPerRow(buffer)
  for y in 0..<height {
    for x in 0..<width {
      let offset = y * stride + x * 4
      let pulse = UInt8((frame * 5 + x / 3) % 255)
      bytes[offset] = UInt8(120 + y * 100 / height)
      bytes[offset + 1] = pulse
      bytes[offset + 2] = UInt8(90 + x * 120 / width)
      bytes[offset + 3] = 255
    }
  }
  CVPixelBufferUnlockBaseAddress(buffer, [])
  adaptor.append(buffer, withPresentationTime: CMTime(value: CMTimeValue(frame), timescale: fps))
}
input.markAsFinished()
await withCheckedContinuation { continuation in
  writer.finishWriting { continuation.resume() }
}
if writer.status != .completed { fatalError(writer.error?.localizedDescription ?? "测试视频生成失败") }
print(output.path)
