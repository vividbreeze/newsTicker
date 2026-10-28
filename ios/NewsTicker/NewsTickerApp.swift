import SwiftUI

enum AppearanceChoice: String, CaseIterable, Identifiable {
    case system, light, dark
    var id: String { rawValue }
    var label: String { switch self { case .system: "System"; case .light: "Hell"; case .dark: "Dunkel" } }
    var scheme: ColorScheme? { switch self { case .system: nil; case .light: .light; case .dark: .dark } }
}

enum TextSizeChoice: String, CaseIterable, Identifiable {
    case system, small, standard, large, xlarge
    var id: String { rawValue }
    var label: String {
        switch self { case .system: "System"; case .small: "Klein"; case .standard: "Standard"; case .large: "Groß"; case .xlarge: "Sehr groß" }
    }
    /// nil = Einstellung des iPhones (Dynamic Type) übernehmen.
    var size: DynamicTypeSize? {
        switch self { case .system: nil; case .small: .small; case .standard: .large; case .large: .xxLarge; case .xlarge: .xxxLarge }
    }
}

@main
struct NewsTickerApp: App {
    @State private var model = AppModel()
    @AppStorage("appearance") private var appearance = AppearanceChoice.system.rawValue
    @AppStorage("textSize") private var textSize = TextSizeChoice.system.rawValue

    var body: some Scene {
        WindowGroup {
            RootView()
                .environment(model)
                .tint(.orange)
                .preferredColorScheme(AppearanceChoice(rawValue: appearance)?.scheme)
                .modifier(TextSizeModifier(size: TextSizeChoice(rawValue: textSize)?.size))
        }
    }
}

struct RootView: View {
    @Environment(AppModel.self) private var model

    var body: some View {
        switch model.state {
        case .setup:
            SetupView()
        case .loading:
            ProgressView().controlSize(.large).task { await model.bootstrap() }
        case .failed(let msg):
            ContentUnavailableView {
                Label("Nicht erreichbar", systemImage: "wifi.exclamationmark")
            } description: { Text(msg) } actions: {
                Button("Erneut versuchen") { Task { await model.bootstrap() } }.buttonStyle(.borderedProminent)
                Button("Server ändern") { model.state = .setup }
            }
        case .ready:
            TickerView()
        }
    }
}

struct TextSizeModifier: ViewModifier {
    let size: DynamicTypeSize?
    func body(content: Content) -> some View {
        if let size { content.dynamicTypeSize(size) } else { content }
    }
}
