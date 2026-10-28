import Foundation
import Observation

enum LoadState: Equatable { case setup, loading, ready, failed(String) }
enum DetailState: Equatable { case loading, loaded(TickerDetail), failed(String) }

@Observable
@MainActor
final class AppModel {
    var connection = Connection.load()
    var state: LoadState = .loading
    var meta: Meta?
    var settings: Settings?
    var sources: [SourceInfo] = []

    var country: String { didSet { UserDefaults.standard.set(country, forKey: "country") } }
    var category: String { didSet { UserDefaults.standard.set(category, forKey: "category") } }

    var ticker: TickerResponse?
    var isLoading = false
    var tickerError: String?
    var details: [String: DetailState] = [:]

    private var cache: [String: TickerResponse] = [:]
    private var api: APIClient { APIClient(connection: connection) }

    init() {
        country = UserDefaults.standard.string(forKey: "country") ?? "jp"
        category = UserDefaults.standard.string(forKey: "category") ?? "top"
        if !connection.isConfigured { state = .setup }
    }

    // MARK: Start

    func bootstrap() async {
        guard connection.isConfigured else { state = .setup; return }
        state = .loading
        do {
            async let m = api.meta()
            async let s = api.settings()
            let (meta, settings) = try await (m, s)
            self.meta = meta
            self.settings = settings
            normalizeSelection()
            state = .ready
        } catch APIError.unauthorized {
            state = .setup
        } catch {
            state = .failed(error.localizedDescription)
        }
    }

    func connect(_ c: Connection) async throws {
        _ = try await APIClient(connection: c).meta() // Verbindung prüfen, bevor gespeichert wird
        c.save()
        connection = c
        cache.removeAll()
        await bootstrap()
    }

    func testConnection(_ c: Connection) async -> String? {
        do { _ = try await APIClient(connection: c).meta(); return nil }
        catch { return error.localizedDescription }
    }

    private func normalizeSelection() {
        guard let settings, let meta else { return }
        if !settings.activeCountries.contains(country) { country = settings.activeCountries.first ?? "jp" }
        if !meta.categories.contains(where: { $0.key == category }) { category = settings.defaultCategory }
    }

    // MARK: Ticker

    var selectionKey: String { "\(country)|\(category)|\(settingsSignature)" }

    private var settingsSignature: String {
        guard let s = settings else { return "" }
        let src = s.sources.sorted { $0.key < $1.key }.map { "\($0.key):" + $0.value.map { "\($0.id)\($0.enabled ? 1 : 0)" }.joined(separator: ",") }.joined(separator: ";")
        return "\(s.itemCount)|\(s.summaryLength.rawValue)|\(src)"
    }

    func loadTicker(refresh: Bool) async {
        let key = selectionKey
        if !refresh, let hit = cache[key] { ticker = hit; tickerError = nil; return }
        let (c, cat) = (country, category)
        isLoading = true
        tickerError = nil
        if !refresh { ticker = nil }
        defer { isLoading = false }
        do {
            let r = try await api.ticker(country: c, category: cat, refresh: refresh)
            cache[key] = r
            if key == selectionKey { ticker = r } // inzwischen anders gewählt? dann nicht überschreiben
        } catch is CancellationError {
            return
        } catch APIError.unauthorized {
            state = .setup
        } catch {
            if key == selectionKey { tickerError = error.localizedDescription }
        }
    }

    func stepCategory(_ delta: Int) {
        guard let cats = meta?.categories, let i = cats.firstIndex(where: { $0.key == category }) else { return }
        let n = i + delta
        if cats.indices.contains(n) { category = cats[n].key }
    }

    // MARK: Detail

    func loadDetail(_ id: String) async {
        if case .loaded = details[id] { return }
        if details[id] == .loading { return }
        details[id] = .loading
        do { details[id] = .loaded(try await api.detail(id: id)) }
        catch { details[id] = .failed(error.localizedDescription) }
    }

    // MARK: Einstellungen

    func loadSources() async { sources = (try? await api.sources()) ?? sources }

    func save(_ new: Settings) async -> String? {
        do {
            settings = try await api.saveSettings(new)
            details.removeAll()
            normalizeSelection()
            return nil
        } catch { return error.localizedDescription }
    }

    func resetConnection() {
        Connection(url: connection.url, token: "").save()
        connection.token = ""
        state = .setup
    }
}
