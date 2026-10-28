import XCTest
@testable import NewsTicker

final class ModelTests: XCTestCase {
    func testDecodesTickerResponse() throws {
        let json = """
        {"country":"jp","category":"top","fetchedAt":"2026-10-28T17:22:57.000Z","stale":false,
         "items":[{"id":"abc","publishedAt":"2026-10-28T17:22:57.000Z","rank":1,"isTop":true,"title":"T","teaser":"X","originalTitle":"O","sourceId":"nhk","sourceName":"NHK","url":"https://x"}],
         "sourceErrors":[{"sourceId":"yahoo-jp","message":"HTTP 403"}]}
        """
        let r = try JSONDecoder().decode(TickerResponse.self, from: Data(json.utf8))
        XCTAssertEqual(r.items.first?.sourceName, "NHK")
        XCTAssertNil(r.notice)
        XCTAssertNotNil(r.items.first?.date)
    }

    func testSettingsRoundTrip() throws {
        let s = Settings(activeCountries: ["jp", "us", "de"], itemCount: 12, summaryLength: .medium, defaultCategory: "top",
                         sources: ["jp": [SourceSetting(id: "nhk", enabled: true)]])
        let back = try JSONDecoder().decode(Settings.self, from: JSONEncoder().encode(s))
        XCTAssertEqual(s, back)
    }

    func testTimeLabels() {
        let now = DateParsing.parse("2026-10-28T12:00:00Z")!
        XCTAssertEqual(TimeFormat.label(DateParsing.parse("2026-10-28T10:05:00Z")!, now: now), "11:05")
        XCTAssertEqual(TimeFormat.label(DateParsing.parse("2026-10-27T10:05:00Z")!, now: now), "gestern 11:05")
    }

    func testConnectionURLNormalization() {
        XCTAssertEqual(Connection(url: "ticker.example.com/", token: "x").baseURL?.absoluteString, "https://ticker.example.com")
        XCTAssertFalse(Connection(url: "https://a.b", token: "").isConfigured)
    }
}
