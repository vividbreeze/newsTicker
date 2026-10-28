import Foundation

enum APIError: LocalizedError {
    case unauthorized, invalidURL, network, server(Int, String?)

    var errorDescription: String? {
        switch self {
        case .unauthorized: "Token ungültig"
        case .invalidURL: "Server-URL ungültig"
        case .network: "Server nicht erreichbar"
        case .server(let code, let msg): msg ?? "Fehler \(code)"
        }
    }
}

struct APIClient {
    let connection: Connection
    var session: URLSession = .shared

    private func request<T: Decodable>(_ path: String, query: [URLQueryItem] = [], method: String = "GET", body: Data? = nil) async throws -> T {
        guard let base = connection.baseURL,
              var comps = URLComponents(url: base.appendingPathComponent(path), resolvingAgainstBaseURL: false) else { throw APIError.invalidURL }
        if !query.isEmpty { comps.queryItems = query }
        guard let url = comps.url else { throw APIError.invalidURL }
        var req = URLRequest(url: url, timeoutInterval: 120) // Listenabruf kann einige Sekunden dauern
        req.httpMethod = method
        req.setValue("Bearer \(connection.token)", forHTTPHeaderField: "Authorization")
        if let body { req.httpBody = body; req.setValue("application/json", forHTTPHeaderField: "Content-Type") }

        let data: Data, resp: URLResponse
        do { (data, resp) = try await session.data(for: req) }
        catch is CancellationError { throw CancellationError() }
        catch let e as URLError where e.code == .cancelled { throw CancellationError() }
        catch { throw APIError.network }

        guard let http = resp as? HTTPURLResponse else { throw APIError.network }
        if http.statusCode == 401 { throw APIError.unauthorized }
        guard (200..<300).contains(http.statusCode) else {
            let msg = (try? JSONSerialization.jsonObject(with: data) as? [String: Any])?["error"] as? String
            throw APIError.server(http.statusCode, msg)
        }
        return try JSONDecoder().decode(T.self, from: data)
    }

    func meta() async throws -> Meta { try await request("api/meta") }
    func settings() async throws -> Settings { try await request("api/settings") }
    func saveSettings(_ s: Settings) async throws -> Settings {
        try await request("api/settings", method: "PUT", body: try JSONEncoder().encode(s))
    }
    func sources() async throws -> [SourceInfo] { try await request("api/sources") }
    func ticker(country: String, category: String, refresh: Bool) async throws -> TickerResponse {
        var q = [URLQueryItem(name: "country", value: country), URLQueryItem(name: "category", value: category)]
        if refresh { q.append(URLQueryItem(name: "refresh", value: "1")) }
        return try await request("api/ticker", query: q)
    }
    func detail(id: String) async throws -> TickerDetail { try await request("api/ticker/\(id)/detail") }
}
