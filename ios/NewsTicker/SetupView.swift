import SwiftUI

struct SetupView: View {
    @Environment(AppModel.self) private var model
    @State private var url = ""
    @State private var token = ""
    @State private var busy = false
    @State private var error: String?

    var body: some View {
        NavigationStack {
            Form {
                Section {
                    TextField("Server-URL", text: $url)
                        .textInputAutocapitalization(.never).autocorrectionDisabled().keyboardType(.URL)
                    SecureField("Token", text: $token)
                        .textInputAutocapitalization(.never).autocorrectionDisabled()
                } header: { Text("Verbindung") } footer: {
                    if let error { Text(error).foregroundStyle(.red) } else { Text("Der Token wird im Schlüsselbund gespeichert.") }
                }
                Section {
                    Button { Task { await connect() } } label: {
                        HStack { Text("Verbinden"); if busy { Spacer(); ProgressView() } }
                    }.disabled(busy || token.trimmingCharacters(in: .whitespaces).isEmpty)
                }
            }
            .navigationTitle("Nachrichten-Ticker")
            .onAppear { url = model.connection.url; token = model.connection.token }
        }
    }

    private func connect() async {
        busy = true; error = nil
        do { try await model.connect(Connection(url: url, token: token.trimmingCharacters(in: .whitespacesAndNewlines))) }
        catch { self.error = error.localizedDescription }
        busy = false
    }
}
