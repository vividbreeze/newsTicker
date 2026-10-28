import Foundation

enum TimeFormat {
    static let berlin = TimeZone(identifier: "Europe/Berlin")!

    private static func formatter(_ format: String) -> DateFormatter {
        let f = DateFormatter()
        f.locale = Locale(identifier: "de_DE")
        f.timeZone = berlin
        f.dateFormat = format
        return f
    }
    private static let hm = formatter("HH:mm")
    private static let dm = formatter("dd.MM.")

    static func clock(_ d: Date) -> String { hm.string(from: d) }

    /// HH:mm, bei älteren Meldungen „gestern HH:mm“ bzw. „dd.MM. HH:mm“.
    static func label(_ d: Date, now: Date = Date()) -> String {
        var cal = Calendar(identifier: .gregorian)
        cal.timeZone = berlin
        if cal.isDate(d, inSameDayAs: now) { return clock(d) }
        if let y = cal.date(byAdding: .day, value: -1, to: now), cal.isDate(d, inSameDayAs: y) { return "gestern \(clock(d))" }
        return "\(dm.string(from: d)) \(clock(d))"
    }
}

enum CategoryIcons {
    static func symbol(for lucide: String) -> String {
        switch lucide {
        case "Star": "star"
        case "Landmark": "building.columns"
        case "TrendingUp": "chart.line.uptrend.xyaxis"
        case "Cpu": "cpu"
        case "Atom": "atom"
        case "HeartPulse": "waveform.path.ecg"
        case "Drama": "theatermasks"
        case "Trophy": "trophy"
        default: "newspaper"
        }
    }
}
