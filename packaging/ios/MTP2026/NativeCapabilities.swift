import UIKit
import WebKit

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
}
