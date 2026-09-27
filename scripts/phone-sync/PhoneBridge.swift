// Read-only bridge between an attached iPhone and sync.mjs, built on ImageCaptureCore
// (the framework behind Image Capture.app), so no Apple developer account is needed.
//
// Protocol: JSON lines.
//   stdout events: {"type":"status"|"item"|"catalog_done"|"downloaded"|"download_error"|"fatal", ...}
//   stdin requests: {"id": "<asset id>", "dir": "<directory to save into>"}
// Closing stdin ends the session and exits.
//
// Nothing here deletes or modifies anything on the phone.

import Foundation
import ImageCaptureCore

func emit(_ obj: [String: Any]) {
  guard let data = try? JSONSerialization.data(withJSONObject: obj) else { return }
  FileHandle.standardOutput.write(data)
  FileHandle.standardOutput.write("\n".data(using: .utf8)!)
}

let iso = ISO8601DateFormatter()

final class Bridge: NSObject, ICDeviceBrowserDelegate, ICCameraDeviceDelegate {
  let browser = ICDeviceBrowser()
  var camera: ICCameraDevice?
  var filesById: [String: ICCameraFile] = [:]
  var catalogSent = false
  var stdinBuffer = Data()

  func start() {
    browser.delegate = self
    browser.browsedDeviceTypeMask = ICDeviceTypeMask(
      rawValue: ICDeviceTypeMask.camera.rawValue | ICDeviceLocationTypeMask.local.rawValue)!
    browser.start()
    DispatchQueue.main.asyncAfter(deadline: .now() + 5) { [weak self] in
      if self?.camera == nil {
        emit(["type": "status", "message": "Waiting for iPhone — connect it by USB and unlock it"])
      }
    }
  }

  // MARK: device browser

  func deviceBrowser(_ browser: ICDeviceBrowser, didAdd device: ICDevice, moreComing: Bool) {
    guard camera == nil, let cam = device as? ICCameraDevice,
      cam.productKind?.lowercased().contains("iphone") ?? true
    else { return }
    camera = cam
    cam.delegate = self
    emit(["type": "status", "message": "Found \(cam.name ?? "iPhone"), opening session…"])
    cam.requestOpenSession()
  }

  func deviceBrowser(_ browser: ICDeviceBrowser, didRemove device: ICDevice, moreGoing: Bool) {
    if device == camera {
      emit(["type": "fatal", "message": "iPhone disconnected"])
      exit(2)
    }
  }

  // MARK: device

  func device(_ device: ICDevice, didOpenSessionWithError error: Error?) {
    if let error = error, !(camera?.isAccessRestrictedAppleDevice ?? false) {
      emit(["type": "fatal", "message": "Could not open session: \(error.localizedDescription)"])
      exit(2)
    }
  }

  func device(_ device: ICDevice, didCloseSessionWithError error: Error?) {}
  func didRemove(_ device: ICDevice) {}

  func cameraDeviceDidEnableAccessRestriction(_ device: ICDevice) {
    if !catalogSent {
      emit(["type": "status", "message": "iPhone is locked — unlock it (and tap Trust if asked)"])
    }
  }

  func cameraDeviceDidRemoveAccessRestriction(_ device: ICDevice) {
    if !catalogSent {
      emit(["type": "status", "message": "iPhone unlocked, reading library…"])
      device.requestOpenSession()
    }
  }

  func deviceDidBecomeReady(withCompleteContentCatalog device: ICCameraDevice) {
    // A catalog delivered before the phone was unlocked is empty; wait for the real one.
    guard !catalogSent, device.hasOpenSession, !device.isAccessRestrictedAppleDevice else { return }
    catalogSent = true
    waitForStableCatalog(device, lastCount: -1, stableChecks: 0)
  }

  // The "complete" callback can arrive while the phone is still delivering items (seen: 7,514 of
  // ~15,000), so only report the catalog once its size stops changing for a few seconds.
  func waitForStableCatalog(_ device: ICCameraDevice, lastCount: Int, stableChecks: Int) {
    let count = device.mediaFiles?.count ?? 0
    if count == lastCount && stableChecks >= 3 {
      sendCatalog(device)
      return
    }
    if count != lastCount && lastCount >= 0 {
      emit(["type": "status", "message": "Reading library… \(count) items so far"])
    }
    DispatchQueue.main.asyncAfter(deadline: .now() + 2) { [weak self] in
      self?.waitForStableCatalog(device, lastCount: count, stableChecks: count == lastCount ? stableChecks + 1 : 0)
    }
  }

  func sendCatalog(_ device: ICCameraDevice) {
    for case let file as ICCameraFile in device.mediaFiles ?? [] {
      let name = file.name ?? "unknown"
      let created = file.creationDate ?? file.fileCreationDate
      // relatedUUID is the Photos asset identifier and is stable across sessions.
      var id = file.relatedUUID ?? file.fingerprint ?? "\(name)|\(created.map(iso.string) ?? "")|\(file.fileSize)"
      if filesById[id] != nil { id += "|\(name)" }
      filesById[id] = file

      var item: [String: Any] = [
        "type": "item",
        "id": id,
        "name": name,
        "size": file.fileSize,
        "livePhoto": !(file.sidecarFiles ?? []).isEmpty,
      ]
      if let created = created { item["created"] = iso.string(from: created) }
      if let original = file.originalFilename { item["originalName"] = original }
      emit(item)
    }
    emit(["type": "catalog_done", "count": filesById.count])
    readRequests()
  }

  // MARK: downloads

  func readRequests() {
    FileHandle.standardInput.readabilityHandler = { [weak self] handle in
      let chunk = handle.availableData
      DispatchQueue.main.async {
        guard let self = self else { return }
        if chunk.isEmpty {
          FileHandle.standardInput.readabilityHandler = nil
          self.camera?.requestCloseSession()
          DispatchQueue.main.asyncAfter(deadline: .now() + 0.5) { exit(0) }
          return
        }
        self.stdinBuffer.append(chunk)
        while let nl = self.stdinBuffer.firstIndex(of: UInt8(ascii: "\n")) {
          let line = self.stdinBuffer.subdata(in: self.stdinBuffer.startIndex..<nl)
          self.stdinBuffer.removeSubrange(self.stdinBuffer.startIndex...nl)
          self.handleRequest(line)
        }
      }
    }
  }

  func handleRequest(_ line: Data) {
    guard let obj = try? JSONSerialization.jsonObject(with: line) as? [String: Any],
      let id = obj["id"] as? String, let dir = obj["dir"] as? String
    else { return }
    guard let file = filesById[id] else {
      emit(["type": "download_error", "id": id, "message": "Unknown asset"])
      return
    }
    let options: [ICDownloadOption: Any] = [
      .downloadsDirectoryURL: URL(fileURLWithPath: dir, isDirectory: true),
      .overwrite: true,
      // Sidecars (e.g. the Live Photo .MOV) are intentionally not requested.
    ]
    file.requestDownload(options: options) { filename, error in
      DispatchQueue.main.async {
        if let error = error {
          emit(["type": "download_error", "id": id, "message": error.localizedDescription])
        } else {
          let path = URL(fileURLWithPath: dir).appendingPathComponent(filename ?? file.name ?? "").path
          emit(["type": "downloaded", "id": id, "path": path])
        }
      }
    }
  }

  // MARK: unused camera delegate callbacks

  func cameraDevice(_ camera: ICCameraDevice, didAdd items: [ICCameraItem]) {}
  func cameraDevice(_ camera: ICCameraDevice, didRemove items: [ICCameraItem]) {}
  func cameraDevice(_ camera: ICCameraDevice, didRenameItems items: [ICCameraItem]) {}
  func cameraDevice(_ camera: ICCameraDevice, didReceiveThumbnail thumbnail: CGImage?, for item: ICCameraItem, error: Error?) {}
  func cameraDevice(_ camera: ICCameraDevice, didReceiveMetadata metadata: [AnyHashable: Any]?, for item: ICCameraItem, error: Error?) {}
  func cameraDeviceDidChangeCapability(_ camera: ICCameraDevice) {}
  func cameraDevice(_ camera: ICCameraDevice, didReceivePTPEvent eventData: Data) {}
}

setvbuf(stdout, nil, _IONBF, 0)
let bridge = Bridge()
bridge.start()
RunLoop.main.run()
