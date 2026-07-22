import AppKit
import ApplicationServices
import CoreGraphics
import Foundation
import ScreenCaptureKit
import Vision

struct Contact: Codable {
    let name: String
    let confidence: Float
}

struct ContactAggregate {
    var contact: Contact
    var sightings: Int
}

struct ScanResult: Codable {
    let ok: Bool
    let contacts: [Contact]
    let error: String?
    let pages: Int
}

struct InboxResult: Codable {
    let ok: Bool
    let unread: Bool
    let contact: String?
    let message: String?
    let error: String?
}

struct ChatMessage: Codable {
    let direction: String
    let text: String
}

struct ChatHistoryResult: Codable {
    let ok: Bool
    let contact: String
    let history: [ChatMessage]
    let count: Int
    let source: String
    let error: String?
}

struct PermissionResult: Codable {
    let ok: Bool
    let screen: Bool
    let accessibility: Bool
    let error: String?
}

struct AutomationResult: Codable {
    let ok: Bool
    let drafted: Bool
    let sent: Bool
    let error: String?
    let debug: String?
}

struct ContactPreviewResult: Codable {
    let ok: Bool
    let markers: [String]
    let imagePath: String?
    let windowX: Double?
    let windowY: Double?
    let windowWidth: Double?
    let windowHeight: Double?
    let error: String?
}

struct RecognizedLine {
    let text: String
    let confidence: Float
    let rect: CGRect
}

struct WindowTarget {
    let id: CGWindowID
    let pid: pid_t
    let bounds: CGRect
}

func emit<T: Encodable>(_ result: T) {
    let encoder = JSONEncoder()
    encoder.outputFormatting = [.withoutEscapingSlashes]
    if let data = try? encoder.encode(result), let text = String(data: data, encoding: .utf8) {
        print(text)
    }
}

func findWeChatWindow() -> WindowTarget? {
    guard let list = CGWindowListCopyWindowInfo([.optionOnScreenOnly, .excludeDesktopElements], CGWindowID(0)) as? [[String: Any]] else { return nil }
    let candidates = list.compactMap { item -> WindowTarget? in
        let owner = item[kCGWindowOwnerName as String] as? String ?? ""
        guard owner.localizedCaseInsensitiveContains("WeChat") || owner.contains("微信") else { return nil }
        guard let number = item[kCGWindowNumber as String] as? NSNumber,
              let pidNumber = item[kCGWindowOwnerPID as String] as? NSNumber,
              let boundsDict = item[kCGWindowBounds as String] as? [String: Any] else { return nil }
        guard let bounds = CGRect(dictionaryRepresentation: boundsDict as CFDictionary) else { return nil }
        let layer = (item[kCGWindowLayer as String] as? NSNumber)?.intValue ?? 0
        guard layer == 0, bounds.width >= 720, bounds.height >= 500 else { return nil }
        return WindowTarget(id: CGWindowID(number.uint32Value), pid: pid_t(pidNumber.int32Value), bounds: bounds)
    }
    return candidates.max { left, right in
        let leftArea = left.bounds.width * left.bounds.height
        let rightArea = right.bounds.width * right.bounds.height
        return leftArea < rightArea
    }
}

func click(_ point: CGPoint) {
    let source = CGEventSource(stateID: .hidSystemState)
    CGEvent(mouseEventSource: source, mouseType: .mouseMoved, mouseCursorPosition: point, mouseButton: .left)?.post(tap: .cghidEventTap)
    usleep(80_000)
    CGEvent(mouseEventSource: source, mouseType: .leftMouseDown, mouseCursorPosition: point, mouseButton: .left)?.post(tap: .cghidEventTap)
    CGEvent(mouseEventSource: source, mouseType: .leftMouseUp, mouseCursorPosition: point, mouseButton: .left)?.post(tap: .cghidEventTap)
}

func postKey(_ keyCode: CGKeyCode, flags: CGEventFlags = []) {
    let source = CGEventSource(stateID: .hidSystemState)
    let down = CGEvent(keyboardEventSource: source, virtualKey: keyCode, keyDown: true)
    down?.flags = flags
    down?.post(tap: .cghidEventTap)
    let up = CGEvent(keyboardEventSource: source, virtualKey: keyCode, keyDown: false)
    up?.flags = flags
    up?.post(tap: .cghidEventTap)
}

func setPasteboard(_ value: String) {
    NSPasteboard.general.clearContents()
    NSPasteboard.general.setString(value, forType: .string)
}

func runningWeChat() -> NSRunningApplication? {
    NSWorkspace.shared.runningApplications.first { application in
        let name = application.localizedName ?? ""
        let identifier = application.bundleIdentifier ?? ""
        return name.localizedCaseInsensitiveContains("WeChat") || name.contains("微信") || identifier.localizedCaseInsensitiveContains("xinWeChat")
    }
}

func focusWeChat(_ application: NSRunningApplication) {
    application.unhide()
    application.activate(options: [.activateAllWindows, .activateIgnoringOtherApps])
    let axApplication = AXUIElementCreateApplication(application.processIdentifier)
    if let windows = axAttribute(axApplication, kAXWindowsAttribute as CFString) as? [AXUIElement] {
        for window in windows {
            _ = AXUIElementSetAttributeValue(window, kAXMinimizedAttribute as CFString, kCFBooleanFalse)
            _ = AXUIElementPerformAction(window, kAXRaiseAction as CFString)
        }
    }
}

func relaunchWindowlessWeChat(_ application: NSRunningApplication) -> NSRunningApplication? {
    guard application.terminate() else { return nil }
    for _ in 0..<30 {
        if application.isTerminated { break }
        usleep(100_000)
    }
    let process = Process()
    process.executableURL = URL(fileURLWithPath: "/usr/bin/open")
    process.arguments = ["-a", "WeChat"]
    do {
        try process.run()
        process.waitUntilExit()
    } catch {
        return nil
    }
    usleep(2_500_000)
    guard let restarted = runningWeChat() else { return nil }
    focusWeChat(restarted)
    usleep(900_000)
    return restarted
}

func screenPoint(for line: RecognizedLine, in image: CGImage, window: WindowTarget) -> CGPoint {
    let scaleX = window.bounds.width / CGFloat(image.width)
    let scaleY = window.bounds.height / CGFloat(image.height)
    return CGPoint(
        x: window.bounds.minX + line.rect.midX * scaleX,
        y: window.bounds.minY + line.rect.midY * scaleY
    )
}

func chatHeaderMatches(contact: String, image: CGImage) -> Bool {
    let width = CGFloat(image.width), height = CGFloat(image.height)
    let expected = canonicalContactKey(contact)
    guard !expected.isEmpty else { return false }
    return recognizeLines(in: image).contains { line in
        let actual = canonicalContactKey(line.text)
        guard line.rect.midX > width * 0.28, line.rect.midY < height * 0.16 else { return false }
        return actual == expected || actual.hasPrefix(expected) || expected.hasPrefix(actual)
    }
}

var lastOpenChatDebug = ""

func openWeChatChat(contact: String) -> WindowTarget? {
    lastOpenChatDebug = "start"
    guard let application = runningWeChat() else {
        lastOpenChatDebug = "wechat_process_missing"
        return nil
    }
    focusWeChat(application)
    usleep(900_000)
    var targetWindow = findWeChatWindow()
    if targetWindow == nil {
        if let wechatURL = URL(string: "weixin://") {
            NSWorkspace.shared.open(wechatURL)
            usleep(1_200_000)
            focusWeChat(application)
            targetWindow = findWeChatWindow()
        }
    }
    if targetWindow == nil {
        // WeChat can keep its process alive after the main panel is closed.
        // Command+0 is its standard “show main window” shortcut.
        postKey(29, flags: .maskCommand)
        usleep(1_100_000)
        targetWindow = findWeChatWindow()
    }
    if targetWindow == nil, relaunchWindowlessWeChat(application) != nil {
        targetWindow = findWeChatWindow()
    }
    guard let window = targetWindow else {
        lastOpenChatDebug = "main_window_not_restored"
        return nil
    }

    // WeChat 4.x changed Command+F into the global “搜一搜” page. Click the
    // conversation-list search box directly so the result remains a local
    // contact/conversation and can be verified before any message is pasted.
    let initialImage = capture(window)
    if initialImage == nil { lastOpenChatDebug = "initial_capture_failed" }
    let recognizedSearch = initialImage.flatMap { image in
        let width = CGFloat(image.width), height = CGFloat(image.height)
        return recognizeLines(in: image).filter { line in
            let value = canonicalContactKey(line.text)
            return line.rect.midX < width * 0.36 &&
                line.rect.midY > height * 0.035 &&
                line.rect.midY < height * 0.18 &&
                (value == "搜索" || value.hasPrefix("搜索"))
        }.sorted { $0.rect.minY < $1.rect.minY }.first.map {
            screenPoint(for: $0, in: image, window: window)
        }
    }
    lastOpenChatDebug = recognizedSearch == nil ? "search_label_not_recognized" : "search_label_recognized"
    let searchPoint = recognizedSearch ?? CGPoint(
        x: window.bounds.minX + min(180, window.bounds.width * 0.18),
        y: window.bounds.minY + min(68, window.bounds.height * 0.085)
    )
    click(searchPoint)
    usleep(250_000)
    setPasteboard(contact)
    postKey(0, flags: .maskCommand) // Command + A
    usleep(80_000)
    postKey(9, flags: .maskCommand) // Command + V
    usleep(900_000)

    let expected = canonicalContactKey(contact)
    for _ in 0..<4 {
        guard let searchImage = capture(window) else {
            lastOpenChatDebug = "search_results_capture_failed"
            return nil
        }
        let width = CGFloat(searchImage.width), height = CGFloat(searchImage.height)
        let visibleLines = recognizeLines(in: searchImage)
        let candidates = visibleLines.filter { line in
            let value = canonicalContactKey(line.text)
            guard line.rect.midX < width * 0.34 else { return false }
            // Exclude the query text still visible inside the search input.
            guard line.rect.midY > height * 0.13, line.rect.midY < height * 0.78 else { return false }
            return value == expected || value.hasPrefix(expected) || expected.hasPrefix(value)
        }.sorted { left, right in
            let leftExact = canonicalContactKey(left.text) == expected
            let rightExact = canonicalContactKey(right.text) == expected
            if leftExact != rightExact { return leftExact }
            return left.rect.minY < right.rect.minY
        }
        if let candidate = candidates.first {
            lastOpenChatDebug = "candidate:\(candidate.text)"
            click(screenPoint(for: candidate, in: searchImage, window: window))
            usleep(850_000)
            if let chatImage = capture(window), chatHeaderMatches(contact: contact, image: chatImage) {
                lastOpenChatDebug = "verified"
                return window
            }
            lastOpenChatDebug = "candidate_clicked_header_not_verified"
        } else {
            let visible = visibleLines.filter {
                $0.rect.midX < width * 0.34 && $0.rect.midY > height * 0.10 && $0.rect.midY < height * 0.78
            }.prefix(12).map(\.text).joined(separator: "|")
            lastOpenChatDebug = "no_candidate:\(String(visible.prefix(240)))"
        }
        usleep(300_000)
    }
    postKey(53) // Escape closes the local search result list.
    return nil
}

func draftWeChat(contact: String, message: String, shouldSend: Bool) -> AutomationResult {
    guard AXIsProcessTrusted() else {
        return AutomationResult(ok: false, drafted: false, sent: false, error: "permission_accessibility", debug: nil)
    }
    guard runningWeChat() != nil else {
        return AutomationResult(ok: false, drafted: false, sent: false, error: "wechat_not_open", debug: nil)
    }
    guard let window = openWeChatChat(contact: contact) else {
        return AutomationResult(ok: false, drafted: false, sent: false, error: "conversation_not_verified", debug: lastOpenChatDebug)
    }
    let inputPoint = CGPoint(
        x: window.bounds.minX + window.bounds.width * 0.68,
        y: window.bounds.minY + window.bounds.height * 0.87
    )
    click(inputPoint)
    usleep(180_000)
    setPasteboard(message)
    postKey(9, flags: .maskCommand)
    usleep(350_000)
    if shouldSend {
        guard let currentImage = capture(window), chatHeaderMatches(contact: contact, image: currentImage) else {
            return AutomationResult(ok: false, drafted: true, sent: false, error: "conversation_changed_before_send", debug: nil)
        }
        postKey(36)
        usleep(450_000)
    }
    return AutomationResult(ok: true, drafted: true, sent: shouldSend, error: nil, debug: nil)
}

func axAttribute(_ element: AXUIElement, _ attribute: CFString) -> CFTypeRef? {
    var value: CFTypeRef?
    guard AXUIElementCopyAttributeValue(element, attribute, &value) == .success else { return nil }
    return value
}

func resetVerticalScrollBars(pid: pid_t) -> Bool {
    let application = AXUIElementCreateApplication(pid)
    var changed = false
    var visited = 0
    func walk(_ element: AXUIElement, depth: Int) {
        guard depth <= 12, visited < 1200 else { return }
        visited += 1
        let role = axAttribute(element, kAXRoleAttribute as CFString) as? String
        if role == (kAXScrollBarRole as String) {
            let orientation = axAttribute(element, kAXOrientationAttribute as CFString) as? String
            if orientation == nil || orientation == (kAXVerticalOrientationValue as String) {
                let zero = NSNumber(value: 0.0)
                if AXUIElementSetAttributeValue(element, kAXValueAttribute as CFString, zero) == .success {
                    changed = true
                }
            }
        }
        if let children = axAttribute(element, kAXChildrenAttribute as CFString) as? [AXUIElement] {
            for child in children { walk(child, depth: depth + 1) }
        }
    }
    if let windows = axAttribute(application, kAXWindowsAttribute as CFString) as? [AXUIElement] {
        for window in windows { walk(window, depth: 0) }
    }
    return changed
}

func scrollDown(at point: CGPoint) {
    let source = CGEventSource(stateID: .hidSystemState)
    CGEvent(mouseEventSource: source, mouseType: .mouseMoved, mouseCursorPosition: point, mouseButton: .left)?.post(tap: .cghidEventTap)
    usleep(60_000)
    // Three paced events keep a generous overlap between captures. Larger
    // bursts trigger WeChat's scroll momentum and can skip entire contact rows.
    for _ in 0..<3 {
        CGEvent(scrollWheelEvent2Source: source, units: .line, wheelCount: 1, wheel1: -28, wheel2: 0, wheel3: 0)?.post(tap: .cghidEventTap)
        usleep(45_000)
    }
}

func scrollToTop(at point: CGPoint, pid: pid_t, wheelEvents: Int) {
    let source = CGEventSource(stateID: .hidSystemState)
    click(point)
    let homeKey: CGKeyCode = 115
    for _ in 0..<30 {
        CGEvent(keyboardEventSource: source, virtualKey: homeKey, keyDown: true)?.post(tap: .cghidEventTap)
        CGEvent(keyboardEventSource: source, virtualKey: homeKey, keyDown: false)?.post(tap: .cghidEventTap)
        usleep(20_000)
    }
    usleep(500_000)
    if resetVerticalScrollBars(pid: pid) {
        usleep(400_000)
        return
    }
    CGEvent(mouseEventSource: source, mouseType: .mouseMoved, mouseCursorPosition: point, mouseButton: .left)?.post(tap: .cghidEventTap)
    usleep(60_000)
    for _ in 0..<wheelEvents {
        CGEvent(scrollWheelEvent2Source: source, units: .line, wheelCount: 1, wheel1: 24, wheel2: 0, wheel3: 0)?.post(tap: .cghidEventTap)
        usleep(10_000)
    }
}

func captureWindowContent(_ window: WindowTarget) -> CGImage? {
    guard #available(macOS 14.0, *) else { return nil }
    let completed = DispatchSemaphore(value: 0)
    var captured: CGImage?
    Task {
        defer { completed.signal() }
        do {
            let content = try await SCShareableContent.excludingDesktopWindows(true, onScreenWindowsOnly: false)
            guard let target = content.windows.first(where: { $0.windowID == window.id }) else { return }
            let filter = SCContentFilter(desktopIndependentWindow: target)
            let configuration = SCStreamConfiguration()
            configuration.width = max(1, Int(target.frame.width * 2))
            configuration.height = max(1, Int(target.frame.height * 2))
            configuration.showsCursor = false
            captured = try await SCScreenshotManager.captureImage(
                contentFilter: filter,
                configuration: configuration
            )
        } catch {
            captured = nil
        }
    }
    _ = completed.wait(timeout: .now() + 6)
    return captured
}

func capture(_ window: WindowTarget, keepAt requestedDestination: URL? = nil) -> CGImage? {
    let destination = requestedDestination ?? FileManager.default.temporaryDirectory
        .appendingPathComponent("qiyu-wechat-\(window.id)-\(UUID().uuidString).png")
    if let image = captureWindowContent(window) {
        if let requestedDestination {
            let representation = NSBitmapImageRep(cgImage: image)
            if let data = representation.representation(using: .png, properties: [:]) {
                try? data.write(to: requestedDestination, options: .atomic)
            }
        }
        return image
    }
    func runCapture(_ arguments: [String]) -> Bool {
        let process = Process()
        process.executableURL = URL(fileURLWithPath: "/usr/sbin/screencapture")
        process.arguments = arguments
        do {
            try process.run()
            process.waitUntilExit()
            return process.terminationStatus == 0 && FileManager.default.fileExists(atPath: destination.path)
        } catch {
            return false
        }
    }
    let capturedWindow = runCapture(["-x", "-o", "-l", String(window.id), destination.path])
    if !capturedWindow {
        try? FileManager.default.removeItem(at: destination)
        let region = [
            Int(window.bounds.minX.rounded()),
            Int(window.bounds.minY.rounded()),
            Int(window.bounds.width.rounded()),
            Int(window.bounds.height.rounded()),
        ].map(String.init).joined(separator: ",")
        guard runCapture(["-x", "-o", "-R\(region)", destination.path]) else {
            try? FileManager.default.removeItem(at: destination)
            return nil
        }
    }
    defer { if requestedDestination == nil { try? FileManager.default.removeItem(at: destination) } }
    guard let image = NSImage(contentsOf: destination),
          let data = image.tiffRepresentation,
          let bitmap = NSBitmapImageRep(data: data) else { return nil }
    return bitmap.cgImage
}

let contactMarkers: Set<String> = ["通讯录", "通讯录管理", "新的朋友", "仅聊天的朋友", "群聊", "标签", "公众号", "服务号", "企业微信联系人", "我的企业", "联系人"]

func visibleContactMarkers(in image: CGImage) -> [String] {
    let recognized = recognizeLines(in: image).map { $0.text.trimmingCharacters(in: .whitespacesAndNewlines) }
    return contactMarkers.filter { marker in
        recognized.contains { value in value.contains(marker) }
    }.sorted()
}

func isContactPage(_ image: CGImage) -> Bool {
    let markers = visibleContactMarkers(in: image)
    // At the top there are several category markers. Farther down, WeChat keeps
    // the distinctive “联系人” heading but scrolls the category rows away.
    return markers.count >= 2 || markers.contains("联系人")
}

func isContactHomePage(_ image: CGImage) -> Bool {
    let markers = visibleContactMarkers(in: image)
    let hasHomeMarker = markers.contains("通讯录管理") || markers.contains("新的朋友") || markers.contains("公众号")
    return hasHomeMarker && markers.count >= 3
}

func openContactTab(_ window: WindowTarget) -> CGImage? {
    let yRatios: [CGFloat] = [0.195, 0.19, 0.20, 0.185, 0.205]
    let listPoint = CGPoint(x: window.bounds.minX + min(190, window.bounds.width * 0.2), y: window.bounds.minY + window.bounds.height * 0.62)
    for yRatio in yRatios {
        let point = CGPoint(
            x: window.bounds.minX + window.bounds.width * 0.025,
            y: window.bounds.minY + window.bounds.height * yRatio
        )
        click(point)
        usleep(500_000)
        guard let currentImage = capture(window), isContactPage(currentImage) else { continue }
        let visibleCount = expectedContactCount(in: currentImage) ?? 1_200
        let wheelEvents = min(6_000, max(900, Int(Double(visibleCount) * 1.10)))
        scrollToTop(at: listPoint, pid: window.pid, wheelEvents: wheelEvents)
        usleep(450_000)
        if let image = capture(window), isContactHomePage(image) {
            return image
        }
    }
    return nil
}

func previewContactTab() -> ContactPreviewResult {
    let axOptions = [kAXTrustedCheckOptionPrompt.takeUnretainedValue() as String: true] as CFDictionary
    guard AXIsProcessTrustedWithOptions(axOptions) else { return ContactPreviewResult(ok: false, markers: [], imagePath: nil, windowX: nil, windowY: nil, windowWidth: nil, windowHeight: nil, error: "permission_accessibility") }
    guard let window = findWeChatWindow() else { return ContactPreviewResult(ok: false, markers: [], imagePath: nil, windowX: nil, windowY: nil, windowWidth: nil, windowHeight: nil, error: "wechat_not_open") }
    NSRunningApplication(processIdentifier: window.pid)?.activate()
    usleep(450_000)
    guard openContactTab(window) != nil else { return ContactPreviewResult(ok: false, markers: [], imagePath: nil, windowX: Double(window.bounds.minX), windowY: Double(window.bounds.minY), windowWidth: Double(window.bounds.width), windowHeight: Double(window.bounds.height), error: "contact_tab_not_open") }
    let destination = FileManager.default.temporaryDirectory.appendingPathComponent("qiyu-contact-preview.png")
    try? FileManager.default.removeItem(at: destination)
    guard let image = capture(window, keepAt: destination) else { return ContactPreviewResult(ok: false, markers: [], imagePath: nil, windowX: Double(window.bounds.minX), windowY: Double(window.bounds.minY), windowWidth: Double(window.bounds.width), windowHeight: Double(window.bounds.height), error: "screen_capture_failed") }
    let markers = visibleContactMarkers(in: image)
    let isOpen = isContactHomePage(image)
    return ContactPreviewResult(ok: isOpen, markers: markers, imagePath: destination.path, windowX: Double(window.bounds.minX), windowY: Double(window.bounds.minY), windowWidth: Double(window.bounds.width), windowHeight: Double(window.bounds.height), error: isOpen ? nil : "contact_tab_not_open")
}

let ignored: Set<String> = [
    "搜索", "通讯录", "联系人", "通讯录管理", "新的朋友", "仅聊天的朋友", "群聊", "标签", "公众号",
    "服务号", "我的企业", "企业微信联系人", "朋友权限", "微信团队", "微信支付", "文件传输助手", "折叠的群聊", "服务通知"
]

func normalizedName(_ value: String) -> String? {
    let name = value.replacingOccurrences(of: "\n", with: " ").trimmingCharacters(in: .whitespacesAndNewlines)
    guard name.count >= 1, name.count <= 40, !ignored.contains(name) else { return nil }
    guard name.range(of: "^[A-Z#]$", options: .regularExpression) == nil else { return nil }
    guard name.range(of: "^\\d{1,2}:\\d{2}$", options: .regularExpression) == nil else { return nil }
    guard name.range(of: "^\\d+$", options: .regularExpression) == nil else { return nil }
    guard !name.hasPrefix("http"), !name.contains("条消息"), !name.contains("位联系人") else { return nil }
    return name
}

func canonicalContactKey(_ value: String) -> String {
    let folded = value.folding(options: [.caseInsensitive, .widthInsensitive], locale: Locale(identifier: "zh_CN"))
    return folded.replacingOccurrences(of: "[\\s\\p{P}\\p{S}]+", with: "", options: .regularExpression)
}

func recognizeContacts(in image: CGImage) -> [Contact] {
    let request = VNRecognizeTextRequest()
    request.recognitionLevel = .accurate
    request.recognitionLanguages = ["zh-Hans", "zh-Hant", "en-US"]
    request.usesLanguageCorrection = false
    do { try VNImageRequestHandler(cgImage: image).perform([request]) } catch { return [] }
    let width = CGFloat(image.width), height = CGFloat(image.height)
    return (request.results ?? []).compactMap { observation in
        guard let candidate = observation.topCandidates(1).first else { return nil }
        let centerX = observation.boundingBox.midX * width
        let top = (1 - observation.boundingBox.maxY) * height
        // Contact names start to the right of the avatar column. Keeping the
        // lower bound here prevents text embedded inside avatars becoming names.
        guard centerX >= width * 0.082, centerX <= width * 0.25 else { return nil }
        guard top >= height * 0.07, top <= height * 0.96 else { return nil }
        guard observation.boundingBox.height * height >= 9 else { return nil }
        guard let name = normalizedName(candidate.string) else { return nil }
        return Contact(name: name, confidence: candidate.confidence)
    }
}

func recognizeLines(in image: CGImage) -> [RecognizedLine] {
    let request = VNRecognizeTextRequest()
    request.recognitionLevel = .accurate
    request.recognitionLanguages = ["zh-Hans", "zh-Hant", "en-US"]
    request.usesLanguageCorrection = true
    do { try VNImageRequestHandler(cgImage: image).perform([request]) } catch { return [] }
    let width = CGFloat(image.width), height = CGFloat(image.height)
    return (request.results ?? []).compactMap { observation in
        guard let candidate = observation.topCandidates(1).first else { return nil }
        let box = observation.boundingBox
        let rect = CGRect(x: box.minX * width, y: (1 - box.maxY) * height, width: box.width * width, height: box.height * height)
        let value = candidate.string.replacingOccurrences(of: "\n", with: " ").trimmingCharacters(in: .whitespacesAndNewlines)
        guard !value.isEmpty else { return nil }
        return RecognizedLine(text: value, confidence: candidate.confidence, rect: rect)
    }
}

func visibleChatMessages(in image: CGImage) -> [ChatMessage] {
    let width = CGFloat(image.width), height = CGFloat(image.height)
    let ignored = "^(微信|聊天|通讯录|搜索|发送|表情|文件|语音聊天|视频聊天|以下为新消息|消息已发出，但被对方拒收了。|\\d{1,2}:\\d{2})$"
    return recognizeLines(in: image).filter { line in
        let x = line.rect.midX, y = line.rect.midY
        guard x > width * 0.33 && x < width * 0.97 else { return false }
        guard y > height * 0.13 && y < height * 0.84 else { return false }
        guard line.text.count >= 1 && line.text.count <= 800 else { return false }
        return line.text.range(of: ignored, options: .regularExpression) == nil
    }.sorted { $0.rect.minY < $1.rect.minY }.map { line in
        ChatMessage(direction: line.rect.midX > width * 0.69 ? "outgoing" : "incoming", text: line.text)
    }
}

func scrollChatUp(at point: CGPoint) {
    let source = CGEventSource(stateID: .hidSystemState)
    CGEvent(mouseEventSource: source, mouseType: .mouseMoved, mouseCursorPosition: point, mouseButton: .left)?.post(tap: .cghidEventTap)
    usleep(50_000)
    for _ in 0..<5 {
        CGEvent(scrollWheelEvent2Source: source, units: .line, wheelCount: 1, wheel1: 24, wheel2: 0, wheel3: 0)?.post(tap: .cghidEventTap)
        usleep(45_000)
    }
}

func scanChatHistory(contact: String, requestedLimit: Int) -> ChatHistoryResult {
    let limit = min(50, max(30, requestedLimit))
    guard AXIsProcessTrusted() else {
        return ChatHistoryResult(ok: false, contact: contact, history: [], count: 0, source: "mac_window_ocr", error: "permission_accessibility")
    }
    if #available(macOS 10.15, *), !CGPreflightScreenCaptureAccess() {
        _ = CGRequestScreenCaptureAccess()
        return ChatHistoryResult(ok: false, contact: contact, history: [], count: 0, source: "mac_window_ocr", error: "permission_screen_recording")
    }
    guard let window = openWeChatChat(contact: contact) else {
        return ChatHistoryResult(ok: false, contact: contact, history: [], count: 0, source: "mac_window_ocr", error: "wechat_not_open")
    }
    let scrollPoint = CGPoint(x: window.bounds.minX + window.bounds.width * 0.68, y: window.bounds.minY + window.bounds.height * 0.42)
    var history: [ChatMessage] = []
    var seen = Set<String>()
    var unchanged = 0
    for _ in 0..<12 {
        guard let image = capture(window) else {
            return ChatHistoryResult(ok: false, contact: contact, history: [], count: 0, source: "mac_window_ocr", error: "screen_capture_failed")
        }
        let page = visibleChatMessages(in: image).filter { message in
            let key = "\(message.direction)|\(message.text)"
            return seen.insert(key).inserted
        }
        if page.isEmpty { unchanged += 1 } else {
            unchanged = 0
            history.insert(contentsOf: page, at: 0)
        }
        if history.count >= limit || unchanged >= 2 { break }
        scrollChatUp(at: scrollPoint)
        usleep(550_000)
    }
    let result = Array(history.suffix(limit))
    if result.isEmpty {
        return ChatHistoryResult(ok: false, contact: contact, history: [], count: 0, source: "mac_window_ocr", error: "chat_history_not_recognized")
    }
    return ChatHistoryResult(ok: true, contact: contact, history: result, count: result.count, source: "mac_window_ocr", error: nil)
}

func expectedContactCount(in image: CGImage) -> Int? {
    let width = CGFloat(image.width), height = CGFloat(image.height)
    let candidates = recognizeLines(in: image).filter { line in
        line.rect.midX >= width * 0.12 && line.rect.midX <= width * 0.25 && line.rect.midY <= height * 0.16
    }
    for line in candidates {
        let digits = line.text.replacingOccurrences(of: "[^0-9]", with: "", options: .regularExpression)
        if let count = Int(digits), count >= 1, count <= 100_000 { return count }
    }
    return nil
}

func unreadBadgeY(in image: CGImage) -> CGFloat? {
    let bitmap = NSBitmapImageRep(cgImage: image)
    let width = bitmap.pixelsWide, height = bitmap.pixelsHigh
    let minX = max(36, Int(Double(width) * 0.025)), maxX = min(width - 1, Int(Double(width) * 0.31))
    let minY = max(55, Int(Double(height) * 0.07)), maxY = min(height - 1, Int(Double(height) * 0.91))
    var rowHits: [(Int, Int)] = []
    for y in stride(from: minY, through: maxY, by: 2) {
        var hits = 0
        for x in stride(from: minX, through: maxX, by: 2) {
            guard let color = bitmap.colorAt(x: x, y: y)?.usingColorSpace(.deviceRGB) else { continue }
            if color.redComponent > 0.72 && color.greenComponent < 0.42 && color.blueComponent < 0.42 && color.alphaComponent > 0.65 { hits += 1 }
        }
        if hits >= 3 { rowHits.append((y, hits)) }
    }
    guard !rowHits.isEmpty else { return nil }
    var groups: [[(Int, Int)]] = []
    for item in rowHits {
        if let last = groups.last?.last, item.0 - last.0 <= 5 { groups[groups.count - 1].append(item) }
        else { groups.append([item]) }
    }
    let candidates = groups.filter { group in group.count >= 2 && group.first!.0 > minY + 8 }
    guard let group = candidates.first else { return nil }
    return CGFloat(group.map { $0.0 }.reduce(0, +)) / CGFloat(group.count)
}

func scanInbox() -> InboxResult {
    let axOptions = [kAXTrustedCheckOptionPrompt.takeUnretainedValue() as String: true] as CFDictionary
    guard AXIsProcessTrustedWithOptions(axOptions) else { return InboxResult(ok: false, unread: false, contact: nil, message: nil, error: "permission_accessibility") }
    if #available(macOS 10.15, *), !CGPreflightScreenCaptureAccess() {
        _ = CGRequestScreenCaptureAccess()
        return InboxResult(ok: false, unread: false, contact: nil, message: nil, error: "permission_screen_recording")
    }
    guard let window = findWeChatWindow() else { return InboxResult(ok: false, unread: false, contact: nil, message: nil, error: "wechat_not_open") }
    NSRunningApplication(processIdentifier: window.pid)?.activate()
    usleep(250_000)
    guard let overview = capture(window) else { return InboxResult(ok: false, unread: false, contact: nil, message: nil, error: "screen_capture_failed") }
    guard let badgeY = unreadBadgeY(in: overview) else { return InboxResult(ok: true, unread: false, contact: nil, message: nil, error: nil) }
    let scaleY = window.bounds.height / CGFloat(overview.height)
    let rowPoint = CGPoint(x: window.bounds.minX + min(185, window.bounds.width * 0.18), y: window.bounds.minY + badgeY * scaleY)
    click(rowPoint)
    usleep(700_000)
    guard let image = capture(window) else { return InboxResult(ok: false, unread: false, contact: nil, message: nil, error: "screen_capture_failed") }
    let lines = recognizeLines(in: image)
    let width = CGFloat(image.width), height = CGFloat(image.height)
    let titleCandidates = lines.filter { $0.rect.midX > width * 0.34 && $0.rect.midX < width * 0.82 && $0.rect.midY > height * 0.035 && $0.rect.midY < height * 0.15 && $0.text.count <= 80 }
    let contact = titleCandidates.sorted { $0.rect.minY < $1.rect.minY }.first?.text
    let ignoredMessage = "^(\\d{1,2}:\\d{2}|以下为新消息|消息已发出，但被对方拒收了。)$"
    let messageCandidates = lines.filter { line in
        let x = line.rect.midX, y = line.rect.midY
        guard x > width * 0.34 && x < width * 0.70 && y > height * 0.16 && y < height * 0.84 else { return false }
        guard line.text.count >= 1 && line.text.count <= 500 else { return false }
        return line.text.range(of: ignoredMessage, options: .regularExpression) == nil
    }
    let message = messageCandidates.sorted { $0.rect.minY > $1.rect.minY }.first?.text
    guard let safeContact = contact, let safeMessage = message else { return InboxResult(ok: false, unread: true, contact: contact, message: message, error: "inbox_message_not_recognized") }
    return InboxResult(ok: true, unread: true, contact: safeContact, message: safeMessage, error: nil)
}

func scanWeChat() -> ScanResult {
    let axOptions = [kAXTrustedCheckOptionPrompt.takeUnretainedValue() as String: true] as CFDictionary
    guard AXIsProcessTrustedWithOptions(axOptions) else {
        return ScanResult(ok: false, contacts: [], error: "permission_accessibility", pages: 0)
    }
    if #available(macOS 10.15, *), !CGPreflightScreenCaptureAccess() {
        _ = CGRequestScreenCaptureAccess()
        return ScanResult(ok: false, contacts: [], error: "permission_screen_recording", pages: 0)
    }
    guard let window = findWeChatWindow() else {
        return ScanResult(ok: false, contacts: [], error: "wechat_not_open", pages: 0)
    }
    NSRunningApplication(processIdentifier: window.pid)?.activate()
    usleep(500_000)

    guard let contactHomeImage = openContactTab(window) else {
        return ScanResult(ok: false, contacts: [], error: "contact_tab_not_open", pages: 0)
    }
    let expectedCount = expectedContactCount(in: contactHomeImage)

    let scrollPoint = CGPoint(x: window.bounds.minX + min(190, window.bounds.width * 0.2), y: window.bounds.minY + window.bounds.height * 0.62)
    var collected: [String: ContactAggregate] = [:]
    var unchangedPages = 0
    var pageCount = 0
    var reachedEnd = false
    for _ in 0..<300 {
        guard let image = capture(window) else {
            return ScanResult(ok: false, contacts: [], error: "screen_capture_failed", pages: pageCount)
        }
        pageCount += 1
        let before = collected.count
        var seenOnPage = Set<String>()
        for contact in recognizeContacts(in: image) {
            let key = canonicalContactKey(contact.name)
            guard !key.isEmpty else { continue }
            if let existing = collected[key] {
                var updated = existing
                if contact.confidence > existing.contact.confidence { updated.contact = contact }
                if seenOnPage.insert(key).inserted { updated.sightings += 1 }
                collected[key] = updated
            } else {
                seenOnPage.insert(key)
                collected[key] = ContactAggregate(contact: contact, sightings: 1)
            }
        }
        unchangedPages = collected.count == before ? unchangedPages + 1 : 0
        if unchangedPages >= 4 {
            reachedEnd = true
            break
        }
        scrollDown(at: scrollPoint)
        usleep(420_000)
    }
    var ranked = Array(collected.values).sorted {
        if $0.sightings != $1.sightings { return $0.sightings > $1.sightings }
        return $0.contact.confidence > $1.contact.confidence
    }
    if let expectedCount, ranked.count > expectedCount {
        ranked = Array(ranked.prefix(expectedCount))
    }
    let contacts = ranked.map(\.contact).sorted {
        $0.name.localizedStandardCompare($1.name) == .orderedAscending
    }
    if contacts.isEmpty {
        return ScanResult(ok: false, contacts: [], error: "no_contacts_recognized", pages: pageCount)
    }
    if !reachedEnd {
        return ScanResult(ok: false, contacts: [], error: "scan_incomplete", pages: pageCount)
    }
    if let expectedCount {
        let minimum = Int(Double(expectedCount) * 0.80)
        let maximum = Int(Double(expectedCount) * 1.05)
        if contacts.count < minimum || contacts.count > maximum {
            return ScanResult(ok: false, contacts: [], error: "contact_count_mismatch", pages: pageCount)
        }
    }
    return ScanResult(ok: true, contacts: contacts, error: nil, pages: pageCount)
}

if CommandLine.arguments.count >= 2, CommandLine.arguments[1] == "--contact-preview" {
    emit(previewContactTab())
} else if CommandLine.arguments.count >= 2, CommandLine.arguments[1] == "--check-screen" {
    if #available(macOS 10.15, *) {
        let granted = CGPreflightScreenCaptureAccess()
        emit(PermissionResult(ok: granted, screen: granted, accessibility: AXIsProcessTrusted(), error: granted ? nil : "permission_screen_recording"))
    } else {
        emit(PermissionResult(ok: true, screen: true, accessibility: AXIsProcessTrusted(), error: nil))
    }
} else if CommandLine.arguments.count >= 2, CommandLine.arguments[1] == "--check-permissions" {
    let accessibility = AXIsProcessTrusted()
    let screen: Bool
    if #available(macOS 10.15, *) { screen = CGPreflightScreenCaptureAccess() } else { screen = true }
    let error = !accessibility ? "permission_accessibility" : (!screen ? "permission_screen_recording" : nil)
    emit(PermissionResult(ok: accessibility && screen, screen: screen, accessibility: accessibility, error: error))
} else if CommandLine.arguments.count >= 2, CommandLine.arguments[1] == "--request-accessibility" {
    let application = NSApplication.shared
    application.setActivationPolicy(.accessory)
    application.finishLaunching()
    application.activate()
    let options = [kAXTrustedCheckOptionPrompt.takeUnretainedValue() as String: true] as CFDictionary
    let accessibility = AXIsProcessTrustedWithOptions(options)
    let screen: Bool
    if #available(macOS 10.15, *) { screen = CGPreflightScreenCaptureAccess() } else { screen = true }
    emit(PermissionResult(ok: accessibility && screen, screen: screen, accessibility: accessibility, error: accessibility ? nil : "permission_accessibility"))
} else if CommandLine.arguments.count >= 2, CommandLine.arguments[1] == "--request-screen" {
    let application = NSApplication.shared
    application.setActivationPolicy(.accessory)
    application.finishLaunching()
    if #available(macOS 10.15, *) {
        let granted = CGPreflightScreenCaptureAccess() || CGRequestScreenCaptureAccess()
        emit(PermissionResult(ok: granted, screen: granted, accessibility: AXIsProcessTrusted(), error: granted ? nil : "permission_screen_recording"))
    } else {
        emit(PermissionResult(ok: true, screen: true, accessibility: AXIsProcessTrusted(), error: nil))
    }
} else if CommandLine.arguments.count >= 4, CommandLine.arguments[1] == "--wechat-draft" {
    let shouldSend = CommandLine.arguments.count >= 5 && CommandLine.arguments[4] == "--send"
    emit(draftWeChat(contact: CommandLine.arguments[2], message: CommandLine.arguments[3], shouldSend: shouldSend))
} else if CommandLine.arguments.count >= 4, CommandLine.arguments[1] == "--chat-history" {
    emit(scanChatHistory(contact: CommandLine.arguments[2], requestedLimit: Int(CommandLine.arguments[3]) ?? 40))
} else if CommandLine.arguments.count >= 2, CommandLine.arguments[1] == "--inbox" {
    emit(scanInbox())
} else if CommandLine.arguments.count >= 3, CommandLine.arguments[1] == "--ocr" {
    guard let image = NSImage(contentsOfFile: CommandLine.arguments[2]),
          let data = image.tiffRepresentation,
          let bitmap = NSBitmapImageRep(data: data),
          let cgImage = bitmap.cgImage else {
        emit(ScanResult(ok: false, contacts: [], error: "invalid_image", pages: 0))
        exit(0)
    }
    emit(ScanResult(ok: true, contacts: recognizeContacts(in: cgImage), error: nil, pages: 1))
} else {
    emit(scanWeChat())
}
