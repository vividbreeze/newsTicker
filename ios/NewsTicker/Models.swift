import Foundation

// Spiegelt die API-Typen aus shared/src/index.ts.

struct TickerItem: Codable, Identifiable, Hashable {
    let id: String
    let publishedAt: String
    let rank: Int
    let isTop: Bool
    let title: String
    let teaser: String
    let originalTitle: String
    let sourceId: String
    let sourceName: String
    let url: String

    var date: Date? { DateParsing.parse(publishedAt) }
}

struct SourceError: Codable, Hashable {
    let sourceId: String
    let message: String
}

struct TickerResponse: Codable {
    let country: String
    let category: String
    let fetchedAt: String
    let stale: Bool
    let items: [TickerItem]
    let sourceErrors: [SourceError]
    let notice: String?

    var fetchedDate: Date? { DateParsing.parse(fetchedAt) }
}

struct TickerDetail: Codable, Hashable {
    let id: String
    let summary: String
    let limited: Bool
    let url: String
    let sourceName: String
}

struct CountryMeta: Codable, Identifiable, Hashable {
    let code: String
    let name: String
    let lang: String
    let flag: String
    let short: String
    var id: String { code }
}

struct CategoryMeta: Codable, Identifiable, Hashable {
    let key: String
    let label: String
    let icon: String
    var id: String { key }
}

struct Meta: Codable {
    let countries: [CountryMeta]
    let categories: [CategoryMeta]
}

struct SourceSetting: Codable, Hashable {
    let id: String
    var enabled: Bool
}

enum SummaryLength: String, Codable, CaseIterable, Identifiable {
    case short, medium, long
    var id: String { rawValue }
    var label: String {
        switch self {
        case .short: "Kurz"
        case .medium: "Mittel"
        case .long: "Lang"
        }
    }
}

struct Settings: Codable, Equatable {
    var activeCountries: [String]
    var itemCount: Int
    var summaryLength: SummaryLength
    var defaultCategory: String
    var sources: [String: [SourceSetting]]
}

struct SourceInfo: Codable, Identifiable, Hashable {
    let id: String
    let country: String
    let name: String
    let type: String
    let enabled: Bool
    let categories: [String]
    let status: String
    let checkedAt: String?
    let message: String?
}

enum DateParsing {
    private static let withFraction: ISO8601DateFormatter = {
        let f = ISO8601DateFormatter()
        f.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
        return f
    }()
    private static let plain = ISO8601DateFormatter()

    static func parse(_ s: String) -> Date? { withFraction.date(from: s) ?? plain.date(from: s) }
}
