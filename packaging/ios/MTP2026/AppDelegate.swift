import UIKit
import WebKit

@main
final class AppDelegate: UIResponder, UIApplicationDelegate {
    var window: UIWindow?
    private var rootViewController: LauncherViewController?

    func application(_ application: UIApplication, didFinishLaunchingWithOptions launchOptions: [UIApplication.LaunchOptionsKey: Any]? = nil) -> Bool {
        let controller = LauncherViewController()
        rootViewController = controller
        let window = UIWindow(frame: UIScreen.main.bounds)
        window.rootViewController = controller
        window.makeKeyAndVisible()
        self.window = window
        return true
    }

    func application(_ application: UIApplication, supportedInterfaceOrientationsFor window: UIWindow?) -> UIInterfaceOrientationMask {
        rootViewController?.orientationMask ?? .portrait
    }
}

final class LauncherViewController: UIViewController, WKScriptMessageHandler, WKNavigationDelegate {
    private let webView: WKWebView
    private var orientationMask: UIInterfaceOrientationMask = .portrait
    private let allowedHosts: Set<String> = [
        "mtp2026-app-launcher.onrender.com",
        "api-vexaaccount.onrender.com",
        "vexaaccount-management.onrender.com"
    ]

    init() {
        let content = WKUserContentController()
        let configuration = WKWebViewConfiguration()
        configuration.websiteDataStore = .default()
        configuration.userContentController = content
        webView = WKWebView(frame: .zero, configuration: configuration)
        super.init(nibName: nil, bundle: nil)
        content.add(self, name: "mtp2026")
        webView.navigationDelegate = self
    }

    required init?(coder: NSCoder) { fatalError("init(coder:) has not been implemented") }

    override func viewDidLoad() {
        super.viewDidLoad()
        view.backgroundColor = UIColor(red: 0.027, green: 0.031, blue: 0.043, alpha: 1)
        webView.translatesAutoresizingMaskIntoConstraints = false
        view.addSubview(webView)
        NSLayoutConstraint.activate([
            webView.leadingAnchor.constraint(equalTo: view.leadingAnchor),
            webView.trailingAnchor.constraint(equalTo: view.trailingAnchor),
            webView.topAnchor.constraint(equalTo: view.topAnchor),
            webView.bottomAnchor.constraint(equalTo: view.bottomAnchor)
        ])
        webView.allowsBackForwardNavigationGestures = true
        webView.load(URLRequest(url: URL(string: "https://mtp2026-app-launcher.onrender.com")!))
    }

    func userContentController(_ userContentController: WKUserContentController, didReceive message: WKScriptMessage) {
        guard message.name == "mtp2026", let body = message.body as? [String: Any], let mode = body["mode"] as? String else { return }
        switch mode {
        case "windows": orientationMask = .landscape
        case "android", "ios": orientationMask = .portrait
        case "gaming": orientationMask = .allButUpsideDown
        default: return
        }
        UIViewController.attemptRotationToDeviceOrientation()
    }

    func webView(_ webView: WKWebView, decidePolicyFor navigationAction: WKNavigationAction, decisionHandler: @escaping (WKNavigationActionPolicy) -> Void) {
        guard let url = navigationAction.request.url else { decisionHandler(.cancel); return }
        if url.scheme == "https", let host = url.host?.lowercased(), allowedHosts.contains(host) { decisionHandler(.allow); return }
        if url.scheme == "http" || url.scheme == "https" {
            UIApplication.shared.open(url)
        }
        decisionHandler(.cancel)
    }
}
