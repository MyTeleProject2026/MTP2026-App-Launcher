import UIKit

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

    func enterFullscreen(_ controller: UIViewController) {
        controller.setNeedsStatusBarAppearanceUpdate()
        controller.prefersStatusBarHidden = true
    }

    func exitFullscreen(_ controller: UIViewController) {
        controller.prefersStatusBarHidden = false
        controller.setNeedsStatusBarAppearanceUpdate()
    }

    func capabilities() -> [String: Any] {
        [
            "native": true,
            "platform": "ios",
            "orientationLock": true,
            "fullscreen": true,
            "filesystem": true,
            "notifications": true,
            "clipboard": true,
            "externalApps": true,
            "gamepad": true
        ]
    }
}
