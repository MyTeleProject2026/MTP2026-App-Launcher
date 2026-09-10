import UIKit
import UserNotifications

final class MTP2026NativeCapabilities: NSObject {
    static let shared = MTP2026NativeCapabilities()

    func apply(mode: String, controller: UIViewController) {
        let mask: UIInterfaceOrientationMask
        switch mode {
        case "windows", "windows11": mask = .landscape
        case "gaming": mask = .allButUpsideDown
        case "android", "ios": mask = .portrait
        default: return
        }
        if let delegate = UIApplication.shared.delegate as? AppDelegate {
            delegate.rootViewController?.orientationMask = mask
        }
        UIViewController.attemptRotationToDeviceOrientation()
    }

    func requestNotificationPermission() async -> Bool {
        do {
            return try await UNUserNotificationCenter.current().requestAuthorization(options: [.alert, .sound, .badge])
        } catch {
            return false
        }
    }

    func notify(title: String, body: String) async -> Bool {
        let center = UNUserNotificationCenter.current()
        let settings = await center.notificationSettings()
        if settings.authorizationStatus == .notDetermined {
            guard await requestNotificationPermission() else { return false }
        } else if settings.authorizationStatus != .authorized && settings.authorizationStatus != .provisional {
            return false
        }
        let content = UNMutableNotificationContent()
        content.title = String(title.prefix(160))
        content.body = String(body.prefix(500))
        content.sound = .default
        let request = UNNotificationRequest(
            identifier: "mtp2026-\(UUID().uuidString)",
            content: content,
            trigger: nil
        )
        do {
            try await center.add(request)
            return true
        } catch {
            return false
        }
    }

    func capabilities() -> [String: Any] {
        [
            "native": true,
            "platform": "ios",
            "orientationLock": true,
            "fullscreen": true,
            "filesystem": false,
            "notifications": true,
            "clipboard": true,
            "externalApps": true,
            "gamepad": false
        ]
    }
}
