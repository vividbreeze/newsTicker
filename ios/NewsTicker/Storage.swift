import Foundation
import Security

/// Token im Keychain, Server-URL in UserDefaults.
enum KeychainStore {
    private static let service = "com.vividbreeze.newsticker"
    private static let account = "api-token"

    static func loadToken() -> String? {
        let q: [String: Any] = [kSecClass as String: kSecClassGenericPassword, kSecAttrService as String: service,
                                kSecAttrAccount as String: account, kSecReturnData as String: true, kSecMatchLimit as String: kSecMatchLimitOne]
        var out: AnyObject?
        guard SecItemCopyMatching(q as CFDictionary, &out) == errSecSuccess, let d = out as? Data else { return nil }
        return String(data: d, encoding: .utf8)
    }

    static func saveToken(_ token: String) {
        let base: [String: Any] = [kSecClass as String: kSecClassGenericPassword, kSecAttrService as String: service, kSecAttrAccount as String: account]
        SecItemDelete(base as CFDictionary)
        guard !token.isEmpty else { return }
        var add = base
        add[kSecValueData as String] = Data(token.utf8)
        add[kSecAttrAccessible as String] = kSecAttrAccessibleAfterFirstUnlockThisDeviceOnly
        SecItemAdd(add as CFDictionary, nil)
    }
}

struct Connection: Equatable {
    var url: String
    var token: String

    var isConfigured: Bool { !token.isEmpty && baseURL != nil }

    var baseURL: URL? {
        var s = url.trimmingCharacters(in: .whitespacesAndNewlines)
        while s.hasSuffix("/") { s.removeLast() }
        if !s.isEmpty && !s.contains("://") { s = "https://" + s }
        guard let u = URL(string: s), u.host != nil else { return nil }
        return u
    }

    private static let urlKey = "serverURL"

    static func load() -> Connection {
        #if DEBUG
        // Nur Debug-Builds: Start per Launch-Argument `-debugToken …` (für Simulator-Tests).
        if let t = UserDefaults.standard.string(forKey: "debugToken"), !t.isEmpty {
            return Connection(url: UserDefaults.standard.string(forKey: urlKey) ?? "", token: t)
        }
        #endif
        return Connection(url: UserDefaults.standard.string(forKey: urlKey) ?? "https://ticker.vividbreeze.com",
                   token: KeychainStore.loadToken() ?? "")
    }

    func save() {
        UserDefaults.standard.set(url, forKey: Self.urlKey)
        KeychainStore.saveToken(token)
    }
}
