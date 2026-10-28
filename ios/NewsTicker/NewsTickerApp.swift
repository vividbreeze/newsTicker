import SwiftUI

enum AppearanceChoice: String, CaseIterable, Identifiable {
    case system, light, dark
    var id: String { rawValue }
    var label: String { switch self { case .system: "System"; case .light: "Hell"; case .dark: "Dunkel" } }
    var scheme: ColorScheme? { switch self { case .system: nil; case .light: .light; case .dark: .dark } }
}

@main
struct NewsTickerApp: App {
    @State private var model = AppModel()
    @AppStorage("appearance") private var appearance = AppearanceChoice.system.rawValue

    var body: some Scene {
        WindowGroup {
            RootView()
                .environment(model)
                .tint(.orange)
                .preferredColorScheme(AppearanceChoice(rawValue: appearance)?.scheme)
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
