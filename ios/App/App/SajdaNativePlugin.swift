import Foundation
import Capacitor
import AuthenticationServices
import CryptoKit
import Security
import UIKit

// One bounded collector per request. Delegate callbacks and auth state share the
// main queue; the session is invalidated on every terminal path (no retain cycle).
private final class SajdaResponseCollector: NSObject, URLSessionDataDelegate {
    typealias Response = (Int, String, [String: String])
    private static let maximumBytes = 4_000_000
    private var transport: URLSession?
    private var task: URLSessionDataTask?
    private var response: HTTPURLResponse?
    private var buffer = Data()
    private var completion: ((Result<Response, Error>) -> Void)?

    init(completion: @escaping (Result<Response, Error>) -> Void) {
        self.completion = completion
        super.init()
    }
    func start(_ request: URLRequest) {
        dispatchPrecondition(condition: .onQueue(.main))
        let config = URLSessionConfiguration.ephemeral
        config.httpCookieStorage = nil; config.httpShouldSetCookies = false; config.urlCache = nil
        config.timeoutIntervalForRequest = 65; config.timeoutIntervalForResource = 70
        let session = URLSession(configuration: config, delegate: self, delegateQueue: .main)
        transport = session; task = session.dataTask(with: request); task?.resume()
    }
    private func finish(_ result: Result<Response, Error>) {
        dispatchPrecondition(condition: .onQueue(.main))
        guard let callback = completion else { return }
        completion = nil; buffer.removeAll(keepingCapacity: false)
        transport?.invalidateAndCancel(); transport = nil; task = nil
        callback(result)
    }
    func cancel() { finish(.failure(URLError(.cancelled))) }
    func urlSession(_ session: URLSession, dataTask: URLSessionDataTask, didReceive response: URLResponse,
                    completionHandler: @escaping (URLSession.ResponseDisposition) -> Void) {
        guard completion != nil, let response = response as? HTTPURLResponse,
              response.expectedContentLength <= Int64(Self.maximumBytes) else {
            completionHandler(.cancel); finish(.failure(URLError(.dataLengthExceedsMaximum))); return
        }
        self.response = response; completionHandler(.allow)
    }
    func urlSession(_ session: URLSession, dataTask: URLSessionDataTask, didReceive data: Data) {
        guard completion != nil else { return }
        // Check before appending: unknown-length/chunked responses cannot grow
        // our buffer beyond the cap, nor can a misleading Content-Length.
        guard data.count <= Self.maximumBytes - buffer.count else {
            finish(.failure(URLError(.dataLengthExceedsMaximum))); return
        }
        buffer.append(data)
    }
    func urlSession(_ session: URLSession, task: URLSessionTask, didCompleteWithError error: Error?) {
        guard completion != nil else { return }
        if let error = error { finish(.failure(error)); return }
        guard let response = response, let text = String(data: buffer, encoding: .utf8) else {
            finish(.failure(URLError(.cannotDecodeContentData))); return
        }
        var headers: [String: String] = [:]
        for name in ["content-type", "allow", "access-control-allow-methods", "retry-after", "x-request-id"] {
            if let value = response.value(forHTTPHeaderField: name), value.utf8.count <= 4096,
               !value.contains("\r"), !value.contains("\n") { headers[name] = value }
        }
        finish(.success((response.statusCode, text, headers)))
    }
    // Never forward bearer credentials through a redirect, even same-origin.
    func urlSession(_ session: URLSession, task: URLSessionTask, willPerformHTTPRedirection response: HTTPURLResponse,
                    newRequest request: URLRequest, completionHandler: @escaping (URLRequest?) -> Void) {
        completionHandler(nil)
    }
}

@objc(SajdaNativePlugin)
public final class SajdaNativePlugin: CAPPlugin, CAPBridgedPlugin, ASWebAuthenticationPresentationContextProviding {
    public let identifier = "SajdaNativePlugin"
    public let jsName = "SajdaNative"
    public let pluginMethods: [CAPPluginMethod] = ["signIn", "signOut", "session", "request", "cancel", "shareCsv", "shareFile"].map {
        CAPPluginMethod(name: $0, returnType: CAPPluginReturnPromise)
    }
    // Capacitor invokes plugins on its bridge queue. Every entry point below
    // hops to main, including Keychain reads/writes and all network completions.
    private var authentication: ASWebAuthenticationSession?
    private var pendingSignIn: CAPPluginCall?
    private var exchangeRequestID: String?
    private var authGeneration: UInt64 = 0
    private var signOutInProgress = false
    private var shareInProgress = false
    private var requests: [String: SajdaResponseCollector] = [:]
    private let methods: [String: Set<String>] = [
        "/api/domain-search": ["POST"], "/api/deep-review": ["POST"], "/api/reference-fx": ["GET"],
        "/api/fact-signals": ["GET"], "/api/contact": ["POST"], "/api/health": ["GET"],
        "/api/openapi": ["GET"], "/api/v1/public/domains": ["POST", "OPTIONS"], "/api/native/account": ["POST"]
    ]
    private func failure(_ message: String) -> NSError {
        NSError(domain: "SajdaNative", code: 1, userInfo: [NSLocalizedDescriptionKey: message])
    }
    private static func validAPIHost(_ host: String) -> Bool {
        let host = host.lowercased()
        guard host.utf8.count <= 253, host != "localhost",
              ![".localhost", ".local", ".internal"].contains(where: { host.hasSuffix($0) }) else { return false }
        let labels = host.split(separator: ".", omittingEmptySubsequences: false)
        // A public DNS name, never an IPv4/IPv6 literal or local-network name.
        return labels.count >= 2 && labels.allSatisfy {
            !$0.isEmpty && $0.utf8.count <= 63 && !$0.hasPrefix("-") && !$0.hasSuffix("-") &&
            $0.range(of: "^[a-z0-9-]+$", options: .regularExpression) != nil
        } && labels.last?.range(of: "[a-z]", options: .regularExpression) != nil
    }
    private func apiOrigin() throws -> URL {
        guard let file = Bundle.main.url(forResource: "sajda-native-config", withExtension: "json", subdirectory: "public"),
              let json = try JSONSerialization.jsonObject(with: Data(contentsOf: file)) as? [String: String],
              let value = json["apiOrigin"], let url = URL(string: value),
              url.scheme == "https", let host = url.host, Self.validAPIHost(host), url.user == nil, url.password == nil,
              url.port == nil, url.query == nil, url.fragment == nil,
              url.path.isEmpty || url.path == "/" else { throw failure("App backend is not configured.") }
        return url
    }
    private func keyQuery() throws -> [String: Any] {
        [kSecClass as String: kSecClassGenericPassword,
         kSecAttrService as String: "com.hypbit.sajda." + (try apiOrigin()).absoluteString,
         kSecAttrAccount as String: "session"]
    }
    private func storedToken() throws -> String? {
        dispatchPrecondition(condition: .onQueue(.main))
        var query = try keyQuery()
        query[kSecReturnData as String] = true; query[kSecMatchLimit as String] = kSecMatchLimitOne
        var result: CFTypeRef?
        let status = SecItemCopyMatching(query as CFDictionary, &result)
        if status == errSecItemNotFound { return nil }
        guard status == errSecSuccess, let data = result as? Data,
              let token = String(data: data, encoding: .utf8),
              token.range(of: "^sjn_[A-Za-z0-9_-]{43}$", options: .regularExpression) != nil else { throw failure("Unlock your device to access your account.") }
        return token
    }
    private func storeToken(_ token: String) throws {
        dispatchPrecondition(condition: .onQueue(.main))
        guard token.range(of: "^sjn_[A-Za-z0-9_-]{43}$", options: .regularExpression) != nil else { throw failure("Invalid app session.") }
        let query = try keyQuery()
        let changes: [String: Any] = [kSecValueData as String: Data(token.utf8),
            kSecAttrAccessible as String: kSecAttrAccessibleWhenUnlockedThisDeviceOnly]
        let updated = SecItemUpdate(query as CFDictionary, changes as CFDictionary)
        if updated == errSecItemNotFound {
            var item = query; changes.forEach { item[$0.key] = $0.value }
            guard SecItemAdd(item as CFDictionary, nil) == errSecSuccess else { throw failure("The account could not be saved securely.") }
        } else if updated != errSecSuccess { throw failure("The account could not be saved securely.") }
    }
    private func clearToken(ifMatching expected: String) throws {
        dispatchPrecondition(condition: .onQueue(.main))
        // A delayed 401/logout for token A must never delete replacement B.
        guard try storedToken() == expected else { return }
        let status = SecItemDelete(try keyQuery() as CFDictionary)
        if status != errSecSuccess && status != errSecItemNotFound { throw failure("Secure sign-out could not finish.") }
        authGeneration &+= 1
    }
    private func randomSecret() throws -> String {
        var bytes = [UInt8](repeating: 0, count: 32)
        guard SecRandomCopyBytes(kSecRandomDefault, bytes.count, &bytes) == errSecSuccess else { throw failure("Secure sign-in could not start.") }
        return base64URL(Data(bytes))
    }
    private func base64URL(_ value: Data) -> String {
        value.base64EncodedString().replacingOccurrences(of: "+", with: "-").replacingOccurrences(of: "/", with: "_").replacingOccurrences(of: "=", with: "")
    }
    private func perform(path: String, method: String, body: String? = nil, bearer: String? = nil,
                         requestID: String = UUID().uuidString, completion: @escaping (Result<(Int, String, [String:String]), Error>) -> Void) {
        dispatchPrecondition(condition: .onQueue(.main))
        do {
            let origin = try apiOrigin()
            guard requests[requestID] == nil, requests.count < 16,
                  path.hasPrefix("/api/"), !path.contains("\\"), !path.contains("%"), !path.contains("/."),
                  let url = URL(string: path, relativeTo: origin)?.absoluteURL,
                  url.scheme == origin.scheme, url.host == origin.host, url.port == nil,
                  url.user == nil, url.password == nil, url.fragment == nil else { throw failure("Invalid app request.") }
            if let body = body, body.utf8.count > 65536 { throw failure("This request is too large.") }
            var request = URLRequest(url: url, cachePolicy: .reloadIgnoringLocalCacheData)
            request.httpMethod = method; request.setValue("application/json", forHTTPHeaderField: "Accept")
            if let body = body {
                request.httpBody = Data(body.utf8); request.setValue("application/json", forHTTPHeaderField: "Content-Type")
            }
            // An anonymous contact abuse guard, never a substitute for account auth.
            if url.path == "/api/contact" { request.setValue(origin.absoluteString, forHTTPHeaderField: "Origin") }
            if let token = bearer {
                request.setValue("Bearer " + token, forHTTPHeaderField: "Authorization")
            }
            let collector = SajdaResponseCollector { [weak self] result in
                self?.requests.removeValue(forKey: requestID)
                completion(result)
            }
            requests[requestID] = collector; collector.start(request)
        } catch { completion(.failure(error)) }
    }
    private func current(_ generation: UInt64, token: String) throws -> Bool {
        dispatchPrecondition(condition: .onQueue(.main))
        guard generation == authGeneration else { return false }
        return try storedToken() == token
    }
    private func isoDate(_ value: Any?) -> Date? {
        guard let text = value as? String, text.utf8.count <= 40 else { return nil }
        let formatter = ISO8601DateFormatter()
        formatter.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
        if let date = formatter.date(from: text) { return date }
        formatter.formatOptions = [.withInternetDateTime]
        return formatter.date(from: text)
    }
    private func sanitizedSession(_ value: Any?) throws -> [String: Any] {
        guard let session = value as? [String: Any], let user = session["user"] as? [String: Any],
              let id = user["id"] as? String, !id.isEmpty, id.utf8.count <= 200,
              id == id.trimmingCharacters(in: .whitespacesAndNewlines),
              let email = user["email"] as? String, !email.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty,
              email.utf8.count <= 320,
              let verified = user["email_verified"] as? NSNumber,
              CFGetTypeID(verified) == CFBooleanGetTypeID(), verified.boolValue,
              let createdAt = user["created_at"] as? String, isoDate(createdAt) != nil,
              let expiresAt = session["expires_at"] as? NSNumber,
              CFGetTypeID(expiresAt) != CFBooleanGetTypeID(), expiresAt.doubleValue.isFinite,
              expiresAt.doubleValue.rounded(.towardZero) == expiresAt.doubleValue,
              expiresAt.doubleValue <= 9_007_199_254_740_991,
              expiresAt.doubleValue > Date().timeIntervalSince1970 else { throw failure("Invalid app session.") }
        var identity: [String: Any] = ["id": id, "email": email, "email_verified": true, "created_at": createdAt]
        if let lastSignIn = user["last_sign_in_at"], !(lastSignIn is NSNull) {
            guard let text = lastSignIn as? String, isoDate(text) != nil else { throw failure("Invalid app session.") }
            identity["last_sign_in_at"] = text
        }
        return ["user": identity, "expires_at": expiresAt]
    }
    @objc public func request(_ call: CAPPluginCall) {
        DispatchQueue.main.async { [weak self] in
            guard let self = self, let path = call.getString("path"), let method = call.getString("method"),
                  let components = URLComponents(string: path), components.scheme == nil, components.host == nil,
                  self.methods[components.path]?.contains(method) == true,
                  let id = call.getString("id"), !id.isEmpty, id.count <= 64 else { call.reject("Unsupported app request."); return }
            do {
                let generation = self.authGeneration
                var bearer: String?
                if components.path == "/api/native/account" {
                    guard self.pendingSignIn == nil, !self.signOutInProgress,
                          let token = try self.storedToken() else { throw self.failure("Sign in to the Sajda app.") }
                    bearer = token
                }
                self.perform(path: path, method: method, body: call.getString("body"), bearer: bearer, requestID: id) { [weak self] result in
                    do {
                        if let token = bearer {
                            guard let self = self, try self.current(generation, token: token) else { throw NSError(domain: "SajdaNative", code: 1) }
                        }
                        switch result {
                        case .success(let (status, text, headers)): call.resolve(["status": status, "body": text, "headers": headers])
                        case .failure: throw NSError(domain: "SajdaNative", code: 1)
                        }
                    } catch { call.reject("The request could not be completed. Check your account and retry.") }
                }
            } catch { call.reject("Unlock your device and sign in to the Sajda app.") }
        }
    }
    @objc public func cancel(_ call: CAPPluginCall) {
        DispatchQueue.main.async { [weak self] in
            if let id = call.getString("id") { self?.requests[id]?.cancel() }
            call.resolve()
        }
    }
    // WKWebView does not route generated blob downloads to Files. Only our
    // three text artifact formats can enter this bounded system share sheet.
    @objc public func shareCsv(_ call: CAPPluginCall) {
        DispatchQueue.main.async { [weak self] in
            guard let self = self else { call.reject("The app is not ready."); return }
            self.shareGeneratedFile(call, csvOnly: true)
        }
    }
    @objc public func shareFile(_ call: CAPPluginCall) {
        DispatchQueue.main.async { [weak self] in
            guard let self = self else { call.reject("The app is not ready."); return }
            self.shareGeneratedFile(call, csvOnly: false)
        }
    }
    private func shareGeneratedFile(_ call: CAPPluginCall, csvOnly: Bool) {
        dispatchPrecondition(condition: .onQueue(.main))
        guard !shareInProgress,
              let filename = call.getString("filename"),
              filename.range(of: "^[A-Za-z0-9][A-Za-z0-9_-]{0,119}\\.(csv|svg|html)$", options: .regularExpression) != nil,
              !csvOnly || filename.hasSuffix(".csv"),
              let content = call.getString(csvOnly ? "csv" : "content"), !content.isEmpty, content.utf8.count <= 4_000_000,
              let presenter = bridge?.viewController,
              let window = presenter.view.window,
              window.windowScene?.activationState == .foregroundActive,
              presenter.presentedViewController == nil else {
            call.reject("The file cannot be shared right now. Close any open dialog and retry."); return
        }
        // The caller provides content, never a path, URL or executable to load.
        let directory = FileManager.default.temporaryDirectory.appendingPathComponent("sajda-export-" + UUID().uuidString, isDirectory: true)
        do {
            try FileManager.default.createDirectory(at: directory, withIntermediateDirectories: false)
            let file = directory.appendingPathComponent(filename, isDirectory: false)
            try Data(content.utf8).write(to: file, options: [.atomic, .completeFileProtection])
            shareInProgress = true
            let sheet = UIActivityViewController(activityItems: [file], applicationActivities: nil)
            // iPad requires an explicit popover anchor, even for a web UI.
            sheet.popoverPresentationController?.sourceView = presenter.view
            sheet.popoverPresentationController?.sourceRect = CGRect(x: presenter.view.bounds.midX, y: presenter.view.bounds.maxY - 1, width: 1, height: 1)
            sheet.popoverPresentationController?.permittedArrowDirections = []
            sheet.completionWithItemsHandler = { [weak self] _, completed, _, error in
                DispatchQueue.main.async {
                    try? FileManager.default.removeItem(at: directory)
                    self?.shareInProgress = false
                    if error != nil { call.reject("The file could not be shared. Try again.") }
                    else { call.resolve(["completed": completed]) }
                }
            }
            presenter.present(sheet, animated: true)
        } catch {
            try? FileManager.default.removeItem(at: directory)
            shareInProgress = false
            call.reject("The file could not be prepared for sharing. Try again.")
        }
    }
    @objc public func session(_ call: CAPPluginCall) {
        DispatchQueue.main.async { [weak self] in
            guard let self = self else { call.reject("The app is not ready."); return }
            do {
                guard self.pendingSignIn == nil, !self.signOutInProgress else { throw self.failure("Account is changing.") }
                guard let token = try self.storedToken() else { call.resolve(["session": NSNull()]); return }
                let generation = self.authGeneration
                self.perform(path: "/api/native/auth", method: "GET", bearer: token) { [weak self] result in
                    do {
                        guard let self = self, try self.current(generation, token: token) else { throw NSError(domain: "SajdaNative", code: 1) }
                        guard case .success(let (status, text, _)) = result else { throw self.failure("Account check failed.") }
                        if status == 401 { try self.clearToken(ifMatching: token); call.resolve(["session": NSNull()]); return }
                        guard status == 200, let data = text.data(using: .utf8),
                              let value = try JSONSerialization.jsonObject(with: data) as? [String: Any] else { throw self.failure("Invalid app session.") }
                        call.resolve(["session": try self.sanitizedSession(value["session"])])
                    } catch { call.reject("Your account could not be checked. Try again.") }
                }
            } catch { call.reject("Unlock your device and finish sign-in before checking your account.") }
        }
    }
    @objc public func signOut(_ call: CAPPluginCall) {
        DispatchQueue.main.async { [weak self] in
            guard let self = self else { call.reject("The app is not ready."); return }
            guard !self.signOutInProgress else { call.reject("Sign-out is already in progress."); return }
            self.signOutInProgress = true
            self.authGeneration &+= 1
            let generation = self.authGeneration
            // Fence first, then cancel: a queued browser or exchange completion
            // can neither store a token nor resolve an obsolete sign-in call.
            let pending = self.pendingSignIn
            self.pendingSignIn = nil
            self.authentication?.cancel(); self.authentication = nil
            if let id = self.exchangeRequestID { self.requests[id]?.cancel() }
            self.exchangeRequestID = nil
            pending?.reject("Sign-in was cancelled by sign-out.")
            do {
                guard let token = try self.storedToken() else {
                    self.signOutInProgress = false; call.resolve(["ok": true]); return
                }
                self.perform(path: "/api/native/auth", method: "POST", body: "{\"action\":\"logout\"}", bearer: token) { [weak self] result in
                    guard let self = self else { call.reject("Sign-out could not finish."); return }
                    defer { self.signOutInProgress = false }
                    do {
                        guard try self.current(generation, token: token),
                              case .success(let (status, _, _)) = result, status == 200 || status == 401 else {
                            throw self.failure("Sign-out was not confirmed.")
                        }
                        try self.clearToken(ifMatching: token); call.resolve(["ok": true])
                    } catch { call.reject("Sign-out was not confirmed. Reconnect and try again.") }
                }
            } catch {
                self.signOutInProgress = false; call.reject("Unlock your device to sign out.")
            }
        }
    }
    private func finishSignIn(_ generation: UInt64, error: String? = nil) {
        dispatchPrecondition(condition: .onQueue(.main))
        guard generation == authGeneration, let call = pendingSignIn else { return }
        pendingSignIn = nil; authentication = nil; exchangeRequestID = nil
        if let error = error { call.reject(error) } else { call.resolve(["ok": true]) }
    }
    @objc public func signIn(_ call: CAPPluginCall) {
        DispatchQueue.main.async { [weak self] in
            guard let self = self else { call.reject("The app is not ready."); return }
            guard self.pendingSignIn == nil, !self.signOutInProgress else { call.reject("An account change is already in progress."); return }
            self.authGeneration &+= 1
            let generation = self.authGeneration
            // Held until the exchange has finished, not merely browser dismissal.
            self.pendingSignIn = call
            do {
                let verifier = try self.randomSecret(), state = try self.randomSecret()
                let challenge = self.base64URL(Data(SHA256.hash(data: Data(verifier.utf8))))
                var url = URLComponents(url: try self.apiOrigin(), resolvingAgainstBaseURL: false)!
                url.path = "/connect/native"
                url.queryItems = [URLQueryItem(name:"challenge",value:challenge),URLQueryItem(name:"state",value:state)]
                guard let start = url.url else { throw self.failure("Sign-in could not start.") }
                let session = ASWebAuthenticationSession(url: start, callbackURLScheme: "com.hypbit.sajda") { [weak self] callback, error in
                    DispatchQueue.main.async {
                        guard let self = self, generation == self.authGeneration, self.pendingSignIn != nil,
                              self.exchangeRequestID == nil else { return }
                        guard error == nil, let callback = callback,
                              callback.scheme == "com.hypbit.sajda", callback.host == "auth", callback.path == "/callback",
                              callback.user == nil, callback.password == nil, callback.port == nil, callback.fragment == nil,
                              let items = URLComponents(url: callback, resolvingAgainstBaseURL: false)?.queryItems,
                              items.filter({ $0.name == "state" }).count == 1, items.first(where: { $0.name == "state" })?.value == state,
                              items.filter({ $0.name == "code" }).count == 1, let code = items.first(where: { $0.name == "code" })?.value,
                              code.range(of: "^[A-Za-z0-9_-]{43}$", options: .regularExpression) != nil else {
                            self.finishSignIn(generation, error: "Sign-in was cancelled or could not be verified."); return
                        }
                        do {
                            let data = try JSONSerialization.data(withJSONObject: ["action": "exchange", "code": code, "verifier": verifier])
                            let requestID = UUID().uuidString
                            self.exchangeRequestID = requestID
                            self.perform(path: "/api/native/auth", method: "POST", body: String(data: data, encoding: .utf8), requestID: requestID) { [weak self] result in
                                guard let self = self, generation == self.authGeneration, self.pendingSignIn != nil,
                                      self.exchangeRequestID == requestID, !self.signOutInProgress else { return }
                                do {
                                    guard case .success(let (status, text, _)) = result, status == 200,
                                          let data = text.data(using: .utf8),
                                          let value = try JSONSerialization.jsonObject(with: data) as? [String: Any],
                                          let token = value["token"] as? String,
                                          let expiry = self.isoDate(value["expiresAt"]), expiry > Date() else { throw self.failure("Sign-in was not completed.") }
                                    try self.storeToken(token)
                                    self.finishSignIn(generation)
                                } catch { self.finishSignIn(generation, error: "The app session could not be saved. Start sign-in again.") }
                            }
                        } catch { self.finishSignIn(generation, error: "Sign-in could not be completed.") }
                    }
                }
                session.presentationContextProvider = self; session.prefersEphemeralWebBrowserSession = false
                self.authentication = session
                if !session.start() { self.finishSignIn(generation, error: "The system browser could not open.") }
            } catch { self.finishSignIn(generation, error: "Secure sign-in could not start. Try again.") }
        }
    }
    public func presentationAnchor(for session: ASWebAuthenticationSession) -> ASPresentationAnchor {
        bridge?.viewController?.view.window ?? ASPresentationAnchor()
    }
}

@objc(SajdaViewController)
public final class SajdaViewController: CAPBridgeViewController {
    public override func capacitorDidLoad() {
        bridge?.registerPluginInstance(SajdaNativePlugin())
    }
}
